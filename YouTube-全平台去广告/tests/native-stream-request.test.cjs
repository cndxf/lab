const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(
  path.join(projectRoot, "scripts/native/youtube-native-request.js"),
  "utf8",
);

function varint(value) {
  const bytes = [];
  let current = value >>> 0;
  while (current > 127) {
    bytes.push((current & 0x7f) | 0x80);
    current >>>= 7;
  }
  bytes.push(current);
  return bytes;
}

function bytesField(number, bytes) {
  return [...varint((number << 3) | 2), ...varint(bytes.length), ...bytes];
}

function onesieRequest(encryptedClientKey) {
  const encryptedRequest = bytesField(5, encryptedClientKey);
  return Uint8Array.from(bytesField(3, encryptedRequest));
}

function runRequest({ url, headers, bodyBytes, initialConfig }) {
  const completions = [];
  const writes = [];
  let fetchCount = 0;
  let storedConfig = JSON.stringify(initialConfig || {});
  const context = {
    $request: { method: "POST", url, headers, body: bodyBytes },
    $response: {},
    $persistentStore: {
      read(key) {
        if (key !== "YouTubeConfig") return null;
        return storedConfig;
      },
      write(value, key) {
        if (key === "YouTubeConfig") storedConfig = value;
        writes.push({ key, value });
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
    ArrayBuffer,
    DataView,
  };

  vm.runInNewContext(source, context, { filename: "youtube-native-request.js" });
  return { completions, writes, fetchCount };
}

const userAgent = "YouTube/21.31.3 (iPhone; iOS 27.0)";
const expectedEncryptKey = Uint8Array.from([1, 2, 3, 4]);
const mismatch = runRequest({
  url: "https://rr1---sn.example.googlevideo.com/initplayback?id=1&ack=1",
  headers: { "User-Agent": userAgent },
  bodyBytes: onesieRequest(Uint8Array.from([9, 9, 9, 9])),
  initialConfig: {
    youtube: {
      clientKey: Buffer.from([5, 6, 7, 8]).toString("base64"),
      encryptKey: Buffer.from(expectedEncryptKey).toString("base64"),
    },
  },
});

assert.equal(mismatch.fetchCount, 0, "request handling must not call a remote Worker");
assert.equal(mismatch.completions.length, 1);
const mismatchResponse = mismatch.completions[0].response || mismatch.completions[0];
assert.equal(mismatchResponse.status, 200);
assert.equal(mismatchResponse.body.byteLength, 0);
assert.equal(mismatch.writes.length, 1, "mismatched key must clear the cached platform key");
assert.deepEqual(JSON.parse(mismatch.writes[0].value), {});

const legacyMissingExpiry = runRequest({
  url: "https://rr1---sn.example.googlevideo.com/initplayback?id=1&ack=1",
  headers: { "User-Agent": userAgent },
  bodyBytes: onesieRequest(expectedEncryptKey),
  initialConfig: {
    youtube: {
      clientKey: Buffer.from([5, 6, 7, 8]).toString("base64"),
      encryptKey: Buffer.from(expectedEncryptKey).toString("base64"),
    },
  },
});

const legacyMissingExpiryResponse =
  legacyMissingExpiry.completions[0].response || legacyMissingExpiry.completions[0];
assert.equal(legacyMissingExpiryResponse.status, 200);
assert.equal(legacyMissingExpiryResponse.body.byteLength, 0);
assert.deepEqual(
  JSON.parse(legacyMissingExpiry.writes[0].value),
  {},
  "legacy key cache without expiresAt must be cleared and refreshed",
);

const matching = runRequest({
  url: "https://rr1---sn.example.googlevideo.com/initplayback?id=1&ack=1",
  headers: { "User-Agent": userAgent },
  bodyBytes: onesieRequest(expectedEncryptKey),
  initialConfig: {
    youtube: {
      clientKey: Buffer.from([5, 6, 7, 8]).toString("base64"),
      encryptKey: Buffer.from(expectedEncryptKey).toString("base64"),
      expiresAt: Date.now() + 60_000,
    },
  },
});

assert.equal(matching.fetchCount, 0);
assert.equal(matching.completions.length, 1);
assert.deepEqual(
  Object.keys(matching.completions[0]),
  [],
  "matching key must leave initplayback unchanged",
);
assert.deepEqual(matching.writes, []);

const logEvent = runRequest({
  url: "https://youtubei.googleapis.com/youtubei/v1/log_event",
  headers: {
    "User-Agent": userAgent,
    "X-YouTube-Hot-Hash-Data": "stale-hash",
  },
  bodyBytes: new Uint8Array(0),
  initialConfig: {},
});

assert.equal(logEvent.fetchCount, 0);
const rewrittenHeaders = logEvent.completions[0].headers;
assert.equal(
  Object.keys(rewrittenHeaders).some((key) => key.toLowerCase() === "x-youtube-hot-hash-data"),
  false,
  "missing key cache must remove the hot-hash header so YouTube returns fresh config",
);

const partialLogEvent = runRequest({
  url: "https://youtubei.googleapis.com/youtubei/v1/log_event",
  headers: {
    "User-Agent": userAgent,
    "X-YouTube-Hot-Hash-Data": "stale-hash",
    "Content-Encoding": "gzip",
  },
  bodyBytes: new Uint8Array(0),
  initialConfig: {
    youtube: { clientKey: Buffer.from([5, 6, 7, 8]).toString("base64") },
  },
});
const partialHeaders = partialLogEvent.completions[0].headers;
assert.equal(
  Object.keys(partialHeaders).some((key) => key.toLowerCase() === "x-youtube-hot-hash-data"),
  false,
  "partial key cache must request a fresh hot config",
);
assert.equal(
  Object.keys(partialHeaders).some((key) => key.toLowerCase() === "content-encoding"),
  false,
  "log_event must remove content-encoding after Surge exposes a decoded body",
);
assert.deepEqual(JSON.parse(partialLogEvent.writes[0].value), {});

const validLogEvent = runRequest({
  url: "https://youtubei.googleapis.com/youtubei/v1/log_event",
  headers: {
    "User-Agent": userAgent,
    "X-YouTube-Hot-Hash-Data": "current-hash",
    "content-encoding": "gzip",
  },
  bodyBytes: new Uint8Array(0),
  initialConfig: {
    youtube: {
      clientKey: Buffer.from([5, 6, 7, 8]).toString("base64"),
      encryptKey: Buffer.from(expectedEncryptKey).toString("base64"),
      expiresAt: Date.now() + 60_000,
    },
  },
});
const validHeaders = validLogEvent.completions[0].headers;
assert.equal(
  validHeaders["X-YouTube-Hot-Hash-Data"],
  "current-hash",
  "valid key cache must retain the current hot-hash",
);
assert.equal(
  Object.keys(validHeaders).some((key) => key.toLowerCase() === "content-encoding"),
  false,
);
assert.deepEqual(validLogEvent.writes, []);

const expiredLogEvent = runRequest({
  url: "https://youtubei.googleapis.com/youtubei/v1/log_event",
  headers: {
    "User-Agent": userAgent,
    "X-YouTube-Hot-Hash-Data": "expired-hash",
    "Content-Encoding": "gzip",
  },
  bodyBytes: new Uint8Array(0),
  initialConfig: {
    youtube: {
      clientKey: Buffer.from([5, 6, 7, 8]).toString("base64"),
      encryptKey: Buffer.from(expectedEncryptKey).toString("base64"),
      expiresAt: Date.now() - 1,
    },
  },
});
const expiredHeaders = expiredLogEvent.completions[0].headers;
assert.equal(
  Object.keys(expiredHeaders).some((key) => key.toLowerCase() === "x-youtube-hot-hash-data"),
  false,
);
assert.deepEqual(JSON.parse(expiredLogEvent.writes[0].value), {});

const expiredInit = runRequest({
  url: "https://rr1---sn.example.googlevideo.com/initplayback?id=1&ack=1",
  headers: { "User-Agent": userAgent },
  bodyBytes: onesieRequest(expectedEncryptKey),
  initialConfig: {
    youtube: {
      clientKey: Buffer.from([5, 6, 7, 8]).toString("base64"),
      encryptKey: Buffer.from(expectedEncryptKey).toString("base64"),
      expiresAt: Date.now() - 1,
    },
  },
});
const expiredInitResponse = expiredInit.completions[0].response || expiredInit.completions[0];
assert.equal(expiredInitResponse.status, 200);
assert.equal(expiredInitResponse.body.byteLength, 0);
assert.deepEqual(JSON.parse(expiredInit.writes[0].value), {});

console.log("PASS: native initplayback request handling stays local and refreshes stale keys");
