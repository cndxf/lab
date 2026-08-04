# Claude Desktop 汉化包

版本门禁：Bundle ID `com.anthropic.claudefordesktop`，版本 `1.24012.9`。

已验证版本见 `manifest.json`。安装：`bash install.sh`；恢复：`bash uninstall.sh`。

```bash
cd tokenark-zh/claude
node scripts/generate_claude_locale.mjs
bash apply_claude.sh
bash restore_claude.sh
# 对比英文源、中文包及已安装远端 locale，生成未翻译候选
node scripts/audit_locale.mjs
```

默认方案只写本地 locale，不修改 `app.asar`。`claude.ai` 远端工作区、套餐页和部分设置文案可能继续由服务端提供英文，不能把本地 473 个 key 的完整翻译扩大为远端全界面中文化。
