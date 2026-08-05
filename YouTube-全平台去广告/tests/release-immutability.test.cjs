const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const buildScriptSource = fs.readFileSync(
  path.join(projectRoot, "tools/build-dist.sh"),
  "utf8",
);

const sourceFiles = new Map([
  ["VERSION", "9.9.9\n"],
  ["clients/surge/YouTube-All-Platform-AdBlock.sgmodule", "base module\n"],
  ["clients/surge/YouTube-iOS-tvOS-AdBlock.sgmodule", "native module\n"],
  ["scripts/web/youtube-web-page.js", "web page\n"],
  ["scripts/web/youtube-web-response.js", "web response\n"],
  ["scripts/native/youtube-native-response.js", "native response\n"],
  ["scripts/native/youtube-native-request.js", "native request\n"],
  ["scripts/native/youtube-native-ump.js", "native ump\n"],
  ["scripts/tvos/youtube-tvos-json.js", "tvos json\n"],
]);

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function createFixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "youtube-release-"));
  const fixtureProjectRoot = path.join(repoRoot, "project");
  for (const [relativePath, contents] of sourceFiles) {
    writeFile(path.join(fixtureProjectRoot, relativePath), contents);
  }
  writeFile(path.join(fixtureProjectRoot, "tools/build-dist.sh"), buildScriptSource);
  return { fixtureProjectRoot, repoRoot };
}

function runBuild(fixtureProjectRoot) {
  return spawnSync("sh", [path.join(fixtureProjectRoot, "tools/build-dist.sh")], {
    encoding: "utf8",
  });
}

{
  const { fixtureProjectRoot, repoRoot } = createFixture();
  try {
    const initial = runBuild(fixtureProjectRoot);
    assert.equal(initial.status, 0, initial.stderr || initial.stdout);

    const publishedRequestPath = path.join(
      repoRoot,
      "dist/youtube/releases/9.9.9/scripts/youtube-native-request.js",
    );
    const publishedContents = fs.readFileSync(publishedRequestPath, "utf8");
    fs.writeFileSync(
      path.join(fixtureProjectRoot, "scripts/native/youtube-native-request.js"),
      "changed native request\n",
    );

    const overwrite = runBuild(fixtureProjectRoot);
    assert.equal(overwrite.status, 1, "a changed existing release must not be overwritten");
    assert.match(`${overwrite.stdout}\n${overwrite.stderr}`, /immutable|already exists/i);
    assert.equal(fs.readFileSync(publishedRequestPath, "utf8"), publishedContents);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
}

{
  const { fixtureProjectRoot, repoRoot } = createFixture();
  try {
    const oldVersions = ["1.0.0", "1.0.1", "1.0.2", "1.0.3"];
    for (const version of oldVersions) {
      writeFile(path.join(repoRoot, `dist/youtube/releases/${version}/marker`), version);
    }

    const build = runBuild(fixtureProjectRoot);
    assert.equal(build.status, 0, build.stderr || build.stdout);
    for (const version of oldVersions) {
      assert.equal(
        fs.readFileSync(path.join(repoRoot, `dist/youtube/releases/${version}/marker`), "utf8"),
        version,
        `build must preserve existing release ${version}`,
      );
    }
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
}

console.log("PASS: published release directories are immutable and retained");
