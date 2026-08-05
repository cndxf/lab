const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const zlib = require("node:zlib");

const projectRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(
  path.join(projectRoot, "scripts/native/youtube-native-ump.js"),
  "utf8",
);
const clientKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1);

function concat(...parts) {
  return Uint8Array.from(Buffer.concat(parts.map((part) => Buffer.from(part))));
}

function varint(value) {
  const bytes = [];
  let current = value >>> 0;
  while (current > 127) {
    bytes.push((current & 0x7f) | 0x80);
    current >>>= 7;
  }
  bytes.push(current);
  return Uint8Array.from(bytes);
}

function bytesField(number, bytes) {
  return concat(varint((number << 3) | 2), varint(bytes.length), bytes);
}

function scalarField(number, value) {
  return concat(varint(number << 3), varint(value));
}

function umpVarint(value) {
  let size = 1;
  while (value >= 1 << (7 * size)) size += 1;
  if (size === 1) return Uint8Array.of(value);
  if (size === 2) return Uint8Array.of((value & 0x3f) | 0x80, value >> 6);
  if (size === 3) {
    return Uint8Array.of((value & 0x1f) | 0xc0, (value >> 5) & 0xff, value >> 13);
  }
  if (size === 4) {
    return Uint8Array.of(
      (value & 0x0f) | 0xe0,
      (value >> 4) & 0xff,
      (value >> 12) & 0xff,
      value >> 20,
    );
  }
  return Uint8Array.of(
    0xf0,
    value & 0xff,
    (value >> 8) & 0xff,
    (value >> 16) & 0xff,
    (value >> 24) & 0xff,
  );
}

function umpPart(type, data) {
  return concat(umpVarint(type), umpVarint(data.length), data);
}

function readUmpVarint(buffer, cursor) {
  const first = buffer[cursor.offset++];
  let size = 0;
  for (let candidate = 1; candidate <= 5; candidate += 1) {
    if (!(first & (0x80 >> (candidate - 1)))) {
      size = candidate;
      break;
    }
  }
  assert.ok(size, "invalid UMP varint size");
  let shift = 0;
  let value = 0;
  if (size !== 5) {
    shift = 8 - size;
    value = first & ((1 << shift) - 1);
  }
  for (let index = 1; index < size; index += 1) {
    value |= buffer[cursor.offset++] << shift;
    shift += 8;
  }
  return value >>> 0;
}

function readProtoFields(bytes) {
  const fields = [];
  const cursor = { offset: 0 };
  const readVarint = () => {
    let value = 0;
    let shift = 0;
    while (cursor.offset < bytes.length) {
      const byte = bytes[cursor.offset++];
      value |= (byte & 0x7f) << shift;
      if (!(byte & 0x80)) return value >>> 0;
      shift += 7;
    }
    throw new Error("truncated protobuf varint");
  };

  while (cursor.offset < bytes.length) {
    const tag = readVarint();
    const number = tag >>> 3;
    const wireType = tag & 7;
    if (wireType === 0) {
      fields.push({ number, wireType, value: readVarint() });
      continue;
    }
    if (wireType !== 2) throw new Error(`unsupported wire type ${wireType}`);
    const length = readVarint();
    const end = cursor.offset + length;
    fields.push({ number, wireType, value: bytes.subarray(cursor.offset, end) });
    cursor.offset = end;
  }
  return fields;
}

function encodePayload(onesie, compressionAlgorithm) {
  if (compressionAlgorithm === 0) return onesie;
  if (compressionAlgorithm === 1) return zlib.gzipSync(onesie, { level: 0 });
  if (compressionAlgorithm === 2) return zlib.brotliCompressSync(onesie);
  return onesie;
}

function decodePayload(payload, compressionAlgorithm) {
  if (compressionAlgorithm === 0) return payload;
  if (compressionAlgorithm === 1) return zlib.gunzipSync(payload);
  if (compressionAlgorithm === 2) return zlib.brotliDecompressSync(payload);
  throw new Error(`unsupported compression algorithm ${compressionAlgorithm}`);
}

function encryptPart(onesie, compressionAlgorithm, ivSeed) {
  const iv = Uint8Array.from({ length: 16 }, (_, index) => ivSeed + index);
  const plain = encodePayload(onesie, compressionAlgorithm);
  const cipher = crypto.createCipheriv("aes-128-ctr", clientKey.subarray(0, 16), iv);
  const encryptedContent = Buffer.concat([cipher.update(plain), cipher.final()]);
  const hmac = crypto
    .createHmac("sha256", clientKey.subarray(16))
    .update(encryptedContent)
    .update(iv)
    .digest();
  return concat(
    bytesField(1, encryptedContent),
    bytesField(2, hmac),
    bytesField(3, iv),
    scalarField(4, compressionAlgorithm),
  );
}

function readUmpParts(body) {
  const parts = [];
  const cursor = { offset: 0 };
  while (cursor.offset < body.length) {
    const type = readUmpVarint(body, cursor);
    const length = readUmpVarint(body, cursor);
    const data = body.subarray(cursor.offset, cursor.offset + length);
    cursor.offset += length;
    parts.push({ type, data });
  }
  return parts;
}

