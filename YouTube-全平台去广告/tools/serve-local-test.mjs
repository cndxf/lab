#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_CONFIGS = {
  native: {
    moduleName: "YouTube-iOS-tvOS-AdBlock.sgmodule",
    sourceModuleName: "YouTube-iOS-tvOS-AdBlock.sgmodule",
    scriptNames: [
      "youtube-native-response.js",
      "youtube-native-request.js",
      "youtube-native-ump.js",
      "youtube-tvos-json.js",
      "youtube-web-response.js",
      "youtube-web-page.js",
    ],
    title: "YouTube iOS/tvOS 本地测试安装",
  },
  web: {
    moduleName: "YouTube-AdBlock.sgmodule",
    sourceModuleName: "YouTube-All-Platform-AdBlock.sgmodule",
    scriptNames: ["youtube-web-response.js", "youtube-web-page.js"],
    title: "YouTube Mac 网页本地测试安装",
  },
};
const SCRIPT_NAMES = [
  ...new Set(Object.values(MODULE_CONFIGS).flatMap(({ scriptNames }) => scriptNames)),
];
const PUBLISHED_SCRIPT_ROOT =
  "https://raw.githubusercontent.com/cndxf/lab/main/dist/youtube/";

function send(response, statusCode, contentType, body) {
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": contentType,
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}

function isPrivateLanIpv4(value) {
  const octets = value.split(".");
  if (octets.length !== 4 || octets.some((octet) => !/^\d{1,3}$/.test(octet))) {
    return false;
  }
  const numbers = octets.map(Number);
  if (numbers.some((number) => number > 255)) {
    return false;
  }
  return (
    numbers[0] === 10 ||
    (numbers[0] === 172 && numbers[1] >= 16 && numbers[1] <= 31) ||
    (numbers[0] === 192 && numbers[1] === 168)
  );
}

function findLanAddress() {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal && isPrivateLanIpv4(address.address)) {
        return address.address;
      }
    }
  }
  return undefined;
}

function requireLanConfiguration({ allowLan, host, advertiseHost }) {
  if (!allowLan) {
    if (host !== "127.0.0.1") {
      throw new Error("allowLan=true is required for non-loopback listening");
    }
    if (advertiseHost !== "127.0.0.1") {
      throw new Error("allowLan=true is required for non-loopback advertising");
    }
    return;
  }

  if (host !== "0.0.0.0" && !isPrivateLanIpv4(host)) {
    throw new Error("LAN host must be 0.0.0.0 or a private LAN IPv4 address");
  }
  if (!isPrivateLanIpv4(advertiseHost)) {
    throw new Error("advertiseHost must be a private LAN IPv4 address");
  }
}

function createSessionToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function withToken(url, token) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

