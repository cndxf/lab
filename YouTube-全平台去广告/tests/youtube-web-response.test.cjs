const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const version = fs.readFileSync(path.join(projectRoot, "VERSION"), "utf8").trim();
const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const scriptPath = path.join(projectRoot, "scripts/web/youtube-web-response.js");
const pageScriptPath = path.join(projectRoot, "scripts/web/youtube-web-page.js");
const modulePath = path.join(
  projectRoot,
  "clients/surge/YouTube-All-Platform-AdBlock.sgmodule",
);
const nativeModulePath = path.join(
  projectRoot,
  "clients/surge/YouTube-iOS-tvOS-AdBlock.sgmodule",
);

function runSurgeScript(url, payload) {
  let result;
  const context = {
    $request: { url },
    $response: { body: JSON.stringify(payload) },
    $done(value) {
      result = value;
    },
    console: { log() {} },
  };

  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, {
    filename: scriptPath,
  });

  return result && result.body ? JSON.parse(result.body) : payload;
}

function runSurgeScriptWithResult(url, payload) {
  let result;
  const context = {
    $request: { url },
    $response: { body: JSON.stringify(payload) },
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

const playerAdState = {
  playerAds: [{ adPlacementRenderer: { config: { kind: "midroll" } } }],
  adPlacements: [{ adPlacementRenderer: { config: { kind: "midroll" } } }],
  adSlots: [{ adSlotRenderer: { slotId: "slot-1" } }],
  adBreakHeartbeatParams: "heartbeat",
};

const input = [{ playerResponse: { ...playerAdState, videoDetails: { videoId: "abc" } } }];
const output = runSurgeScript(
  "https://www.youtube.com/youtubei/v1/get_watch?prettyPrint=false",
  input,
);

assert.deepEqual(
  output[0].playerResponse,
  input[0].playerResponse,
  "get_watch 中的播放器广告状态必须保留，避免免费电影在服务端广告点卡住",
);

console.log("PASS: get_watch preserves nested player ad state");

const config = fs.readFileSync(modulePath, "utf8");
const nativeConfig = fs.readFileSync(nativeModulePath, "utf8");
const packageSnippet = config;
const responseRule = config.match(/^youtube\.web\.response = .*$/m)?.[0] || "";
const pageRule = config.match(/^youtube\.web\.page = .*$/m)?.[0] || "";
const packagePageRule =
  packageSnippet.match(/^youtube\.web\.page = .*$/m)?.[0] || "";
const packageResponseRule =
  packageSnippet.match(/^youtube\.web\.response = .*$/m)?.[0] || "";
const pagePatternSource =
  pageRule.match(/pattern=(.*?),requires-body=/)?.[1] || "(?!)";
const pagePattern = new RegExp(pagePatternSource);
const packagePagePatternSource =
  packagePageRule.match(/pattern=(.*?),requires-body=/)?.[1] || "(?!)";
const packagePagePattern = new RegExp(packagePagePatternSource);
const nativeResponseRule =
  nativeConfig.match(/^youtube\.native\.response = .*$/m)?.[0] || "";
const normalizedNativeResponseRule = nativeResponseRule.replaceAll("\\/", "/");
const mitmHostnameLine = config.match(/^hostname = .*$/m)?.[0] || "";
const googlevideoQuicRule =
  config.match(/^AND,\(\(DOMAIN-SUFFIX,googlevideo\.com\).*$/m)?.[0] || "";
const youtubeiQuicRule =
  config.match(/^AND,\(\(DOMAIN,youtubei\.googleapis\.com\).*$/m)?.[0] || "";

assert.match(
  responseRule,
  /next\|browse\|search/,
  "响应脚本必须接收 search 接口，才能在渲染前清理搜索推广项",
);
assert.match(
  responseRule,
  /reel\\\/reel_watch_sequence/,
  "响应脚本必须接收 Shorts 序列接口，才能在渲染前删除广告条目",
);

assert.doesNotMatch(
  responseRule,
  /(?:^|\|)player(?:\||,|\()/,
  "列表清理脚本不应扫描完整 player 响应，以免破坏服务端广告状态",
);
assert.match(
  responseRule,
  /player\\\/ad_break/,
  "响应脚本必须接收 player/ad_break，才能删除服务端下发的中插广告调度",
);

const adBreakPayload = {
  responseContext: { responseId: "ad-break-fixture" },
  playerAds: [
    {
      adPlacementRenderer: {
        config: { adPlacementConfig: { offsetStartMilliseconds: "68333" } },
      },
    },
  ],
  adThrottled: true,
  trackingParams: "keep-response-context",
};
const adBreakOutput = runSurgeScript(
  "https://www.youtube.com/youtubei/v1/player/ad_break?prettyPrint=false",
  adBreakPayload,
);
assert.equal(
  adBreakOutput.playerAds,
  undefined,
  "player/ad_break 的播放器广告调度必须被删除",
);
assert.equal(
  adBreakOutput.adThrottled,
  undefined,
  "player/ad_break 的广告限流标志必须被删除",
);
assert.deepEqual(
  adBreakOutput.responseContext,
  adBreakPayload.responseContext,
  "player/ad_break 的普通响应上下文必须保留",
);
console.log("PASS: web response removes player/ad_break scheduling");

const directPlayerPayload = {
  playerAds: [{ adPlacementRenderer: { config: { kind: "keep-player-state" } } }],
  playabilityStatus: { status: "OK" },
  videoDetails: { videoId: "direct-player-fixture" },
};
const directPlayerOutput = runSurgeScript(
  "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
  directPlayerPayload,
);
assert.deepEqual(
  directPlayerOutput,
  directPlayerPayload,
  "完整 player 响应仍必须保留播放器广告状态",
);
console.log("PASS: full player response remains untouched");

for (const route of [
  "shorts",
  "results",
  "feed",
  "channel",
  "embed",
  "playlist",
  "live",
  "post",
  "hashtag",
  "clip",
]) {
  assert.match(
    pageRule,
    new RegExp(route),
    `页面脚本必须覆盖 /${route}，以便清理动态插入的广告卡片`,
  );
}

assert.equal(
  pagePattern.test("https://www.youtube.com/shorts/"),
  true,
  "页面脚本必须匹配裸 /shorts/ 入口，避免前端重定向后整页未注入",
);
assert.equal(
  packagePagePattern.test("https://www.youtube.com/shorts/"),
  true,
  "维护包模板必须匹配裸 /shorts/ 入口，避免重新安装后恢复旧缺口",
);
assert.match(
  packagePageRule,
  new RegExp(
    `script-path=https://raw\\.githubusercontent\\.com/cndxf/lab/main/dist/youtube/releases/${escapedVersion}/scripts/youtube-web-page\\.js\\?v=${escapedVersion},script-update-interval=\\{\\{\\{update_interval\\}\\}\\}$`,
  ),
  "维护包模板必须指向受管页面脚本",
);
assert.equal(
  responseRule,
  packageResponseRule,
  "活动网页响应规则必须与维护包模板一致",
);
assert.equal(pageRule, packagePageRule, "活动页面规则必须与维护包模板一致");

assert.match(responseRule, /\(\?:www\|m\)/, "响应脚本必须同时覆盖桌面和移动站");
assert.match(pageRule, /\(\?:www\|m\)/, "页面脚本必须同时覆盖桌面和移动站");
assert.match(
  mitmHostnameLine,
  /www\.youtube\.com.*m\.youtube\.com/,
  "MITM 必须包含 www.youtube.com 与 m.youtube.com",
);

console.log("PASS: config covers search and the selected YouTube page routes");

const shortsNormalEntry = {
  command: {
    reelWatchEndpoint: {
      adClientParams: { isAd: false },
      videoId: "normal-short",
    },
  },
};
const shortsAdEntry = {
  command: {
    reelWatchEndpoint: {
      adClientParams: { isAd: true },
      videoId: "advertisement-short",
    },
  },
};
const shortsOutput = runSurgeScript(
  "https://www.youtube.com/youtubei/v1/reel/reel_watch_sequence?prettyPrint=false",
  { entries: [shortsNormalEntry, shortsAdEntry] },
);
assert.deepEqual(shortsOutput.entries, [shortsNormalEntry], "Shorts 必须只删除明确标记 isAd=true 的条目");
console.log("PASS: web response removes explicit Shorts ad entries");

const nestedJsonPrefix = "  \n\t";
const nestedJsonOutput = runSurgeScriptWithResult(
  "https://www.youtube.com/youtubei/v1/browse?prettyPrint=false",
  {
    response:
      nestedJsonPrefix +
      JSON.stringify({
        contents: [{ adSlotRenderer: { slotId: "nested-ad" } }],
        tracking: "keep-me",
      }),
  },
);
assert.ok(nestedJsonOutput?.body, "带前导空白的嵌套 JSON 广告被清理后必须返回修改后的响应");
const nestedJsonPayload = JSON.parse(nestedJsonOutput.body);
assert.equal(
  nestedJsonPayload.response.startsWith(nestedJsonPrefix),
  true,
  "清理嵌套 JSON 时必须保留原有前导空白",
);
assert.deepEqual(
  JSON.parse(nestedJsonPayload.response.trimStart()),
  { contents: [], tracking: "keep-me" },
  "带前导空白的嵌套 JSON 仍必须删除明确广告项",
);
console.log("PASS: web response cleans whitespace-prefixed nested JSON");

for (const endpoint of [
  "browse",
  "next",
  "player",
  "search",
  "reel/reel_watch_sequence",
  "get_watch",
  "log_event",
  "config",
]) {
  assert.equal(
    normalizedNativeResponseRule.includes(endpoint),
    true,
    `原生 App 响应脚本必须覆盖 ${endpoint}`,
  );
}
assert.match(
  nativeResponseRule,
  /binary-body-mode=1/,
  "原生 App protobuf 响应必须启用 binary-body-mode",
);
assert.equal(
  /^youtube\.native\.request\./m.test(config),
  false,
  "隐私最小配置不得启用会转发或误拦播放请求的原生请求脚本",
);
assert.equal(
  config.includes("init-stream.maasea.workers.dev"),
  false,
  "配置中不得包含第三方 initplayback Worker",
);
assert.match(
  googlevideoQuicRule,
  /^$/,
  "模块不得拦截 googlevideo QUIC，避免网页视频播放异常",
);
assert.match(
  youtubeiQuicRule,
  /^AND,\(\(DOMAIN,youtubei\.googleapis\.com\),\(PROTOCOL,UDP\)\),REJECT$/,
  "youtubei QUIC 必须快速拒绝并回落 TCP",
);
assert.match(
  mitmHostnameLine,
  /youtubei\.googleapis\.com/,
  "MITM 必须包含原生 App 的 youtubei.googleapis.com",
);
console.log("PASS: native YouTube uses privacy-minimal protobuf interception");

function transformPage(response) {
  let result;
  const context = {
    $response: response,
    $done(value) {
      result = value;
    },
    console: { log() {} },
  };

  vm.runInNewContext(fs.readFileSync(pageScriptPath, "utf8"), context, {
    filename: pageScriptPath,
  });

  return result;
}

function getInjectedPageScript() {
  const result = transformPage({
    body: "<html><body><main>content</main></body></html>",
  });

  const match = result.body.match(
    /<script[^>]*data-youtube-adblock-skipper[^>]*>([\s\S]*?)<\/script>/,
  );
  assert.ok(match, "页面响应中必须注入广告清理脚本");
  return match[1];
}

const injectedPageScript = getInjectedPageScript();
assert.match(
  injectedPageScript,
  new RegExp(`const VERSION="${escapedVersion}"`),
  "网页运行时版本必须与维护版本文件一致",
);

const visualAdSuppressionResult = transformPage({
  body: "<html><body><main>content</main></body></html>",
});
assert.match(
  visualAdSuppressionResult.body,
  /#movie_player\[data-youtube-adblock-active="true"\]\s*\{[^}]*opacity:\s*0\s*!important;/s,
  "只有运行时确认广告正在播放时才隐藏广告画面",
);
assert.doesNotMatch(
  visualAdSuppressionResult.body,
  /#movie_player\.ad-showing\s*\{[^}]*opacity:\s*0\s*!important;/s,
  "不得仅凭可能残留的 ad-showing 类名持续隐藏正片",
);
assert.match(
  visualAdSuppressionResult.body,
  /#player-container-inner\s*\{[^}]*background:\s*#000\s*!important;/s,
  "隐藏广告画面时播放器容器必须保持黑色背景",
);
console.log("PASS: page style visually suppresses detected player ads");

const cspNonceResult = transformPage({
  body: "<html><body><main>content</main></body></html>",
  headers: {
    "Content-Security-Policy":
      "script-src 'strict-dynamic' 'nonce-youtube-csp-nonce' 'unsafe-inline'",
  },
});
assert.match(
  cspNonceResult.body,
  /<script nonce="youtube-csp-nonce" data-youtube-adblock-skipper>/,
  "HTML 未携带 nonce 时必须从 CSP 响应头继承，避免浏览器保留脚本但拒绝执行",
);
console.log("PASS: page injection inherits the CSP response nonce");

const cacheControlResult = transformPage({
  body: "<html><body><main>content</main></body></html>",
  headers: {
    "Cache-Control": "public, max-age=3600",
    ETag: '"youtube-cache-tag"',
    "Last-Modified": "Tue, 04 Aug 2026 00:00:00 GMT",
    "Content-Length": "48",
    "Content-Type": "text/html; charset=utf-8",
  },
});
assert.equal(
  cacheControlResult.headers["Cache-Control"],
  "no-store, no-cache, must-revalidate, max-age=0",
  "已注入的 HTML 必须禁止缓存，避免浏览器复用未注入文档",
);
assert.equal(cacheControlResult.headers.Pragma, "no-cache");
assert.equal(cacheControlResult.headers.Expires, "0");
for (const staleHeader of ["etag", "last-modified", "content-length"]) {
  assert.equal(
    Object.keys(cacheControlResult.headers).some(
      (name) => name.toLowerCase() === staleHeader,
    ),
    false,
    `已修改响应必须移除 ${staleHeader}`,
  );
}
assert.equal(
  cacheControlResult.headers["Content-Type"],
  "text/html; charset=utf-8",
  "非缓存响应头必须保留",
);
console.log("PASS: injected pages disable stale browser caches");

for (const selector of [
  "ytm-promoted-video-renderer",
  "ytm-promoted-sparkles-web-renderer",
]) {
  assert.match(
    injectedPageScript,
    new RegExp(selector),
    `移动网页广告清理必须覆盖 ${selector}`,
  );
}

console.log("PASS: page cleaner covers mobile YouTube ad renderers");

let removedAdNode = 0;
let removedOuterCard = 0;
const outerCard = { remove() { removedOuterCard += 1; } };
const adNode = {
  closest() { return outerCard; },
  remove() { removedAdNode += 1; },
};

const pageContext = {
  window: {},
  document: {
    documentElement: {},
    querySelector() { return null; },
    querySelectorAll(selector) {
      return selector.includes("ytd-ad-slot-renderer") ? [adNode] : [];
    },
  },
  HTMLElement: class HTMLElement {},
  MutationObserver: class MutationObserver {
    observe() {}
  },
  setInterval() {},
};

vm.runInNewContext(injectedPageScript, pageContext, {
  filename: "youtube-web-page.injected.js",
});

assert.equal(removedAdNode, 1, "必须删除明确匹配的广告节点");
assert.equal(removedOuterCard, 0, "不得删除广告节点外层的整张推荐卡片");
console.log("PASS: page cleaner removes only the explicit ad node");

class VisibleElement {}
const adSignal = new VisibleElement();
adSignal.offsetParent = {};
const video = { muted: false, playbackRate: 1 };
let hasVideo = true;
let adShowing = true;
const intervalCallbacks = new Map();
const player = {
  classList: { contains() { return adShowing; } },
  querySelector(selector) {
    return selector === "video" && hasVideo ? video : null;
  },
};

const restoreContext = {
  window: {},
  document: {
    documentElement: {},
    querySelector(selector) {
      return selector === "#movie_player" ? player : null;
    },
    querySelectorAll(selector) {
      return selector === ".ytp-ad-text" ? [adSignal] : [];
    },
  },
  HTMLElement: VisibleElement,
  MutationObserver: class MutationObserver {
    observe() {}
  },
  setInterval(callback, milliseconds) {
    intervalCallbacks.set(milliseconds, callback);
  },
};

vm.runInNewContext(injectedPageScript, restoreContext, {
  filename: "youtube-web-page.restore.injected.js",
});
assert.equal(video.muted, true, "广告播放时应临时静音");
assert.equal(video.playbackRate, 16, "广告播放时应临时加速");

hasVideo = false;
adShowing = false;
intervalCallbacks.get(300)();

assert.equal(video.muted, false, "video 暂时消失时也必须恢复原静音状态");
assert.equal(video.playbackRate, 1, "video 暂时消失时也必须恢复原播放速度");
console.log("PASS: page cleaner restores the original video after transient removal");

let staleVisualAdActive = false;
let staleAdSignalVisible = true;
const staleAdVideo = { muted: false, playbackRate: 1 };
const staleAdSignal = new VisibleElement();
staleAdSignal.offsetParent = {};
const staleAdIntervals = new Map();
const staleAdPlayer = {
  classList: {
    contains(className) {
      return className === "ad-showing";
    },
  },
  getAdState() {
    return -1;
  },
  querySelector(selector) {
    return selector === "video" ? staleAdVideo : null;
  },
  querySelectorAll() {
    return [];
  },
  setAttribute(name, value) {
    if (name === "data-youtube-adblock-active") {
      staleVisualAdActive = value === "true";
    }
  },
  removeAttribute(name) {
    if (name === "data-youtube-adblock-active") staleVisualAdActive = false;
  },
};
const staleAdContext = {
  window: {},
  document: {
    documentElement: {},
    querySelector(selector) {
      return selector === "#movie_player" ? staleAdPlayer : null;
    },
    querySelectorAll(selector) {
      return selector === ".ytp-ad-text" && staleAdSignalVisible ? [staleAdSignal] : [];
    },
  },
  HTMLElement: VisibleElement,
  MutationObserver: class MutationObserver {
    observe() {}
  },
  setInterval(callback, milliseconds) {
    staleAdIntervals.set(milliseconds, callback);
  },
};

vm.runInNewContext(injectedPageScript, staleAdContext, {
  filename: "youtube-web-page.stale-ad-class.injected.js",
});
assert.equal(staleVisualAdActive, true, "检测到真实广告信号时必须隐藏广告画面");
assert.equal(staleAdVideo.muted, true, "检测到真实广告信号时必须临时静音");
assert.equal(staleAdVideo.playbackRate, 16, "检测到真实广告信号时必须临时加速");

staleAdSignalVisible = false;
staleAdIntervals.get(300)();

assert.equal(staleVisualAdActive, false, "广告信号消失后必须撤销黑屏，即使 ad-showing 类仍残留");
assert.equal(staleAdVideo.muted, false, "广告信号消失后必须恢复原静音状态");
assert.equal(staleAdVideo.playbackRate, 1, "广告信号消失后必须恢复原播放速度");
console.log("PASS: stale ad-showing class cannot keep the main video hidden");

let modernSkipClicks = 0;
let runtimeDomVersion = null;
const modernMovieVideo = { muted: false, playbackRate: 1 };
const modernSkipButton = new VisibleElement();
modernSkipButton.offsetParent = {};
modernSkipButton.textContent = "跳过";
modernSkipButton.getAttribute = () => null;
modernSkipButton.click = () => {
  modernSkipClicks += 1;
};
const modernMoviePlayer = {
  classList: {
    contains(className) {
      return className === "ad-showing" || className === "ad-interrupting";
    },
  },
  querySelector(selector) {
    return selector === "video" ? modernMovieVideo : null;
  },
  querySelectorAll(selector) {
    return selector === "button" ? [modernSkipButton] : [];
  },
};
const modernMovieContext = {
  window: {},
  document: {
    documentElement: {
      setAttribute(name, value) {
        if (name === "data-youtube-adblock-version") {
          runtimeDomVersion = value;
        }
      },
    },
    querySelector(selector) {
      return selector === "#movie_player" ? modernMoviePlayer : null;
    },
    querySelectorAll() {
      return [];
    },
  },
  HTMLElement: VisibleElement,
  MutationObserver: class MutationObserver {
    observe() {}
  },
  setInterval() {},
};

vm.runInNewContext(injectedPageScript, modernMovieContext, {
  filename: "youtube-web-page.modern-movie.injected.js",
});

assert.equal(modernSkipClicks, 1, "新版免费电影广告的通用跳过按钮必须被点击");
assert.equal(modernMovieVideo.muted, true, "仅有播放器广告状态时也必须临时静音");
assert.equal(modernMovieVideo.playbackRate, 16, "仅有播放器广告状态时也必须临时加速");
assert.match(runtimeDomVersion || "", /^\d+\.\d+\.\d+$/, "运行时必须写入跨上下文可见的版本标记");
console.log("PASS: page cleaner handles modern YouTube Movies ad markup");

let raceVisualAdActive = false;
const raceVideo = { muted: false, playbackRate: 1 };
const raceListeners = new Map();
const racePlayer = {
  classList: {
    contains(className) {
      return className === "ad-interrupting";
    },
  },
  querySelector(selector) {
    return selector === "video" ? raceVideo : null;
  },
  querySelectorAll() {
    return [];
  },
  setAttribute(name, value) {
    if (name === "data-youtube-adblock-active") raceVisualAdActive = value === "true";
  },
  removeAttribute(name) {
    if (name === "data-youtube-adblock-active") raceVisualAdActive = false;
  },
};
const raceDocument = {
  documentElement: {},
  querySelector(selector) {
    return selector === "#movie_player" ? racePlayer : null;
  },
  querySelectorAll() {
    return [];
  },
  addEventListener(name, handler) {
    const handlers = raceListeners.get(name) || [];
    handlers.push(handler);
    raceListeners.set(name, handlers);
  },
  removeEventListener() {},
};
const raceContext = {
  window: {},
  document: raceDocument,
  HTMLElement: VisibleElement,
  MutationObserver: class MutationObserver {
    observe() {}
  },
  setInterval() {},
};

vm.runInNewContext(injectedPageScript, raceContext, {
  filename: "youtube-web-page.volume-race.injected.js",
});
assert.equal(raceVisualAdActive, true, "静音竞态测试必须处于广告态");
raceVideo.muted = false;
raceVideo.playbackRate = 1;
for (const handler of raceListeners.get("volumechange") || []) handler();
for (const handler of raceListeners.get("ratechange") || []) handler();
assert.equal(raceVideo.muted, true, "广告态 volumechange 后必须立即重新静音");
assert.equal(raceVideo.playbackRate, 16, "广告态 ratechange 后必须立即恢复广告加速");
console.log("PASS: page cleaner closes the ad mute and rate race");

const placeholderVideo = {
  muted: false,
  playbackRate: 1,
  paused: true,
  readyState: 0,
  duration: Number.NaN,
};
const activePlaybackVideo = {
  muted: false,
  playbackRate: 1,
  paused: false,
  readyState: 4,
  duration: 5283,
};
const multiVideoPlayer = {
  classList: {
    contains(className) {
      return className === "ad-interrupting";
    },
  },
  querySelector(selector) {
    return selector === "video" ? placeholderVideo : null;
  },
  querySelectorAll(selector) {
    return selector === "video" ? [placeholderVideo, activePlaybackVideo] : [];
  },
  setAttribute() {},
  removeAttribute() {},
};
const multiVideoContext = {
  window: {},
  document: {
    documentElement: {},
    querySelector(selector) {
      return selector === "#movie_player" ? multiVideoPlayer : null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
    removeEventListener() {},
  },
  HTMLElement: VisibleElement,
  MutationObserver: class MutationObserver {
    observe() {}
  },
  setInterval() {},
};

vm.runInNewContext(injectedPageScript, multiVideoContext, {
  filename: "youtube-web-page.active-video.injected.js",
});
assert.equal(activePlaybackVideo.muted, true, "广告态必须静音真正正在播放的 video");
assert.equal(activePlaybackVideo.playbackRate, 16, "广告态必须加速真正正在播放的 video");
assert.equal(placeholderVideo.muted, false, "不应把占位 video 当成当前播放器");
assert.equal(placeholderVideo.playbackRate, 1, "占位 video 的播放速度应保持不变");
console.log("PASS: page cleaner targets the active player video");

let staleRuntimeRunCalls = 0;
let staleRuntimeDisposeCalls = 0;
let replacementRuntimeVersion = null;
const staleRuntimeContext = {
  window: {
    __youtubeAdBlockRuntime: {
      version: "1.2.0",
      run() {
        staleRuntimeRunCalls += 1;
      },
      dispose() {
        staleRuntimeDisposeCalls += 1;
      },
    },
  },
  document: {
    hidden: false,
    visibilityState: "visible",
    documentElement: {
      setAttribute(name, value) {
        if (name === "data-youtube-adblock-version") replacementRuntimeVersion = value;
      },
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
    removeEventListener() {},
  },
  HTMLElement: VisibleElement,
  MutationObserver: class MutationObserver {
    observe() {}
    disconnect() {}
  },
  setInterval() {
    return 1;
  },
  clearInterval() {},
};

vm.runInNewContext(injectedPageScript, staleRuntimeContext, {
  filename: "youtube-web-page.stale-runtime.injected.js",
});
assert.equal(staleRuntimeRunCalls, 0, "版本不同时不得继续复用旧运行时");
assert.equal(staleRuntimeDisposeCalls, 1, "替换旧运行时前必须调用 dispose");
assert.equal(replacementRuntimeVersion, version, "新运行时必须写入当前版本");
assert.equal(
  staleRuntimeContext.window.__youtubeAdBlockRuntime.version,
  version,
  "版本升级后全局运行时必须切换到当前版本",
);
console.log("PASS: page cleaner replaces stale runtime versions");

let interruptOnlyVisualAdActive = false;
const interruptOnlyVideo = { muted: false, playbackRate: 1 };
const interruptOnlyPlayer = {
  classList: {
    contains(className) {
      return className === "ad-interrupting";
    },
  },
  querySelector(selector) {
    return selector === "video" ? interruptOnlyVideo : null;
  },
  querySelectorAll() {
    return [];
  },
  setAttribute(name, value) {
    if (name === "data-youtube-adblock-active") {
      interruptOnlyVisualAdActive = value === "true";
    }
  },
  removeAttribute(name) {
    if (name === "data-youtube-adblock-active") interruptOnlyVisualAdActive = false;
  },
};
const interruptOnlyContext = {
  window: {},
  document: {
    documentElement: {},
    querySelector(selector) {
      return selector === "#movie_player" ? interruptOnlyPlayer : null;
    },
    querySelectorAll() {
      return [];
    },
  },
  HTMLElement: VisibleElement,
  MutationObserver: class MutationObserver {
    observe() {}
  },
  setInterval() {},
};

vm.runInNewContext(injectedPageScript, interruptOnlyContext, {
  filename: "youtube-web-page.interrupt-only.injected.js",
});
assert.equal(interruptOnlyVisualAdActive, true, "ad-interrupting 单独出现时也必须隐藏广告画面");
assert.equal(interruptOnlyVideo.muted, true, "ad-interrupting 单独出现时也必须临时静音");
assert.equal(interruptOnlyVideo.playbackRate, 16, "ad-interrupting 单独出现时也必须临时加速");
console.log("PASS: page cleaner handles ad-interrupting without ad-showing");

let playerApiVisualAdActive = false;
const playerApiVideo = { muted: false, playbackRate: 1 };
const playerApiAdPlayer = {
  classList: { contains() { return false; } },
  getAdState() {
    return 1;
  },
  querySelector(selector) {
    return selector === "video" ? playerApiVideo : null;
  },
  querySelectorAll() {
    return [];
  },
  setAttribute(name, value) {
    if (name === "data-youtube-adblock-active") {
      playerApiVisualAdActive = value === "true";
    }
  },
  removeAttribute(name) {
    if (name === "data-youtube-adblock-active") playerApiVisualAdActive = false;
  },
};
const playerApiAdContext = {
  window: {},
  document: {
    documentElement: {},
    querySelector(selector) {
      return selector === "#movie_player" ? playerApiAdPlayer : null;
    },
    querySelectorAll() {
      return [];
    },
  },
  HTMLElement: VisibleElement,
  MutationObserver: class MutationObserver {
    observe() {}
  },
  setInterval() {},
};

vm.runInNewContext(injectedPageScript, playerApiAdContext, {
  filename: "youtube-web-page.player-api-ad-state.injected.js",
});
assert.equal(
  playerApiVisualAdActive,
  true,
  "播放器 API 已确认广告时，即使类名和 DOM 标记均缺失也必须隐藏广告画面",
);
assert.equal(playerApiVideo.muted, true, "播放器 API 广告态必须临时静音");
assert.equal(playerApiVideo.playbackRate, 16, "播放器 API 广告态必须临时加速");
console.log("PASS: page cleaner uses the player API ad state");

let lifaVisualAdActive = false;
const lifaVideo = { muted: false, playbackRate: 1 };
const lifaPlayer = {
  classList: { contains() { return false; } },
  getAdState() {
    return -1;
  },
  isLifaAdPlaying() {
    return true;
  },
  querySelector(selector) {
    return selector === "video" ? lifaVideo : null;
  },
  querySelectorAll() {
    return [];
  },
  setAttribute(name, value) {
    if (name === "data-youtube-adblock-active") {
      lifaVisualAdActive = value === "true";
    }
  },
  removeAttribute(name) {
    if (name === "data-youtube-adblock-active") lifaVisualAdActive = false;
  },
};
const lifaContext = {
  window: {},
  document: {
    documentElement: {},
    querySelector(selector) {
      return selector === "#movie_player" ? lifaPlayer : null;
    },
    querySelectorAll() {
      return [];
    },
  },
  HTMLElement: VisibleElement,
  MutationObserver: class MutationObserver {
    observe() {}
  },
  setInterval() {},
};

vm.runInNewContext(injectedPageScript, lifaContext, {
  filename: "youtube-web-page.lifa-ad-state.injected.js",
});
assert.equal(lifaVisualAdActive, true, "LIFA 广告态必须隐藏广告画面");
assert.equal(lifaVideo.muted, true, "LIFA 广告态必须临时静音");
assert.equal(lifaVideo.playbackRate, 16, "LIFA 广告态必须临时加速");
console.log("PASS: page cleaner uses the LIFA ad state");

let fixedSkipClicks = 0;
const fixedSkipButton = new VisibleElement();
fixedSkipButton.offsetParent = null;
fixedSkipButton.getClientRects = () => [{}];
fixedSkipButton.textContent = "Skip Ad";
fixedSkipButton.getAttribute = () => "Skip Ad";
fixedSkipButton.click = () => {
  fixedSkipClicks += 1;
};
const fixedButtonPlayer = {
  classList: { contains(className) { return className === "ad-showing"; } },
  querySelector(selector) {
    return selector === "video" ? { muted: false, playbackRate: 1 } : null;
  },
  querySelectorAll(selector) {
    return selector === "button" ? [fixedSkipButton] : [];
  },
};
const fixedButtonContext = {
  window: {},
  document: {
    documentElement: {},
    querySelector(selector) {
      return selector === "#movie_player" ? fixedButtonPlayer : null;
    },
    querySelectorAll() {
      return [];
    },
  },
  HTMLElement: VisibleElement,
  MutationObserver: class MutationObserver {
    observe() {}
  },
  setInterval() {},
};

vm.runInNewContext(injectedPageScript, fixedButtonContext, {
  filename: "youtube-web-page.fixed-button.injected.js",
});
assert.equal(fixedSkipClicks, 1, "固定定位或全屏中的跳过按钮也必须被识别");
console.log("PASS: page cleaner clicks fixed-position skip buttons");

let ordinarySkipClicks = 0;
const ordinarySkipButton = new VisibleElement();
ordinarySkipButton.offsetParent = {};
ordinarySkipButton.textContent = "Skip Ad";
ordinarySkipButton.getAttribute = () => "Skip Ad";
ordinarySkipButton.click = () => {
  ordinarySkipClicks += 1;
};
const ordinaryPlayer = {
  classList: { contains() { return false; } },
  querySelector(selector) {
    return selector === "video" ? { muted: false, playbackRate: 1 } : null;
  },
  querySelectorAll(selector) {
    return selector === "button" ? [ordinarySkipButton] : [];
  },
};
const ordinaryContext = {
  window: {},
  document: {
    documentElement: {},
    querySelector(selector) {
      return selector === "#movie_player" ? ordinaryPlayer : null;
    },
    querySelectorAll() {
      return [];
    },
  },
  HTMLElement: VisibleElement,
  MutationObserver: class MutationObserver {
    observe() {}
  },
  setInterval() {},
};

vm.runInNewContext(injectedPageScript, ordinaryContext, {
  filename: "youtube-web-page.ordinary-skip-label.injected.js",
});
assert.equal(ordinarySkipClicks, 0, "普通视频中的相同文案不得在非广告状态被误点");
console.log("PASS: page cleaner ignores skip-like labels outside ad playback");

let retrySkipAttempts = 0;
let retrySkipClicks = 0;
const retrySkipButton = new VisibleElement();
retrySkipButton.offsetParent = {};
retrySkipButton.textContent = "Skip Ad";
retrySkipButton.getAttribute = () => "Skip Ad";
retrySkipButton.click = () => {
  retrySkipAttempts += 1;
  if (retrySkipAttempts === 1) throw new Error("transient click failure");
  retrySkipClicks += 1;
};
const retryIntervals = new Map();
const retryPlayer = {
  classList: { contains(className) { return className === "ad-showing"; } },
  querySelector(selector) {
    return selector === "video" ? { muted: false, playbackRate: 1 } : null;
  },
  querySelectorAll(selector) {
    return selector === "button" ? [retrySkipButton] : [];
  },
};
const retryContext = {
  window: {},
  document: {
    documentElement: {},
    querySelector(selector) {
      return selector === "#movie_player" ? retryPlayer : null;
    },
    querySelectorAll() {
      return [];
    },
  },
  HTMLElement: VisibleElement,
  MutationObserver: class MutationObserver {
    observe() {}
  },
  setInterval(callback, milliseconds) {
    retryIntervals.set(milliseconds, callback);
  },
};

vm.runInNewContext(injectedPageScript, retryContext, {
  filename: "youtube-web-page.skip-retry.injected.js",
});
retryIntervals.get(300)();
assert.equal(retrySkipAttempts, 2, "跳过按钮点击失败后，下一轮扫描必须再次尝试");
assert.equal(retrySkipClicks, 1, "重试成功后只应记录一次有效点击");
console.log("PASS: page cleaner retries transient skip-button failures");

let silentRetryAttempts = 0;
let silentRetryNow = 1000;
let silentRetryInterval;
const silentRetryButton = new VisibleElement();
silentRetryButton.offsetParent = {};
silentRetryButton.textContent = "Skip Ad";
silentRetryButton.getAttribute = () => "Skip Ad";
silentRetryButton.click = () => {
  silentRetryAttempts += 1;
};
const silentRetryPlayer = {
  classList: { contains(className) { return className === "ad-showing"; } },
  querySelector(selector) {
    return selector === "video" ? { muted: false, playbackRate: 1 } : null;
  },
  querySelectorAll(selector) {
    return selector === "button" ? [silentRetryButton] : [];
  },
};
const silentRetryContext = {
  window: {},
  document: {
    documentElement: {},
    querySelector(selector) {
      return selector === "#movie_player" ? silentRetryPlayer : null;
    },
    querySelectorAll() {
      return [];
    },
  },
  HTMLElement: VisibleElement,
  Date: {
    now() {
      return silentRetryNow;
    },
  },
  MutationObserver: class MutationObserver {
    observe() {}
  },
  setInterval(callback, milliseconds) {
    if (milliseconds === 300) silentRetryInterval = callback;
  },
};

vm.runInNewContext(injectedPageScript, silentRetryContext, {
  filename: "youtube-web-page.silent-skip-retry.injected.js",
});
assert.equal(silentRetryAttempts, 1, "首次发现跳过按钮时必须尝试点击");
silentRetryNow += 800;
silentRetryInterval();
assert.equal(silentRetryAttempts, 2, "点击未抛错但广告未消失时必须在冷却后重试");
console.log("PASS: page cleaner retries silent skip-button failures");

let serverSideSeekTarget = null;
const serverSideVideo = { muted: false, playbackRate: 1 };
const serverSidePlayer = {
  classList: { contains() { return false; } },
  querySelector(selector) {
    return selector === "video" ? serverSideVideo : null;
  },
  querySelectorAll() {
    return [];
  },
  getStatsForNerds() {
    return { debug_info: "SSAP, AD test fixture" };
  },
  getProgressState() {
    return { current: 3, duration: 30, loaded: 30 };
  },
  seekTo(value) {
    serverSideSeekTarget = value;
  },
};
const serverSideContext = {
  window: {},
  document: {
    documentElement: {},
    querySelector(selector) {
      return selector === "#movie_player" ? serverSidePlayer : null;
    },
    querySelectorAll() {
      return [];
    },
  },
  HTMLElement: VisibleElement,
  MutationObserver: class MutationObserver {
    observe() {}
  },
  setInterval() {},
};

vm.runInNewContext(injectedPageScript, serverSideContext, {
  filename: "youtube-web-page.ssap.injected.js",
});
assert.equal(serverSideSeekTarget, 30, "SSAP 服务端广告必须跳到广告片段末尾");
console.log("PASS: page cleaner skips server-side inserted ads");

let removedStructuralAd = 0;
const structuralAd = {
  remove() {
    removedStructuralAd += 1;
  },
};
const structuralContext = {
  window: {},
  document: {
    documentElement: {},
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      return selector.includes("ytd-rich-item-renderer:has") ? [structuralAd] : [];
    },
  },
  HTMLElement: VisibleElement,
  MutationObserver: class MutationObserver {
    observe() {}
  },
  setInterval() {},
};

vm.runInNewContext(injectedPageScript, structuralContext, {
  filename: "youtube-web-page.structural-ad.injected.js",
});
assert.equal(removedStructuralAd, 1, "明确包含广告槽位的外层卡片必须一并删除");
console.log("PASS: page cleaner removes explicit structural ad wrappers");

assert.equal(
  typeof modernMovieContext.window.__youtubeAdBlockRuntime,
  "object",
  "运行时必须暴露版本化诊断对象，方便升级后定位规则失效",
);
assert.match(
  modernMovieContext.window.__youtubeAdBlockRuntime.version,
  /^\d+\.\d+\.\d+$/,
  "诊断对象必须包含语义化版本号",
);
assert.equal(
  typeof modernMovieContext.window.__youtubeAdBlockRuntime.snapshot,
  "function",
  "诊断对象必须提供只读状态快照",
);
console.log("PASS: page cleaner exposes versioned diagnostics");

let mutationCallback;
let queryCount = 0;
const scheduledCleanups = [];
const batchingContext = {
  window: {},
  document: {
    documentElement: {},
    querySelector() {
      queryCount += 1;
      return null;
    },
    querySelectorAll() {
      queryCount += 1;
      return [];
    },
  },
  HTMLElement: class HTMLElement {},
  MutationObserver: class MutationObserver {
    constructor(callback) {
      mutationCallback = callback;
    }
    observe() {}
  },
  setInterval() {},
  setTimeout(callback) {
    scheduledCleanups.push(callback);
  },
};

vm.runInNewContext(injectedPageScript, batchingContext, {
  filename: "youtube-web-page.batch.injected.js",
});

const queriesAfterInitialClean = queryCount;
for (let index = 0; index < 20; index += 1) mutationCallback();

assert.equal(
  queryCount,
  queriesAfterInitialClean,
  "连续 DOM 变化不应同步重复扫描整个页面",
);
assert.equal(scheduledCleanups.length, 1, "连续 DOM 变化必须合并为一次延迟清理");

scheduledCleanups[0]();
assert.ok(queryCount > queriesAfterInitialClean, "合并后的清理任务必须实际执行");
console.log("PASS: mutation bursts are batched into one page cleanup");

let hiddenQueryCount = 0;
const hiddenIntervals = new Map();
const visibilityListeners = new Map();
const hiddenContext = {
  window: {},
  document: {
    hidden: false,
    visibilityState: "visible",
    documentElement: {},
    querySelector() {
      hiddenQueryCount += 1;
      return null;
    },
    querySelectorAll() {
      hiddenQueryCount += 1;
      return [];
    },
    addEventListener(name, callback) {
      visibilityListeners.set(name, callback);
    },
  },
  HTMLElement: class HTMLElement {},
  MutationObserver: class MutationObserver {
    observe() {}
  },
  setInterval(callback, milliseconds) {
    hiddenIntervals.set(milliseconds, callback);
  },
};

vm.runInNewContext(injectedPageScript, hiddenContext, {
  filename: "youtube-web-page.hidden-tab.injected.js",
});
const visibleQueryCount = hiddenQueryCount;
hiddenContext.document.hidden = true;
hiddenContext.document.visibilityState = "hidden";
hiddenIntervals.get(300)();
hiddenIntervals.get(2000)();
assert.equal(hiddenQueryCount, visibleQueryCount, "标签页隐藏时必须跳过高频 DOM 扫描");

hiddenContext.document.hidden = false;
hiddenContext.document.visibilityState = "visible";
visibilityListeners.get("visibilitychange")();
assert.ok(hiddenQueryCount > visibleQueryCount, "标签页恢复可见时必须立即执行一次完整清理");
console.log("PASS: page cleaner pauses hidden-tab scans and resumes immediately");
