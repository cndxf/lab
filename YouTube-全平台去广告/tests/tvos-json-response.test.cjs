const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(projectRoot, "scripts/tvos/youtube-tvos-json.js");
const modulePath = path.join(
  projectRoot,
  "clients/surge/YouTube-iOS-tvOS-AdBlock.sgmodule",
);

assert.ok(fs.existsSync(scriptPath), "tvOS JSON response script is missing");

function runScript(url, payload) {
  let result;
  const context = {
    $request: { url },
    $response: { body: typeof payload === "string" ? payload : JSON.stringify(payload) },
    $done(value) {
      result = value;
    },
    console: { log() {} },
  };

  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, {
    filename: scriptPath,
  });
  return result;
}

const payload = {
  playerConfig: {
    ssapConfig: { ssapPrerollEnabled: true, entityId: "ssap-fixture" },
    playbackStartConfig: { startSeconds: 0 },
  },
  playerAds: [{ adPlacementRenderer: { config: { kind: "pre-roll" } } }],
  adPlacements: [{ adPlacementRenderer: { config: { kind: "mid-roll" } } }],
  adSlots: [{ adSlotRenderer: { slotId: "slot-1" } }],
  playbackTracking: {
    pageadViewthroughconversion: "sensitive-tracking-value",
    videoplayback: { start: "keep" },
  },
  videoDetails: { videoId: "tvos-fixture" },
};

const result = runScript(
  "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
  payload,
);
assert.ok(result?.body, "tvOS JSON player response must be rewritten");
const cleaned = JSON.parse(result.body);
assert.equal(cleaned.playerAds, undefined);
assert.equal(cleaned.adPlacements, undefined);
assert.equal(cleaned.adSlots, undefined);
assert.equal(
  cleaned.playerConfig.ssapConfig,
  undefined,
  "tvOS player JSON must remove server-side ad insertion config",
);
assert.deepEqual(
  cleaned.playerConfig.playbackStartConfig,
  payload.playerConfig.playbackStartConfig,
  "tvOS player JSON must preserve non-ad player configuration",
);
assert.equal(cleaned.playbackTracking.pageadViewthroughconversion, undefined);
assert.deepEqual(cleaned.playbackTracking.videoplayback, { start: "keep" });
assert.deepEqual(cleaned.videoDetails, payload.videoDetails);

const unchanged = runScript(
  "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
  "not-json",
);
assert.deepEqual(
  JSON.parse(JSON.stringify(unchanged)),
  {},
  "non-JSON tvOS bodies must pass through",
);

const version = fs.readFileSync(path.join(projectRoot, "VERSION"), "utf8").trim();
const moduleSource = fs.readFileSync(modulePath, "utf8");
assert.match(moduleSource, /^youtube\.tvos\.json = type=http-response/m);
assert.match(
  moduleSource,
  new RegExp(
    `script-path=https://raw\\.githubusercontent\\.com/cndxf/lab/main/dist/youtube/releases/${version.replaceAll(".", "\\.")}/scripts/youtube-tvos-json\\.js\\?v=${version.replaceAll(".", "\\.")}`,
  ),
);
assert.match(
  moduleSource,
  /youtubei\\\.googleapis\\\.com.*youtubei\\\/v1\\\/player/,
  "tvOS JSON rule must also match the youtubei API host",
);

console.log("PASS: tvOS JSON player responses remove pre-roll and mid-roll scheduling");
