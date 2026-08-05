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
  let current = value;
  while (current > 127) {
    bytes.push((current % 128) | 0x80);
    current = Math.floor(current / 128);
  }
  bytes.push(current);
  return Uint8Array.from(bytes);
}

function fieldTag(number, wireType) {
  return varint(number * 8 + wireType);
}

function bytesField(number, bytes) {
  return concat(fieldTag(number, 2), varint(bytes.length), bytes);
}

function intField(number, value) {
  return concat(fieldTag(number, 0), varint(value));
}

function configResponse({ clientKey, encryptKey, expiresInSeconds }) {
  const onesieHotConfig = concat(
    bytesField(1, clientKey),
    bytesField(2, encryptKey),
    intField(3, expiresInSeconds),
  );
  const mediaHotConfig = bytesField(146311580, onesieHotConfig);
  const hotConfigGroup = bytesField(138536474, mediaHotConfig);
  const globalConfigGroup = bytesField(7, hotConfigGroup);
  const responseContext = bytesField(16, globalConfigGroup);
  return bytesField(1, responseContext);
}

const fixedNow = 1_800_000_000_000;
const clientKey = Uint8Array.of(1, 2, 3, 4);
const encryptKey = Uint8Array.from({ length: 32 }, (_, index) => index + 10);
const writes = [];
const completions = [];

class FixedDate extends Date {
  static now() {
    return fixedNow;
  }
}

const context = {
  $argument: JSON.stringify({
    captionLang: "off",
    blockUpload: false,
    blockImmersive: false,
    blockShorts: false,
    debug: false,
  }),
  $request: {
    url: "https://youtubei.googleapis.com/youtubei/v1/config",
    headers: { "User-Agent": "YouTube/21.31.3 (iPhone; iOS 27.0)" },
  },
  $response: {
    status: 200,
    headers: {},
    body: configResponse({ clientKey, encryptKey, expiresInSeconds: 90 }),
  },
  $persistentStore: {
    read(key) {
      return key === "YouTubeConfig" ? "{}" : null;
    },
    write(value, key) {
      writes.push({ key, value });
      return true;
    },
  },
  $httpClient: {
    get() {
      throw new Error("native config processing must remain local");
    },
    post() {
      throw new Error("native config processing must remain local");
    },
  },
  $notification: { post() {} },
  $done(value) {
    completions.push(value);
  },
  console: { log() {} },
  Date: FixedDate,
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

assert.equal(completions.length, 1, "config response must complete exactly once");
assert.equal(writes.length, 1, "config response must persist the refreshed key once");
assert.equal(writes[0].key, "YouTubeConfig");
assert.deepEqual(JSON.parse(writes[0].value), {
  youtube: {
    clientKey: Buffer.from(clientKey).toString("base64"),
    encryptKey: Buffer.from(encryptKey).toString("base64"),
    expiresAt: fixedNow + 90_000,
  },
});

console.log("PASS: native config response persists an absolute onesie key expiry");
