# GitHub Desktop 汉化包

版本门禁：Bundle ID `com.github.GitHubClient`，版本 `3.6.3`。

已验证版本见 `manifest.json`。安装：`bash install.sh`；恢复：`bash uninstall.sh`。

```bash
cd tokenark-zh/github-desktop
node --test tests/test_injector.mjs
bash tests/test_scripts.sh
bash ./patch.sh
bash ./unpatch.sh
# 扫描应用静态资源中的英文 UI 候选文本
node scripts/audit_untranslated.mjs
```

补丁会修改 Electron 资源并使原签名失效；原始备份位于实验室根目录的 `backups/`。
