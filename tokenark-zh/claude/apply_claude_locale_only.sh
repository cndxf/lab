#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "$PACKAGE_ROOT/../.." && pwd -P)"
APP_ROOT="${CLAUDE_APP_ROOT:-/Applications/Claude.app}"
BACKUP_ROOT="${CLAUDE_BACKUP_ROOT:-$PROJECT_ROOT/backups/claude}"
PACKAGE="$PACKAGE_ROOT/zh-CN.json"
REMOTE_OVERLAY="$PACKAGE_ROOT/remote_locale_overlay.json"
REMOTE_OVERLAY_GENERATOR="$PACKAGE_ROOT/scripts/generate_remote_overlay.mjs"
REGISTER_FRONTEND="$PACKAGE_ROOT/scripts/register_claude_frontend_locale.mjs"
REMOTE_INJECTOR="$PACKAGE_ROOT/remote_zh_inject.js"
ASAR_PATH="$APP_ROOT/Contents/Resources/app.asar"
EXPECTED_BUNDLE_ID="com.anthropic.claudefordesktop"
EXPECTED_VERSION="${TOKENARK_CLAUDE_EXPECTED_VERSION:-1.24012.9}"

die() { printf '错误：%s\n' "$*" >&2; exit 1; }
[[ -d "$APP_ROOT" && -f "$APP_ROOT/Contents/Info.plist" ]] || die "找不到 Claude：$APP_ROOT"
bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP_ROOT/Contents/Info.plist")
version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP_ROOT/Contents/Info.plist")
[[ "$bundle_id" == "$EXPECTED_BUNDLE_ID" ]] || die "Bundle ID 不匹配：$bundle_id"
[[ "$version" == "$EXPECTED_VERSION" ]] || die "仅支持 Claude $EXPECTED_VERSION，当前为 $version"
[[ -f "$PACKAGE" ]] || die "请先生成 Claude locale"
[[ -f "$REMOTE_OVERLAY" ]] || die "找不到 Claude 远端 locale 覆盖表：$REMOTE_OVERLAY"
[[ -f "$REMOTE_OVERLAY_GENERATOR" ]] || die "找不到 Claude 远端 locale 覆盖生成器：$REMOTE_OVERLAY_GENERATOR"
[[ -f "$REGISTER_FRONTEND" ]] || die "找不到 Claude 前端语言注册脚本：$REGISTER_FRONTEND"
[[ -f "$REMOTE_INJECTOR" ]] || die "找不到 Claude 远端中文注入脚本：$REMOTE_INJECTOR"
[[ -f "$ASAR_PATH" ]] || die "找不到 Claude app.asar：$ASAR_PATH"
if pgrep -f "$APP_ROOT/Contents/MacOS/Claude(\$| )" >/dev/null 2>&1; then die "请先退出 Claude"; fi

