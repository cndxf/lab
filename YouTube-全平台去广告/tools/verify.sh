#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)

if [ "${CHECK_PUBLISHED:-0}" -eq 1 ]; then
  REQUIRE_SURGE_CLI=1
  export REQUIRE_SURGE_CLI
fi

"$SCRIPT_DIR/build-dist.sh" --check
"$SCRIPT_DIR/validate-surge-module.sh"
"$SCRIPT_DIR/validate-surge-module.sh" \
  "$PROJECT_ROOT/clients/surge/YouTube-iOS-tvOS-AdBlock.sgmodule"

node --check "$PROJECT_ROOT/scripts/web/youtube-web-page.js"
node --check "$PROJECT_ROOT/scripts/web/youtube-web-response.js"
node --check "$PROJECT_ROOT/scripts/native/youtube-native-response.js"
node --check "$PROJECT_ROOT/scripts/native/youtube-native-request.js"
node --check "$PROJECT_ROOT/scripts/native/youtube-native-ump.js"
node --check "$PROJECT_ROOT/scripts/tvos/youtube-tvos-json.js"
node --check "$PROJECT_ROOT/tools/serve-local-test.mjs"

node "$PROJECT_ROOT/tests/generic-runtime-names.test.cjs"
node "$PROJECT_ROOT/tests/package-structure.test.cjs"
node "$PROJECT_ROOT/tests/release-immutability.test.cjs"
node "$PROJECT_ROOT/tests/install-entry.test.cjs"
node "$PROJECT_ROOT/tests/local-test-docs.test.cjs"
node "$PROJECT_ROOT/tests/local-test-server.test.cjs"
node "$PROJECT_ROOT/tests/mac-chrome-regression.test.cjs"
node "$PROJECT_ROOT/tests/maintenance-boundaries.test.cjs"
node "$PROJECT_ROOT/tests/module-activation.test.cjs"
node "$PROJECT_ROOT/tests/module-arguments.test.cjs"
node "$PROJECT_ROOT/tests/native-diagnostics.test.cjs"
node "$PROJECT_ROOT/tests/native-response-config-key.test.cjs"
node "$PROJECT_ROOT/tests/native-response-player-edge.test.cjs"
node "$PROJECT_ROOT/tests/native-stream-module.test.cjs"
node "$PROJECT_ROOT/tests/native-stream-request.test.cjs"
node "$PROJECT_ROOT/tests/native-stream-ump-edge.test.cjs"
node "$PROJECT_ROOT/tests/native-stream-ump.test.cjs"
node "$PROJECT_ROOT/tests/tvos-json-response.test.cjs"
node "$PROJECT_ROOT/tests/youtube-web-response.test.cjs"
"$PROJECT_ROOT/tests/upstream-audit.test.sh"

if [ "${AUDIT_UPSTREAM:-0}" -eq 1 ]; then
  "$SCRIPT_DIR/audit-upstream.sh" --strict
fi

if [ "${CHECK_PUBLISHED:-0}" -eq 1 ]; then
  "$SCRIPT_DIR/check-published.sh"
fi

printf 'All YouTube package checks passed.\n'
