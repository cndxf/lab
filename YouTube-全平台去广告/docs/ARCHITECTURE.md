# 架构与排障边界

## 目录职责

| 目录 | 职责 | 当前状态 |
| --- | --- | --- |
| `scripts/web/` | YouTube 网页 HTML 注入和 JSON 响应清理 | Surge macOS 网页路径已回归 |
| `scripts/native/` | iPhone/iPad 原生 App protobuf 响应处理 | 已接入，仍需持续真机广告回归 |
| `scripts/tvos/` | Apple TV 差异、专用实现和真机证据 | 实验性，尚无独立脚本 |
| `clients/surge/` | Surge 模块和安装说明 | 首个可安装适配器 |
| `clients/stash/` | Stash 格式和运行时适配 | 未验证 |
| `clients/shadowrocket/` | Shadowrocket 格式和运行时适配 | 未验证 |
| `dist/youtube/` | GitHub Raw 使用的稳定 ASCII 分发路径 | 由构建脚本生成并校验 |

## 共用部分

共用的是域名边界、接口匹配、版本管理、更新策略、广告结构样本和验收标准。不同客户端的配置语法、脚本 API、证书入口和缓存策略不能假设相同，因此分别放在 `clients/` 下。

## 网页专用

`youtube-web-response.js` 只处理网页 JSON 列表广告，刻意避开 `player` 和 `get_watch` 的播放器广告状态。`youtube-web-page.js` 处理 DOM 广告、跳过按钮、播放器广告态、临时静音加速以及正片恢复。

排障时先确认：页面是否被注入、运行时版本是否存在、CSP nonce 是否继承、广告节点清理数、播放器是否恢复。网页故障不要直接修改原生 protobuf 脚本。

## 移动端专用

`youtube-native-response.js` 来自 Maasea/sgmodule 的 Apache-2.0 上游构建，用于原生客户端二进制响应。当前模块只接入响应脚本，不接入 `googlevideo.com/initplayback` 请求改写，以减少播放失败和第三方转发风险。

排障时先确认：`youtubei.googleapis.com` 是否完成 MITM、是否启用 `binary-body-mode=1`、App 是否重建连接、是否存在重复响应脚本。

## Apple TV 专用

Apple TV 目前只记录实验边界，不宣称和 iPhone 完全相同。若 tvOS 出现独有接口、证书部署或播放恢复问题，应在 `scripts/tvos/` 新建独立脚本和测试，并保留真机证据。

## 更新原则

模块地址保持不变，脚本地址带发布版本参数。更新模块会切换到新脚本 URL；远程脚本同时每 6 小时检查一次。任何改动必须先通过单元测试、模块结构检查和分发文件一致性检查，再更新 GitHub。
