---
name: tokenark-sitesucker-zh
description: 从 SiteSucker 自带的 zh-Hant 资源生成 zh-Hans 简体中文包，应用并可回滚。
---

# SiteSucker 中文化

## 使用流程

1. 检查 Bundle ID `us.sitesucker.mac.sitesucker` 和版本 `6.2`。
2. 在本目录运行 `bash generate_sitesucker_locale.sh`；脚本使用 macOS ICU `Hant-Hans` 转换所有 `.strings`/HTML 文案并生成资源清单。
3. 退出 SiteSucker，运行 `bash apply_sitesucker.sh` 将生成的 `zh-Hans.lproj` 放入 App，并同步覆盖实际优先加载的 `en.lproj`，同时保留原始备份。资源生成阶段会把港台常用词规范为简体用词（例如“文件、窗口、队列、设置、帮助、账号、网络、数据、互联网、拖动、音频文件、视频文件”）。若系统 App 由 `root:wheel` 所有，脚本会先备份旧用户副本，再从系统应用复制新版到 `~/Applications/SiteSucker.app` 并进行 ad-hoc 签名，避免修改系统 App。
4. 使用应用绝对路径打开用户副本，逐项检查主菜单、视图、设置、队列、关于窗口和下载进度。确认“关于 SiteSucker”“隐藏其他/退出 SiteSucker”“显示队列/隐藏工具栏/自定义工具栏/进入全屏幕”等为简体中文；macOS 外部服务名称、URL、文件名、站点内容和 User-Agent 保留原文。

## 升级与回滚

SiteSucker 升级后重新生成资源；版本不匹配时停止。回滚执行 `bash restore_sitesucker.sh`，不会删除下载文件或用户设置。
