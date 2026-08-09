#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)
EXPECTED_VERSION=$(tr -d '\r\n' < "$PROJECT_ROOT/VERSION")
EXPECTED_RELEASE_PATH="/releases/$EXPECTED_VERSION/scripts/"
VERSION_PATTERN=$(printf '%s' "$EXPECTED_VERSION" | sed 's/\./\\./g')
SURGE_CLI=${SURGE_CLI:-/Applications/Surge.app/Contents/Applications/surge-cli}

script_is_current() {
  script_line=$1
  if [ "${SURGE_LOCAL_TEST:-0}" -eq 1 ]; then
    # The one-time LAN server intentionally rewrites public release paths to /scripts/.
    printf '%s\n' "$script_line" | grep -Eq "/scripts/[^,[:space:]]+\\?[^,[:space:]]*v=$VERSION_PATTERN(&|$)"
    return
  fi
  printf '%s\n' "$script_line" | grep -Fq "$EXPECTED_RELEASE_PATH"
}

if [ -n "${SURGE_EFFECTIVE_PROFILE_FILE:-}" ]; then
  [ -f "$SURGE_EFFECTIVE_PROFILE_FILE" ] || {
    printf 'Effective profile fixture is unavailable: %s\n' "$SURGE_EFFECTIVE_PROFILE_FILE" >&2
    exit 2
  }
  effective_profile=$(cat "$SURGE_EFFECTIVE_PROFILE_FILE")
elif [ -n "${SURGE_REMOTE:-}" ]; then
  [ -x "$SURGE_CLI" ] || {
    printf 'Surge CLI is unavailable: %s\n' "$SURGE_CLI" >&2
    exit 2
  }
  effective_profile=$($SURGE_CLI --remote "$SURGE_REMOTE" dump profile effective)
else
  [ -x "$SURGE_CLI" ] || {
    printf 'Surge CLI is unavailable: %s\n' "$SURGE_CLI" >&2
    exit 2
  }
  effective_profile=$($SURGE_CLI dump profile effective)
fi

if printf '%s\n' "$effective_profile" | grep -Fxq '(null)'; then
  printf '%s\n' \
    'NO_ACTIVE_PROFILE: Surge returned no effective profile.' \
    'Start Surge, apply a profile, and enable the VPN before checking iOS/tvOS native modules.' >&2
  exit 2
fi

failed=0
mitm_hostname=$(printf '%s\n' "$effective_profile" | awk '/^hostname = / { print }')
if printf '%s\n' "$mitm_hostname" | grep -Eq '(^|[ ,])\*([ ,]|$)'; then
  printf '%s\n' \
    'GLOBAL_MITM_WILDCARD: effective profile contains hostname = *.' \
    'Remove the wildcard and keep only the YouTube hosts required by this module; certificate-pinned apps can abort the TLS handshake.' >&2
  failed=1
fi

if printf '%s\n' "$mitm_hostname" | grep -Eq '(^|[ ,])(www|m)\.youtube\.com([ ,]|$)'; then
  printf '%s\n' \
    'NATIVE_WEB_MITM: native iOS/tvOS profile still captures www.youtube.com or m.youtube.com.' \
    'Disable the macOS web module for iOS/tvOS and keep native MITM limited to youtubei.googleapis.com and *.googlevideo.com.' >&2
  failed=1
fi

native_count=$(printf '%s\n' "$effective_profile" | awk '
  index($0, "youtube.native.") == 1 || index($0, "youtube.tvos.") == 1 { count += 1 }
  END { print count + 0 }
')
if [ "$native_count" -eq 0 ]; then
  printf '%s\n' \
    'NATIVE_MISSING: no iOS/tvOS YouTube scripts are present in the effective profile.' \
    "Install and enable the current \"v$EXPECTED_VERSION · YouTube iOS/tvOS 去广告\", then redeploy the profile to the device." >&2
  failed=1
fi

for script_name in \
  youtube.native.response \
  youtube.native.request.init \
  youtube.native.response.init \
  youtube.tvos.json
do
  count=$(printf '%s\n' "$effective_profile" | awk -v prefix="$script_name =" '
    index($0, prefix) == 1 { count += 1 }
    END { print count + 0 }
  ')
  case "$count" in
    1)
      printf 'PASS: %s is active exactly once.\n' "$script_name"
      script_line=$(printf '%s\n' "$effective_profile" | awk -v prefix="$script_name =" '
        index($0, prefix) == 1 { print; exit }
      ')
      if ! script_is_current "$script_line"; then
        printf '%s\n' \
          "STALE: $script_name does not reference release $EXPECTED_VERSION." \
          'Refresh or replace the current iOS/tvOS module, then redeploy the profile.' >&2
        failed=1
      fi
      ;;
    0)
      printf 'MISSING: %s\n' "$script_name" >&2
      failed=1
      ;;
    *)
      printf 'DUPLICATE: %s appears %s times. Remove old or duplicate native modules.\n' \
        "$script_name" "$count" >&2
      failed=1
      ;;
  esac
done

if ! printf '%s\n' "$mitm_hostname" | grep -Fq '*.googlevideo.com'; then
  printf '%s\n' \
    'MITM_MISSING: effective profile does not include *.googlevideo.com.' \
    'The native initplayback response cannot be inspected without the Google Video MITM hostname.' >&2
  failed=1
fi

if [ "$failed" -ne 0 ]; then
  printf '%s\n' \
    'The effective profile is missing, stale, duplicated, or incomplete for iOS/tvOS native YouTube handling.' \
    'Do not count the device as deployed until this check passes.' >&2
  exit 1
fi

printf 'All iOS/tvOS native YouTube scripts and MITM hosts are current and unique.\n'
