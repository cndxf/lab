# Apple TV / tvOS 回归记录

## 当前状态（2026-08-05）

- Apple TV 的 Surge 远程控制端口可达，设备运行环境报告为 `tvOS 27.0`、`AppleTV14,1`。
- 当前 tvOS 有效配置只包含网页 YouTube 规则：`www.youtube.com`、`m.youtube.com` 和 `youtubei.googleapis.com`。
- 当前有效配置没有 `youtube.native.response`、`youtube.native.request.init`、`youtube.native.response.init`、`youtube.tvos.json`，也没有 `*.googlevideo.com` MITM。
- 因此当前不能宣称 Apple TV 已部署原生去广告模块，也没有前贴片、中插或长视频恢复的真机证据。

## 部署门槛

1. 在 iPhone/iPad 的 Surge 中安装并启用 `YouTube iOS/tvOS 去广告`。
2. 确认 Surge CA 已安装并完全信任。
3. 通过 Surge 的 tvOS/Ponte 管理入口，把配置和 CA 重新部署到 Apple TV。
4. 在 Apple TV 上重启 Surge，再强制退出并重新打开 YouTube。
5. 从 Mac 运行有效配置检查：

```bash
SURGE_REMOTE='[REDACTED]@APPLE_TV_IP:6170' \
  ./tools/check-surge-native-effective.sh
```

检查必须通过四条原生脚本、当前 `releases/<VERSION>/scripts/` 路径和 `*.googlevideo.com` MITM。只看到设备在线、配置页面打开或能 ping 通，不算部署完成。

## 真机播放矩阵

部署检查通过后，逐项记录 Surge 最近请求、脚本日志和画面状态：

- YouTube 首页、搜索、账号状态正常。
- 普通视频前贴片：广告态被处理，正片画面、声音、进度恢复。
- 免费电影或长视频前贴片、中插：`googlevideo/initplayback` 命中原生 UMP 脚本，广告处理后继续播放。
- Shorts：播放、切换和下一条内容正常。
- 遥控器暂停、继续、拖动进度和退出后重新进入正常。
- 关闭模块后可正常回滚，不能留下黑屏、静音或异常倍速。

配置检查、脚本命中和播放恢复必须分别留证，不能用 iPhone 或 Mac 的结果代替 Apple TV 真机结果。
