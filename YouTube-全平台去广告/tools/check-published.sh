#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)
REPO_ROOT=$(CDPATH= cd -- "$PROJECT_ROOT/.." && pwd -P)
DIST_ROOT="$REPO_ROOT/dist/youtube"
BASE_URL=${YOUTUBE_DIST_BASE_URL:-https://raw.githubusercontent.com/cndxf/lab/main/dist/youtube}
PAGES_BASE_URL=${YOUTUBE_PAGES_BASE_URL:-https://cndxf.github.io/lab}
ALLOW_LOCAL=${ALLOW_LOCAL:-0}

for checked_base_url in "$BASE_URL" "$PAGES_BASE_URL"; do
  case "$checked_base_url" in
  http://127.0.0.1:*|http://localhost:*|http://[::1]:*)
    if [ "$ALLOW_LOCAL" -ne 1 ]; then
      printf 'Refusing local published URL without ALLOW_LOCAL=1: %s\n' "$checked_base_url" >&2
      exit 2
    fi
    ;;
  esac
done

version=$(tr -d '\r\n' < "$PROJECT_ROOT/VERSION")
temporary_root=$(mktemp -d "${TMPDIR:-/tmp}/youtube-adblock-published.XXXXXX")
trap 'rm -rf "$temporary_root"' EXIT HUP INT TERM

download_file() {
  relative_path=$1
  target_path="$temporary_root/$relative_path"
  mkdir -p "$(dirname "$target_path")"
  curl -fsSL --retry 2 --connect-timeout 10 --max-time 30 \
    "$BASE_URL/$relative_path" \
    -o "$target_path"
}

managed_files="VERSION
YouTube-AdBlock.sgmodule
YouTube-iOS-tvOS-AdBlock.sgmodule
releases/$version/scripts/youtube-web-page.js
releases/$version/scripts/youtube-web-response.js
releases/$version/scripts/youtube-native-response.js
releases/$version/scripts/youtube-native-request.js
releases/$version/scripts/youtube-native-ump.js
releases/$version/scripts/youtube-tvos-json.js"

printf '%s\n' "$managed_files" | while IFS= read -r relative_path; do
  download_file "$relative_path"
  if ! cmp -s "$DIST_ROOT/$relative_path" "$temporary_root/$relative_path"; then
    printf 'Published distribution is stale or different: %s\n' "$relative_path" >&2
    exit 1
  fi
done

download_file SHA256SUMS
if ! cmp -s "$DIST_ROOT/SHA256SUMS" "$temporary_root/SHA256SUMS"; then
  printf 'Published checksum file is stale or different.\n' >&2
  exit 1
fi

remote_version=$(tr -d '\r\n' < "$temporary_root/VERSION")
[ "$remote_version" = "$version" ] || {
  printf 'Published VERSION=%s, local VERSION=%s.\n' "$remote_version" "$version" >&2
  exit 1
}

page_script="$temporary_root/releases/$version/scripts/youtube-web-page.js"
grep -Fq "const VERSION=\"$version\"" "$page_script" || {
  printf 'Published web runtime does not contain VERSION=%s.\n' "$version" >&2
  exit 1
}

module="$temporary_root/YouTube-AdBlock.sgmodule"
for script_name in youtube-native-response.js youtube-web-response.js youtube-web-page.js; do
  grep -Fq "script-path=https://raw.githubusercontent.com/cndxf/lab/main/dist/youtube/releases/$version/scripts/$script_name?v=$version" "$module" || {
    printf 'Published module does not point %s at version %s.\n' "$script_name" "$version" >&2
    exit 1
  }
done

native_module="$temporary_root/YouTube-iOS-tvOS-AdBlock.sgmodule"
for script_name in youtube-native-response.js youtube-native-request.js youtube-native-ump.js youtube-tvos-json.js; do
  grep -Fq "script-path=https://raw.githubusercontent.com/cndxf/lab/main/dist/youtube/releases/$version/scripts/$script_name?v=$version" "$native_module" || {
    printf 'Published iOS/tvOS module does not point %s at version %s.\n' "$script_name" "$version" >&2
    exit 1
  }
done

if grep -Eq 'script-path=(/|file://)' "$module"; then
  printf 'Published module contains a local script path.\n' >&2
  exit 1
fi
if grep -Eq 'script-path=(/|file://)' "$native_module"; then
  printf 'Published iOS/tvOS module contains a local script path.\n' >&2
  exit 1
fi

for installer_name in surge-install.html surge-install-native.html; do
  published_installer="$temporary_root/pages/$installer_name"
  mkdir -p "$(dirname "$published_installer")"
  curl -fsSL --retry 2 --connect-timeout 10 --max-time 30 \
    "$PAGES_BASE_URL/$installer_name" \
    -o "$published_installer"
  if ! cmp -s "$REPO_ROOT/$installer_name" "$published_installer"; then
    printf 'Published GitHub Pages installer is stale or different: %s\n' "$installer_name" >&2
    exit 1
  fi
done

printf 'Published YouTube distribution matches local VERSION=%s.\n' "$version"
