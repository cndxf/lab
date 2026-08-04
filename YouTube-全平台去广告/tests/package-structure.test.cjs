const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(projectRoot, "..");
const version = fs.readFileSync(path.join(projectRoot, "VERSION"), "utf8").trim();
const modulePath = path.join(
  projectRoot,
  "clients/surge/YouTube-All-Platform-AdBlock.sgmodule",
);
const distModulePath = path.join(repoRoot, "dist/youtube/YouTube-AdBlock.sgmodule");

assert.equal(version, "1.2.0", "首个全平台目录版本必须是 1.2.0");

const moduleSource = fs.readFileSync(modulePath, "utf8");
assert.match(moduleSource, /^#!name=YouTube 全平台去广告$/m);
assert.match(moduleSource, /^#!desc=.*网页.*移动.*Apple TV.*$/m);
assert.match(moduleSource, /^\[Rule\]$/m);
assert.match(moduleSource, /^\[Script\]$/m);
assert.match(moduleSource, /^\[MITM\]$/m);
for (const requiredText of ["证书信任设置", "更新方法", "无法播放", "回滚方法"]) {
  assert.match(moduleSource, new RegExp(requiredText), `模块内置说明缺少：${requiredText}`);
}

for (const scriptName of [
  "youtube-web-page.js",
  "youtube-web-response.js",
  "youtube-native-response.js",
]) {
  const escapedName = scriptName.replaceAll(".", "\\.");
  assert.match(
    moduleSource,
    new RegExp(
      `script-path=https://raw\\.githubusercontent\\.com/cndxf/lab/main/dist/youtube/scripts/${escapedName}\\?v=${version}`,
    ),
    `${scriptName} 必须使用固定公开地址和版本参数`,
  );
}

for (const scriptRule of moduleSource.match(/^youtube\..*script-path=.*$/gm) || []) {
  assert.match(
    scriptRule,
    /script-update-interval=21600/,
    "每条远程脚本规则都必须每 6 小时检查更新",
  );
}

assert.match(
  moduleSource,
  /^hostname = %APPEND% www\.youtube\.com, m\.youtube\.com, youtubei\.googleapis\.com$/m,
);
const activeModuleSource = moduleSource
  .split("\n")
  .filter((line) => line.trim() && !line.trimStart().startsWith("#"))
  .join("\n");
assert.doesNotMatch(
  activeModuleSource,
  /youtube\.native\.request|init-stream\.maasea\.workers\.dev|\*\.googlevideo\.com/,
  "首版不得加入曾影响网页播放的原生请求改写或 googlevideo MITM",
);

assert.equal(
  fs.readFileSync(distModulePath, "utf8"),
  moduleSource,
  "公开分发模块必须与 Surge 适配器源文件完全一致",
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
  "scripts/youtube-web-page.js",
  "scripts/youtube-web-response.js",
  "scripts/youtube-native-response.js",
]) {
  const filePath = path.join(repoRoot, "dist/youtube", relativePath);
  const actual = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  assert.equal(checksumEntries.get(relativePath), actual, `${relativePath} 哈希不一致`);
}
assert.equal(checksumEntries.size, 5, "SHA256SUMS 只能包含五个受管分发文件");

const scopedSources = [
  ["scripts/web/youtube-web-page.js", "Scope: Web only"],
  ["scripts/web/youtube-web-response.js", "Scope: Web only"],
  ["scripts/native/youtube-native-response.js", "Scope: Native mobile"],
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
