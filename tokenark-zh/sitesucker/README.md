# SiteSucker 汉化包

版本门禁：Bundle ID `us.sitesucker.mac.sitesucker`，版本 `6.2`。

已验证版本见 `manifest.json`。安装：`bash install.sh`；恢复：`bash uninstall.sh`。

```bash
cd tokenark-zh/sitesucker
bash generate_sitesucker_locale.sh
bash apply_sitesucker.sh
bash restore_sitesucker.sh
# 扫描繁体残留并生成报告
bash scripts/audit_locale.sh
```

如果系统应用由 `root:wheel` 所有，脚本会先备份旧用户副本，再从系统应用复制新版到 `~/Applications/SiteSucker.app` 并进行 ad-hoc 签名。下载 URL、文件名、User-Agent 和站点内容按边界保留原文。
