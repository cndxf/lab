const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const pageScript = fs.readFileSync(
  path.resolve(__dirname, "../scripts/web/youtube-web-page.js"),
  "utf8",
);

assert.doesNotMatch(
  pageScript,
  /data-surge-youtube|__surgeYouTube/,
  "网页运行时标记必须使用客户端无关名称",
);
assert.match(pageScript, /data-youtube-adblock-skipper/);
assert.match(pageScript, /data-youtube-adblock-active/);
assert.match(pageScript, /data-youtube-adblock-version/);
assert.match(pageScript, /window\.__youtubeAdBlockRuntime/);

console.log("PASS: web runtime names are client-neutral");
