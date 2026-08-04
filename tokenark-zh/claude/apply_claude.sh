#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "$PACKAGE_ROOT/../.." && pwd -P)"
APP_ROOT="${CLAUDE_APP_ROOT:-/Applications/Claude.app}"
BACKUP_ROOT="${CLAUDE_BACKUP_ROOT:-$PROJECT_ROOT/backups/claude}"
PACKAGE="$PACKAGE_ROOT/zh-CN.json"
REMOTE_INJECTOR="$PACKAGE_ROOT/remote_zh_inject.js"
ASAR_PATH="$APP_ROOT/Contents/Resources/app.asar"
EXPECTED_BUNDLE_ID="com.anthropic.claudefordesktop"
EXPECTED_VERSION="${TOKENARK_CLAUDE_EXPECTED_VERSION:-1.24012.9}"

die() { printf '错误：%s\n' "$*" >&2; exit 1; }
[[ -d "$APP_ROOT" && -f "$APP_ROOT/Contents/Info.plist" ]] || die "找不到 Claude：$APP_ROOT"
[[ -f "$ASAR_PATH" ]] || die "找不到 Claude app.asar：$ASAR_PATH"
[[ -f "$REMOTE_INJECTOR" ]] || die "找不到远端页面注入脚本：$REMOTE_INJECTOR"
bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP_ROOT/Contents/Info.plist")
version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP_ROOT/Contents/Info.plist")
[[ "$bundle_id" == "$EXPECTED_BUNDLE_ID" ]] || die "Bundle ID 不匹配：$bundle_id"
[[ "$version" == "$EXPECTED_VERSION" ]] || die "仅支持 Claude $EXPECTED_VERSION，当前为 $version"
[[ -f "$PACKAGE" ]] || die "请先运行 generate_claude_locale.mjs"
if pgrep -f "$APP_ROOT/Contents/MacOS/Claude(\$| )" >/dev/null 2>&1; then die "请先退出 Claude"; fi

# The remote DOM injector is experimental and disabled by default. Keep the
# normal installer on the stable locale-only path unless explicitly opted in.
if [[ "${TOKENARK_CLAUDE_REMOTE_INJECT:-0}" != "1" ]]; then
  exec "$PACKAGE_ROOT/apply_claude_locale_only.sh"
fi

ASAR_BIN="${CLAUDE_ASAR_BIN:-$(command -v asar || true)}"
asar_run() {
  if [[ -n "$ASAR_BIN" ]]; then
    "$ASAR_BIN" "$@"
  else
    npx --yes @electron/asar "$@"
  fi
}

mkdir -p "$BACKUP_ROOT"
stamp="$(date +%Y%m%d-%H%M%S)"
backup="$BACKUP_ROOT/${stamp}-Claude.app"
ditto "$APP_ROOT" "$backup"
asar_backup="$BACKUP_ROOT/${stamp}-app.asar"
cp -p "$ASAR_PATH" "$asar_backup"
if defaults export "$EXPECTED_BUNDLE_ID" "$BACKUP_ROOT/${stamp}-AppleDefaults.plist" >/dev/null 2>&1; then :; else
  /usr/bin/touch "$BACKUP_ROOT/${stamp}-AppleDefaults.missing"
fi

