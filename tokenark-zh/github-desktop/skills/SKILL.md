---
name: tokenark-github-desktop-zh
description: 生成、应用和回滚 GitHub Desktop 3.6.3 简体中文补丁，并按可点击菜单逐项验收。
---

# GitHub Desktop 中文化

## 使用流程

1. 阅读项目 README、验收报告和当前 GitHub Desktop 版本。
2. 在本目录运行 `./unpatch.sh` 恢复最新原始备份，再运行 `./patch.sh` 生成新备份并注入词典。
3. 用 Computer Use 打开顶层菜单、设置入口和弹窗，记录固定英文；仓库名、账号、路径、URL、代码和品牌名保留原文。
4. 运行 `node --test tests/test_injector.mjs`、`bash tests/test_scripts.sh`，再打开 App 验证 `--lang=zh-CN`。

## 升级

升级 GitHub Desktop 后先在本目录执行 `./unpatch.sh`，确认版本仍为 `3.6.3`，再执行 `./patch.sh`。未知版本必须停止，不能盲改 Electron 资源。

## 回滚

退出应用后执行 `./unpatch.sh`。补丁会使 Electron 代码签名失效，原始备份是唯一恢复依据。
