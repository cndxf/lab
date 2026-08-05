const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const installation = fs.readFileSync(
  path.join(projectRoot, "clients/surge/安装说明.md"),
  "utf8",
);
const readme = fs.readFileSync(path.join(projectRoot, "README.md"), "utf8");

assert.match(
  readme,
  /tools\/serve-local-test\.mjs/,
  "项目维护入口必须列出局域网真机测试服务器",
);

assert.match(
  installation,
  /serve-local-test\.mjs/,
  "安装说明必须记录未发布版本的局域网真机测试入口",
);
assert.match(
  installation,
  /--allow-lan/,
  "局域网真机测试命令必须显式允许 LAN 监听",
);
assert.match(
  installation,
  /终端输出.*token=/s,
  "安装说明必须要求使用服务器输出的带 token 安装地址",
);
assert.match(
  installation,
  /测试结束后.*停止.*本地服务器/s,
  "安装说明必须要求测试后停止局域网服务器",
);
assert.match(
  installation,
  /日期与时间.*自动设置/s,
  "证书与配对排障必须覆盖设备时钟不一致",
);

console.log("PASS: local device-test and clock troubleshooting are documented");
