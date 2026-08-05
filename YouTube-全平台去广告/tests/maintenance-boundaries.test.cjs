const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const markers = [
  "[COMMON / 多客户端通用]",
  "[WEB / 网页专用]",
  "[MOBILE / 移动端专用]",
  "[TVOS / Apple TV 专用]",
];

const fullyScopedFiles = [
  "scripts/web/youtube-web-page.js",
  "scripts/web/youtube-web-response.js",
  "scripts/native/youtube-native-response.js",
];

for (const relativePath of fullyScopedFiles) {
  const source = fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
  for (const marker of markers) {
    assert.ok(
      source.includes(marker),
      `${relativePath} 缺少维护边界注释：${marker}`,
    );
  }
}

const webModuleSource = fs.readFileSync(
  path.join(projectRoot, "clients/surge/YouTube-All-Platform-AdBlock.sgmodule"),
  "utf8",
);
for (const marker of ["[COMMON / 多客户端通用]", "[WEB / 网页专用]"]) {
  assert.ok(webModuleSource.includes(marker), `网页模块缺少维护边界注释：${marker}`);
}
for (const marker of ["[MOBILE / 移动端专用]", "[TVOS / Apple TV 专用]"]) {
  assert.ok(!webModuleSource.includes(marker), `网页模块不得包含原生平台区段：${marker}`);
}

const architecture = fs.readFileSync(
  path.join(projectRoot, "docs/ARCHITECTURE.md"),
  "utf8",
);
for (const marker of markers) {
  assert.ok(architecture.includes(marker), `架构文档缺少维护边界标记：${marker}`);
}

console.log("PASS: platform boundary comments are complete");
