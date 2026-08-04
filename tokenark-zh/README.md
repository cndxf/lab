# 三款 macOS 应用简体中文包

本目录包含三个可以独立运行的汉化包：

- `github-desktop/`：GitHub Desktop 3.6.3 的 Electron 菜单和动态界面翻译。
- `claude/`：Claude Desktop 1.24012.9 的本地 locale 翻译。
- `sitesucker/`：SiteSucker 6.1.8 的 `zh-Hans` 资源和大陆词汇规范化。

每个软件目录都有自己的 `skills/SKILL.md`、脚本、资源和测试。统一入口：

```bash
cd tokenark-zh
bash install-all-zh.sh --offline
bash uninstall-all-zh.sh
```

单独使用时进入对应软件目录，按其中的 `skills/SKILL.md` 和 README 操作。备份、状态和验收报告统一保存在上一级实验室目录，不随软件包混放。

每个软件都提供独立审计入口：GitHub Desktop 使用 `scripts/audit_untranslated.mjs`，Claude 使用 `scripts/audit_locale.mjs`，SiteSucker 使用 `scripts/audit_locale.sh`；报告写入实验室根目录 `reports/`，只列出候选文本，不翻译仓库名、账号、路径、URL 或模型标识。

每个目录的 `manifest.json` 标记已验证版本，并提供独立入口：

```bash
bash github-desktop/install.sh
bash github-desktop/uninstall.sh
bash claude/install.sh
bash claude/uninstall.sh
bash sitesucker/install.sh
bash sitesucker/uninstall.sh
```

安装脚本会读取本机 Bundle ID 和版本号；版本未登记时直接停止，不会把旧版本补丁套到新版本。