temp_root="$(mktemp -d)"
trap 'rm -rf "$temp_root"' EXIT
extracted="$temp_root/app"
staged_asar="$temp_root/app.asar"
verified="$temp_root/verified"
asar_run extract "$ASAR_PATH" "$extracted"
main_bundle="$(rg -l --glob '*.js' --fixed-strings 'main_view_dom_ready' "$extracted/.vite/build" | sed -n '1,2p')"
[[ -n "$main_bundle" ]] || die "app.asar 中未找到 main-process main_view_dom_ready 锚点"
[[ "$(printf '%s\n' "$main_bundle" | wc -l | tr -d ' ')" == "1" ]] || die "app.asar 中 main_view_dom_ready 锚点不唯一：$main_bundle"
node - "$main_bundle" "$REMOTE_INJECTOR" <<'NODE'
const fs = require('node:fs')
const [mainPath, injectorPath] = process.argv.slice(2)
const marker = '/* tokenark-claude-zh-main-v1 */'
const source = fs.readFileSync(mainPath, 'utf8')
if (source.includes(marker)) throw new Error('main process 已存在远端中文注入标记，请先回滚')
const injector = fs.readFileSync(injectorPath, 'utf8')
const pattern = /(?<web>[A-Za-z_$][A-Za-z0-9_$]*\.webContents)\.on\("dom-ready",\(\)=>\{(?<body>[^{}]*main_view_dom_ready[^{}]*)\}\)/g
const matches = [...source.matchAll(pattern)]
if (matches.length !== 1) throw new Error(`main-process dom-ready 锚点数量异常：${matches.length}`)
const match = matches[0]
const web = match.groups.web
const body = match.groups.body
const replacement = `${web}.on("dom-ready",()=>{${body};${web}.executeJavaScript(${JSON.stringify(injector)}).catch(()=>{})})${marker}`
fs.writeFileSync(mainPath, source.slice(0, match.index) + replacement + source.slice(match.index + match[0].length), 'utf8')
NODE
asar_run pack "$extracted" "$staged_asar"
asar_run extract "$staged_asar" "$verified"
node - "$main_bundle" "$verified" <<'NODE'
const fs = require('node:fs')
const [mainPath, verifiedRoot] = process.argv.slice(2)
const marker = '/* tokenark-claude-zh-main-v1 */'
const relative = mainPath.split('/.vite/build/').pop()
const source = fs.readFileSync(`${verifiedRoot}/.vite/build/${relative}`, 'utf8')
if (!source.includes(marker)) throw new Error('打包后的 main process 缺少远端中文注入标记')
NODE
cp -p "$staged_asar" "$ASAR_PATH"
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
  /usr/libexec/PlistBuddy -c "Add :ElectronAsarIntegrity dict" "$APP_ROOT/Contents/Info.plist" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :ElectronAsarIntegrity:Resources dict" "$APP_ROOT/Contents/Info.plist" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :ElectronAsarIntegrity:Resources:app.asar dict" "$APP_ROOT/Contents/Info.plist" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :ElectronAsarIntegrity:Resources:app.asar:hash string $asar_hash" "$APP_ROOT/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c "Add :ElectronAsarIntegrity:Resources:app.asar:algorithm string SHA256" "$APP_ROOT/Contents/Info.plist"
fi
cp "$PACKAGE" "$APP_ROOT/Contents/Resources/zh-CN.json"
# Claude's remote shell currently requests en-US after startup. Keep the
# packaged English locale mapped to the same Chinese strings so the UI does
# not fall back to English after the renderer initializes.
cp "$PACKAGE" "$APP_ROOT/Contents/Resources/en-US.json"
defaults write "$EXPECTED_BUNDLE_ID" AppleLanguages -array zh-CN zh-Hans en-US

# Updating ElectronAsarIntegrity changes the bundle metadata; re-sign the
# modified app ad hoc so LaunchServices accepts the patched bundle.
codesign --force --deep --sign - "$APP_ROOT" >/dev/null 2>&1 || die "Claude 用户副本 ad-hoc 签名失败"

while IFS= read -r old; do rm -rf "$old"; done < <(find "$BACKUP_ROOT" -maxdepth 1 -type d -name '*-Claude.app' -print | sort -r | tail -n +4)
while IFS= read -r old; do rm -f "$old"; done < <(find "$BACKUP_ROOT" -maxdepth 1 -type f -name '*-app.asar' -print | sort -r | tail -n +4)
signature="通过"
if ! codesign --verify --deep --strict "$APP_ROOT" >/dev/null 2>&1; then signature="修改后签名验证失败"; fi
printf '%s\n' "Claude 中文语言包已应用：$APP_ROOT" "备份：$backup" "app.asar 备份：$asar_backup" "app.asar SHA-256：$asar_hash" "远端页面注入：main-process dom-ready executeJavaScript" "locale：$PACKAGE" "兼容资源：en-US.json 已映射为中文" "签名：$signature"
