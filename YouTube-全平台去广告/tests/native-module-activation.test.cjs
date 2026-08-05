const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const checkerPath = path.join(projectRoot, "tools/check-surge-native-effective.sh");
const version = fs.readFileSync(path.join(projectRoot, "VERSION"), "utf8").trim();

assert.ok(fs.existsSync(checkerPath), "必须提供 iOS/tvOS 有效配置检查工具");
const checker = fs.readFileSync(checkerPath, "utf8");
assert.match(checker, /youtube\.native\.response/);
assert.match(checker, /youtube\.tvos\.json/);
assert.match(checker, /googlevideo/);

function runChecker(profile) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "youtube-native-effective-profile-"));
  const profilePath = path.join(temporaryDirectory, "effective.conf");
  fs.writeFileSync(profilePath, profile);
  const result = spawnSync(checkerPath, [], {
    encoding: "utf8",
    env: { ...process.env, SURGE_EFFECTIVE_PROFILE_FILE: profilePath },
  });
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  return result;
}

const releaseRoot = `/releases/${version}/scripts/`;
const validNativeProfile = `
[MITM]
hostname = www.youtube.com, m.youtube.com, youtubei.googleapis.com, *.googlevideo.com

[Script]
youtube.native.response = type=http-response,script-path=${releaseRoot}youtube-native-response.js
youtube.native.request.init = type=http-request,script-path=${releaseRoot}youtube-native-request.js
youtube.native.response.init = type=http-response,script-path=${releaseRoot}youtube-native-ump.js
youtube.tvos.json = type=http-response,script-path=${releaseRoot}youtube-tvos-json.js
`;

const validResult = runChecker(validNativeProfile);
assert.equal(validResult.status, 0, validResult.stderr || validResult.stdout);

const wildcardMitmResult = runChecker(
  validNativeProfile.replace(
    "hostname = www.youtube.com, m.youtube.com, youtubei.googleapis.com, *.googlevideo.com",
    "hostname = *, www.youtube.com, m.youtube.com, youtubei.googleapis.com, *.googlevideo.com",
  ),
);
assert.equal(wildcardMitmResult.status, 1, "全局 * MITM 必须检查失败，避免证书固定应用和普通网站一起断网");
assert.match(
  `${wildcardMitmResult.stdout}\n${wildcardMitmResult.stderr}`,
  /GLOBAL_MITM_WILDCARD/,
);

const missingTvosResult = runChecker(
  validNativeProfile.replace(/youtube\.tvos\.json.*\n/, ""),
);
assert.equal(missingTvosResult.status, 1, "缺少 tvOS JSON 规则必须检查失败");
assert.match(`${missingTvosResult.stdout}\n${missingTvosResult.stderr}`, /MISSING/);

const staleResult = runChecker(
  validNativeProfile.replaceAll(`/releases/${version}/`, "/releases/1.2.8/"),
);
assert.equal(staleResult.status, 1, "旧版本原生脚本必须检查失败");
assert.match(`${staleResult.stdout}\n${staleResult.stderr}`, /STALE/);

const duplicateResult = runChecker(`${validNativeProfile}\n${validNativeProfile}`);
assert.equal(duplicateResult.status, 1, "重复原生模块必须检查失败");
assert.match(`${duplicateResult.stdout}\n${duplicateResult.stderr}`, /DUPLICATE/);

const webOnlyResult = runChecker(
  "hostname = www.youtube.com, m.youtube.com, youtubei.googleapis.com\n" +
    `youtube.web.response = type=http-response,script-path=/releases/${version}/scripts/youtube-web-response.js\n`,
);
assert.equal(webOnlyResult.status, 1, "网页模块不能被视为原生模块已部署");
assert.match(`${webOnlyResult.stdout}\n${webOnlyResult.stderr}`, /NATIVE_MISSING/);

console.log("PASS: native iOS/tvOS effective-profile checker");
