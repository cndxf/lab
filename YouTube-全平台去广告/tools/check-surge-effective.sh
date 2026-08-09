#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)
EXPECTED_VERSION=$(tr -d '\r\n' < "$PROJECT_ROOT/VERSION")
EXPECTED_RELEASE_PATH="/releases/$EXPECTED_VERSION/"
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
mitm_hostname=$(printf '%s\n' "$effective_profile" | awk '/^hostname = / { print }')
if printf '%s\n' "$mitm_hostname" | grep -Eq '(^|[ ,])\*([ ,]|$)'; then
  printf '%s\n' \
    'GLOBAL_MITM_WILDCARD: effective profile contains hostname = *.' \
    'Remove the wildcard and keep only the YouTube hosts required by this module; certificate-pinned apps can abort the TLS handshake.' >&2
  failed=1
fi

native_script_count=$(printf '%s\n' "$effective_profile" | awk '
  index($0, "youtube.native.") == 1 || index($0, "youtube.tvos.") == 1 { count += 1 }
  END { print count + 0 }
')
if [ "$native_script_count" -gt 0 ]; then
  printf '%s\n' \
    "NATIVE_CONFLICT: Mac effective profile contains $native_script_count iOS/tvOS YouTube script(s)." \
    "Remove the iOS/tvOS module from Mac and keep only the current \"v$EXPECTED_VERSION · YouTube 全平台去广告\" module." >&2
  failed=1
fi

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
      if ! script_is_current "$script_line"; then
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

# 同一版本的旧模块也可能只更新了脚本 URL，遗漏新增页面路由；检查规则内容本身。
web_page_lines=$(printf '%s\n' "$effective_profile" | awk '
  index($0, "youtube.web.page =") == 1 { print }
')
for required_route in gaming music movies podcasts premium shopping sports news kids fashion learning live; do
  if ! printf '%s\n' "$web_page_lines" | grep -Eq "(^|[|(:])${required_route}([|):])"; then
    printf '%s\n' \
      "STALE: youtube.web.page does not include current page route: $required_route." \
      'Refresh or replace the current YouTube module, then apply changes.' >&2
    failed=1
  fi
done

if [ "$failed" -ne 0 ]; then
  printf '%s\n' \
    'The effective profile is missing, stale, or contains duplicate YouTube scripts.' \
    "Open Surge > Modules, keep one current \"v$EXPECTED_VERSION · YouTube 全平台去广告\", then apply changes." >&2
  exit 1
fi

printf 'All YouTube module scripts are current and unique in the effective profile.\n'
