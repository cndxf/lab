#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "$PACKAGE_ROOT/../.." && pwd -P)"
APP_ROOT="${SITESUCKER_APP_ROOT:-/Applications/SiteSucker.app}"
EXPECTED_BUNDLE_ID="us.sitesucker.mac.sitesucker"
EXPECTED_VERSION="${TOKENARK_SITESUCKER_EXPECTED_VERSION:-6.1.8}"
SOURCE_LPROJ="$APP_ROOT/Contents/Resources/zh-Hant.lproj"
OUTPUT_LPROJ="$PACKAGE_ROOT/zh-Hans.lproj"
CONVERTER="$PACKAGE_ROOT/scripts/hant_to_hans.swift"

die() { printf '错误：%s\n' "$*" >&2; exit 1; }
[[ -d "$APP_ROOT" ]] || die "找不到 SiteSucker：$APP_ROOT"
bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP_ROOT/Contents/Info.plist")
version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP_ROOT/Contents/Info.plist")
[[ "$bundle_id" == "$EXPECTED_BUNDLE_ID" ]] || die "Bundle ID 不匹配：$bundle_id"
[[ "$version" == "$EXPECTED_VERSION" ]] || die "仅支持 SiteSucker $EXPECTED_VERSION，当前为 $version"
[[ -d "$SOURCE_LPROJ" ]] || die "缺少原始 zh-Hant.lproj"
command -v swift >/dev/null || die "需要 macOS Swift（Xcode Command Line Tools）"

mkdir -p "$OUTPUT_LPROJ"
find "$OUTPUT_LPROJ" -type f -delete
count=0
while IFS= read -r -d '' source; do
  relative="${source#"$SOURCE_LPROJ/"}"
  target="$OUTPUT_LPROJ/$relative"
  mkdir -p "$(dirname "$target")"
  case "$source" in
    *.strings|*.html) swift "$CONVERTER" "$source" "$target" >/dev/null ;;
    *) ditto "$source" "$target" ;;
  esac
  count=$((count + 1))
done < <(find "$SOURCE_LPROJ" -type f -print0)

node - "$OUTPUT_LPROJ" "$PACKAGE_ROOT/manifest.json" "$version" "$count" <<'NODE'
const fs = require('node:fs')
const crypto = require('node:crypto')
const path = require('node:path')
const [root, output, version, count] = process.argv.slice(2)
const files = []
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(absolute)
    else files.push({ path: path.relative(root, absolute), sha256: crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex') })
  }
}
walk(root)
fs.writeFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(), appVersion: version, resourceCount: Number(count), files }, null, 2) + '\n')
console.log(JSON.stringify({ appVersion: version, resourceCount: files.length, output: root }))
NODE
