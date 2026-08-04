#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
OPEN_APPS=1
for arg in "$@"; do
  case "$arg" in
    --no-open) OPEN_APPS=0 ;;
    --help|-h) printf '用法：%s [--no-open]\n' "$0"; exit 0 ;;
    *) printf '错误：未知参数 %s\n' "$arg" >&2; exit 2 ;;
  esac
done

osascript -e 'tell application "GitHub Desktop" to quit' >/dev/null 2>&1 || true
osascript -e 'tell application "Claude" to quit' >/dev/null 2>&1 || true
osascript -e 'tell application "SiteSucker" to quit' >/dev/null 2>&1 || true
sleep 2
bash "$PACKAGE_ROOT/github-desktop/unpatch.sh"
bash "$PACKAGE_ROOT/claude/restore_claude.sh"
bash "$PACKAGE_ROOT/sitesucker/restore_sitesucker.sh"
if (( OPEN_APPS )); then
  open -a '/Applications/GitHub Desktop.app'
  open -a '/Applications/Claude.app'
  open -a '/Applications/SiteSucker.app'
fi
printf '三款应用已恢复到最近一次原始备份。\n'
