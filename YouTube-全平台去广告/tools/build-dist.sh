#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)
REPO_ROOT=$(CDPATH= cd -- "$PROJECT_ROOT/.." && pwd -P)
DIST_ROOT="$REPO_ROOT/dist/youtube"
CHECK_ONLY=0

if [ "${1:-}" = "--check" ]; then
  CHECK_ONLY=1
elif [ "$#" -ne 0 ]; then
  printf 'Usage: %s [--check]\n' "$0" >&2
  exit 2
fi

sync_file() {
  source_path=$1
  target_path=$2

  if [ "$CHECK_ONLY" -eq 1 ]; then
    [ -f "$target_path" ] || {
      printf 'Missing distribution file: %s\n' "$target_path" >&2
      exit 1
    }
    cmp -s "$source_path" "$target_path" || {
      printf 'Distribution file is stale: %s\n' "$target_path" >&2
      exit 1
    }
  else
    mkdir -p "$(dirname "$target_path")"
    cp "$source_path" "$target_path"
  fi
}

sync_file \
  "$PROJECT_ROOT/clients/surge/YouTube-All-Platform-AdBlock.sgmodule" \
  "$DIST_ROOT/YouTube-AdBlock.sgmodule"
sync_file \
  "$PROJECT_ROOT/scripts/web/youtube-web-page.js" \
  "$DIST_ROOT/scripts/youtube-web-page.js"
sync_file \
  "$PROJECT_ROOT/scripts/web/youtube-web-response.js" \
  "$DIST_ROOT/scripts/youtube-web-response.js"
sync_file \
  "$PROJECT_ROOT/scripts/native/youtube-native-response.js" \
  "$DIST_ROOT/scripts/youtube-native-response.js"
sync_file "$PROJECT_ROOT/VERSION" "$DIST_ROOT/VERSION"

hash_file() {
  file_path=$1
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file_path" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file_path" | awk '{print $1}'
  else
    printf 'Neither shasum nor sha256sum is available.\n' >&2
    exit 1
  fi
}

managed_dist_files='VERSION
YouTube-AdBlock.sgmodule
scripts/youtube-web-page.js
scripts/youtube-web-response.js
scripts/youtube-native-response.js'

if [ "$CHECK_ONLY" -eq 1 ]; then
  [ -f "$DIST_ROOT/SHA256SUMS" ] || {
    printf 'Missing distribution checksum file: %s/SHA256SUMS\n' "$DIST_ROOT" >&2
    exit 1
  }
  checksum_count=0
  while IFS='  ' read -r expected relative_path; do
    [ -n "$relative_path" ] || continue
    actual=$(hash_file "$DIST_ROOT/$relative_path")
    [ "$actual" = "$expected" ] || {
      printf 'Distribution checksum mismatch: %s\n' "$relative_path" >&2
      exit 1
    }
    checksum_count=$((checksum_count + 1))
  done < "$DIST_ROOT/SHA256SUMS"
  [ "$checksum_count" -eq 5 ] || {
    printf 'Expected 5 distribution checksums, found %s.\n' "$checksum_count" >&2
    exit 1
  }
else
  checksum_tmp="$DIST_ROOT/SHA256SUMS.tmp"
  : > "$checksum_tmp"
  printf '%s\n' "$managed_dist_files" | while IFS= read -r relative_path; do
    printf '%s  %s\n' "$(hash_file "$DIST_ROOT/$relative_path")" "$relative_path"
  done > "$checksum_tmp"
  mv "$checksum_tmp" "$DIST_ROOT/SHA256SUMS"
fi

if [ "$CHECK_ONLY" -eq 1 ]; then
  printf 'Distribution files are current.\n'
else
  printf 'Built distribution files in %s\n' "$DIST_ROOT"
fi