patch_remote_preload() {
  local marker='/* tokenark-claude-zh-preload-v1 */'
  local asar_bin="${CLAUDE_ASAR_BIN:-$(command -v asar || true)}"
  local temp_root extracted staged_asar main_view
  temp_root="$(mktemp -d -t tokenark-claude-preload.XXXXXX)"
  trap 'rm -rf "$temp_root"' RETURN
  extracted="$temp_root/app"
  staged_asar="$temp_root/app.asar"
  if [[ -n "$asar_bin" ]]; then
    "$asar_bin" extract "$ASAR_PATH" "$extracted"
  else
    npx --yes @electron/asar extract "$ASAR_PATH" "$extracted"
  fi
  main_view="$extracted/.vite/build/mainView.js"
  [[ -f "$main_view" ]] || die "app.asar 中未找到 mainView preload"
  if rg -q --fixed-strings "$marker" "$main_view"; then
    printf '%s' "已存在"
    return 0
  fi
  node - "$main_view" "$REMOTE_INJECTOR" "$marker" <<'NODE'
const fs = require('node:fs')
const [mainPath, injectorPath, marker] = process.argv.slice(2)
const source = fs.readFileSync(mainPath, 'utf8')
const injector = fs.readFileSync(injectorPath, 'utf8')
if (source.includes(marker)) process.exit(0)
fs.writeFileSync(mainPath, `${source}\n\n${injector}\n${marker}\n`, 'utf8')
NODE
  if [[ -n "$asar_bin" ]]; then
    "$asar_bin" pack "$extracted" "$staged_asar"
  else
    npx --yes @electron/asar pack "$extracted" "$staged_asar"
  fi
  cp -p "$staged_asar" "$ASAR_PATH"
  local asar_hash
  asar_hash="$(node - "$ASAR_PATH" <<'NODE'
const fs = require('node:fs')
const crypto = require('node:crypto')
const buffer = fs.readFileSync(process.argv[2])
const headerSize = buffer.readUInt32LE(12)
process.stdout.write(crypto.createHash('sha256').update(buffer.subarray(16, 16 + headerSize)).digest('hex'))
NODE
)"
  if /usr/libexec/PlistBuddy -c 'Print :ElectronAsarIntegrity:Resources/app.asar:hash' "$APP_ROOT/Contents/Info.plist" >/dev/null 2>&1; then
    /usr/libexec/PlistBuddy -c "Set :ElectronAsarIntegrity:Resources/app.asar:hash $asar_hash" "$APP_ROOT/Contents/Info.plist"
  else
    /usr/libexec/PlistBuddy -c 'Add :ElectronAsarIntegrity dict' "$APP_ROOT/Contents/Info.plist" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c 'Add :ElectronAsarIntegrity:Resources dict' "$APP_ROOT/Contents/Info.plist" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c 'Add :ElectronAsarIntegrity:Resources:app.asar dict' "$APP_ROOT/Contents/Info.plist" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Add :ElectronAsarIntegrity:Resources:app.asar:hash string $asar_hash" "$APP_ROOT/Contents/Info.plist"
    /usr/libexec/PlistBuddy -c 'Add :ElectronAsarIntegrity:Resources:app.asar:algorithm string SHA256' "$APP_ROOT/Contents/Info.plist"
  fi
  printf '%s' "已写入（app.asar 哈希 ${asar_hash}）"
}

mkdir -p "$BACKUP_ROOT"
stamp="$(date +%Y%m%d-%H%M%S)"
backup="$BACKUP_ROOT/${stamp}-Claude.app"
ditto "$APP_ROOT" "$backup"
if defaults export "$EXPECTED_BUNDLE_ID" "$BACKUP_ROOT/${stamp}-AppleDefaults.plist" >/dev/null 2>&1; then :; else
  /usr/bin/touch "$BACKUP_ROOT/${stamp}-AppleDefaults.missing"
fi
remote_preload_status="未启用"
if [[ "${TOKENARK_CLAUDE_REMOTE_PRELOAD:-1}" == "1" ]]; then
  remote_preload_status="$(patch_remote_preload)"
fi
cp "$PACKAGE" "$APP_ROOT/Contents/Resources/zh-CN.json"
cp "$PACKAGE" "$APP_ROOT/Contents/Resources/en-US.json"
generated_overlay="$(mktemp -t tokenark-claude-overlay.XXXXXX.json)"
trap 'rm -f "$generated_overlay"' EXIT
remote_source="$APP_ROOT/Contents/Resources/ion-dist/i18n/en-US.json"
if [[ -f "$remote_source" ]]; then
  node "$REMOTE_OVERLAY_GENERATOR" "$remote_source" "$PACKAGE_ROOT/en-US.source.json" "$PACKAGE" "$REMOTE_OVERLAY" "$generated_overlay" >/dev/null
  REMOTE_OVERLAY="$generated_overlay"
