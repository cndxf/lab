#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "$PACKAGE_ROOT/../.." && pwd -P)"
APP_ROOT="${SITESUCKER_APP_ROOT:-/Applications/SiteSucker.app}"
if [[ -d "$APP_ROOT" && ! -w "$APP_ROOT/Contents/Resources" && -d "$HOME/Applications/SiteSucker.app" ]]; then
  APP_ROOT="$HOME/Applications/SiteSucker.app"
fi
BACKUP_ROOT="$PROJECT_ROOT/backups/sitesucker"
if pgrep -f "$APP_ROOT/Contents/MacOS/SiteSucker$" >/dev/null 2>&1; then
  printf '错误：请先退出 SiteSucker\n' >&2
  exit 1
fi
backup=""
while IFS= read -r candidate; do
  if [[ ! -e "$candidate/Contents/Resources/zh-Hans.lproj" ]]; then
    backup="$candidate"
    break
  fi
done < <(find "$BACKUP_ROOT" -maxdepth 1 -type d -name '*-SiteSucker.app' -print | sort -r)
[[ -n "$backup" && -d "$backup" ]] || { printf '错误：没有 SiteSucker 原始备份\n' >&2; exit 1; }
rm -rf "$APP_ROOT"
ditto "$backup" "$APP_ROOT"
printf '已恢复 SiteSucker 原始备份：%s\n' "$backup"
