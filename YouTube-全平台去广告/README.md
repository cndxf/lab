# YouTube 全平台去广告

面向 YouTube 网页、iPhone/iPad 原生 App 和 Apple TV 的去广告维护项目。项目名称描述长期目标，不代表所有平台已经完成验证；每个客户端和平台必须在兼容性表中单独记录真实状态。

## 一键安装

当前可安装适配器是 Surge：

[一键安装到 Surge](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2Fcndxf%2Flab%2Fmain%2Fdist%2Fyoutube%2FYouTube-AdBlock.sgmodule)

详细步骤、证书信任、更新、验证和回滚见 [`clients/surge/安装说明.md`](clients/surge/安装说明.md)。

## 支持状态

| 平台 / 客户端 | 状态 | 说明 |
| --- | --- | --- |
| macOS 网页 + Surge | 已完成自动回归 | 24 项单元测试与两轮 28/28 Chrome 页面矩阵；登录态真实广告仍需持续抽测 |
| iPhone/iPad YouTube App + Surge | 已接入 | 使用上游 protobuf 响应脚本，需继续做前贴片、中插和恢复真机回归 |
| iPhone/iPad 网页 + Surge | 已接入 | 与移动网页规则共用，需继续真机回归 |
| Apple TV + Surge | 实验性 | 证书部署和 tvOS 广告回归尚未完成 |
| Stash | 未验证 | 不提供安装文件 |
| Shadowrocket | 未验证 | 不提供安装文件 |

## 维护入口

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)：多客户端、网页、移动端和 Apple TV 的边界。
- [`scripts/web/`](scripts/web/)：网页专用脚本。
- [`scripts/native/`](scripts/native/)：移动端原生响应脚本。
- [`scripts/tvos/`](scripts/tvos/)：Apple TV 实验记录和未来专用实现。
- [`clients/`](clients/)：各代理客户端适配器。
- [`tools/verify.sh`](tools/verify.sh)：本地与 CI 验证入口。

## 安全边界

- 模块不包含证书、CA 私钥、账号、Cookie 或用户配置。
- 只 MITM `www.youtube.com`、`m.youtube.com` 和 `youtubei.googleapis.com`。
- 不接入 `*.googlevideo.com` MITM 或 `initplayback` 请求改写。
- 上游原生脚本保留来源、提交版本与 Apache-2.0 许可证说明。
- YouTube、Surge、Stash 和 Shadowrocket 均为各自权利人的商标，本项目与其官方无隶属关系。