function renderInstaller(origin, token, moduleName, title) {
  const moduleUrl = withToken(`${origin}/${moduleName}`, token);
  const installUrl = `surge:///install-module?url=${encodeURIComponent(moduleUrl)}`;
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="refresh" content="0;url=${installUrl}">
    <title>${title}</title>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p><a href="${installUrl}">打开 Surge 并导入</a></p>
      <p><a href="${moduleUrl}">查看本地测试模块</a></p>
    </main>
  </body>
</html>
`;
}

function rewriteModuleSource(source, origin, token, scriptNames) {
  const scriptNamePattern = scriptNames
    .map((scriptName) => scriptName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const pattern = new RegExp(
    `${PUBLISHED_SCRIPT_ROOT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:releases/[^/,\\r\\n]+/)?scripts/(${scriptNamePattern})(\\?[^,\\r\\n]*)?`,
    "g",
  );
  return source.replace(pattern, (_, scriptName, query = "") => {
    const parameters = new URLSearchParams(query.slice(1));
    parameters.set("token", token);
    return `${origin}/scripts/${scriptName}?${parameters.toString()}`;
  });
}

function readRequired(readFile, filePath) {
  try {
    return readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(`dist/youtube is stale: unable to read ${filePath}: ${error.message}`);
  }
}

export function validateDistributionCurrent({ projectRoot, readFile = fs.readFileSync } = {}) {
  if (!projectRoot) {
    throw new Error("projectRoot is required");
  }

  const repoRoot = path.resolve(projectRoot, "..");
  const distRoot = path.join(repoRoot, "dist/youtube");
  const version = readRequired(readFile, path.join(projectRoot, "VERSION")).trim();
  const releaseRoot = path.join(distRoot, "releases", version);
  const distVersion = readRequired(readFile, path.join(distRoot, "VERSION")).trim();
  if (version !== distVersion) {
    throw new Error("dist/youtube is stale: VERSION differs");
  }

  for (const moduleConfig of Object.values(MODULE_CONFIGS)) {
    const sourceModule = readRequired(
      readFile,
      path.join(projectRoot, "clients/surge", moduleConfig.sourceModuleName),
    );
    const distModule = readRequired(readFile, path.join(distRoot, moduleConfig.moduleName));
    if (sourceModule !== distModule) {
      throw new Error(`dist/youtube is stale: module ${moduleConfig.moduleName} differs`);
    }
  }

  for (const scriptName of SCRIPT_NAMES) {
    const sourceDirectory =
      scriptName === "youtube-tvos-json.js"
        ? "tvos"
        : scriptName.startsWith("youtube-native-")
          ? "native"
          : "web";
    const source = readRequired(readFile, path.join(projectRoot, "scripts", sourceDirectory, scriptName));
    const distribution = readRequired(readFile, path.join(releaseRoot, "scripts", scriptName));
    if (source !== distribution) {
      throw new Error(`dist/youtube is stale: script ${scriptName} differs`);
    }
  }

  return { distRoot, releaseRoot, version };
}

export async function startLocalTestServer({
  projectRoot,
  platform = "native",
  allowLan = false,
  host,
  advertiseHost,
  port = 8765,
  token = createSessionToken(),
  logger = console.log,
} = {}) {
  const moduleConfig = MODULE_CONFIGS[platform];
  if (!moduleConfig) {
    throw new Error(`platform must be one of: ${Object.keys(MODULE_CONFIGS).join(", ")}`);
  }
  const { distRoot, releaseRoot, version } = validateDistributionCurrent({ projectRoot });
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("token must be a non-empty string");
  }

  const listenHost = host ?? (allowLan ? "0.0.0.0" : "127.0.0.1");
  const publicHost = advertiseHost ?? (allowLan ? findLanAddress() : "127.0.0.1");
  requireLanConfiguration({ allowLan, host: listenHost, advertiseHost: publicHost });

  const modulePath = path.join(distRoot, moduleConfig.moduleName);
  const scriptsRoot = path.join(releaseRoot, "scripts");
  const scriptNameSet = new Set(moduleConfig.scriptNames);
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://local.test");
    const suppliedTokens = requestUrl.searchParams.getAll("token");
    if (suppliedTokens.length !== 1 || suppliedTokens[0] !== token) {
      send(response, 404, "text/plain; charset=utf-8", "Not Found\n");
      return;
    }

    if (request.method !== "GET") {
      send(response, 405, "text/plain; charset=utf-8", "Method Not Allowed\n");
      return;
    }

    const pathname = requestUrl.pathname;
    const address = server.address();
    const actualPort = typeof address === "object" && address ? address.port : port;
    const origin = `http://${publicHost}:${actualPort}`;

    if (pathname === "/health") {
      send(response, 200, "application/json; charset=utf-8", `${JSON.stringify({ status: "ok", version })}\n`);
      return;
    }
    if (pathname === "/install.html" || pathname === "/") {
      send(
        response,
        200,
        "text/html; charset=utf-8",
        renderInstaller(origin, token, moduleConfig.moduleName, moduleConfig.title),
      );
      return;
    }
    if (pathname === `/${moduleConfig.moduleName}`) {
      const source = rewriteModuleSource(
        fs.readFileSync(modulePath, "utf8"),
        origin,
        token,
        moduleConfig.scriptNames,
      );
      send(response, 200, "text/plain; charset=utf-8", source);
      return;
    }
    if (pathname.startsWith("/scripts/")) {
      let scriptName;
      try {
        scriptName = decodeURIComponent(pathname.slice("/scripts/".length));
      } catch {
        send(response, 404, "text/plain; charset=utf-8", "Not Found\n");
        return;
      }
      if (!scriptNameSet.has(scriptName)) {
        send(response, 404, "text/plain; charset=utf-8", "Not Found\n");
        return;
      }
      send(response, 200, "text/javascript; charset=utf-8", fs.readFileSync(path.join(scriptsRoot, scriptName), "utf8"));
      return;
    }
    send(response, 404, "text/plain; charset=utf-8", "Not Found\n");
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, listenHost, resolve);
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const origin = `http://${publicHost}:${actualPort}`;
  logger(`Local YouTube test server: ${withToken(`${origin}/install.html`, token)}`);
  logger(`Local Surge module: ${withToken(`${origin}/${moduleConfig.moduleName}`, token)}`);

  return {
    host: listenHost,
    origin,
    token,
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

export function parseCliOptions(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (name === "--allow-lan") {
      options.allowLan = true;
      continue;
    }
    if (name === "--platform") {
      if (!value || !Object.hasOwn(MODULE_CONFIGS, value)) {
        throw new Error("--platform must be web or native");
      }
      options.platform = value;
      index += 1;
      continue;
    }
    if (name === "--host" || name === "--advertise-host" || name === "--port") {
      if (!value) {
        throw new Error(`${name} requires a value`);
      }
      if (name === "--host") options.host = value;
      if (name === "--advertise-host") options.advertiseHost = value;
      if (name === "--port") {
        if (!/^\d+$/.test(value)) {
          throw new Error("--port must be an integer");
        }
        options.port = Number(value);
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${name}`);
  }
  if (options.port !== undefined && (options.port < 0 || options.port > 65535)) {
    throw new Error("--port must be between 0 and 65535");
  }
  return options;
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const runtime = await startLocalTestServer({
    projectRoot,
    ...parseCliOptions(process.argv.slice(2)),
  });

  const stop = async () => {
    await runtime.close();
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
