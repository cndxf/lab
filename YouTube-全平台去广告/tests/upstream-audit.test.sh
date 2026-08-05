#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)
AUDIT_SCRIPT="$PROJECT_ROOT/tools/audit-upstream.sh"
TEST_TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/youtube-upstream-audit-test.XXXXXX")

cleanup() {
  rm -rf "$TEST_TMP_DIR"
}

trap cleanup EXIT HUP INT TERM

cat > "$TEST_TMP_DIR/uassets-valid.txt" <<'EOF'
youtube_antiadblock_and_ads
adPlacements
adSlots
ssapConfig
no_ads
reelWatchEndpoint.adClientParams.isAd
serverContract
SSAP
get_watch
github.com/uBlockOrigin/uAssets/issues/3367
EOF

cat > "$TEST_TMP_DIR/adguard-valid.txt" <<'EOF'
START: Youtube whitescreen fix
ytInitialPlayerResponse.adPlacements
adSlots
playerAds
ssapConfig
no_ads
reelWatchEndpoint.adClientParams.isAd
serverAbrStreamingUrl
get_drm_license
html5_enable_ssap_entity_id
END: Youtube whitescreen fix
EOF

valid_output=$(
  "$AUDIT_SCRIPT" \
    --uassets-file "$TEST_TMP_DIR/uassets-valid.txt" \
    --adguard-file "$TEST_TMP_DIR/adguard-valid.txt" \
    --native-head 65075cdb388fc5e3094afd7e7314c67b243f3525 \
    --skip-baseline
)

case "$valid_output" in
  *"Maasea native baseline: unchanged"*"uAssets signatures: OK"*"AdGuard signatures: OK"*) ;;
  *)
    printf 'FAIL: valid upstream signatures were rejected.\n%s\n' "$valid_output" >&2
    exit 1
    ;;
esac

sed '/ssapConfig/d' "$TEST_TMP_DIR/adguard-valid.txt" > "$TEST_TMP_DIR/adguard-missing.txt"

if missing_output=$(
  "$AUDIT_SCRIPT" \
    --uassets-file "$TEST_TMP_DIR/uassets-valid.txt" \
    --adguard-file "$TEST_TMP_DIR/adguard-missing.txt" \
    --native-head 65075cdb388fc5e3094afd7e7314c67b243f3525 \
    --skip-baseline 2>&1
); then
  printf 'FAIL: missing upstream signature unexpectedly passed.\n' >&2
  exit 1
fi

case "$missing_output" in
  *"MISSING AdGuard signature: ssapConfig"*) ;;
  *)
    printf 'FAIL: missing signature was not reported clearly.\n%s\n' "$missing_output" >&2
    exit 1
    ;;
esac

sed '/no_ads/d' "$TEST_TMP_DIR/adguard-valid.txt" > "$TEST_TMP_DIR/adguard-no-ads-missing.txt"

if no_ads_missing_output=$(
  "$AUDIT_SCRIPT" \
    --uassets-file "$TEST_TMP_DIR/uassets-valid.txt" \
    --adguard-file "$TEST_TMP_DIR/adguard-no-ads-missing.txt" \
    --native-head 65075cdb388fc5e3094afd7e7314c67b243f3525 \
    --skip-baseline 2>&1
); then
  printf 'FAIL: missing AdGuard no_ads signature unexpectedly passed.\n' >&2
  exit 1
fi

case "$no_ads_missing_output" in
  *"MISSING AdGuard signature: no_ads"*) ;;
  *)
    printf 'FAIL: missing AdGuard no_ads signature was not reported clearly.\n%s\n' "$no_ads_missing_output" >&2
    exit 1
    ;;
esac

if native_output=$(
  "$AUDIT_SCRIPT" \
    --uassets-file "$TEST_TMP_DIR/uassets-valid.txt" \
    --adguard-file "$TEST_TMP_DIR/adguard-valid.txt" \
    --native-head deadbeef \
    --skip-baseline \
    --strict 2>&1
); then
  printf 'FAIL: changed native upstream commit unexpectedly passed strict mode.\n' >&2
  exit 1
else
  native_status=$?
fi

[ "$native_status" -eq 3 ] || {
  printf 'FAIL: changed native upstream returned %s instead of 3.\n%s\n' \
    "$native_status" "$native_output" >&2
  exit 1
}

case "$native_output" in
  *"Maasea native baseline: CHANGED"*) ;;
  *)
    printf 'FAIL: changed native upstream was not reported clearly.\n%s\n' "$native_output" >&2
    exit 1
    ;;
esac

verify_source=$(cat "$PROJECT_ROOT/tools/verify.sh")
case "$verify_source" in
  *'tests/upstream-audit.test.sh'*) ;;
  *)
    printf 'FAIL: tools/verify.sh does not run the upstream audit regression test.\n' >&2
    exit 1
    ;;
esac

case "$verify_source" in
  *'AUDIT_UPSTREAM'*) ;;
  *)
    printf 'FAIL: tools/verify.sh has no opt-in live upstream audit.\n' >&2
    exit 1
    ;;
esac

printf 'PASS: upstream audit accepts known signals and rejects missing ones.\n'
