#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)

"$SCRIPT_DIR/build-dist.sh" --check
"$SCRIPT_DIR/validate-surge-module.sh"

node --check "$PROJECT_ROOT/scripts/web/youtube-web-page.js"
node --check "$PROJECT_ROOT/scripts/web/youtube-web-response.js"
node --check "$PROJECT_ROOT/scripts/native/youtube-native-response.js"

node "$PROJECT_ROOT/tests/generic-runtime-names.test.cjs"
node "$PROJECT_ROOT/tests/package-structure.test.cjs"
node "$PROJECT_ROOT/tests/youtube-web-response.test.cjs"

printf 'All YouTube package checks passed.\n'
