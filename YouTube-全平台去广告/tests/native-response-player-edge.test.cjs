const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(
  path.join(projectRoot, "scripts/native/youtube-native-response.js"),
  "utf8",
);

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

function runResponse(pathName, body) {
  const completions = [];
  const context = {
    $argument: JSON.stringify({
      captionLang: "off",
      blockUpload: false,
      blockImmersive: false,
      blockShorts: false,
      debug: false,
    }),
    $request: {
      url: `https://youtubei.googleapis.com/youtubei/v1/${pathName}`,
      headers: { "User-Agent": "YouTube/21.31.3 (iPhone; iOS 27.0)" },
    },
    $response: { status: 200, headers: {}, body },
    $persistentStore: {
      read() {
        return null;
      },
      write() {
        return true;
      },
    },
    $httpClient: {
      get() {
        throw new Error("native response processing must remain local");
      },
      post() {
        throw new Error("native response processing must remain local");
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
  vm.runInNewContext(source, context, { filename: "youtube-native-response.js" });
  assert.equal(completions.length, 1, `${pathName} must complete exactly once`);
  const completion = completions[0].response || completions[0];
  assert.ok(
    Object.hasOwn(completion, "body") || Object.hasOwn(completion, "bodyBytes"),
    `${pathName} must return a rewritten protobuf body`,
  );
  return Uint8Array.from(completion.bodyBytes || completion.body);
}

function assertCleanPlayer(player) {
  const fields = readProtoFields(player);
  const numbers = fields.map((field) => field.number);
  assert.equal(numbers.includes(7), false, "adPlacements must be removed");
  assert.equal(numbers.includes(68), false, "adSlots must be removed");
  assert.ok(numbers.includes(100), "unrelated unknown player fields must be preserved");
}

const playerWithoutStatus = concat(
  bytesField(7, new Uint8Array(0)),
  bytesField(68, new Uint8Array(0)),
  bytesField(100, Uint8Array.of(1, 2, 3)),
);

assertCleanPlayer(runResponse("player", playerWithoutStatus));

const watchOutput = runResponse(
  "get_watch",
  bytesField(1, bytesField(2, playerWithoutStatus)),
);
const watchContent = readProtoFields(watchOutput).find((field) => field.number === 1)?.value;
assert.ok(watchContent, "get_watch must retain its content entry");
const watchPlayer = readProtoFields(watchContent).find((field) => field.number === 2)?.value;
assert.ok(watchPlayer, "get_watch must retain its player entry");
assertCleanPlayer(watchPlayer);

console.log("PASS: native player cleaning does not depend on playabilityStatus");
