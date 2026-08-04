#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=./scripts/lib.sh
source "$SCRIPT_DIR/scripts/lib.sh"

APP_ROOT="/Applications/GitHub Desktop.app"
while (($#)); do
  case "$1" in
    --app) APP_ROOT="${2:?--app 需要路径}"; shift 2 ;;
    --help|-h)
      printf '用法：%s [--app /Applications/GitHub Desktop.app]\n' "$0"
      exit 0
      ;;
    *) die "未知参数：$1" ;;
  esac
done

assert_supported_app "$APP_ROOT"
assert_app_not_running "$APP_ROOT"
restore_backup "$APP_ROOT"
rm -f "$APP_ROOT/Contents/Resources/app/tokenark-ghd-zh.js"
rm -f "$APP_ROOT/Contents/Resources/tokenark-ghd-zh-manifest.json"
info "已回滚到最近一次原始应用备份。"
