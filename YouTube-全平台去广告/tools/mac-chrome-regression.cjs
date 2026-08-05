#!/usr/bin/env node

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CHROME_PATH =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SURGE_PROXY = process.env.SURGE_PROXY || "http://127.0.0.1:6152";
const SAMPLE_INTERVAL_MS = 500;
const STABLE_SAMPLE_COUNT = 3;
const AD_BREAK_FIELD_NAMES = new Set([
  "adbreakheartbeatparams",
  "adbreakservicerenderer",
  "adplacementrenderer",
  "adplacements",
  "adslotrenderer",
  "adslots",
  "adthrottled",
  "playerads",
]);

const DEFAULT_CASES = [
  {
    name: "home",
    url: "https://www.youtube.com/",
    waitMs: 7000,
    scrollSteps: 4,
  },
  {
    name: "search",
    url: "https://www.youtube.com/results?search_query=iphone",
    waitMs: 7000,
    scrollSteps: 5,
  },
  {
    name: "watch",
    url: "https://www.youtube.com/watch?v=RsQ4ZEezufE",
    waitMs: 18000,
    playback: true,
  },
  {
    name: "movie-1",
    url: "https://www.youtube.com/watch?v=NRTmocsdb7o",
    waitMs: 18000,
    playback: true,
  },
  {
    name: "movie-2",
    url: "https://www.youtube.com/watch?v=ZVPm1kqDScU",
    waitMs: 18000,
    playback: true,
  },
  {
    name: "movie-3",
    url: "https://www.youtube.com/watch?v=bRp4nz0JbIE",
    waitMs: 18000,
    playback: true,
  },
  {
    name: "long-watch",
    url: "https://www.youtube.com/watch?v=RsQ4ZEezufE",
    waitMs: 8000,
    playback: true,
    seekPoints: [597, 1197, 1797],
    seekWaitMs: 8000,
  },
  {
    name: "shorts",
    url: "https://www.youtube.com/shorts/N7FIOm3oVfo",
    waitMs: 12000,
    playback: true,
  },
  {
    name: "playlist",
    url: "https://www.youtube.com/playlist?list=PLo_mCdoeO0g9WdS38ko_bpVWPp23DvxPr",
    waitMs: 8000,
    scrollSteps: 3,
  },
  {
    name: "subscriptions",
    url: "https://www.youtube.com/feed/subscriptions",
    waitMs: 7000,
    scrollSteps: 4,
  },
  {
    name: "channel",
    url: "https://www.youtube.com/@officialpsy",
    waitMs: 7000,
    scrollSteps: 3,
  },
  {
    name: "post",
    url: "https://www.youtube.com/post/UgkxiCSRfD6g7SPlWGPDa3vbP7aIsytXRkvy",
    waitMs: 7000,
  },
  {
    name: "hashtag",
    url: "https://www.youtube.com/hashtag/thatthat",
    waitMs: 7000,
    scrollSteps: 3,
  },
  {
    name: "clip",
    url: "https://www.youtube.com/clip/UgkxCSQbL83XFTtgYtrd1zh3AzLA0pBP2Vlh",
    waitMs: 9000,
    playback: true,
  },
  {
    name: "live",
    url: "https://www.youtube.com/live/awQzjn72bI0",
    waitMs: 12000,
    playback: true,
  },
  {
    name: "embed",
    url: "https://www.youtube.com/embed/8dJyRm2jJ-U",
    waitMs: 12000,
    playback: true,
    referrer: "https://example.com/",
  },
];

const PLAYER_CASE_NAMES = ["watch", "movie-1", "movie-2", "movie-3", "long-watch"];

