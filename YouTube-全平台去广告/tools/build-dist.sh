#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)
REPO_ROOT=$(CDPATH= cd -- "$PROJECT_ROOT/.." && pwd -P)
DIST_ROOT="$REPO_ROOT/dist/youtube"
VERSION=$(tr -d '\r\n' < "$PROJECT_ROOT/VERSION")
RELEASE_ROOT="$DIST_ROOT/releases/$VERSION"
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
    case "$target_path" in
      "$RELEASE_ROOT"/*)
        if [ -f "$target_path" ]; then
          cmp -s "$source_path" "$target_path" || {
            printf 'Immutable release file already exists with different content: %s\n' \
              "$target_path" >&2
            exit 1
          }
        else
          cp "$source_path" "$target_path"
        fi
        ;;
      *)
        cp "$source_path" "$target_path"
        ;;
    esac
  fi
}

assert_existing_release_file() {
  source_path=$1
  target_path=$2

  [ -f "$target_path" ] || {
    printf 'Immutable release directory is incomplete: %s\n' "$target_path" >&2
    exit 1
  }
  cmp -s "$source_path" "$target_path" || {
    printf 'Immutable release file already exists with different content: %s\n' \
      "$target_path" >&2
    exit 1
  }
}

if [ "$CHECK_ONLY" -eq 0 ] && [ -d "$RELEASE_ROOT" ]; then
  assert_existing_release_file \
    "$PROJECT_ROOT/scripts/web/youtube-web-page.js" \
    "$RELEASE_ROOT/scripts/youtube-web-page.js"
  assert_existing_release_file \
    "$PROJECT_ROOT/scripts/web/youtube-web-response.js" \
    "$RELEASE_ROOT/scripts/youtube-web-response.js"
  assert_existing_release_file \
    "$PROJECT_ROOT/scripts/native/youtube-native-response.js" \
    "$RELEASE_ROOT/scripts/youtube-native-response.js"
  assert_existing_release_file \
    "$PROJECT_ROOT/scripts/native/youtube-native-request.js" \
    "$RELEASE_ROOT/scripts/youtube-native-request.js"
  assert_existing_release_file \
    "$PROJECT_ROOT/scripts/native/youtube-native-ump.js" \
    "$RELEASE_ROOT/scripts/youtube-native-ump.js"
  assert_existing_release_file \
    "$PROJECT_ROOT/scripts/tvos/youtube-tvos-json.js" \
    "$RELEASE_ROOT/scripts/youtube-tvos-json.js"
fi

sync_file \
  "$PROJECT_ROOT/clients/surge/YouTube-All-Platform-AdBlock.sgmodule" \
  "$DIST_ROOT/YouTube-AdBlock.sgmodule"
sync_file \
  "$PROJECT_ROOT/clients/surge/YouTube-iOS-tvOS-AdBlock.sgmodule" \
  "$DIST_ROOT/YouTube-iOS-tvOS-AdBlock.sgmodule"
sync_file \
  "$PROJECT_ROOT/scripts/web/youtube-web-page.js" \
  "$RELEASE_ROOT/scripts/youtube-web-page.js"
sync_file \
  "$PROJECT_ROOT/scripts/web/youtube-web-response.js" \
  "$RELEASE_ROOT/scripts/youtube-web-response.js"
sync_file \
  "$PROJECT_ROOT/scripts/native/youtube-native-response.js" \
  "$RELEASE_ROOT/scripts/youtube-native-response.js"
sync_file \
  "$PROJECT_ROOT/scripts/native/youtube-native-request.js" \
  "$RELEASE_ROOT/scripts/youtube-native-request.js"
sync_file \
  "$PROJECT_ROOT/scripts/native/youtube-native-ump.js" \
  "$RELEASE_ROOT/scripts/youtube-native-ump.js"
sync_file \
  "$PROJECT_ROOT/scripts/tvos/youtube-tvos-json.js" \
  "$RELEASE_ROOT/scripts/youtube-tvos-json.js"
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

managed_dist_files="VERSION
YouTube-AdBlock.sgmodule
YouTube-iOS-tvOS-AdBlock.sgmodule
releases/$VERSION/scripts/youtube-web-page.js
releases/$VERSION/scripts/youtube-web-response.js
releases/$VERSION/scripts/youtube-native-response.js
releases/$VERSION/scripts/youtube-native-request.js
releases/$VERSION/scripts/youtube-native-ump.js
releases/$VERSION/scripts/youtube-tvos-json.js"

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
  [ "$checksum_count" -eq 9 ] || {
    printf 'Expected 9 distribution checksums, found %s.\n' "$checksum_count" >&2
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
