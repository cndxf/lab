const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const version = fs.readFileSync(path.join(projectRoot, "VERSION"), "utf8").trim();
const escapedVersion = version.replaceAll(".", "\\.");
const modulePath = path.join(
  projectRoot,
  "clients/surge/YouTube-iOS-tvOS-AdBlock.sgmodule",
);
const requestScriptPath = path.join(
  projectRoot,
  "scripts/native/youtube-native-request.js",
);
const umpScriptPath = path.join(
  projectRoot,
  "scripts/native/youtube-native-ump.js",
);

assert.ok(
  fs.existsSync(modulePath),
  "iOS/tvOS must have a dedicated module so googlevideo MITM does not affect macOS web playback",
);
assert.ok(fs.existsSync(requestScriptPath), "native initplayback request script is missing");
assert.ok(fs.existsSync(umpScriptPath), "native UMP response script is missing");

const moduleSource = fs.readFileSync(modulePath, "utf8");
assert.match(
  moduleSource,
  new RegExp(`^#!name=v${escapedVersion} · YouTube iOS\\/tvOS 去广告$`, "m"),
);
assert.match(
  moduleSource,
  /^#!requirement=CORE_VERSION >= 20 && \(SYSTEM = 'iOS' \|\| SYSTEM = 'tvOS'\)$/m,
  "native stream module must be limited to iOS and tvOS",
);
assert.match(moduleSource, /youtube\.native\.response = type=http-response/);
assert.match(moduleSource, /youtube\.native\.request\.init = type=http-request/);
assert.match(moduleSource, /youtube\.native\.response\.init = type=http-response/);
assert.match(moduleSource, /youtube\.native\.request\.log_event = type=http-request/);
assert.match(moduleSource, /\*\.googlevideo\.com/);
assert.match(moduleSource, /youtubei\.googleapis\.com/);
const activeModuleSource = moduleSource
  .split("\n")
  .filter((line) => line.trim() && !line.trimStart().startsWith("#"))
  .join("\n");
assert.doesNotMatch(
  activeModuleSource,
  /workers\.dev|init-stream\.maasea/,
  "native stream processing must remain local and must not forward playback metadata to a third-party Worker",
);

for (const scriptName of [
  "youtube-native-response.js",
  "youtube-native-request.js",
  "youtube-native-ump.js",
]) {
  const escapedName = scriptName.replaceAll(".", "\\.");
  assert.match(
    moduleSource,
    new RegExp(
      `script-path=https://raw\\.githubusercontent\\.com/cndxf/lab/main/dist/youtube/releases/${escapedVersion}/scripts/${escapedName}\\?v=${escapedVersion}`,
    ),
    `${scriptName} must use an immutable versioned public distribution URL`,
  );
}

for (const [scriptPath, marker] of [
  [requestScriptPath, "Scope: Native initplayback request"],
  [umpScriptPath, "Scope: Native encrypted stream"],
]) {
  const source = fs.readFileSync(scriptPath, "utf8");
  assert.match(source, new RegExp(marker), `${path.basename(scriptPath)} is missing its scope marker`);
  assert.match(source, /Maasea\/sgmodule/);
  assert.match(source, /Apache License 2\.0/);
  assert.doesNotMatch(source, /workers\.dev|init-stream\.maasea/);
}

const baseModuleSource = fs.readFileSync(
  path.join(projectRoot, "clients/surge/YouTube-All-Platform-AdBlock.sgmodule"),
  "utf8",
);
const activeBaseModuleSource = baseModuleSource
  .split("\n")
  .filter((line) => line.trim() && !line.trimStart().startsWith("#"))
  .join("\n");
assert.match(
  baseModuleSource,
  /^#!requirement=CORE_VERSION >= 20 && SYSTEM = 'macOS'$/m,
  "web module must be limited to macOS so it is not deployed to iOS/tvOS",
);
assert.doesNotMatch(
  activeBaseModuleSource,
  /youtube\.native\.|\*\.googlevideo\.com/,
  "the web-safe module must not load native scripts or start MITM on googlevideo",
);

console.log("PASS: iOS/tvOS native stream module stays local and isolated from macOS web playback");
