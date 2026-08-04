# Apple TV 脚本边界

Apple TV 当前为实验性目标。现阶段 Surge 模块会让 tvOS 候选路径复用 `scripts/native/youtube-native-response.js`，但仓库中没有把未经验证的复用代码复制成一个“Apple TV 专用脚本”。

完成以下真机回归前，不得标记为已验证：

- tvOS 能够安装并完全信任用于 MITM 的 CA。
- YouTube App 首页、搜索和账号登录正常。
- 普通视频、长视频、Shorts 的前贴片和中插行为正常。
- 广告处理结束后画面、声音、播放速度和进度能够恢复。
- 关闭模块后可以完整回滚，不影响正常播放。

如果 tvOS 的请求结构与 iOS 不同，应在本目录新增独立实现和测试，不要继续向移动端脚本堆叠平台特例。
