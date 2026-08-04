#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "$PACKAGE_ROOT/../.." && pwd -P)"
APP_ROOT="${CLAUDE_APP_ROOT:-/Applications/Claude.app}"
BACKUP_ROOT="$PROJECT_ROOT/backups/claude"
EXPECTED_BUNDLE_ID="com.anthropic.claudefordesktop"
if pgrep -f '/Applications/Claude.app/Contents/MacOS/Claude($| )' >/dev/null 2>&1; then
  printf '错误：请先退出 Claude\n' >&2
  exit 1
fi
backup=""
while IFS= read -r candidate; do
  [[ -f "$candidate/Contents/Resources/app.asar" ]] || continue
  if ! strings "$candidate/Contents/Resources/app.asar" | rg -q 'tokenark-claude-zh-(remote|main)-v1'; then
    backup="$candidate"
    break
  fi
done < <(find "$BACKUP_ROOT" -maxdepth 1 -type d -name '*-Claude.app' -print | sort -r)
[[ -n "$backup" && -d "$backup" ]] || { printf '错误：没有无注入 Claude 备份\n' >&2; exit 1; }
ditto "$backup" "$APP_ROOT"
stamp="$(basename "$backup" -Claude.app)"
defaults_backup="$BACKUP_ROOT/${stamp}-AppleDefaults.plist"
if [[ -f "$defaults_backup" ]]; then defaults import "$EXPECTED_BUNDLE_ID" "$defaults_backup"; fi
config_path="$HOME/Library/Application Support/Claude/config.json"
if [[ -f "$PROJECT_ROOT/state/claude-locale.json" ]]; then
  previous_locale="$(node - "$PROJECT_ROOT/state/claude-locale.json" <<'NODE'
const fs = require('node:fs')
try {
  const value = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).previousLocale
  process.stdout.write(typeof value === 'string' ? value : 'en-US')
} catch {
  process.stdout.write('en-US')
}
NODE
)"
  node - "$config_path" "$previous_locale" <<'NODE'
const fs = require('node:fs')
const filePath = process.argv[2]
const locale = process.argv[3]
let config = {}
try {
  const value = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  if (value && typeof value === 'object' && !Array.isArray(value)) config = value
} catch {}
config.locale = locale
const tempPath = `${filePath}.tmp-${process.pid}`
fs.writeFileSync(tempPath, JSON.stringify(config, null, 2) + '\n', 'utf8')
fs.renameSync(tempPath, filePath)
NODE
fi
printf '已恢复 Claude 无注入备份：%s\n' "$backup"
