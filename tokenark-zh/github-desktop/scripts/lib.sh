#!/usr/bin/env bash
set -euo pipefail

LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# lib.sh lives in github-desktop/scripts; the lab root is three levels up.
PROJECT_ROOT="$(cd "$LIB_DIR/../../.." && pwd -P)"
BACKUP_ROOT="${BACKUP_ROOT:-$PROJECT_ROOT/backups}"
EXPECTED_BUNDLE_ID="com.github.GitHubClient"
EXPECTED_VERSION="${TOKENARK_GHD_EXPECTED_VERSION:-3.6.3}"

die() {
  printf '错误：%s\n' "$*" >&2
  return 1
}

info() {
  printf '信息：%s\n' "$*"
}

bundle_value() {
  local app_root="$1" key="$2"
  /usr/libexec/PlistBuddy -c "Print :${key}" "$app_root/Contents/Info.plist" 2>/dev/null
}

read_bundle_version() {
  bundle_value "$1" CFBundleShortVersionString
}

assert_supported_app() {
  local app_root="$1"
  [[ -d "$app_root" ]] || die "找不到应用：$app_root"
  [[ -f "$app_root/Contents/Info.plist" ]] || die "应用缺少 Info.plist：$app_root"
  local bundle_id version
  bundle_id="$(bundle_value "$app_root" CFBundleIdentifier)" || die "无法读取 Bundle ID"
  version="$(read_bundle_version "$app_root")" || die "无法读取应用版本"
  [[ "$bundle_id" == "$EXPECTED_BUNDLE_ID" ]] || die "Bundle ID 不匹配：$bundle_id"
  [[ "$version" == "$EXPECTED_VERSION" ]] || die "仅支持 GitHub Desktop $EXPECTED_VERSION，当前为 $version"
}

assert_app_not_running() {
  local app_root="$1"
  local app_name
  app_name="$(basename "$app_root" .app)"
  if pgrep -f "/Contents/MacOS/${app_name}$" >/dev/null 2>&1 || pgrep -x "$app_name" >/dev/null 2>&1; then
    die "请先退出 ${app_name}"
  fi
}

ensure_backup_root() {
  mkdir -p "$BACKUP_ROOT"
}

backup_app() {
  local app_root="$1"
  ensure_backup_root
  local stamp backup_path
  stamp="$(date +%Y%m%d-%H%M%S)"
  backup_path="$BACKUP_ROOT/${stamp}-GitHub Desktop.app"
  [[ ! -e "$backup_path" ]] || die "备份路径已存在：$backup_path"
  ditto "$app_root" "$backup_path"
  printf '%s\n' "$backup_path"
}

list_backups() {
  ensure_backup_root
  find "$BACKUP_ROOT" -maxdepth 1 -type d -name '*-GitHub Desktop.app' -print | sort -r
}

prune_backups() {
  local keep="${1:-3}" count=0 path
  while IFS= read -r path; do
    [[ -n "$path" ]] || continue
    count=$((count + 1))
    if (( count > keep )); then
      rm -rf "$path"
    fi
  done < <(list_backups)
}

latest_backup() {
  list_backups | head -n 1
}

restore_backup() {
  local app_root="$1" backup_path="${2:-$(latest_backup)}"
  [[ -n "$backup_path" && -d "$backup_path" ]] || die "没有可恢复的备份"
  local temp_path="${app_root}.rollback.$$.tmp"
  [[ ! -e "$temp_path" ]] || die "临时恢复路径已存在：$temp_path"
  if [[ -e "$app_root" ]]; then
    ditto "$app_root" "$temp_path"
  fi
  ditto "$backup_path" "$app_root"
  [[ ! -e "$temp_path" ]] || rm -rf "$temp_path"
  info "已恢复备份：$backup_path"
}

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}
