const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(projectRoot, "..");
const moduleSource = fs.readFileSync(
  path.join(projectRoot, "clients/surge/YouTube-All-Platform-AdBlock.sgmodule"),
  "utf8",
);
const installGuide = fs.readFileSync(
  path.join(projectRoot, "clients/surge/安装说明.md"),
  "utf8",
);
const installer = fs.readFileSync(path.join(repoRoot, "surge-install.html"), "utf8");
const checkerPath = path.join(projectRoot, "tools/check-surge-effective.sh");
const version = fs.readFileSync(path.join(projectRoot, "VERSION"), "utf8").trim();

assert.match(moduleSource, /^#!desc=.*hostname=\*.*有效配置.*$/m);

for (const requiredText of [
  "安装完成不等于启用",
  "每台设备单独启用",
  "修改后的有效配置",
  "不会复制到主配置",
  "hostname = *",
  "捕获全部 HTTPS",
]) {
  assert.match(installGuide, new RegExp(requiredText), `安装说明缺少：${requiredText}`);
}

for (const requiredText of ["安装完成后", "模块列表", "启用开关"]) {
  assert.match(installer, new RegExp(requiredText), `中转页缺少：${requiredText}`);
}

assert.ok(fs.existsSync(checkerPath), "必须提供 Mac 有效配置检查工具");
const checker = fs.readFileSync(checkerPath, "utf8");
assert.match(checker, /dump profile effective/);
for (const scriptName of [
  "youtube.web.response",
  "youtube.web.page",
]) {
  assert.match(checker, new RegExp(scriptName.replaceAll(".", "\\.")));
}
assert.doesNotMatch(checker, /youtube\.native\.response/);

function runChecker(profile) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "youtube-effective-profile-"));
  const profilePath = path.join(temporaryDirectory, "effective.conf");
  fs.writeFileSync(profilePath, profile);
  const result = spawnSync(checkerPath, [], {
    encoding: "utf8",
    env: { ...process.env, SURGE_EFFECTIVE_PROFILE_FILE: profilePath },
  });
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  return result;
}

const currentEffectiveProfile = `
youtube.web.response = type=http-response,pattern=^https:\\/\\/www\\.youtube\\.com\\/youtubei\\/v1\\/(?:next|browse|search|get_watch|player|player\\/ad_break)$,script-path=/tmp/dist/youtube/releases/${version}/scripts/youtube-web-response.js
youtube.web.page = type=http-response,pattern=^https:\\/\\/www\\.youtube\\.com\\/watch$,script-path=/tmp/dist/youtube/releases/${version}/scripts/youtube-web-page.js
`;
const currentResult = runChecker(currentEffectiveProfile);
assert.equal(currentResult.status, 0, currentResult.stderr || currentResult.stdout);

const wildcardMitmResult = runChecker(
  `${currentEffectiveProfile}\nhostname = *, www.youtube.com, m.youtube.com, youtubei.googleapis.com\n`,
);
assert.equal(wildcardMitmResult.status, 1, "全局 * MITM 必须检查失败");
assert.match(
  `${wildcardMitmResult.stdout}\n${wildcardMitmResult.stderr}`,
  /GLOBAL_MITM_WILDCARD/,
);

const mixedNativeResult = runChecker(
  `${currentEffectiveProfile}\n` +
    "youtube.native.response = type=http-response,script-path=/tmp/dist/youtube/releases/" +
    `${version}/scripts/youtube-native-response.js\n`,
);
assert.equal(
  mixedNativeResult.status,
  1,
  "Mac 有效配置混入 iOS/tvOS 原生脚本时必须检查失败",
);
assert.match(
  `${mixedNativeResult.stdout}\n${mixedNativeResult.stderr}`,
  /NATIVE_CONFLICT/,
);

const duplicateResult = runChecker(`${currentEffectiveProfile}\n${currentEffectiveProfile}`);
assert.equal(duplicateResult.status, 1, "重复模块必须让有效配置检查失败");
assert.match(`${duplicateResult.stdout}\n${duplicateResult.stderr}`, /DUPLICATE/);

const staleResult = runChecker(
  currentEffectiveProfile.replace("|player\\/ad_break", ""),
);
assert.equal(staleResult.status, 1, "缺少 player/ad_break 的旧模块必须检查失败");
assert.match(`${staleResult.stdout}\n${staleResult.stderr}`, /STALE/);

const oldReleaseResult = runChecker(
  currentEffectiveProfile.replaceAll(`/releases/${version}/`, "/releases/1.2.7/"),
);
assert.equal(oldReleaseResult.status, 1, "旧版本脚本路径必须检查失败");
assert.match(`${oldReleaseResult.stdout}\n${oldReleaseResult.stderr}`, /STALE/);

console.log("PASS: module activation instructions and effective-profile checker");
