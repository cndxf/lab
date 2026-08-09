# YouTube 全平台去广告

面向 YouTube 网页、iPhone/iPad 原生 App 和 Apple TV 的去广告维护项目。项目名称描述长期目标，不代表所有平台已经完成验证；每个客户端和平台必须在兼容性表中单独记录真实状态。

## 一键安装

当前可安装适配器是 Surge，请按设备选择：

- [Mac 网页版一键导入](https://cndxf.github.io/lab/surge-install.html)
- [iPhone / iPad / Apple TV 原生版一键导入](https://cndxf.github.io/lab/surge-install-native.html)

GitHub 会先打开本仓库的 HTTPS 中转页，然后自动唤起 Surge；若浏览器阻止自动跳转，中转页也提供备用按钮。

公开入口的实际版本以 [`dist/youtube/VERSION`](../dist/youtube/VERSION) 和模块标题为准，不以本文中的候选版本号为准。当前工作区的 `1.2.17` 仍是候选版；在它完成真机回归并推送公开分发前，测试请使用安装说明中的局域网一次性测试服务器。

安装完成后仍需在当前设备的模块列表启用。Mac 使用不解密 `googlevideo` 的网页安全版；iPhone、iPad 和 Apple TV 使用原生版。同一设备不要同时启用两个模块。

详细步骤、证书信任、更新、验证和回滚见 [`clients/surge/安装说明.md`](clients/surge/安装说明.md)。

## 支持状态

| 平台 / 客户端 | 状态 | 说明 |
| --- | --- | --- |
| macOS 网页 + Surge | `1.2.17` 候选，待最终播放器验收 | 修复游戏、音乐、电影、播客、Premium、购物及同类页面入口未注入的问题；真实前贴片、中插仍需在已登录资料中复测 |
| iPhone/iPad YouTube App + Surge | `1.2.17` 真机候选 | 独立原生模块已接入 protobuf、本地 UMP 解密和有限期 key 刷新，前贴片、中插和恢复仍需真机验收 |
| iPhone/iPad 网页 + Surge | 已接入 | 与移动网页规则共用，需继续真机回归 |
| Apple TV + Surge | `1.2.17` 实验性 | JSON player 回退路径新增 SSAP 配置清理并接入 UMP 候选路径；证书、前贴片、中插和长时播放仍需 tvOS 真机验收 |
| Stash | 未验证 | 不提供安装文件 |
| Shadowrocket | 未验证 | 不提供安装文件 |

## 维护入口

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)：多客户端、网页、移动端和 Apple TV 的边界。
- [`docs/MAC-REGRESSION.md`](docs/MAC-REGRESSION.md)：Mac 网页端真实回归矩阵和证据边界。
- [`docs/TVOS-REGRESSION.md`](docs/TVOS-REGRESSION.md)：Apple TV 部署门槛、有效配置检查和 tvOS 真机回归矩阵。
- [`scripts/web/`](scripts/web/)：网页专用脚本。
- [`scripts/native/`](scripts/native/)：移动端原生响应脚本。
- [`scripts/tvos/`](scripts/tvos/)：Apple TV JSON 回退脚本、实验记录和真机证据。
- [`clients/`](clients/)：各代理客户端适配器。
- [`tools/verify.sh`](tools/verify.sh)：本地与 CI 验证入口。
- [`tools/check-published.sh`](tools/check-published.sh)：发布前核对 GitHub 公开分发与本地产物。
- [`tools/check-surge-effective.sh`](tools/check-surge-effective.sh)：Mac 上检查两条网页脚本是否进入有效配置。
- [`tools/check-surge-native-effective.sh`](tools/check-surge-native-effective.sh)：iOS/tvOS 上检查四条原生脚本与 `*.googlevideo.com` MITM 是否完整、唯一且为当前版本。
- [`tools/serve-local-test.mjs`](tools/serve-local-test.mjs)：未发布版本通过局域网安装到 iPhone/iPad 的一次性真机测试服务器。
- [`tools/audit-upstream.sh`](tools/audit-upstream.sh)：发布前检查 Maasea 原生脚本与 uBlock Origin、AdGuard 的 YouTube 广告特征是否变化。
- [`tools/mac-chrome-regression.cjs`](tools/mac-chrome-regression.cjs)：默认执行播放器广告回归，并分别报告前贴片、中插广告态和 `player/ad_break` 响应证据；可用 `--profile-dir` 复用专用登录测试资料，避免匿名会话长期被 YouTube 登录门槛阻断。

普通本地验证不依赖网络；发布前增加实时上游审计：

```bash
AUDIT_UPSTREAM=1 ./tools/verify.sh
```

实时审计发现上游提交或广告字段块变化时会以严格模式失败，防止未复核差异就直接发布。
网络较慢时可用 `YOUTUBE_AUDIT_MAX_TIME=180 AUDIT_UPSTREAM=1 ./tools/verify.sh` 延长上游文件下载超时；默认值为 120 秒。

## 安全边界

- 模块不包含证书、CA 私钥、账号、Cookie 或用户配置。
- Mac 网页安全版只 MITM `www.youtube.com`、`m.youtube.com` 和 `youtubei.googleapis.com`，不接入 `*.googlevideo.com`。
- iOS/tvOS 原生版会 MITM `*.googlevideo.com` 的 `initplayback`，但解密、清理、重新加密和 HMAC 校验全部在设备本地完成。
- 原生版不请求第三方 Worker，不上传播放 URL、密钥、Cookie、Authorization 或响应正文。
- 同一设备不要同时启用 Mac 网页安全版和 iOS/tvOS 原生版。
- 上游原生脚本保留来源、提交版本与 Apache-2.0 许可证说明。
- YouTube、Surge、Stash 和 Shadowrocket 均为各自权利人的商标，本项目与其官方无隶属关系。
