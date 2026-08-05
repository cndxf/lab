const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  DEFAULT_CASES,
  PLAYER_CASE_NAMES,
  classifyPlaybackBlocker,
  computeAdNodeMetrics,
  inspectAdBreakPayload,
  loadExpectedVersion,
  parseArguments,
  selectCases,
  SNAPSHOT_EXPRESSION,
  START_PLAYBACK_EXPRESSION,
  summarizeAdBreakEvidence,
  summarizeSamples,
} = require("../tools/mac-chrome-regression.cjs");

const projectRoot = path.resolve(__dirname, "..");
const verifyScript = fs.readFileSync(path.join(projectRoot, "tools/verify.sh"), "utf8");
const currentVersion = loadExpectedVersion(projectRoot);

assert.match(
  verifyScript,
  /mac-chrome-regression\.test\.cjs/,
  "统一验证入口必须执行 Mac Chrome 回归工具测试",
);

assert.equal(
  loadExpectedVersion(projectRoot),
  currentVersion,
  "Mac 回归工具必须从项目 VERSION 自动读取当前版本",
);

const requiredCases = [
  "home",
  "search",
  "watch",
  "movie-1",
  "movie-2",
  "shorts",
  "playlist",
  "subscriptions",
  "channel",
  "post",
  "hashtag",
  "clip",
  "live",
  "embed",
];
assert.deepEqual(
  requiredCases.every((name) => DEFAULT_CASES.some((testCase) => testCase.name === name)),
  true,
  "Mac 回归矩阵必须包含所有网页入口和播放器入口",
);

const parsedArguments = parseArguments([
  "--rounds",
  "4",
  "--only",
  "home,clip",
  "--output",
  "/tmp/youtube-regression-test",
]);
assert.equal(parsedArguments.rounds, 4);
assert.deepEqual([...parsedArguments.only], ["home", "clip"]);
assert.equal(parsedArguments.outputDir, "/tmp/youtube-regression-test");
assert.equal(parsedArguments.scope, "player");

const fullArguments = parseArguments(["--scope", "full"]);
assert.equal(fullArguments.scope, "full");
let persistentProfileArguments;
assert.doesNotThrow(() => {
  persistentProfileArguments = parseArguments([
    "--profile-dir",
    "/tmp/youtube-regression-profile",
  ]);
}, "Mac 真页回归必须支持复用专用登录资料目录");
assert.equal(
  persistentProfileArguments.profileDir,
  "/tmp/youtube-regression-profile",
);
assert.deepEqual(
  selectCases(DEFAULT_CASES, parseArguments([])).map(({ name }) => name),
  PLAYER_CASE_NAMES,
  "Mac 实测默认只跑播放器广告场景，页面广告矩阵由 --scope full 显式执行",
);
assert.equal(
  selectCases(DEFAULT_CASES, fullArguments).length,
  DEFAULT_CASES.length,
  "--scope full 必须保留完整页面矩阵",
);
assert.throws(
  () => parseArguments(["--scope", "unknown"]),
  /--scope must be player or full/,
);

