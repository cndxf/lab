# Apple TV 脚本边界

Apple TV 当前为实验性目标。`YouTube-iOS-tvOS-AdBlock.sgmodule` 复用移动端的 protobuf、initplayback 和 UMP 路径，并增加 `scripts/tvos/youtube-tvos-json.js` 处理 tvOS 可能返回的 JSON `player` 响应。该脚本清理已知广告调度字段和 `playerConfig.ssapConfig`，不修改视频流地址或其他播放器配置。

部署顺序：

1. 在 iPhone/iPad 的 Surge 中安装并仅启用 `YouTube iOS/tvOS 去广告`。
2. 确认 Surge CA 已生成且手机端完全信任，然后从 Surge iOS 的 tvOS 管理入口把当前配置与 CA 重新部署到目标 Apple TV。
3. Apple TV 上启动 Surge，确认当前配置已更新；随后彻底退出并重新打开 YouTube，让 `youtubei` 与 `googlevideo` 建立新的 TLS 连接。
4. 在 Surge 最近请求和脚本日志中分别确认普通 protobuf 路径与 `initplayback` 路径。仅看到配置已部署，不能视为广告处理已验证。

原生模块的 `[MITM]` 使用 `*.googlevideo.com`，所以整个该主机通配范围会由 Surge CA 建立 TLS 解密；脚本规则只执行在 `initplayback`。测试时需要同时观察广告处理和非 `initplayback` 视频分片是否仍能稳定加载。

完成以下真机回归前，不得标记为已验证：

- tvOS 能够安装并完全信任用于 MITM 的 CA。
- YouTube App 首页、搜索和账号登录正常。
- `youtubei.googleapis.com` 和 `*.googlevideo.com/initplayback` 均能进入预期脚本，且不存在重复模块。
- `www.youtube.com/youtubei/v1/player` 的 JSON 回退响应能进入 `youtube.tvos.json`，且非 JSON 响应保持不变。
- 普通视频、长视频、Shorts 的前贴片和中插行为正常。
- 广告处理结束后画面、声音、播放速度和进度能够恢复。
- 关闭模块后可以完整回滚，不影响正常播放。

如果 tvOS 的请求结构与 iOS 不同，应在本目录新增独立实现和测试，不要继续向移动端脚本堆叠平台特例。