fi
frontend_registration="$(node "$REGISTER_FRONTEND" "$APP_ROOT" "$REMOTE_OVERLAY" "$PACKAGE")"
config_path="$HOME/Library/Application Support/Claude/config.json"
mkdir -p "$(dirname "$config_path")" "$PROJECT_ROOT/state"
previous_locale="$(node - "$config_path" <<'NODE'
const fs = require('node:fs')
const filePath = process.argv[2]
try {
  const value = JSON.parse(fs.readFileSync(filePath, 'utf8')).locale
  process.stdout.write(typeof value === 'string' ? value : 'en-US')
} catch {
  process.stdout.write('en-US')
}
NODE
)"
node - "$PROJECT_ROOT/state/claude-locale.json" "$previous_locale" <<'NODE'
const fs = require('node:fs')
const filePath = process.argv[2]
const previousLocale = process.argv[3] || 'en-US'
fs.writeFileSync(filePath, JSON.stringify({ previousLocale, locale: 'zh-CN' }) + '\n', 'utf8')
NODE
node - "$config_path" <<'NODE'
const fs = require('node:fs')
const filePath = process.argv[2]
let config = {}
try {
  const value = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  if (value && typeof value === 'object' && !Array.isArray(value)) config = value
} catch {}
config.locale = 'zh-CN'
const tempPath = `${filePath}.tmp-${process.pid}`
fs.writeFileSync(tempPath, JSON.stringify(config, null, 2) + '\n', 'utf8')
fs.renameSync(tempPath, filePath)
NODE
remote_overlay_count=0
if [[ "${TOKENARK_CLAUDE_REMOTE_OVERLAY:-0}" == "1" ]]; then
for remote_locale in \
  "$APP_ROOT/Contents/Resources/ion-dist/i18n/en-US.json" \
  "$APP_ROOT/Contents/Resources/ion-dist/i18n/dynamic/en-US.json"; do
  [[ -f "$remote_locale" ]] || continue
  remote_overlay_changed="$(node - "$remote_locale" "$REMOTE_OVERLAY" <<'NODE'
const fs = require('node:fs')
const [localePath, overlayPath] = process.argv.slice(2)
const locale = JSON.parse(fs.readFileSync(localePath, 'utf8'))
const overlay = JSON.parse(fs.readFileSync(overlayPath, 'utf8'))
let matched = 0
for (const [key, value] of Object.entries(overlay)) {
  if (!Object.prototype.hasOwnProperty.call(locale, key)) continue
  matched += 1
  if (locale[key] === value) continue
  locale[key] = value
}
const tempPath = `${localePath}.tmp-${process.pid}`
fs.writeFileSync(tempPath, JSON.stringify(locale, null, 2) + '\n', 'utf8')
fs.renameSync(tempPath, localePath)
process.stdout.write(String(matched))
NODE
)"
  remote_overlay_count=$((remote_overlay_count + remote_overlay_changed))
done
fi
defaults write "$EXPECTED_BUNDLE_ID" AppleLanguages -array zh-CN zh-Hans en-US
# The vendor signature seals the locale resources. Re-sign the modified app
# locally so macOS can launch the installed language-pack build.
codesign --force --deep --sign - "$APP_ROOT" >/dev/null 2>&1 || die "Claude 用户副本 ad-hoc 签名失败"
while IFS= read -r old; do rm -rf "$old"; done < <(find "$BACKUP_ROOT" -maxdepth 1 -type d -name '*-Claude.app' -print | sort -r | tail -n +4)
signature="通过"
if ! codesign --verify --deep --strict "$APP_ROOT" >/dev/null 2>&1; then signature="修改后签名验证失败"; fi
printf '%s\n' "Claude 中文语言包已应用：$APP_ROOT" "备份：$backup" "远端页面预加载注入：$remote_preload_status" "语言列表注册：$frontend_registration" "用户配置：$config_path locale=zh-CN" "远端 i18n 定点覆盖（实验）：$remote_overlay_count 个 key" "兼容资源：en-US.json 已映射为中文" "签名：$signature"
