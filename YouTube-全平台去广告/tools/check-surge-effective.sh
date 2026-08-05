#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)
EXPECTED_VERSION=$(tr -d '\r\n' < "$PROJECT_ROOT/VERSION")
EXPECTED_RELEASE_PATH="/releases/$EXPECTED_VERSION/"
SURGE_CLI=${SURGE_CLI:-/Applications/Surge.app/Contents/Applications/surge-cli}

# 测试可传入固定的有效配置；正常使用时仍由 Surge CLI 读取当前合并结果。
if [ -n "${SURGE_EFFECTIVE_PROFILE_FILE:-}" ]; then
  [ -f "$SURGE_EFFECTIVE_PROFILE_FILE" ] || {
    printf 'Effective profile fixture is unavailable: %s\n' "$SURGE_EFFECTIVE_PROFILE_FILE" >&2
    exit 2
  }
  effective_profile=$(cat "$SURGE_EFFECTIVE_PROFILE_FILE")
else
  [ -x "$SURGE_CLI" ] || {
    printf 'Surge CLI is unavailable: %s\n' "$SURGE_CLI" >&2
    exit 2
  }
  # [COMMON / 多客户端通用] 模块不会改写主配置；这里读取模块合并后的有效配置。
  effective_profile=$($SURGE_CLI dump profile effective)
fi

failed=0

for script_name in \
  youtube.web.response \
  youtube.web.page
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
      if ! printf '%s\n' "$script_line" | grep -Fq "$EXPECTED_RELEASE_PATH"; then
        printf '%s\n' \
          "STALE: $script_name does not reference release $EXPECTED_VERSION." \
          'Refresh or replace the current YouTube module, then apply changes.' >&2
        failed=1
      fi
      ;;
    0)
      printf 'MISSING: %s\n' "$script_name" >&2
      failed=1
      ;;
    *)
      printf 'DUPLICATE: %s appears %s times. Remove old or duplicate modules.\n' \
        "$script_name" "$count" >&2
      failed=1
      ;;
  esac
done

web_response_lines=$(printf '%s\n' "$effective_profile" | awk '
  index($0, "youtube.web.response =") == 1 { print }
')
if [ -n "$web_response_lines" ] && ! printf '%s\n' "$web_response_lines" | grep -Fq 'player\/ad_break'; then
  printf '%s\n' \
    'STALE: youtube.web.response does not include player\/ad_break.' \
    'Disable or remove the old YouTube module, then enable the current module.' >&2
  failed=1
fi

if [ "$failed" -ne 0 ]; then
  printf '%s\n' \
    'The effective profile is missing, stale, or contains duplicate YouTube scripts.' \
    'Open Surge > Modules, keep one current "YouTube 全平台去广告", then apply changes.' >&2
  exit 1
fi

printf 'All YouTube module scripts are current and unique in the effective profile.\n'
