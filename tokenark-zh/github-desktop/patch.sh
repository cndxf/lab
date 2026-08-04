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

if [[ -f "$APP_ROOT/Contents/Resources/tokenark-ghd-zh-manifest.json" ]]; then
  die "检测到已应用中文补丁，请先运行 ./unpatch.sh"
fi

BACKUP_PATH="$(backup_app "$APP_ROOT")"
TEMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEMP_ROOT"' EXIT
TEMP_APP="$TEMP_ROOT/GitHub Desktop.app"
ditto "$APP_ROOT" "$TEMP_APP"

node "$SCRIPT_DIR/scripts/apply_patch.mjs" \
  --app-root "$TEMP_APP" \
  --injector "$SCRIPT_DIR/inject.js" \
  --translations "$SCRIPT_DIR/translations.json"

ditto "$TEMP_APP" "$APP_ROOT"
prune_backups 3

SIGNATURE_STATUS="通过"
if ! codesign --verify --deep --strict "$APP_ROOT" >/dev/null 2>&1; then
  SIGNATURE_STATUS="修改后签名验证失败（预期：应用资源已被修改）"
fi

mkdir -p "$PROJECT_ROOT/state"
node - "$APP_ROOT" "$BACKUP_PATH" "$SIGNATURE_STATUS" "$PROJECT_ROOT/state/last-apply.json" <<'NODE'
const fs = require('node:fs')
const crypto = require('node:crypto')
const path = require('node:path')
const [appRoot, backupPath, signatureStatus, outputPath] = process.argv.slice(2)
const files = [
  'Contents/Resources/app/index.html',
  'Contents/Resources/app/main.js',
  'Contents/Resources/app/renderer.js',
  'Contents/Resources/app/tokenark-ghd-zh.js',
  'Contents/Resources/tokenark-ghd-zh-manifest.json',
]
const hashes = Object.fromEntries(files.map((relative) => {
  const data = fs.readFileSync(path.join(appRoot, relative))
  return [relative, crypto.createHash('sha256').update(data).digest('hex')]
}))
const output = {
  appliedAt: new Date().toISOString(),
  appRoot,
  backupPath,
  signatureStatus,
  hashes,
}
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n')
NODE

info "中文补丁已应用。备份：$BACKUP_PATH"
info "代码签名状态：$SIGNATURE_STATUS"
