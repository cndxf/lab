#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
FETCH_FLAG="--fetch-missing"
OPEN_APPS=1
for arg in "$@"; do
  case "$arg" in
    --offline) FETCH_FLAG="" ;;
    --no-open) OPEN_APPS=0 ;;
    --help|-h) printf '用法：%s [--offline] [--no-open]\n' "$0"; exit 0 ;;
    *) printf '错误：未知参数 %s\n' "$arg" >&2; exit 2 ;;
  esac
done

quit_app() {
  local name="$1" executable="$2"
  if ! pgrep -f "$executable$" >/dev/null 2>&1; then return 0; fi
  osascript -e "tell application \"$name\" to quit" >/dev/null 2>&1 || true
  for _ in {1..15}; do
    pgrep -f "$executable$" >/dev/null 2>&1 || return 0
    sleep 1
  done
  printf '错误：%s 未能在 15 秒内退出\n' "$name" >&2
  return 1
}

SITE_APP_ROOT="${SITESUCKER_APP_ROOT:-/Applications/SiteSucker.app}"
if [[ -d "$HOME/Applications/SiteSucker.app" ]]; then SITE_APP_ROOT="$HOME/Applications/SiteSucker.app"; fi
export SITESUCKER_APP_ROOT="$SITE_APP_ROOT"

printf '== 生成 Claude 简体中文 locale ==\n'
if [[ -n "$FETCH_FLAG" ]]; then
  node "$PACKAGE_ROOT/claude/scripts/generate_claude_locale.mjs" "$FETCH_FLAG"
else
  node "$PACKAGE_ROOT/claude/scripts/generate_claude_locale.mjs"
fi
printf '\n== 生成 SiteSucker 简体中文资源 ==\n'
bash "$PACKAGE_ROOT/sitesucker/generate_sitesucker_locale.sh"

printf '\n== 退出三款应用 ==\n'
quit_app "GitHub Desktop" '/Applications/GitHub Desktop.app/Contents/MacOS/GitHub Desktop'
quit_app "Claude" '/Applications/Claude.app/Contents/MacOS/Claude'
quit_app "SiteSucker" "$SITE_APP_ROOT/Contents/MacOS/SiteSucker"

printf '\n== 应用 GitHub Desktop ==\n'
if [[ -f "/Applications/GitHub Desktop.app/Contents/Resources/tokenark-ghd-zh-manifest.json" ]]; then
  bash "$PACKAGE_ROOT/github-desktop/unpatch.sh"
fi
bash "$PACKAGE_ROOT/github-desktop/patch.sh"
printf '\n== 应用 Claude ==\n'
bash "$PACKAGE_ROOT/claude/apply_claude.sh"
printf '\n== 应用 SiteSucker ==\n'
bash "$PACKAGE_ROOT/sitesucker/apply_sitesucker.sh"

if (( OPEN_APPS )); then
  printf '\n== 启动三款应用 ==\n'
  open -a '/Applications/GitHub Desktop.app'
  open -a '/Applications/Claude.app'
  open -a "$SITE_APP_ROOT"
fi
printf '\n中文语言包套件处理完成。\n'
