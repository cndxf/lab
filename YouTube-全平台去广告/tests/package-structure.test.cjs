const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(projectRoot, "..");
const version = fs.readFileSync(path.join(projectRoot, "VERSION"), "utf8").trim();
const baseModulePath = path.join(
  projectRoot,
  "clients/surge/YouTube-All-Platform-AdBlock.sgmodule",
);
const nativeModulePath = path.join(
  projectRoot,
  "clients/surge/YouTube-iOS-tvOS-AdBlock.sgmodule",
);
const distBaseModulePath = path.join(repoRoot, "dist/youtube/YouTube-AdBlock.sgmodule");
const distNativeModulePath = path.join(
  repoRoot,
  "dist/youtube/YouTube-iOS-tvOS-AdBlock.sgmodule",
);
const escapedVersion = version.replaceAll(".", "\\.");
const releaseScriptsPath = `releases/${version}/scripts`;

assert.match(version, /^\d+\.\d+\.\d+$/, "维护版本必须使用 semver 三段格式");

const baseModuleSource = fs.readFileSync(baseModulePath, "utf8");
const nativeModuleSource = fs.readFileSync(nativeModulePath, "utf8");
assert.match(baseModuleSource, new RegExp(`^#!name=v${escapedVersion} · YouTube 全平台去广告$`, "m"));
assert.match(
  baseModuleSource,
  new RegExp(`^#!desc=版本：v${escapedVersion} \| .*网页.*$`, "m"),
);
assert.match(baseModuleSource, /^#!desc=.*网页.*$/m);
assert.match(nativeModuleSource, new RegExp(`^#!name=v${escapedVersion} · YouTube iOS\\/tvOS 去广告$`, "m"));
assert.match(
  nativeModuleSource,
  new RegExp(`^#!desc=版本：v${escapedVersion} \| .*Apple TV.*$`, "m"),
);
for (const moduleSource of [baseModuleSource, nativeModuleSource]) {
  assert.match(moduleSource, /^\[Rule\]$/m);
  assert.match(moduleSource, /^\[Script\]$/m);
  assert.match(moduleSource, /^\[MITM\]$/m);
}
for (const requiredText of ["证书信任设置", "更新方法", "无法播放", "回滚方法"]) {
  assert.match(baseModuleSource, new RegExp(requiredText), `基础模块内置说明缺少：${requiredText}`);
  assert.match(nativeModuleSource, new RegExp(requiredText), `iOS/tvOS 模块内置说明缺少：${requiredText}`);
}
for (const moduleSource of [baseModuleSource, nativeModuleSource]) {
  assert.match(moduleSource, /hostname = \*/,
    "模块必须明确警告全局 hostname=* 的风险");
  assert.match(moduleSource, /捕获全部 HTTPS/,
    "模块必须明确警告全量 HTTPS 捕获的风险");
}

for (const scriptName of [
  "youtube-web-page.js",
  "youtube-web-response.js",
]) {
  const escapedName = scriptName.replaceAll(".", "\\.");
  assert.match(
    baseModuleSource,
    new RegExp(
      `script-path=https://raw\\.githubusercontent\\.com/cndxf/lab/main/dist/youtube/releases/${escapedVersion}/scripts/${escapedName}\\?v=${escapedVersion}`,
    ),
    `${scriptName} 必须使用不可变的版本目录和版本参数`,
  );
}

for (const scriptRule of baseModuleSource.match(/^youtube\..*script-path=.*$/gm) || []) {
  assert.match(
    scriptRule,
    /script-update-interval=\{\{\{update_interval\}\}\}/,
    "每条远程脚本规则都必须使用模块更新间隔参数",
  );
}

assert.match(
  baseModuleSource,
  /^hostname = %APPEND% www\.youtube\.com, m\.youtube\.com, music\.youtube\.com, youtubei\.googleapis\.com$/m,
);
const activeModuleSource = baseModuleSource
  .split("\n")
  .filter((line) => line.trim() && !line.trimStart().startsWith("#"))
  .join("\n");
assert.doesNotMatch(
  activeModuleSource,
  /youtube\.native\.|init-stream\.maasea\.workers\.dev|\*\.googlevideo\.com/,
  "网页安全模块不得加载原生脚本、原生请求改写或 googlevideo MITM",
);

assert.equal(
  fs.readFileSync(distBaseModulePath, "utf8"),
  baseModuleSource,
  "公开分发基础模块必须与 Surge 适配器源文件完全一致",
);
assert.equal(
  fs.readFileSync(distNativeModulePath, "utf8"),
  nativeModuleSource,
  "公开分发 iOS/tvOS 模块必须与 Surge 适配器源文件完全一致",
);

const checksumPath = path.join(repoRoot, "dist/youtube/SHA256SUMS");
const checksumEntries = new Map(
  fs
    .readFileSync(checksumPath, "utf8")
    .trim()
    .split("\n")
    .map((line) => {
      const match = line.match(/^([a-f0-9]{64})  (.+)$/);
      assert.ok(match, `无效的 SHA256SUMS 行：${line}`);
      return [match[2], match[1]];
    }),
);

for (const relativePath of [
  "VERSION",
  "YouTube-AdBlock.sgmodule",
  "YouTube-iOS-tvOS-AdBlock.sgmodule",
  `${releaseScriptsPath}/youtube-web-page.js`,
  `${releaseScriptsPath}/youtube-web-response.js`,
  `${releaseScriptsPath}/youtube-native-response.js`,
  `${releaseScriptsPath}/youtube-native-request.js`,
  `${releaseScriptsPath}/youtube-native-ump.js`,
  `${releaseScriptsPath}/youtube-tvos-json.js`,
]) {
  const filePath = path.join(repoRoot, "dist/youtube", relativePath);
  const actual = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  assert.equal(checksumEntries.get(relativePath), actual, `${relativePath} 哈希不一致`);
}
assert.equal(checksumEntries.size, 9, "SHA256SUMS 必须包含九个受管分发文件");

const scopedSources = [
  ["scripts/web/youtube-web-page.js", "Scope: Web only"],
  ["scripts/web/youtube-web-response.js", "Scope: Web only"],
  ["scripts/native/youtube-native-response.js", "Scope: Native mobile"],
  ["scripts/native/youtube-native-request.js", "Scope: Native initplayback request"],
  ["scripts/native/youtube-native-ump.js", "Scope: Native encrypted stream"],
  ["scripts/tvos/youtube-tvos-json.js", "[TVOS / Apple TV 专用]"],
];

for (const [relativePath, marker] of scopedSources) {
  const source = fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
  assert.match(source, new RegExp(marker), `${relativePath} 缺少平台边界注释`);
}

const nativeSource = fs.readFileSync(
  path.join(projectRoot, "scripts/native/youtube-native-response.js"),
  "utf8",
);
assert.match(nativeSource, /Maasea\/sgmodule/);
assert.match(nativeSource, /65075cdb388fc5e3094afd7e7314c67b243f3525/);
assert.match(nativeSource, /Apache License 2\.0/);
assert.match(nativeSource, /Apple TV: experimental/);

const reviewedNativeBodies = new Map([
  ["scripts/native/youtube-native-request.js", "e3cd9580112bde3bc6380e6a7d8c98991cf2e615f0b2309f3d8061112aad543d"],
  ["scripts/native/youtube-native-ump.js", "96f7637b9b00ad09d0aae08ba1dc170c3d6bb6effc2535244561254ad461e47a"],
]);
for (const [relativePath, expectedBodyHash] of reviewedNativeBodies) {
  const source = fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
  assert.match(source, /2ead6ff5950d7722c4aa6658998904ef78eee531/);
  assert.match(source, /Apache License 2\.0/);
  assert.doesNotMatch(source, /workers\.dev|init-stream\.maasea/);
  const upstreamBody = source.slice(source.indexOf("// Build:")).trimEnd();
  const actualBodyHash = crypto.createHash("sha256").update(upstreamBody).digest("hex");
  assert.equal(actualBodyHash, expectedBodyHash, `${relativePath} 已偏离审核后的本地构建体`);
}

const installGuide = fs.readFileSync(
  path.join(projectRoot, "clients/surge/安装说明.md"),
  "utf8",
);
for (const requiredText of [
  "一键安装",
  "iPhone / iPad",
  "macOS",
  "证书信任设置",
  "更新模块",
  "回滚",
  "Apple TV",
  "无法播放",
]) {
  assert.match(installGuide, new RegExp(requiredText), `安装说明缺少：${requiredText}`);
}

for (const client of ["stash", "shadowrocket"]) {
  const clientReadme = fs.readFileSync(
    path.join(projectRoot, `clients/${client}/README.md`),
    "utf8",
  );
  assert.match(clientReadme, /尚未完成真实设备验证/);
  assert.doesNotMatch(clientReadme, /install-module|一键安装按钮/);
}

const tvosReadme = fs.readFileSync(
  path.join(projectRoot, "scripts/tvos/README.md"),
  "utf8",
);
assert.match(tvosReadme, /Apple TV/);
assert.match(tvosReadme, /实验性/);
assert.match(tvosReadme, /不得标记为已验证/);

const surgeValidator = fs.readFileSync(
  path.join(projectRoot, "tools/validate-surge-module.sh"),
  "utf8",
);
assert.match(surgeValidator, /surge-cli/);
assert.match(surgeValidator, /FINAL,DIRECT/);
assert.match(surgeValidator, /%APPEND%/);
assert.match(surgeValidator, /--check/);

console.log("PASS: package structure, update policy, and platform boundaries");
