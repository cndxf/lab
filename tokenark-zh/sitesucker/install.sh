#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
bash "$SCRIPT_DIR/generate_sitesucker_locale.sh"
exec bash "$SCRIPT_DIR/apply_sitesucker.sh" "$@"
