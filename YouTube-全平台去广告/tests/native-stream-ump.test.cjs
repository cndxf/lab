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

function concat(...parts) {
  const buffers = parts.map((part) => Buffer.from(part));
  return Uint8Array.from(Buffer.concat(buffers));
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

function encryptPart(plain, clientKey, iv) {
  const aesKey = clientKey.subarray(0, 16);
  const hmacKey = clientKey.subarray(16);
  const cipher = crypto.createCipheriv("aes-128-ctr", aesKey, iv);
  const encryptedContent = Buffer.concat([cipher.update(plain), cipher.final()]);
  const hmac = crypto
    .createHmac("sha256", hmacKey)
    .update(encryptedContent)
    .update(iv)
    .digest();
  return concat(
    bytesField(1, encryptedContent),
    bytesField(2, hmac),
    bytesField(3, iv),
    scalarField(4, 1),
  );
}

const player = concat(
  bytesField(2, new Uint8Array(0)),
  bytesField(7, new Uint8Array(0)),
);
const watchContent = bytesField(2, player);
const onesieResponse = bytesField(4, watchContent);
const compressed = zlib.gzipSync(onesieResponse, { level: 0 });
const clientKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const iv = Uint8Array.from({ length: 16 }, (_, index) => 32 - index);
const encryptedPart = encryptPart(compressed, clientKey, iv);
const requestBody = concat(
  umpPart(10, scalarField(1, 25)),
  umpPart(11, encryptedPart),
);

const completions = [];
let fetchCount = 0;
const context = {
  $argument: JSON.stringify({ captionLang: "off", debug: false }),
  $request: {
    url: "https://rr1---sn.example.googlevideo.com/initplayback?id=1&ack=1",
    headers: { "User-Agent": "YouTube/21.31.3 (iPhone; iOS 27.0)" },
  },
  $response: { status: 200, headers: {}, body: requestBody },
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
      fetchCount += 1;
    },
    post() {
      fetchCount += 1;
    },
  },
  $notification: { post() {} },
  $done(value) {
    completions.push(value);
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

vm.runInNewContext(source, context, { filename: "youtube-native-ump.js" });

setImmediate(() => {
  assert.equal(fetchCount, 0, "UMP processing must not contact a remote Worker");
  assert.equal(completions.length, 1, "UMP processing must complete exactly once");
  const response = completions[0].response || completions[0];
  const outputBody = response.bodyBytes || response.body;
  assert.ok(outputBody?.byteLength, "UMP processing must return a rewritten binary body");

  const cursor = { offset: 0 };
  let rewrittenEncryptedPart;
  while (cursor.offset < outputBody.length) {
    const type = readUmpVarint(outputBody, cursor);
    const length = readUmpVarint(outputBody, cursor);
    const data = outputBody.subarray(cursor.offset, cursor.offset + length);
    cursor.offset += length;
    if (type === 11) rewrittenEncryptedPart = data;
  }
  assert.ok(rewrittenEncryptedPart, "rewritten UMP body must retain the encrypted response part");

  const encryptedFields = readProtoFields(rewrittenEncryptedPart);
  const encryptedContent = encryptedFields.find((field) => field.number === 1)?.value;
  const rewrittenHmac = encryptedFields.find((field) => field.number === 2)?.value;
  const rewrittenIv = encryptedFields.find((field) => field.number === 3)?.value;
  assert.ok(encryptedContent && rewrittenHmac && rewrittenIv);
  const expectedHmac = crypto
    .createHmac("sha256", clientKey.subarray(16))
    .update(encryptedContent)
    .update(rewrittenIv)
    .digest();
  assert.deepEqual(Buffer.from(rewrittenHmac), expectedHmac, "rewritten UMP HMAC must be valid");

  const decipher = crypto.createDecipheriv(
    "aes-128-ctr",
    clientKey.subarray(0, 16),
    rewrittenIv,
  );
  const decrypted = Buffer.concat([decipher.update(encryptedContent), decipher.final()]);
  const rewrittenOnesie = zlib.gunzipSync(decrypted);
  const content = readProtoFields(rewrittenOnesie).find((field) => field.number === 4)?.value;
  const rewrittenPlayer = readProtoFields(content).find((field) => field.number === 2)?.value;
  const playerFieldNumbers = readProtoFields(rewrittenPlayer).map((field) => field.number);
  assert.equal(playerFieldNumbers.includes(7), false, "adPlacements must be removed from UMP Watch data");

  console.log("PASS: native UMP response is decrypted, cleaned, and re-encrypted locally");
});