assert.match(
  SNAPSHOT_EXPRESSION,
  /find\(candidate\s*=>\s*!candidate\.paused/,
  "回归快照必须优先读取实际正在播放的 video，不能固定取 Shorts 的第一个占位 video",
);
assert.match(
  START_PLAYBACK_EXPRESSION,
  /find\(candidate\s*=>\s*!candidate\.paused/,
  "播放器启动必须优先操作实际活动的 video",
);

assert.equal(
  typeof classifyPlaybackBlocker,
  "function",
  "回归工具必须导出可测试的 YouTube 播放阻断分类器",
);
assert.equal(
  classifyPlaybackBlocker({
    bodyText: "",
    pathname: "/embed/8dJyRm2jJ-U",
    playerClass: "html5-video-player ytp-embed-error",
  }),
  "youtube-embed-player-error",
  "嵌入播放器自身错误不能误报为模块播放失败",
);

const hiddenPlaceholderSamples = [
  { rawAdNodes: 0, visibleAdNodeSignatures: [] },
  { rawAdNodes: 1, visibleAdNodeSignatures: [] },
  { rawAdNodes: 1, visibleAdNodeSignatures: [] },
  { rawAdNodes: 0, visibleAdNodeSignatures: [] },
];
const hiddenMetrics = computeAdNodeMetrics(hiddenPlaceholderSamples, 3);
assert.deepEqual(hiddenMetrics, {
  maxRawAdNodes: 1,
  maxVisibleAdNodes: 0,
  stableAdNodes: 0,
  stableAdNodeSignatures: [],
});

const transientVisibleSamples = [
  { rawAdNodes: 0, visibleAdNodeSignatures: [] },
  { rawAdNodes: 1, visibleAdNodeSignatures: ["ytd-ad-slot-renderer"] },
  { rawAdNodes: 0, visibleAdNodeSignatures: [] },
];
assert.equal(
  computeAdNodeMetrics(transientVisibleSamples, 3).stableAdNodes,
  0,
  "单次可见的瞬时节点必须记录但不能直接判定为稳定广告泄漏",
);

const persistentVisibleSamples = [
  { rawAdNodes: 1, visibleAdNodeSignatures: ["#player-ads>ytd-player-legacy-desktop-watch-ads-renderer"] },
  { rawAdNodes: 1, visibleAdNodeSignatures: ["#player-ads>ytd-player-legacy-desktop-watch-ads-renderer"] },
  { rawAdNodes: 1, visibleAdNodeSignatures: ["#player-ads>ytd-player-legacy-desktop-watch-ads-renderer"] },
];
const persistentMetrics = computeAdNodeMetrics(persistentVisibleSamples, 3);
assert.equal(persistentMetrics.maxVisibleAdNodes, 1);
assert.equal(persistentMetrics.stableAdNodes, 1);

const baseSnapshot = {
  documentVersion: currentVersion,
  runtimeVersion: currentVersion,
  injectedScriptCount: 1,
  injectedStyleCount: 1,
  diagnostics: { errors: [] },
};

const hiddenSummary = summarizeSamples(
  hiddenPlaceholderSamples.map((sample) => ({ ...baseSnapshot, ...sample })),
  { expectedVersion: currentVersion, expectPlayback: false, stableSampleCount: 3 },
);
assert.equal(hiddenSummary.ok, true, "隐藏占位节点不能让页面回归失败");
assert.equal(hiddenSummary.status, "passed");
assert.equal(hiddenSummary.adNodeMetrics.maxRawAdNodes, 1);
assert.equal(hiddenSummary.adNodeMetrics.stableAdNodes, 0);

const blockedSummary = summarizeSamples(
  [
    {
      ...baseSnapshot,
      playbackBlocker: "youtube-bot-signin-gate",
      paused: true,
      readyState: 0,
      duration: null,
    },
  ],
  { expectedVersion: currentVersion, expectPlayback: true, stableSampleCount: 3 },
);
assert.equal(blockedSummary.ok, false);
assert.equal(blockedSummary.status, "blocked", "外部登录/机器人门槛必须独立标记为 blocked");

const failedPlaybackSummary = summarizeSamples(
  [
    {
      ...baseSnapshot,
      paused: true,
      readyState: 0,
      duration: null,
    },
  ],
  { expectedVersion: currentVersion, expectPlayback: true, stableSampleCount: 3 },
);
assert.equal(failedPlaybackSummary.status, "failed", "没有外部阻断标记的播放失败必须保留 failed");

const pausedLoadedSamples = [
  {
    ...baseSnapshot,
    currentTime: 0,
    duration: 5283,
    paused: true,
    readyState: 4,
  },
  {
    ...baseSnapshot,
    currentTime: 0,
    duration: 5283,
    paused: true,
    readyState: 4,
  },
];
const pausedLoadedSummary = summarizeSamples(
  pausedLoadedSamples,
  { expectedVersion: currentVersion, expectPlayback: true, stableSampleCount: 3 },
);
assert.equal(
  pausedLoadedSummary.playbackEstablished,
  false,
  "仅加载并暂停的视频不能算作真实播放已建立",
);
assert.equal(
  pausedLoadedSummary.ok,
  false,
  "播放器未实际播放时，前贴片/中插回归必须失败而不是假通过",
);
assert.match(
  pausedLoadedSummary.failures.join("\n"),
  /media playback not established/,
);

const persistentSummary = summarizeSamples(
  persistentVisibleSamples.map((sample) => ({ ...baseSnapshot, ...sample })),
  { expectedVersion: currentVersion, expectPlayback: false, stableSampleCount: 3 },
);
assert.equal(persistentSummary.ok, false, "持续可见的广告节点必须让回归失败");
assert.match(persistentSummary.failures.join("\n"), /stable visible ad nodes=1/);

const prerollSummary = summarizeSamples(
  [
    {
      ...baseSnapshot,
      phase: "initial",
      active: true,
      currentTime: 12,
      duration: 48,
      paused: false,
      muted: true,
      playbackRate: 16,
      opacity: "0",
    },
    {
      ...baseSnapshot,
      phase: "initial",
      active: false,
      currentTime: 2,
      duration: 5283,
      paused: false,
      muted: false,
      playbackRate: 1,
      opacity: "1",
    },
  ],
  { expectedVersion: currentVersion, expectPlayback: true, stableSampleCount: 3 },
);
assert.equal(prerollSummary.prerollStatus, "verified");
assert.equal(prerollSummary.seenPrerollAd, true);
assert.equal(prerollSummary.seenPrerollRecovery, true);
assert.equal(prerollSummary.midrollStatus, "not-applicable");

const midrollSummary = summarizeSamples(
  [
    {
      ...baseSnapshot,
      phase: "initial",
      active: false,
      currentTime: 100,
      duration: 5283,
      paused: false,
      muted: false,
      playbackRate: 1,
      opacity: "1",
    },
    {
      ...baseSnapshot,
      phase: "seek",
      seekPoint: 1197,
      active: true,
      currentTime: 8,
      duration: 30,
      paused: false,
      muted: true,
      playbackRate: 16,
      opacity: "0",
    },
    {
      ...baseSnapshot,
      phase: "seek",
      seekPoint: 1197,
      active: false,
      currentTime: 1198,
      duration: 5283,
      paused: false,
      muted: false,
      playbackRate: 1,
      opacity: "1",
    },
  ],
  { expectedVersion: currentVersion, expectPlayback: true, stableSampleCount: 3 },
);
assert.equal(midrollSummary.midrollStatus, "verified");
assert.equal(midrollSummary.seenMidrollAd, true);
assert.equal(midrollSummary.seenMidrollRecovery, true);
assert.deepEqual(midrollSummary.seekPointsTested, [1197]);

const noMidrollSummary = summarizeSamples(
  [
    {
      ...baseSnapshot,
      phase: "initial",
      active: false,
      currentTime: 100,
      duration: 5283,
      paused: false,
      muted: false,
      playbackRate: 1,
      opacity: "1",
    },
    {
      ...baseSnapshot,
      phase: "seek",
      seekPoint: 1197,
      active: false,
      currentTime: 1198,
      duration: 5283,
      paused: false,
      muted: false,
      playbackRate: 1,
      opacity: "1",
    },
  ],
  { expectedVersion: currentVersion, expectPlayback: true, stableSampleCount: 3 },
);
assert.equal(noMidrollSummary.ok, true);
assert.equal(
  noMidrollSummary.midrollStatus,
  "not-observed",
  "断点正常播放只能证明兼容性，不能冒充真实中插广告已处理",
);

const stuckMidrollSummary = summarizeSamples(
  [
    {
      ...baseSnapshot,
      phase: "initial",
      active: false,
      currentTime: 100,
      duration: 5283,
      paused: false,
      muted: false,
      playbackRate: 1,
      opacity: "1",
    },
    {
      ...baseSnapshot,
      phase: "seek",
      seekPoint: 1197,
      active: true,
      currentTime: 8,
      duration: 30,
      paused: false,
      muted: true,
      playbackRate: 16,
      opacity: "0",
    },
  ],
  { expectedVersion: currentVersion, expectPlayback: true, stableSampleCount: 3 },
);
assert.equal(stuckMidrollSummary.ok, false);
assert.equal(stuckMidrollSummary.midrollStatus, "failed");
assert.match(stuckMidrollSummary.failures.join("\n"), /midroll ad did not recover/);

const cleanedAdBreak = inspectAdBreakPayload(
  JSON.stringify({ responseContext: { responseId: "ok" }, trackingParams: "tracking" }),
);
assert.equal(cleanedAdBreak.parsed, true);
assert.equal(cleanedAdBreak.cleaned, true);
assert.deepEqual(cleanedAdBreak.adFieldPaths, []);

const dirtyAdBreak = inspectAdBreakPayload(
  JSON.stringify({
    responseContext: { responseId: "dirty" },
    playerAds: [{ adPlacementRenderer: { config: { kind: "midroll" } } }],
    nested: { adSlots: [{ adSlotRenderer: { slotId: "slot-1" } }] },
  }),
);
assert.equal(dirtyAdBreak.cleaned, false);
assert.deepEqual(dirtyAdBreak.adFieldPaths, [
  "nested.adSlots",
  "nested.adSlots[0].adSlotRenderer",
  "playerAds",
  "playerAds[0].adPlacementRenderer",
]);

assert.equal(summarizeAdBreakEvidence([]).status, "not-observed");
assert.equal(
  summarizeAdBreakEvidence([{ requestId: "1", payload: cleanedAdBreak }]).status,
  "verified",
);
const failedAdBreakEvidence = summarizeAdBreakEvidence([
  { requestId: "2", payload: dirtyAdBreak },
]);
assert.equal(failedAdBreakEvidence.status, "failed");
assert.deepEqual(failedAdBreakEvidence.adFieldPaths, dirtyAdBreak.adFieldPaths);
assert.equal(
  summarizeAdBreakEvidence([{ requestId: "3", error: "body unavailable" }]).status,
  "unavailable",
);

console.log("PASS: Mac Chrome regression classifies raw, visible, and stable ad nodes");
