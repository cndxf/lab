const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(projectRoot, "..");
const installers = [
  {
    pageName: "surge-install.html",
    pageUrl: "https://cndxf.github.io/lab/surge-install.html",
    moduleUrl:
      "https://raw.githubusercontent.com/cndxf/lab/main/dist/youtube/YouTube-AdBlock.sgmodule",
  },
  {
    pageName: "surge-install-native.html",
    pageUrl: "https://cndxf.github.io/lab/surge-install-native.html",
    moduleUrl:
      "https://raw.githubusercontent.com/cndxf/lab/main/dist/youtube/YouTube-iOS-tvOS-AdBlock.sgmodule",
  },
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const readmes = [
  path.join(repoRoot, "README.md"),
  path.join(projectRoot, "README.md"),
];

for (const readmePath of readmes) {
  const source = fs.readFileSync(readmePath, "utf8");
  for (const { pageUrl } of installers) {
    assert.match(
      source,
      new RegExp(escapeRegExp(pageUrl)),
      `${readmePath} 必须包含可被 GitHub 渲染的 HTTPS 导入入口：${pageUrl}`,
    );
  }
  assert.doesNotMatch(
    source,
    /\]\(surge:\/\//,
    `${readmePath} 不应直接使用 GitHub 会过滤的 surge:// Markdown 链接`,
  );
}

const publishCheckerPath = path.join(projectRoot, "tools/check-published.sh");
assert.ok(fs.existsSync(publishCheckerPath), "必须提供公开分发一致性检查工具");
const publishChecker = fs.readFileSync(publishCheckerPath, "utf8");
assert.match(publishChecker, /curl/);
assert.match(publishChecker, /VERSION/);
assert.match(publishChecker, /YOUTUBE_DIST_BASE_URL/);
assert.match(publishChecker, /ALLOW_LOCAL/);
assert.match(
  fs.readFileSync(path.join(projectRoot, "clients/surge/安装说明.md"), "utf8"),
  /check-published\.sh/,
  "安装说明必须提供发布前公开分发检查入口",
);
for (const { pageName, moduleUrl } of installers) {
  const installerPath = path.join(repoRoot, pageName);
  assert.ok(fs.existsSync(installerPath), `缺少 Surge 中转页：${pageName}`);
  const installer = fs.readFileSync(installerPath, "utf8");
  const surgeInstallUrl = `surge:///install-module?url=${encodeURIComponent(moduleUrl)}`;
  assert.match(installer, /<meta[^>]+name=["']viewport["']/i);
  assert.match(installer, /id=["']install["'][^>]+href=["']surge:\/\/\/install-module\?url=/i);
  assert.match(
    installer,
    new RegExp(escapeRegExp(surgeInstallUrl)),
    `${pageName} 必须指向固定的公开 Surge 模块`,
  );
  assert.match(installer, /window\.location\.(?:replace|assign)\(installUrl\)/);
  assert.match(installer, /id=["']fallback["']/i);
  assert.doesNotMatch(installer, /<script[^>]+src=/i, `${pageName} 不得依赖外部脚本`);
}

console.log("PASS: GitHub HTTPS entry and Surge one-click installer");
