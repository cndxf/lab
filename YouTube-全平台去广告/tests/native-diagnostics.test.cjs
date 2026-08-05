const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(
  path.join(projectRoot, "scripts/native/youtube-native-response.js"),
  "utf8",
);
const block = source.match(
  /\/\* BEGIN LOCAL NATIVE DIAGNOSTICS \*\/([\s\S]*?)\/\* END LOCAL NATIVE DIAGNOSTICS \*\//,
);

assert.ok(block, "native script must expose the testable local diagnostics prelude");

function runDiagnostics({ argument, request, response }) {
  const logs = [];
  const context = {
    $argument: argument,
    $request: request,
    $response: response,
    console: {
      log(value) {
        logs.push(String(value));
      },
    },
    URL,
    Uint8Array,
  };

  vm.runInNewContext(block[1], context);
  return logs;
}

const tvosLogs = runDiagnostics({
  argument: JSON.stringify({ debug: true }),
  request: {
    method: "POST",
    url: "https://youtubei.googleapis.com/youtubei/v1/player?videoId=secret-video-id",
    headers: {
      "User-Agent": "com.google.ios.youtube/20.30.1 (AppleTV; tvOS 27.0)",
      "X-YouTube-Client-Name": "29",
      "X-YouTube-Client-Version": "20.30.1",
      Authorization: "Bearer secret-token",
      Cookie: "SID=secret-cookie",
    },
  },
  response: {
    headers: { "Content-Type": "application/x-protobuf" },
    bodyBytes: new Uint8Array(321),
  },
});

assert.equal(tvosLogs.length, 1, "debug mode should emit one compact context event");
assert.match(tvosLogs[0], /^\[YTAB\]\[native-context\] /);
const tvosEvent = JSON.parse(tvosLogs[0].replace(/^\[YTAB\]\[native-context\] /, ""));
assert.deepEqual(
  JSON.parse(JSON.stringify(tvosEvent)),
  {
    event: "native-response",
    platform: "tvos",
    endpoint: "player",
    method: "POST",
    clientName: "29",
    clientVersion: "20.30.1",
    contentType: "application/x-protobuf",
    responseBytes: 321,
  },
);
assert.doesNotMatch(tvosLogs[0], /secret-video-id|secret-token|secret-cookie/);

const iosLogs = runDiagnostics({
  argument: { debug: "true" },
  request: {
    method: "POST",
    url: "https://youtubei.googleapis.com/youtubei/v1/reel/reel_watch_sequence?foo=bar",
    headers: { "user-agent": "YouTube/20.30 (iPhone; iOS 27.0)" },
  },
  response: { body: "abc" },
});
const iosEvent = JSON.parse(iosLogs[0].replace(/^\[YTAB\]\[native-context\] /, ""));
assert.equal(iosEvent.platform, "ios");
assert.equal(iosEvent.endpoint, "reel/reel_watch_sequence");
assert.equal(iosEvent.responseBytes, 3);

assert.deepEqual(
  runDiagnostics({
    argument: JSON.stringify({ debug: false }),
    request: { url: "https://youtubei.googleapis.com/youtubei/v1/player", headers: {} },
    response: { bodyBytes: new Uint8Array(1) },
  }),
  [],
  "disabled diagnostics must stay silent",
);

assert.deepEqual(
  runDiagnostics({
    argument: "not-json",
    request: { url: "https://youtubei.googleapis.com/youtubei/v1/player", headers: {} },
    response: {},
  }),
  [],
  "malformed arguments must not affect native response processing",
);

console.log("PASS: native diagnostics identify tvOS without logging sensitive request data");