function parseArguments(argv) {
  const options = {
    rounds: 3,
    only: null,
    scope: "player",
    profileDir: process.env.YOUTUBE_CHROME_PROFILE_DIR
      ? path.resolve(process.env.YOUTUBE_CHROME_PROFILE_DIR)
      : null,
    outputDir: path.join(
      os.tmpdir(),
      `youtube-mac-chrome-${new Date().toISOString().replaceAll(":", "-")}`,
    ),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--rounds") {
      options.rounds = Number(argv[index + 1]);
      index += 1;
    } else if (argument === "--only") {
      options.only = new Set(
        String(argv[index + 1] || "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      );
      index += 1;
    } else if (argument === "--scope") {
      options.scope = String(argv[index + 1] || "");
      index += 1;
    } else if (argument === "--output") {
      options.outputDir = path.resolve(argv[index + 1]);
      index += 1;
    } else if (argument === "--profile-dir") {
      const value = argv[index + 1];
      if (!value) throw new Error("--profile-dir requires a directory");
      options.profileDir = path.resolve(value);
      index += 1;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!Number.isInteger(options.rounds) || options.rounds < 1 || options.rounds > 20) {
    throw new Error("--rounds must be an integer between 1 and 20");
  }
  if (options.scope !== "player" && options.scope !== "full") {
    throw new Error("--scope must be player or full");
  }

  return options;
}

function selectCases(cases, options) {
  if (options.only) {
    return cases.filter((testCase) => options.only.has(testCase.name));
  }
  if (options.scope === "player") {
    const names = new Set(PLAYER_CASE_NAMES);
    return cases.filter((testCase) => names.has(testCase.name));
  }
  return [...cases];
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function withCacheBuster(rawUrl, round) {
  const url = new URL(rawUrl);
  url.searchParams.set("youtube_adblock_regression", `${Date.now()}-${round}`);
  return url.toString();
}

function waitForDevTools(chrome, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => {
      reject(new Error(`Chrome DevTools did not start. stderr=${stderr.slice(-2000)}`));
    }, timeoutMs);

    chrome.stderr.setEncoding("utf8");
    chrome.stderr.on("data", (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timer);
      resolve({ port: Number(new URL(match[1]).port), stderr });
    });

    chrome.once("exit", (code, signal) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Chrome exited before DevTools was ready: code=${code} signal=${signal} stderr=${stderr.slice(-2000)}`,
        ),
      );
    });
  });
}

class CdpClient {
  constructor(websocketUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.socket = new WebSocket(websocketUrl);
  }

  async open() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result || {});
        return;
      }

      const listeners = this.listeners.get(message.method) || [];
      for (const listener of listeners) listener(message.params || {});
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off(method, listener);
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      const listener = (params) => {
        clearTimeout(timer);
        this.off(method, listener);
        resolve(params);
      };
      const listeners = this.listeners.get(method) || [];
      listeners.push(listener);
      this.listeners.set(method, listeners);
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  off(method, listener) {
    const listeners = this.listeners.get(method) || [];
    this.listeners.set(
      method,
      listeners.filter((candidate) => candidate !== listener),
    );
  }

  close() {
    this.socket.close();
  }
}

async function createPage(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
    method: "PUT",
  });
  if (!response.ok) throw new Error(`Unable to create Chrome target: HTTP ${response.status}`);
  const target = await response.json();
  return new CdpClient(target.webSocketDebuggerUrl);
}

function classifyPlaybackBlocker({ bodyText = "", pathname = "", playerClass = "" }) {
  if (/确认你不是聊天机器人|confirm you(?:'| a)re not a bot/i.test(bodyText)) {
    return "youtube-bot-signin-gate";
  }
  if (/确认你的年龄|confirm your age/i.test(bodyText)) {
    return "youtube-age-signin-gate";
  }
  if (/视频无法播放|video unavailable/i.test(bodyText)) {
    return "youtube-video-unavailable";
  }
  if (/错误\s*153|error\s*153|播放器配置错误|player configuration error/i.test(bodyText)) {
    return "youtube-embed-client-identification";
  }
  if (pathname.startsWith("/embed/") && /(?:^|\s)ytp-embed-error(?:\s|$)/.test(playerClass)) {
    return "youtube-embed-player-error";
  }
  return null;
}

const CLASSIFY_PLAYBACK_BLOCKER_SOURCE = `(${classifyPlaybackBlocker.toString()})`;

const SNAPSHOT_EXPRESSION = String.raw`(() => {
  const player = document.querySelector("#movie_player");
  const playerVideos = [...(player?.querySelectorAll?.("video") || [])];
  const documentVideos = [...document.querySelectorAll("video")];
  const videos = [...new Set([...playerVideos, ...documentVideos])];
  const video =
    videos.find(candidate => !candidate.paused && candidate.readyState >= 2) ||
    videos.find(candidate => Number.isFinite(candidate.duration) && candidate.duration > 0) ||
    playerVideos[0] ||
    documentVideos[0];
  const runtime = window.__youtubeAdBlockRuntime;
  const call = (name) => {
    try {
      const value = player?.[name]?.();
      return value === undefined ? null : value;
    } catch (error) {
      return "error:" + String(error);
    }
  };
  const adSelector = [
    "ytd-ad-slot-renderer",
    "ad-slot-renderer",
    "ytd-display-ad-renderer",
    "ytd-promoted-sparkles-web-renderer",
    "ytd-in-feed-ad-layout-renderer",
    "ytd-promoted-video-renderer",
    "ytd-compact-promoted-video-renderer",
    "ytd-search-pyv-renderer",
    "ytd-video-masthead-ad-v3-renderer",
    "ytd-masthead-ad-v3-renderer",
    "ytd-action-companion-ad-renderer",
    "ytd-player-legacy-desktop-watch-ads-renderer",
    "ytd-player-legacy-desktop-watch-ads-renderer *",
    "#masthead-ad"
  ].join(",");
  const signatureFor = (node) => {
    const parent = node.parentElement?.id ? "#" + node.parentElement.id :
      (node.parentElement?.tagName || "").toLowerCase();
    const tag = (node.tagName || "").toLowerCase();
    const classes = String(node.className || "").replace(/\s+/g, " ").trim().slice(0, 120);
    return parent + ">" + tag + (classes ? "." + classes.replace(/\s+/g, ".") : "");
  };
  const isVisible = (node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    const opacity = Number(style.opacity);
    return style.display !== "none" && style.visibility !== "hidden" &&
      Number.isFinite(opacity) && opacity > 0.01 && rect.width > 1 && rect.height > 1;
  };
  const adNodes = [...document.querySelectorAll(adSelector)];
  const visibleAdNodeSignatures = adNodes.filter(isVisible).map(signatureFor);
  const bodyText = document.body?.innerText || "";
  const playbackBlocker = ${CLASSIFY_PLAYBACK_BLOCKER_SOURCE}({
    bodyText,
    pathname: location.pathname,
    playerClass: player?.className || ""
  });
  return {
    href: location.href,
    title: document.title,
    readyState: document.readyState,
    injectedScriptCount: document.querySelectorAll("script[data-youtube-adblock-skipper]").length,
    injectedStyleCount: document.querySelectorAll("style[data-youtube-adblock-style]").length,
    documentVersion: document.documentElement.getAttribute("data-youtube-adblock-version"),
    runtimeVersion: runtime?.version || null,
    playerExists: Boolean(player),
    playerVideoExists: playerVideos.length > 0,
    documentVideoCount: documentVideos.length,
    active: player?.getAttribute?.("data-youtube-adblock-active") === "true",
    adShowing: Boolean(player?.classList?.contains?.("ad-showing")),
    adInterrupting: Boolean(player?.classList?.contains?.("ad-interrupting")),
    adState: call("getAdState"),
    lifa: call("isLifaAdPlaying"),
    opacity: player ? getComputedStyle(player).opacity : null,
    muted: video?.muted ?? null,
    playbackRate: video?.playbackRate ?? null,
    paused: video?.paused ?? null,
    readyState: video?.readyState ?? null,
    networkState: video?.networkState ?? null,
    mediaError: video?.error?.message || null,
    playbackBlocker,
    currentTime: video?.currentTime ?? null,
    duration: video?.duration ?? null,
    rawAdNodes: adNodes.length,
    visibleAdNodes: visibleAdNodeSignatures.length,
    visibleAdNodeSignatures,
    diagnostics: runtime?.snapshot?.() || null
  };
})()`;

const START_PLAYBACK_EXPRESSION = String.raw`(() => {
  const player = document.querySelector("#movie_player");
  const playerVideos = [...(player?.querySelectorAll?.("video") || [])];
  const documentVideos = [...document.querySelectorAll("video")];
  const videos = [...new Set([...playerVideos, ...documentVideos])];
  const video =
    videos.find(candidate => !candidate.paused && candidate.readyState >= 2) ||
    videos.find(candidate => Number.isFinite(candidate.duration) && candidate.duration > 0) ||
    playerVideos[0] ||
    documentVideos[0];
  let playerResult = "unavailable";
  let videoResult = "unavailable";
  try {
    if (typeof player?.playVideo === "function") {
      player.playVideo();
      playerResult = "called";
    }
  } catch (error) {
    playerResult = "error:" + String(error);
  }
  try {
    if (video) {
      const playResult = video.play();
      playResult?.catch?.(() => {});
      videoResult = "requested";
    }
  } catch (error) {
    videoResult = "error:" + String(error);
  }
  return {
    playerResult,
    videoResult,
    playerExists: Boolean(player),
    videoExists: Boolean(video),
    paused: video?.paused ?? null,
    readyState: video?.readyState ?? null,
    networkState: video?.networkState ?? null,
    currentTime: video?.currentTime ?? null,
    duration: video?.duration ?? null,
    mediaError: video?.error?.message || null
  };
})()`;

const SCROLL_EXPRESSION = String.raw`(() => {
  const before = window.scrollY;
  window.scrollBy({ top: Math.max(window.innerHeight * 0.8, 600), behavior: "instant" });
  return { before, after: window.scrollY, height: document.documentElement.scrollHeight };
})()`;

function seekPlaybackExpression(seconds) {
  const position = Math.max(0, Number(seconds) || 0);
  return `(() => {
    const player = document.querySelector("#movie_player");
    const video = player?.querySelector?.("video") || document.querySelector("video");
    if (!video) return { videoExists: false, requested: ${position} };
    video.currentTime = ${position};
    const playResult = video.play();
    playResult?.catch?.(() => {});
    return { videoExists: true, requested: ${position}, currentTime: video.currentTime, paused: video.paused };
  })()`;
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return result.result?.value;
}

async function captureScreenshot(client, filePath) {
  const result = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  fs.writeFileSync(filePath, Buffer.from(result.data, "base64"));
}

function loadExpectedVersion(projectRoot = path.resolve(__dirname, "..")) {
  return fs.readFileSync(path.join(projectRoot, "VERSION"), "utf8").trim();
}

function computeAdNodeMetrics(samples, stableSampleCount = 3) {
  const consecutive = new Map();
  const stable = new Set();
  let maxRawAdNodes = 0;
  let maxVisibleAdNodes = 0;

  for (const sample of samples) {
    const visible = new Set(sample.visibleAdNodeSignatures || []);
    maxRawAdNodes = Math.max(maxRawAdNodes, Number(sample.rawAdNodes) || 0);
    maxVisibleAdNodes = Math.max(maxVisibleAdNodes, visible.size);

    for (const signature of [...consecutive.keys()]) {
      if (!visible.has(signature)) consecutive.set(signature, 0);
    }
    for (const signature of visible) {
      const count = (consecutive.get(signature) || 0) + 1;
      consecutive.set(signature, count);
      if (count >= stableSampleCount) stable.add(signature);
    }
  }

  return {
    maxRawAdNodes,
    maxVisibleAdNodes,
    stableAdNodes: stable.size,
    stableAdNodeSignatures: [...stable].sort(),
  };
}

function inspectAdBreakPayload(body) {
  const bodyLength = String(body || "").length;
  try {
    const payload = JSON.parse(String(body || ""));
    const adFieldPaths = [];
    const walk = (value, path) => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach((item, index) => walk(item, `${path}[${index}]`));
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        const keyPath = path ? `${path}.${key}` : key;
        if (AD_BREAK_FIELD_NAMES.has(key.toLowerCase())) adFieldPaths.push(keyPath);
        walk(child, keyPath);
      }
    };
    walk(payload, "");
    adFieldPaths.sort();
    return {
      parsed: true,
      bodyLength,
      topLevelKeys: Object.keys(payload).sort(),
      adFieldPaths,
      cleaned: adFieldPaths.length === 0,
    };
  } catch (error) {
    return {
      parsed: false,
      bodyLength,
      topLevelKeys: [],
      adFieldPaths: [],
      cleaned: false,
      error: String(error),
    };
  }
}

function summarizeAdBreakEvidence(responses) {
  if (!responses.length) {
    return { status: "not-observed", responses: 0, inspected: 0, adFieldPaths: [] };
  }
  const payloads = responses.map((response) => response.payload).filter(Boolean);
  const adFieldPaths = [
    ...new Set(payloads.flatMap((payload) => payload.adFieldPaths || [])),
  ].sort();
  const status = adFieldPaths.length > 0
    ? "failed"
    : payloads.some((payload) => payload.parsed && payload.cleaned)
      ? "verified"
      : "unavailable";
  return {
    status,
    responses: responses.length,
    inspected: payloads.filter((payload) => payload.parsed).length,
    adFieldPaths,
  };
}

function summarizeSamples(
  samples,
  { expectedVersion, expectPlayback, stableSampleCount = 3 },
) {
  const first = samples[0] || {};
  const last = samples.at(-1) || {};
  const failures = [];
  const adNodeMetrics = computeAdNodeMetrics(samples, stableSampleCount);
  const runtimeErrors = last.diagnostics?.errors || [];
  const activeSamples = samples.filter((sample) => sample.active);
  const firstInactiveAfterAd = activeSamples.length
    ? samples.slice(samples.indexOf(activeSamples[0]) + 1).find((sample) => !sample.active)
    : null;
  const firstPrerollAdIndex = samples.findIndex(
    (sample) => sample.active && sample.phase === "initial",
  );
  const firstMidrollAdIndex = samples.findIndex(
    (sample) => sample.active && sample.phase === "seek",
  );
  const seekPointsTested = [
    ...new Set(
      samples
        .filter((sample) => sample.phase === "seek" && Number.isFinite(sample.seekPoint))
        .map((sample) => Number(sample.seekPoint)),
    ),
  ];
  const hasRecoveredAfter = (index, phase, seekPoint = null) =>
    index >= 0 &&
    samples.slice(index + 1).some(
      (sample) =>
        !sample.active &&
        sample.phase === phase &&
        (seekPoint == null || Number(sample.seekPoint) === Number(seekPoint)) &&
        sample.opacity !== "0" &&
        !(Number(sample.playbackRate) >= 15),
    );
  const firstMidrollAd = firstMidrollAdIndex >= 0 ? samples[firstMidrollAdIndex] : null;
  const seenPrerollAd = firstPrerollAdIndex >= 0;
  const seenMidrollAd = firstMidrollAdIndex >= 0;
  const seenPrerollRecovery = hasRecoveredAfter(firstPrerollAdIndex, "initial");
  const seenMidrollRecovery = hasRecoveredAfter(
    firstMidrollAdIndex,
    "seek",
    firstMidrollAd?.seekPoint,
  );
  const prerollStatus = !seenPrerollAd
    ? "not-observed"
    : seenPrerollRecovery
      ? "verified"
      : "failed";
  const midrollStatus = seekPointsTested.length === 0
    ? "not-applicable"
    : !seenMidrollAd
      ? "not-observed"
      : seenMidrollRecovery
        ? "verified"
        : "failed";
  const playbackProgressed = samples.some((sample, index) => {
    if (sample.paused !== false) return false;
    if (Number(sample.currentTime) > 0.1) return true;
    if (index === 0) return false;
    const previous = samples[index - 1];
    return (
      previous.paused === false &&
      Number.isFinite(previous.currentTime) &&
      Number.isFinite(sample.currentTime) &&
      Number(sample.currentTime) > Number(previous.currentTime) + 0.1
    );
  });
  const playbackEstablished = playbackProgressed;

  if (last.injectedScriptCount !== 1) {
    failures.push(`injected script count=${last.injectedScriptCount ?? "missing"}`);
  }
  if (last.injectedStyleCount !== 1) {
    failures.push(`injected style count=${last.injectedStyleCount ?? "missing"}`);
  }
  if (last.documentVersion !== expectedVersion) {
    failures.push(`document version=${last.documentVersion || "missing"}`);
  }
  if (last.runtimeVersion !== expectedVersion) {
    failures.push(`runtime version=${last.runtimeVersion || "missing"}`);
  }
  if (adNodeMetrics.stableAdNodes > 0) {
    failures.push(`stable visible ad nodes=${adNodeMetrics.stableAdNodes}`);
  }
  if (runtimeErrors.length > 0) {
    failures.push(`runtime errors=${runtimeErrors.join(" | ")}`);
  }
  if (expectPlayback && !playbackEstablished) {
    const blocker = samples.find((sample) => sample.playbackBlocker)?.playbackBlocker;
    failures.push(blocker ? `playback blocked=${blocker}` : "media playback not established");
  }
  if (seenPrerollAd && !seenPrerollRecovery) {
    failures.push("preroll ad did not recover");
  }
  if (seenMidrollAd && !seenMidrollRecovery) {
    failures.push("midroll ad did not recover");
  }

  for (const sample of activeSamples) {
    if (sample.opacity !== "0") failures.push(`active ad opacity=${sample.opacity}`);
    if (sample.muted !== true) failures.push(`active ad muted=${sample.muted}`);
    if (!(Number(sample.playbackRate) >= 15)) {
      failures.push(`active ad playbackRate=${sample.playbackRate}`);
    }
  }
  if (firstInactiveAfterAd) {
    if (firstInactiveAfterAd.opacity === "0") failures.push("player stayed hidden after ad");
    if (Number(firstInactiveAfterAd.playbackRate) >= 15) {
      failures.push("playback rate stayed accelerated after ad");
    }
  }

  const uniqueFailures = [...new Set(failures)];
  const playbackBlocker = samples.find((sample) => sample.playbackBlocker)?.playbackBlocker || null;
  const onlyExternalPlaybackBlock =
    Boolean(playbackBlocker) &&
    uniqueFailures.length === 1 &&
    uniqueFailures[0] === `playback blocked=${playbackBlocker}`;
  const status = uniqueFailures.length === 0
    ? "passed"
    : onlyExternalPlaybackBlock
      ? "blocked"
      : "failed";

  return {
    ok: uniqueFailures.length === 0,
    status,
    failures: uniqueFailures,
    title: last.title || first.title || "",
    finalUrl: last.href || first.href || "",
    samples: samples.length,
    seenActiveAd: activeSamples.length > 0,
    seenRecovery: Boolean(firstInactiveAfterAd),
    seenPrerollAd,
    seenPrerollRecovery,
    prerollStatus,
    seenMidrollAd,
    seenMidrollRecovery,
    midrollStatus,
    seekPointsTested,
    playbackEstablished,
    playbackStatus: !expectPlayback
      ? "not-applicable"
      : playbackEstablished
        ? "verified"
        : samples.find((sample) => sample.playbackBlocker)
          ? "blocked"
          : "failed",
    playbackBlocker,
    adNodeMetrics,
    final: last,
  };
}

function deriveResultStatus(summary) {
  if (summary.ok) return "passed";
  const onlyExternalPlaybackBlock =
    Boolean(summary.playbackBlocker) &&
    summary.failures.length === 1 &&
    summary.failures[0] === `playback blocked=${summary.playbackBlocker}`;
  return onlyExternalPlaybackBlock ? "blocked" : "failed";
}

async function runCase(client, testCase, round, outputDir, expectedVersion) {
  const browserExceptions = [];
  const browserErrors = [];
  const adBreakResponses = [];
  const onException = (params) => {
    browserExceptions.push(params.exceptionDetails?.text || "unknown exception");
  };
  const onLog = (params) => {
    if (params.entry?.level === "error" || params.entry?.level === "warning") {
      browserErrors.push(`${params.entry.level}:${params.entry.text}`);
    }
  };
  const onResponse = (params) => {
    const url = params.response?.url || "";
    if (!/\/youtubei\/v1\/player\/ad_break(?:\?|$)/i.test(url)) return;
    adBreakResponses.push({
      requestId: params.requestId,
      status: params.response?.status ?? null,
      mimeType: params.response?.mimeType || null,
      url,
    });
  };
  client.on("Runtime.exceptionThrown", onException);
  client.on("Log.entryAdded", onLog);
  client.on("Network.responseReceived", onResponse);

  const samples = [];
  const url = withCacheBuster(testCase.url, round);
  try {
    const loaded = client.once("Page.loadEventFired", 45000);
    await client.send("Page.navigate", {
      url,
      ...(testCase.referrer ? { referrer: testCase.referrer } : {}),
    });
    await loaded;
    await delay(800);

    for (let index = 0; index < (testCase.scrollSteps || 0); index += 1) {
      await evaluate(client, SCROLL_EXPRESSION);
      await delay(700);
      samples.push({
        ...(await evaluate(client, SNAPSHOT_EXPRESSION)),
        phase: "lazy-scroll",
        scrollStep: index + 1,
      });
    }

    let playbackStart = null;
    if (testCase.playback) {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        playbackStart = await evaluate(client, START_PLAYBACK_EXPRESSION);
        if (
          playbackStart.videoExists &&
          (playbackStart.paused === false ||
            playbackStart.readyState >= 2 ||
            playbackStart.currentTime > 0)
        ) break;
        await delay(500);
      }
    }

    const collectUntil = async (waitMs, phase, seekPoint = null) => {
      const deadline = Date.now() + waitMs;
      while (Date.now() < deadline) {
        try {
          samples.push({
            ...(await evaluate(client, SNAPSHOT_EXPRESSION)),
            phase,
            ...(seekPoint == null ? {} : { seekPoint }),
          });
        } catch (error) {
          browserExceptions.push(String(error));
        }
        await delay(SAMPLE_INTERVAL_MS);
      }
    };

    await collectUntil(testCase.waitMs, "initial");
    for (const seekPoint of testCase.seekPoints || []) {
      await evaluate(client, seekPlaybackExpression(seekPoint));
      await collectUntil(testCase.seekWaitMs || 6000, "seek", seekPoint);
    }

    const summary = summarizeSamples(samples, {
      expectedVersion,
      expectPlayback: Boolean(testCase.playback),
      stableSampleCount: STABLE_SAMPLE_COUNT,
    });
    summary.name = testCase.name;
    summary.round = round;
    summary.requestedUrl = testCase.url;
    summary.playbackStart = playbackStart;
    summary.browserExceptions = [...new Set(browserExceptions)].slice(-20);
    summary.browserErrors = [...new Set(browserErrors)].slice(-20);
    const inspectedAdBreakResponses = [];
    for (const response of [
      ...new Map(adBreakResponses.map((item) => [item.requestId, item])).values(),
    ]) {
      try {
        const result = await client.send("Network.getResponseBody", {
          requestId: response.requestId,
        });
        const body = result.base64Encoded
          ? Buffer.from(result.body || "", "base64").toString("utf8")
          : result.body || "";
        inspectedAdBreakResponses.push({
          ...response,
          payload: inspectAdBreakPayload(body),
        });
      } catch (error) {
        inspectedAdBreakResponses.push({ ...response, error: String(error) });
      }
    }
    summary.adBreakEvidence = summarizeAdBreakEvidence(inspectedAdBreakResponses);
    summary.adBreakStatus = summary.adBreakEvidence.status;
    if (summary.adBreakStatus === "failed") {
      summary.ok = false;
      summary.failures.push(
        `player/ad_break response contains ad fields=${summary.adBreakEvidence.adFieldPaths.join(",")}`,
      );
    }
    if (summary.browserExceptions.length) {
      summary.ok = false;
      summary.failures.push(`browser exceptions=${summary.browserExceptions.join(" | ")}`);
    }

    summary.failures = [...new Set(summary.failures)];
    summary.status = deriveResultStatus(summary);

    if (!summary.ok || summary.adNodeMetrics.maxVisibleAdNodes > 0) {
      await captureScreenshot(
        client,
        path.join(outputDir, `${String(round).padStart(2, "0")}-${testCase.name}.png`),
      );
    }
    return summary;
  } finally {
    client.off("Runtime.exceptionThrown", onException);
    client.off("Log.entryAdded", onLog);
    client.off("Network.responseReceived", onResponse);
  }
}

function printUsage() {
  console.log(
    "Usage: node tools/mac-chrome-regression.cjs [--scope player|full] [--rounds 3] [--only watch,long-watch] [--profile-dir DIR] [--output DIR]",
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const projectRoot = path.resolve(__dirname, "..");
  const expectedVersion = loadExpectedVersion(projectRoot);
  const testCases = selectCases(DEFAULT_CASES, options);
  if (!testCases.length) throw new Error("No matching test cases");
  if (!fs.existsSync(CHROME_PATH)) throw new Error(`Chrome not found: ${CHROME_PATH}`);

  fs.mkdirSync(options.outputDir, { recursive: true });
  const temporaryProfile = !options.profileDir;
  const profileDir = options.profileDir ||
    fs.mkdtempSync(path.join(os.tmpdir(), "youtube-mac-chrome-profile-"));
  if (!temporaryProfile) fs.mkdirSync(profileDir, { recursive: true });
  const headless = process.env.HEADLESS !== "0";
  const chrome = spawn(
    CHROME_PATH,
    [
      ...(headless ? ["--headless=new"] : []),
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDir}`,
      `--proxy-server=${SURGE_PROXY}`,
      "--disable-quic",
      "--no-first-run",
      "--no-default-browser-check",
      "--autoplay-policy=no-user-gesture-required",
      "--window-size=1440,1000",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );

  let client;
  const results = [];
  try {
    const { port } = await waitForDevTools(chrome);
    client = await createPage(port);
    await client.open();
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await client.send("Network.enable");

    for (let round = 1; round <= options.rounds; round += 1) {
      for (const testCase of testCases) {
        const result = await runCase(client, testCase, round, options.outputDir, expectedVersion);
        results.push(result);
        const status = result.status === "passed"
          ? "PASS"
          : result.status === "blocked"
            ? "BLOCKED"
            : "FAIL";
        console.log(
          `${status} round=${round} case=${testCase.name} media=${result.playbackStatus} preroll=${result.prerollStatus} midroll=${result.midrollStatus} adbreak=${result.adBreakStatus} active=${result.seenActiveAd} recovery=${result.seenRecovery} raw=${result.adNodeMetrics.maxRawAdNodes} visible=${result.adNodeMetrics.maxVisibleAdNodes} stable=${result.adNodeMetrics.stableAdNodes} errors=${result.final.diagnostics?.counters?.errors ?? "n/a"}`,
        );
        if (!result.ok) console.log(`  ${result.failures.join("; ")}`);
      }
    }
  } finally {
    client?.close();
    chrome.kill("SIGTERM");
    await delay(500);
    if (temporaryProfile) fs.rmSync(profileDir, { recursive: true, force: true });
  }

  const reportPath = path.join(options.outputDir, "report.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        expectedVersion,
        chromePath: CHROME_PATH,
        surgeProxy: SURGE_PROXY,
        headless,
        profileMode: temporaryProfile ? "temporary" : "persistent",
        rounds: options.rounds,
        scope: options.scope,
        stableSampleCount: STABLE_SAMPLE_COUNT,
        cases: testCases.map(({ name, url }) => ({ name, url })),
        results,
      },
      null,
      2,
    ),
  );

  const failed = results.filter((result) => result.status === "failed");
  const blocked = results.filter((result) => result.status === "blocked");
  console.log(`Report: ${reportPath}`);
  console.log(
    `Summary: passed=${results.filter((result) => result.status === "passed").length} ` +
      `blocked=${blocked.length} failed=${failed.length} total=${results.length}`,
  );
  if (failed.length) process.exitCode = 1;
  else if (blocked.length) process.exitCode = 2;
}

module.exports = {
  DEFAULT_CASES,
  PLAYER_CASE_NAMES,
  SNAPSHOT_EXPRESSION,
  START_PLAYBACK_EXPRESSION,
  classifyPlaybackBlocker,
  computeAdNodeMetrics,
  inspectAdBreakPayload,
  loadExpectedVersion,
  parseArguments,
  selectCases,
  summarizeAdBreakEvidence,
  summarizeSamples,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || String(error));
    process.exitCode = 1;
  });
}