function decryptPart(part) {
  const fields = readProtoFields(part);
  const encryptedContent = fields.find((field) => field.number === 1)?.value;
  const hmac = fields.find((field) => field.number === 2)?.value;
  const iv = fields.find((field) => field.number === 3)?.value;
  const compressionAlgorithm =
    fields.find((field) => field.number === 4)?.value ?? 0;
  assert.ok(encryptedContent && hmac && iv, "encrypted UMP fields must remain complete");
  const expectedHmac = crypto
    .createHmac("sha256", clientKey.subarray(16))
    .update(encryptedContent)
    .update(iv)
    .digest();
  assert.deepEqual(Buffer.from(hmac), expectedHmac, "rewritten HMAC must remain valid");
  const decipher = crypto.createDecipheriv(
    "aes-128-ctr",
    clientKey.subarray(0, 16),
    iv,
  );
  const decrypted = Buffer.concat([decipher.update(encryptedContent), decipher.final()]);
  return {
    compressionAlgorithm,
    onesie: decodePayload(decrypted, compressionAlgorithm),
  };
}

function makeOnesie({ includePlayabilityStatus = true } = {}) {
  const player = includePlayabilityStatus
    ? concat(bytesField(2, new Uint8Array(0)), bytesField(7, new Uint8Array(0)))
    : bytesField(7, new Uint8Array(0));
  return bytesField(4, bytesField(2, player));
}

function assertAdRemoved(onesie) {
  const content = readProtoFields(onesie).find((field) => field.number === 4)?.value;
  assert.ok(content, "onesie response must retain Watch content");
  const player = readProtoFields(content).find((field) => field.number === 2)?.value;
  if (!player) return;
  const playerFieldNumbers = readProtoFields(player).map((field) => field.number);
  assert.equal(playerFieldNumbers.includes(7), false, "adPlacements must be removed");
  assert.equal(playerFieldNumbers.includes(68), false, "adSlots must be removed");
}

function runScript(body) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("UMP script did not complete")), 1000);
    const context = {
      $argument: JSON.stringify({ captionLang: "off", debug: false }),
      $request: {
        url: "https://rr1---sn.example.googlevideo.com/initplayback?id=1&ack=1",
        headers: { "User-Agent": "YouTube/21.31.3 (iPhone; iOS 27.0)" },
      },
      $response: { status: 200, headers: {}, body },
      $persistentStore: {
        read(key) {
          if (key !== "YouTubeConfig") return null;
          return JSON.stringify({
            youtube: { clientKey: Buffer.from(clientKey).toString("base64") },
          });
        },
        write() {
          return true;
        },
      },
      $httpClient: {
        get() {
          reject(new Error("UMP processing must remain local"));
        },
        post() {
          reject(new Error("UMP processing must remain local"));
        },
      },
      $notification: { post() {} },
      $done(value) {
        clearTimeout(timeout);
        const response = value.response || value;
        resolve(response.bodyBytes || response.body || new Uint8Array(0));
      },
      console: { log() {} },
      TextDecoder,
      TextEncoder,
      Uint8Array,
      Uint16Array,
      Uint32Array,
      Int32Array,
      ArrayBuffer,
      DataView,
      BigInt,
      setTimeout,
      clearTimeout,
    };
    try {
      vm.runInNewContext(source, context, { filename: "youtube-native-ump.js" });
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

(async () => {
  for (const compressionAlgorithm of [0, 1]) {
    const requestBody = concat(
      umpPart(10, scalarField(1, 25)),
      umpPart(11, encryptPart(makeOnesie(), compressionAlgorithm, 16)),
    );
    const outputBody = await runScript(requestBody);
    assert.ok(outputBody.byteLength, `algorithm ${compressionAlgorithm} must not return empty`);
    const rewritten = readUmpParts(outputBody).find((part) => part.type === 11);
    assert.ok(rewritten, `algorithm ${compressionAlgorithm} must retain encrypted part`);
    const decoded = decryptPart(rewritten.data);
    assert.equal(decoded.compressionAlgorithm, compressionAlgorithm);
    assertAdRemoved(decoded.onesie);
  }

  const brotliBody = concat(
    umpPart(10, scalarField(1, 25)),
    umpPart(11, encryptPart(makeOnesie(), 2, 24)),
  );
  const brotliOutput = await runScript(brotliBody);
  assert.deepEqual(
    Buffer.from(brotliOutput),
    Buffer.from(brotliBody),
    "Brotli must preserve the original response until local rewrite support exists",
  );

  const missingStatusBody = concat(
    umpPart(10, scalarField(1, 25)),
    umpPart(11, encryptPart(makeOnesie({ includePlayabilityStatus: false }), 1, 32)),
  );
  const missingStatusOutput = await runScript(missingStatusBody);
  assert.ok(missingStatusOutput.byteLength, "missing playabilityStatus must not empty playback");
  assertAdRemoved(decryptPart(readUmpParts(missingStatusOutput)[1].data).onesie);

  const multiPartBody = concat(
    umpPart(10, scalarField(1, 25)),
    umpPart(11, encryptPart(makeOnesie(), 1, 48)),
    umpPart(11, encryptPart(makeOnesie(), 1, 64)),
  );
  const multiPartOutput = await runScript(multiPartBody);
  const encryptedParts = readUmpParts(multiPartOutput).filter((part) => part.type === 11);
  assert.equal(encryptedParts.length, 2, "all encrypted parts must remain present");
  for (const part of encryptedParts) assertAdRemoved(decryptPart(part.data).onesie);

  const unsupportedBody = concat(
    umpPart(10, scalarField(1, 25)),
    umpPart(11, encryptPart(makeOnesie(), 99, 80)),
  );
  const unsupportedOutput = await runScript(unsupportedBody);
  assert.deepEqual(
    Buffer.from(unsupportedOutput),
    Buffer.from(unsupportedBody),
    "unknown compression must preserve the original response",
  );

  console.log(
    "PASS: native UMP handles supported compression, missing fields, multi-part framing, and safe fallback",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
