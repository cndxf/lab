---
name: tokenark-claude-zh
description: 生成、应用和回滚 Claude Desktop 简体中文 locale，支持版本升级时重新生成。
---

# Claude Desktop 中文化

## 使用流程

1. 检查 Bundle ID `com.anthropic.claudefordesktop` 和版本 `1.24012.9`。
2. 在本目录运行 `node scripts/generate_claude_locale.mjs --fetch-missing` 生成 `zh-CN.json`；生成器优先使用最近的原始 Claude 备份、本目录冻结源 `en-US.source.json`，也可通过 `--source <原始英文 en-US.json>` 显式指定源文件。无网络时省略 `--fetch-missing`，并查看 `untranslated.json`。如果当前 App 的 `en-US.json` 已被中文包覆盖且没有可用英文源，生成器会明确失败；不要把中文资源当作源，升级后必须提供同版本原始英文资源。
3. 退出 Claude，运行 `bash apply_claude.sh`。默认写入 `Contents/Resources/zh-CN.json`，将同一中文资源映射到 `en-US.json`，不修改 `app.asar`。远端 key 覆盖仅作实验，需显式设置 `TOKENARK_CLAUDE_REMOTE_OVERLAY=1`；远端 DOM 注入实验需显式设置 `TOKENARK_CLAUDE_REMOTE_INJECT=1`，两者都不作为正式安装路径。
4. 启动 Claude，检查原生菜单、本地设置和帮助菜单已选用中文资源；主工作区和设置页中由 `claude.ai` 远端提供的英文需记录为远端缺口，不把本地 locale 完整扩大成全界面中文化；动态账号、URL、模型和路径不翻译。

## 升级与回滚

Claude 升级后重新运行生成器和应用脚本；版本不匹配时停止。回滚执行 `bash restore_claude.sh`，它恢复最近 App 备份并还原 AppleLanguages 偏好（若存在备份）。
