#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "$PACKAGE_ROOT/../.." && pwd -P)"
APP_ROOT="${SITESUCKER_APP_ROOT:-/Applications/SiteSucker.app}"
SOURCE_APP_ROOT="$APP_ROOT"
USER_APP_ROOT="$HOME/Applications/SiteSucker.app"
BACKUP_ROOT="$PROJECT_ROOT/backups/sitesucker"
EXPECTED_BUNDLE_ID="us.sitesucker.mac.sitesucker"
EXPECTED_VERSION="${TOKENARK_SITESUCKER_EXPECTED_VERSION:-6.2}"
PACKAGE="$PACKAGE_ROOT/zh-Hans.lproj"

die() { printf '错误：%s\n' "$*" >&2; exit 1; }
bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$SOURCE_APP_ROOT/Contents/Info.plist")
version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$SOURCE_APP_ROOT/Contents/Info.plist")
[[ "$bundle_id" == "$EXPECTED_BUNDLE_ID" ]] || die "Bundle ID 不匹配：$bundle_id"
[[ "$version" == "$EXPECTED_VERSION" ]] || die "仅支持 SiteSucker $EXPECTED_VERSION，当前为 $version"
[[ -d "$PACKAGE" ]] || die "请先运行 generate_sitesucker_locale.sh"
if pgrep -f 'SiteSucker.app/Contents/MacOS/SiteSucker$' >/dev/null 2>&1; then die "请先退出 SiteSucker"; fi

mkdir -p "$BACKUP_ROOT"
stamp="$(date +%Y%m%d-%H%M%S)"
backup="$BACKUP_ROOT/${stamp}-SiteSucker.app"
if [[ -w "$SOURCE_APP_ROOT/Contents/Resources" ]]; then
  APP_ROOT="$SOURCE_APP_ROOT"
  ditto "$APP_ROOT" "$backup"
else
  APP_ROOT="$USER_APP_ROOT"
  if [[ -d "$APP_ROOT" ]]; then
    ditto "$APP_ROOT" "$backup"
    rm -rf "$APP_ROOT"
  else
    ditto "$SOURCE_APP_ROOT" "$backup"
  fi
  mkdir -p "$(dirname "$APP_ROOT")"
  ditto "$SOURCE_APP_ROOT" "$APP_ROOT"
fi
ditto "$PACKAGE" "$APP_ROOT/Contents/Resources/zh-Hans.lproj"
# The current build resolves the English bundle first on this machine. Keep
# the active resource set Chinese even when Cocoa does not select zh-Hans.
[[ -d "$APP_ROOT/Contents/Resources/en.lproj" ]] || mkdir -p "$APP_ROOT/Contents/Resources/en.lproj"
ditto "$PACKAGE" "$APP_ROOT/Contents/Resources/en.lproj"
[[ -d "$APP_ROOT/Contents/Resources/Base.lproj" ]] || mkdir -p "$APP_ROOT/Contents/Resources/Base.lproj"
ditto "$PACKAGE" "$APP_ROOT/Contents/Resources/Base.lproj"

if ! /usr/libexec/PlistBuddy -c 'Print :CFBundleLocalizations' "$APP_ROOT/Contents/Info.plist" >/dev/null 2>&1; then
  /usr/libexec/PlistBuddy -c 'Add :CFBundleLocalizations array' "$APP_ROOT/Contents/Info.plist"
fi
if ! /usr/libexec/PlistBuddy -c 'Print :CFBundleLocalizations:0' "$APP_ROOT/Contents/Info.plist" 2>/dev/null | rg -qx 'zh-Hans'; then
  /usr/libexec/PlistBuddy -c 'Add :CFBundleLocalizations:0 string zh-Hans' "$APP_ROOT/Contents/Info.plist" || true
fi

while IFS= read -r old; do rm -rf "$old"; done < <(find "$BACKUP_ROOT" -maxdepth 1 -type d -name '*-SiteSucker.app' -print | sort -r | tail -n +4)
signature="通过"
if [[ "$APP_ROOT" == "$HOME/Applications/SiteSucker.app" ]]; then
  if codesign --force --deep --sign - "$APP_ROOT" >/dev/null 2>&1 && codesign --verify --deep --strict "$APP_ROOT" >/dev/null 2>&1; then
    signature="用户副本已使用 ad-hoc 签名"
  else
    signature="用户副本签名失败"
  fi
elif ! codesign --verify --deep --strict "$APP_ROOT" >/dev/null 2>&1; then
  signature="修改后签名验证失败（预期）"
fi
printf '%s\n' "中文语言包已应用：$APP_ROOT" "备份：$backup" "资源：$PACKAGE" "兼容资源：en.lproj/Base.lproj 已映射为简体中文" "签名：$signature"
