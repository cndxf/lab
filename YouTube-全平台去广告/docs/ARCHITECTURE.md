# 架构与排障边界

## 维护标记

源码和客户端配置统一使用以下四种标记。修改前先确认目标属于哪一层，避免网页修复误改原生客户端，或把尚未验证的 tvOS 行为当作移动端通用能力。

| 标记 | 允许维护的内容 |
| --- | --- |
| `[COMMON / 多客户端通用]` | 域名边界、接口匹配、版本、运行时命名、更新与回滚约定 |
| `[WEB / 网页专用]` | HTML 注入、DOM 清理、网页 JSON、CSP、播放器恢复 |
| `[MOBILE / 移动端专用]` | iPhone/iPad 原生 App 的 protobuf、二进制响应和真机回归 |
| `[TVOS / Apple TV 专用]` | Apple TV 独有接口、证书部署、遥控器与 tvOS 真机证据 |

## 目录职责

| 目录 | 职责 | 当前状态 |
| --- | --- | --- |
| `scripts/web/` | YouTube 网页 HTML 注入和 JSON 响应清理 | Surge macOS 网页路径已回归 |
| `scripts/native/` | iPhone/iPad 原生 App protobuf、initplayback 请求和 UMP 加密响应 | 本地合成回归已通过，仍需真机广告回归 |
| `scripts/tvos/` | Apple TV 差异、专用实现和真机证据 | 实验性，包含 JSON player 回退脚本 |
| `clients/surge/` | Surge 模块和安装说明 | 首个可安装适配器 |
| `clients/stash/` | Stash 格式和运行时适配 | 未验证 |
| `clients/shadowrocket/` | Shadowrocket 格式和运行时适配 | 未验证 |
| `dist/youtube/` | GitHub Raw 使用的稳定 ASCII 分发路径 | 由构建脚本生成并校验 |

## 共用部分

共用的是域名边界、接口匹配、版本管理、更新策略、广告结构样本和验收标准。不同客户端的配置语法、脚本 API、证书入口和缓存策略不能假设相同，因此分别放在 `clients/` 下。

## 运行时自动分流

Surge 分为两个安装入口：Mac 网页安全版不解密 `googlevideo`，iOS/tvOS 原生版包含网页规则与原生加密流规则。同一设备只启用其中一个。模块内的脚本由 URL `pattern` 自动匹配：

| 请求特征 | 处理脚本 | 说明 |
| --- | --- | --- |
| `www.youtube.com` / `m.youtube.com` 网页和网页 API | `youtube-web-page.js` / `youtube-web-response.js` | 桌面和移动浏览器共用网页路径 |
| `youtubei.googleapis.com` 二进制响应 | `youtube-native-response.js` | iPhone/iPad 原生 App 路径，使用 `binary-body-mode=1` |
| `*.googlevideo.com/initplayback` 请求 | `youtube-native-request.js` | 校验并刷新本地 onesie key，不转发请求 |
| `*.googlevideo.com/initplayback` UMP 响应 | `youtube-native-ump.js` | 本地 AES-CTR 解密、清理、gzip、重新加密和 HMAC |
| `www.youtube.com/youtubei/v1/player` JSON 响应 | `youtube-tvos-json.js` | tvOS 专用回退路径，只清理广告调度和追踪字段 |

因此“自动识别”的核心是请求域名、路径和响应格式，不是硬件型号或用户手动选择平台。原生脚本内部只额外使用 `User-Agent` 区分 YouTube 与 YouTube Music 的状态存储，不用它决定 Mac 或 iPhone 路径。

## 网页专用

`youtube-web-response.js` 处理网页 JSON 列表广告，并只对 `player/ad_break` 定向删除中插调度字段；它刻意避开完整 `player` 和 `get_watch` 的播放器状态。`youtube-web-page.js` 处理 DOM 广告、跳过按钮、播放器广告态、临时静音加速以及正片恢复。

Mac 当前先验收播放器链路：真实前贴片广告态、正片恢复、`player/ad_break` 响应清理和真实中插恢复。首页、搜索、推荐流等页面广告仍保留完整回归入口，但不能用页面节点清理结果替代播放器广告证据。

排障时先确认：页面是否被注入、运行时版本是否存在、CSP nonce 是否继承、广告节点清理数、播放器是否恢复。网页故障不要直接修改原生 protobuf 脚本。

## 移动端专用

`youtube-native-response.js` 来自 Maasea/sgmodule 的 Apache-2.0 上游构建，处理常规原生 protobuf 响应。`youtube-native-request.js` 和 `youtube-native-ump.js` 锁定上游历史提交 `2ead6ff5950d7722c4aa6658998904ef78eee531`，用于本地处理原生 `initplayback` 加密流。

这两条 UMP 脚本不调用 `init-stream.maasea.workers.dev` 或其他第三方 Worker。播放 URL、密钥、账号请求头和正文不离开设备。排障时先确认：`youtubei.googleapis.com` 和 `*.googlevideo.com` 是否完成 MITM、是否启用 `binary-body-mode=1`、App 是否重建连接、是否存在重复脚本。

## Apple TV 专用

Apple TV 目前由 iOS/tvOS 原生模块复用 UMP 候选路径，并对 JSON `player` 响应增加独立回退脚本；不宣称和 iPhone 完全相同。若 tvOS 出现其他独有接口、证书部署或播放恢复问题，应在 `scripts/tvos/` 增加独立脚本和测试，并保留真机证据。

## 更新原则

两个模块地址都保持不变，脚本地址带发布版本参数。更新模块会切换到新脚本 URL；远程脚本同时每 6 小时检查一次。任何改动必须先通过单元测试、两个模块的 Surge CLI 语法检查和八个分发文件的一致性检查，再更新 GitHub。

`tools/audit-upstream.sh` 另外锁定 Maasea 原生脚本提交，并对 uBlock Origin 与 AdGuard 的 YouTube 广告特征块执行签名和基线检查。普通单元测试使用本地样本，`AUDIT_UPSTREAM=1 ./tools/verify.sh` 才访问实时上游；发现变化必须先审查差异，不允许直接重置基线。
