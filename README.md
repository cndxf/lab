# 实验室

公开、可复现、可回滚的个人工具实验仓库。每个项目使用独立子目录，不上传本机备份、运行状态、账号、证书或私钥。

## 项目

### YouTube 全平台去广告

目录：[`YouTube-全平台去广告/`](YouTube-全平台去广告/)

当前首个可安装适配器为 Surge：

[一键安装到 Surge](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2Fcndxf%2Flab%2Fmain%2Fdist%2Fyoutube%2FYouTube-AdBlock.sgmodule)

模块 Raw 地址：

```text
https://raw.githubusercontent.com/cndxf/lab/main/dist/youtube/YouTube-AdBlock.sgmodule
```

项目覆盖网页、iPhone/iPad 原生 App 和 Apple TV 的长期维护目标；实际支持状态以项目兼容性表为准。Stash 和 Shadowrocket 在完成真实设备验证前不提供伪兼容安装文件。

### TokenArk 汉化工具

目录：[`tokenark-zh/`](tokenark-zh/)

当前包含 GitHub Desktop、Claude Desktop 和 SiteSucker 的版本门禁、安装、审计和回滚脚本。补丁只适用于各目录 `manifest.json` 中列出的版本，应用升级后必须重新验证。

## 本地验证

```bash
./verify.sh
```

验证包含 YouTube 模块结构与脚本回归、分发文件一致性、汉化工具测试、本机绝对路径扫描和敏感文件特征扫描。

## 许可证与归属

仓库代码使用 Apache License 2.0。第三方脚本、应用名称、商标和应用自身资源仍归各自权利人所有，详情见 [`NOTICE.md`](NOTICE.md)。本仓库与 YouTube、Google、Surge、Stash、Shadowrocket、GitHub、Anthropic 或 SiteSucker 官方无隶属关系。
