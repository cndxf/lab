const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const webModuleSource = fs.readFileSync(
  path.join(projectRoot, "clients/surge/YouTube-All-Platform-AdBlock.sgmodule"),
  "utf8",
);
const nativeModuleSource = fs.readFileSync(
  path.join(projectRoot, "clients/surge/YouTube-iOS-tvOS-AdBlock.sgmodule"),
  "utf8",
);
const installGuide = fs.readFileSync(
  path.join(projectRoot, "clients/surge/安装说明.md"),
  "utf8",
);
const validator = fs.readFileSync(
  path.join(projectRoot, "tools/validate-surge-module.sh"),
  "utf8",
);

const nativeArguments = [
  ["caption_lang", "off"],
  ["block_upload", "false"],
  ["block_immersive", "false"],
  ["block_shorts", "false"],
  ["debug", "false"],
  ["update_interval", "21600"],
];

const webArgumentLine = webModuleSource.match(/^#!arguments=(.*)$/m)?.[1] || "";
for (const [name, defaultValue] of [
  ["debug", "false"],
  ["update_interval", "21600"],
]) {
  assert.match(
    webArgumentLine,
    new RegExp(`(?:^|,)${name}:${defaultValue}(?:,|$)`),
    `网页模块参数缺少 ${name}:${defaultValue}`,
  );
  assert.ok(webModuleSource.includes(`{{{${name}}}}`), `网页模块没有使用参数：${name}`);
}
for (const nativeOnlyName of ["caption_lang", "block_upload", "block_immersive", "block_shorts"]) {
  assert.doesNotMatch(webArgumentLine, new RegExp(`(?:^|,)${nativeOnlyName}:`));
  assert.ok(!webModuleSource.includes(`{{{${nativeOnlyName}}}}`));
}
assert.match(webModuleSource, /^#!arguments-desc=.*debug.*update_interval.*$/m);
assert.doesNotMatch(webModuleSource, /^#!arguments-desc=.*caption_lang.*$/m);

const nativeArgumentLine = nativeModuleSource.match(/^#!arguments=(.*)$/m)?.[1] || "";
for (const [name, defaultValue] of nativeArguments) {
  assert.match(
    nativeArgumentLine,
    new RegExp(`(?:^|,)${name}:${defaultValue}(?:,|$)`),
    `原生模块参数缺少 ${name}:${defaultValue}`,
  );
  assert.ok(nativeModuleSource.includes(`{{{${name}}}}`), `原生模块没有使用参数：${name}`);
}

assert.match(nativeModuleSource, /^#!arguments-desc=.*caption_lang.*block_upload.*block_immersive.*block_shorts.*debug.*update_interval.*$/m);
assert.match(webModuleSource, /^#!category=广告过滤$/m);
assert.match(nativeModuleSource, /^#!category=广告过滤$/m);

const nativeRule = nativeModuleSource.match(/^youtube\.native\.response = .*$/m)?.[0] || "";
for (const jsonArgument of [
  '\\\"captionLang\\\":\\\"{{{caption_lang}}}\\\"',
  '\\\"blockUpload\\\":{{{block_upload}}}',
  '\\\"blockImmersive\\\":{{{block_immersive}}}',
  '\\\"blockShorts\\\":{{{block_shorts}}}',
  '\\\"debug\\\":{{{debug}}}',
]) {
  assert.ok(nativeRule.includes(jsonArgument), `原生脚本参数未接入：${jsonArgument}`);
}

for (const ruleName of ["youtube.web.response", "youtube.web.page"]) {
  const rule = webModuleSource.match(new RegExp(`^${ruleName.replaceAll(".", "\\.")} = .*$`, "m"))?.[0] || "";
  assert.match(rule, /debug=\{\{\{debug\}\}\}/);
  assert.match(rule, /script-update-interval=\{\{\{update_interval\}\}\}/);
}
for (const ruleName of [
  "youtube.native.response",
  "youtube.native.request.init",
  "youtube.native.response.init",
  "youtube.native.request.log_event",
  "youtube.tvos.json",
  "youtube.web.response",
  "youtube.web.page",
]) {
  const rule = nativeModuleSource.match(new RegExp(`^${ruleName.replaceAll(".", "\\.")} = .*$`, "m"))?.[0] || "";
  assert.match(rule, /debug=\{\{\{debug\}\}\}/);
  assert.match(rule, /script-update-interval=\{\{\{update_interval\}\}\}/);
}

for (const requiredText of [
  "模块参数设置",
  "caption_lang",
  "block_upload",
  "block_immersive",
  "block_shorts",
  "debug",
  "update_interval",
]) {
  assert.match(installGuide, new RegExp(requiredText), `安装说明缺少参数文档：${requiredText}`);
}

assert.match(validator, /#!arguments=/);
assert.ok(
  validator.includes('rendered.replaceAll(`{{{${name}}}}`, value)'),
  "校验器必须解析当前 Surge 使用的三花括号参数占位符",
);

console.log("PASS: Surge module exposes documented custom arguments");
