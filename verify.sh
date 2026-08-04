#!/bin/sh

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)

"$ROOT/YouTube-全平台去广告/tools/verify.sh"

node --test "$ROOT/tokenark-zh/github-desktop/tests/test_injector.mjs"
bash "$ROOT/tokenark-zh/github-desktop/tests/test_scripts.sh"
node --test "$ROOT/tokenark-zh/claude/tests/test_remote_overlay.mjs"

if rg -n --hidden --glob '!.git/**' '/Users/[A-Za-z0-9._-]+/' "$ROOT"; then
  printf 'Public files contain a local absolute path.\n' >&2
  exit 1
fi

if rg -n --hidden --glob '!.git/**' \
  --glob '!SECURITY.md' \
  --glob '!README.md' \
  --glob '!安装说明.md' \
  --glob '!*.strings' \
  --glob '!*.json' \
  -- \
  '-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----|(^|[[:space:]])ca-p12[[:space:]]*=|(^|[[:space:]])private-key[[:space:]]*=|gh[opsu]_[A-Za-z0-9]{20,}' \
  "$ROOT"; then
  printf 'Public files contain a credential-like value.\n' >&2
  exit 1
fi

linked_path=$(find "$ROOT" -type l -print -quit)
if [ -n "$linked_path" ]; then
  printf 'Public repository must not contain symbolic links: %s\n' "$linked_path" >&2
  exit 1
fi

printf 'All repository checks passed.\n'
