const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(projectRoot, "..");
const moduleName = "YouTube-iOS-tvOS-AdBlock.sgmodule";
const webModuleName = "YouTube-AdBlock.sgmodule";
const scriptNames = [
  "youtube-native-response.js",
  "youtube-native-request.js",
  "youtube-native-ump.js",
  "youtube-tvos-json.js",
  "youtube-web-response.js",
  "youtube-web-page.js",
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

(async () => {
  const {
    parseCliOptions,
    startLocalTestServer,
    validateDistributionCurrent,
  } = await import(pathToFileURL(path.join(projectRoot, "tools/serve-local-test.mjs")));
  const token = "test-session-token";

  assert.deepEqual(
    parseCliOptions([
      "--allow-lan",
      "--host",
      "0.0.0.0",
      "--advertise-host",
      "192.168.1.20",
      "--port",
      "8765",
    ]),
    {
      allowLan: true,
      host: "0.0.0.0",
      advertiseHost: "192.168.1.20",
      port: 8765,
    },
  );
  assert.deepEqual(parseCliOptions(["--platform", "web"]), { platform: "web" });
  assert.throws(() => parseCliOptions(["--platform", "other"]), /platform must be web or native/);
  assert.throws(() => parseCliOptions(["--allow-lan=no"]), /Unknown option/);
  assert.throws(
    () =>
      validateDistributionCurrent({
        projectRoot,
        readFile(filePath, encoding) {
          if (filePath.endsWith(`dist/youtube/releases/${fs.readFileSync(path.join(projectRoot, "VERSION"), "utf8").trim()}/scripts/youtube-native-ump.js`)) {
            return "stale distribution";
          }
          return fs.readFileSync(filePath, encoding);
        },
      }),
    /dist\/youtube is stale: script youtube-native-ump\.js differs/,
  );

  const firstRandomRuntime = await startLocalTestServer({ projectRoot, port: 0, logger() {} });
  const secondRandomRuntime = await startLocalTestServer({ projectRoot, port: 0, logger() {} });
  try {
    assert.notEqual(firstRandomRuntime.token, secondRandomRuntime.token);
  } finally {
    await firstRandomRuntime.close();
    await secondRandomRuntime.close();
  }

  const runtime = await startLocalTestServer({
    projectRoot,
    port: 0,
    token,
    logger() {},
  });

  try {
    assert.equal(runtime.host, "127.0.0.1");
    assert.match(runtime.origin, /^http:\/\/127\.0\.0\.1:\d+$/);

    for (const pathname of [
      "/",
      "/install.html",
      "/health",
      `/${moduleName}`,
      "/scripts/youtube-native-ump.js",
    ]) {
      assert.equal((await fetch(`${runtime.origin}${pathname}`)).status, 404);
      assert.equal((await fetch(`${runtime.origin}${pathname}?token=wrong-token`)).status, 404);
    }

    const moduleResponse = await fetch(`${runtime.origin}/${moduleName}?token=${token}`);
    assert.equal(moduleResponse.status, 200);
    assert.equal(moduleResponse.headers.get("cache-control"), "no-store");
    const moduleSource = await moduleResponse.text();
    assert.doesNotMatch(moduleSource, /https:\/\/raw\.githubusercontent\.com\/cndxf\/lab\/main\/dist\/youtube/);
    for (const scriptName of scriptNames) {
      assert.match(
        moduleSource,
        new RegExp(`${escapeRegExp(runtime.origin)}/scripts/${escapeRegExp(scriptName)}\\?[^,\\r\\n]*token=${token}`),
        `${scriptName} must use the local origin and session token`,
      );
    }

    const scriptResponse = await fetch(`${runtime.origin}/scripts/youtube-native-ump.js?token=${token}`);
    assert.equal(scriptResponse.status, 200);
    assert.equal(
      await scriptResponse.text(),
      fs.readFileSync(
        path.join(
          repoRoot,
          "dist/youtube/releases",
          fs.readFileSync(path.join(projectRoot, "VERSION"), "utf8").trim(),
          "scripts/youtube-native-ump.js",
        ),
        "utf8",
      ),
    );

    const installerResponse = await fetch(`${runtime.origin}/install.html?token=${token}`);
    assert.equal(installerResponse.status, 200);
    const installer = await installerResponse.text();
    const moduleUrl = `${runtime.origin}/${moduleName}?token=${token}`;
    assert.match(installer, new RegExp(`surge:\/\/\/install-module\\?url=${escapeRegExp(encodeURIComponent(moduleUrl))}`));
    assert.match(installer, new RegExp(escapeRegExp(moduleUrl)));

    const healthResponse = await fetch(`${runtime.origin}/health?token=${token}`);
    assert.equal(healthResponse.status, 200);
    assert.deepEqual(await healthResponse.json(), {
      status: "ok",
      version: fs.readFileSync(path.join(projectRoot, "VERSION"), "utf8").trim(),
    });

    const traversalResponse = await fetch(`${runtime.origin}/scripts/..%2FVERSION?token=${token}`);
    assert.equal(traversalResponse.status, 404);
  } finally {
    await runtime.close();
  }

  const webRuntime = await startLocalTestServer({
    projectRoot,
    platform: "web",
    port: 0,
    token,
    logger() {},
  });

  try {
    const webModuleResponse = await fetch(`${webRuntime.origin}/${webModuleName}?token=${token}`);
    assert.equal(webModuleResponse.status, 200);
    const webModuleSource = await webModuleResponse.text();
    for (const scriptName of ["youtube-web-response.js", "youtube-web-page.js"]) {
      assert.match(
        webModuleSource,
        new RegExp(`${escapeRegExp(webRuntime.origin)}/scripts/${escapeRegExp(scriptName)}\\?[^,\\r\\n]*token=${token}`),
        `${scriptName} must use the local web origin and session token`,
      );
    }
    assert.equal(
      (await fetch(`${webRuntime.origin}/scripts/youtube-native-ump.js?token=${token}`)).status,
      404,
    );
    assert.equal(
      (await fetch(`${webRuntime.origin}/scripts/youtube-web-page.js?token=${token}`)).status,
      200,
    );
    const webInstaller = await (await fetch(`${webRuntime.origin}/install.html?token=${token}`)).text();
    assert.match(webInstaller, /YouTube Mac 网页本地测试安装/);
    assert.match(webInstaller, new RegExp(escapeRegExp(`${webRuntime.origin}/${webModuleName}?token=${token}`)));
  } finally {
    await webRuntime.close();
  }

  for (const advertiseHost of ["127.0.0.1", "0.0.0.0", "198.18.0.1"]) {
    await assert.rejects(
      () => startLocalTestServer({ projectRoot, allowLan: true, host: "0.0.0.0", advertiseHost, port: 0, token, logger() {} }),
      /advertiseHost must be a private LAN IPv4 address/,
    );
  }
  await assert.rejects(
    () => startLocalTestServer({ projectRoot, host: "0.0.0.0", advertiseHost: "192.168.1.20", port: 0, token, logger() {} }),
    /allowLan=true is required for non-loopback listening/,
  );

  console.log("PASS: local device-test server enforces LAN, token, and distribution safety");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
