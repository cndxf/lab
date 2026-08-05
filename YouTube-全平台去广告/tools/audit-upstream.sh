#!/bin/sh

set -eu

UASSETS_URL="https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/quick-fixes.txt"
ADGUARD_URL="https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/BaseFilter/sections/specific.txt"
NATIVE_REPO_URL="https://github.com/Maasea/sgmodule.git"
NATIVE_BASELINE_COMMIT="65075cdb388fc5e3094afd7e7314c67b243f3525"
UASSETS_BASELINE_COMMIT="9bbd491042c3e6c3ade281ab43de7502d75347d4"
ADGUARD_BASELINE_COMMIT="c6f4f4abffcda13b66ced923d4348e7633745b90"
UASSETS_BASELINE_HASH="78c9fd5fb410627736045dea324a69ebc02ac780f8e64fe5b5cf33e77d47b751"
ADGUARD_BASELINE_HASH="85ab2b9e67ddad6c234ee560e8e62cb46b13409882d54a63beb18f2d2d421bc9"

uassets_file=""
adguard_file=""
native_head=""
skip_baseline=0
strict=0
temporary_files=""

usage() {
  printf '%s\n' \
    "Usage: $0 [--uassets-file PATH] [--adguard-file PATH] [--native-head SHA] [--skip-baseline] [--strict]"
}

cleanup() {
  for file in $temporary_files; do
    rm -f -- "$file"
  done
}

new_temporary_file() {
  temporary_file=$(mktemp "${TMPDIR:-/tmp}/youtube-upstream-audit.XXXXXX")
  temporary_files="$temporary_files $temporary_file"
}

download_source() {
  curl --fail --silent --show-error --location --max-time 30 "$1" -o "$2"
}

extract_uassets_block() {
  awk '
    /youtube_antiadblock_and_ads/ { capture = 1 }
    capture && /github.com\/uBlockOrigin\/uAssets\/issues\/3367/ { exit }
    capture { print }
  ' "$1" > "$2"
}

extract_adguard_block() {
  awk '
    /START: Youtube whitescreen fix/ { capture = 1 }
    capture { print }
    /END: Youtube whitescreen fix/ { exit }
  ' "$1" > "$2"
}

require_signature() {
  if ! grep -Fq -- "$2" "$1"; then
    printf 'MISSING %s signature: %s\n' "$3" "$2" >&2
    return 1
  fi
}

hash_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    printf 'Neither shasum nor sha256sum is available.\n' >&2
    return 1
  fi
}

check_hash() {
  actual=$(hash_file "$1")
  if [ "$actual" = "$2" ]; then
    printf '%s baseline: unchanged (%s)\n' "$3" "$4"
    return 0
  fi
  printf '%s baseline: CHANGED (baseline commit %s, current hash %s)\n' \
    "$3" "$4" "$actual"
  return 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --uassets-file)
      [ "$#" -ge 2 ] || { usage >&2; exit 2; }
      uassets_file=$2
      shift
      ;;
    --adguard-file)
      [ "$#" -ge 2 ] || { usage >&2; exit 2; }
      adguard_file=$2
      shift
      ;;
    --native-head)
      [ "$#" -ge 2 ] || { usage >&2; exit 2; }
      native_head=$2
      shift
      ;;
    --skip-baseline) skip_baseline=1 ;;
    --strict) strict=1 ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
  shift
done

trap cleanup EXIT HUP INT TERM

if [ -z "$native_head" ]; then
  native_head=$(git ls-remote "$NATIVE_REPO_URL" HEAD | awk 'NR == 1 { print $1 }')
fi

[ -n "$native_head" ] || {
  printf 'Could not resolve Maasea native upstream HEAD.\n' >&2
  exit 1
}

audit_changed=0
if [ "$native_head" = "$NATIVE_BASELINE_COMMIT" ]; then
  printf 'Maasea native baseline: unchanged (%s)\n' "$NATIVE_BASELINE_COMMIT"
else
  printf 'Maasea native baseline: CHANGED (baseline commit %s, current commit %s)\n' \
    "$NATIVE_BASELINE_COMMIT" "$native_head"
  audit_changed=1
fi

if [ -z "$uassets_file" ]; then
  new_temporary_file
  uassets_file=$temporary_file
  download_source "$UASSETS_URL" "$uassets_file"
fi

if [ -z "$adguard_file" ]; then
  new_temporary_file
  adguard_file=$temporary_file
  download_source "$ADGUARD_URL" "$adguard_file"
fi

[ -f "$uassets_file" ] || { printf 'Missing uAssets source: %s\n' "$uassets_file" >&2; exit 1; }
[ -f "$adguard_file" ] || { printf 'Missing AdGuard source: %s\n' "$adguard_file" >&2; exit 1; }

new_temporary_file
uassets_block=$temporary_file
new_temporary_file
adguard_block=$temporary_file
extract_uassets_block "$uassets_file" "$uassets_block"
extract_adguard_block "$adguard_file" "$adguard_block"

[ -s "$uassets_block" ] || { printf 'Could not locate the uAssets YouTube block.\n' >&2; exit 1; }
[ -s "$adguard_block" ] || { printf 'Could not locate the AdGuard YouTube block.\n' >&2; exit 1; }

signature_failure=0
for signature in \
  adPlacements \
  adSlots \
  reelWatchEndpoint.adClientParams.isAd \
  serverContract \
  SSAP \
  get_watch; do
  require_signature "$uassets_block" "$signature" uAssets || signature_failure=1
done
[ "$signature_failure" -eq 0 ] && printf 'uAssets signatures: OK\n'

adguard_signature_failure=0
for signature in \
  ytInitialPlayerResponse.adPlacements \
  adSlots \
  playerAds \
  reelWatchEndpoint.adClientParams.isAd \
  serverAbrStreamingUrl \
  get_drm_license \
  html5_enable_ssap_entity_id; do
  require_signature "$adguard_block" "$signature" AdGuard || adguard_signature_failure=1
done
[ "$adguard_signature_failure" -eq 0 ] && printf 'AdGuard signatures: OK\n'

if [ "$signature_failure" -ne 0 ] || [ "$adguard_signature_failure" -ne 0 ]; then
  exit 1
fi

if [ "$skip_baseline" -eq 0 ]; then
  check_hash "$uassets_block" "$UASSETS_BASELINE_HASH" uAssets "$UASSETS_BASELINE_COMMIT" || audit_changed=1
  check_hash "$adguard_block" "$ADGUARD_BASELINE_HASH" AdGuard "$ADGUARD_BASELINE_COMMIT" || audit_changed=1
fi

if [ "$strict" -eq 1 ] && [ "$audit_changed" -ne 0 ]; then
  exit 3
fi

printf 'Upstream YouTube audit completed. No remote content was executed or installed.\n'
