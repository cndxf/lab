#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
source "$ROOT/scripts/lib.sh"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

make_fake_app() {
  local path="$1" version="$2"
  mkdir -p "$path/Contents"
  /usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string com.github.GitHubClient" "$path/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c "Add :CFBundleShortVersionString string $version" "$path/Contents/Info.plist"
}

APP="$TMP_ROOT/GitHub Desktop.app"
make_fake_app "$APP" 3.6.3
BACKUP_ROOT="$TMP_ROOT/backups"

[[ "$(read_bundle_version "$APP")" == "3.6.3" ]]
assert_supported_app "$APP"

WRONG="$TMP_ROOT/Wrong.app"
make_fake_app "$WRONG" 3.6.2
if (assert_supported_app "$WRONG") 2>/dev/null; then
  printf 'expected wrong version to fail\n' >&2
  exit 1
fi

BACKUP="$(backup_app "$APP")"
[[ -d "$BACKUP" ]]
[[ -f "$BACKUP/Contents/Info.plist" ]]

for stamp in 20240101-000000 20240102-000000 20240103-000000 20240104-000000; do
  mkdir -p "$BACKUP_ROOT/${stamp}-GitHub Desktop.app/Contents"
done
prune_backups 3
[[ "$(list_backups | wc -l | tr -d ' ')" == "3" ]]

PATCH_APP="$TMP_ROOT/Patch Fixture.app"
mkdir -p "$PATCH_APP/Contents/Resources/app"
printf '%s\n' '<script defer="defer" src="renderer.js"></script>' > "$PATCH_APP/Contents/Resources/app/index.html"
printf '%s' 'const a=[{label:"File"},{label:"Edit"},{label:"View"},{label:"Repository"},{label:"Branch"},{label:"About GitHub Desktop"},{label:"Settings…"},{label:"Install Command Line Tool…"},{label:"New Repository…"},{label:"Add Local Repository…"},{label:"Clone Repository…"}];const b=[{role:"services",submenu:[]},{role:"hide"},{role:"hideOthers"},{role:"unhide"},{role:"quit"}];function at(){return(e&&e.submenu?e.submenu.items:[]).filter(e=>!st(e.role,"pasteandmatchstyle"))}const d=o?"Remove…":"Remove";const f=s?"View Pull Request on GitHub":"Create Pull Request";const g=label:(h?"Hide":"Show")+" Changes Filter";const j=e?t?"Force Push…":"Force Push":"Push";const k=label:`Open in ${t??"Shell"}`;const l=label:`Open in ${e??"External Editor"}`;const m=label:u?"Stash All Changes…":"Stash All Changes";const n=label:`Update from ${a}`;function Re(e){return r.Menu.buildFromTemplate(p}(e))}function Me(e){}' > "$PATCH_APP/Contents/Resources/app/main.js"
printf '%s' 'Create a Tutorial Repository… Clone a Repository from the Internet… Create a New Repository on your Local Drive… Add an Existing Repository from your Local Drive… Filter your repositories Prefer absolute dates over relative About GitHub Desktop r=`Version ${t}` className:"version"},"Version ",t n=ke.createElement("p",null,"You have the latest version (last checked" onShowTermsAndConditions},"Terms and Conditions" onShowAcknowledgements},"License and Open Source Notices"' > "$PATCH_APP/Contents/Resources/app/renderer.js"
node "$ROOT/scripts/apply_patch.mjs" \
  --app-root "$PATCH_APP" \
  --injector "$ROOT/inject.js" \
  --translations "$ROOT/translations.json" >/dev/null
PATCHED_MAIN="$(<"$PATCH_APP/Contents/Resources/app/main.js")"
[[ "$PATCHED_MAIN" == *'在 GitHub 上查看 Pull Request'* ]]
[[ "$PATCHED_MAIN" == *'new r.MenuItem({label:t,role:e.role'* ]]
[[ "$PATCHED_MAIN" == *'隐藏 GitHub Desktop'* ]]
[[ "$PATCHED_MAIN" == *'e.role||""'* ]]
PATCHED_RENDERER="$(cat "$PATCH_APP/Contents/Resources/app/renderer.js")"
[[ "$PATCHED_RENDERER" == *'关于 GitHub Desktop'* ]]
[[ "$PATCHED_RENDERER" == *'r=`版本 ${t}`'* ]]
[[ "$PATCHED_RENDERER" == *'className:"version"},"版本 ",t'* ]]
[[ "$PATCHED_RENDERER" == *'n=ke.createElement("p",null,"你已使用最新版本（上次检查时间"'* ]]
[[ "$PATCHED_RENDERER" == *'onShowTermsAndConditions},"条款与条件"'* ]]
grep -Fq 'services:"服务",hide:"隐藏 GitHub Desktop"' <<< "$PATCHED_MAIN"

FAIL_APP="$TMP_ROOT/Failed Fixture.app"
mkdir -p "$FAIL_APP/Contents/Resources/app"
printf '%s\n' '<script defer="defer" src="renderer.js"></script>' > "$FAIL_APP/Contents/Resources/app/index.html"
printf '%s' 'const a=[{label:"File"}]' > "$FAIL_APP/Contents/Resources/app/main.js"
printf '%s' 'Create a Tutorial Repository…' > "$FAIL_APP/Contents/Resources/app/renderer.js"
if node "$ROOT/scripts/apply_patch.mjs" \
  --app-root "$FAIL_APP" \
  --injector "$ROOT/inject.js" \
  --translations "$ROOT/translations.json" >/dev/null 2>&1; then
  printf 'expected missing anchor fixture to fail\n' >&2
  exit 1
fi
[[ ! -e "$FAIL_APP/Contents/Resources/app/tokenark-ghd-zh.js" ]]
[[ ! -e "$FAIL_APP/Contents/Resources/tokenark-ghd-zh-manifest.json" ]]
[[ "$(<"$FAIL_APP/Contents/Resources/app/index.html")" == '<script defer="defer" src="renderer.js"></script>' ]]

printf 'PASS: script helper tests\n'
