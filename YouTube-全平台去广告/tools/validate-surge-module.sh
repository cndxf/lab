#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)
MODULE_PATH=${1:-$PROJECT_ROOT/clients/surge/YouTube-All-Platform-AdBlock.sgmodule}
SURGE_CLI=${SURGE_CLI:-/Applications/Surge.app/Contents/Applications/surge-cli}
REQUIRE_SURGE_CLI=${REQUIRE_SURGE_CLI:-0}

[ -f "$MODULE_PATH" ] || {
  printf 'Module does not exist: %s\n' "$MODULE_PATH" >&2
  exit 1
}

if [ ! -x "$SURGE_CLI" ]; then
  if [ "$REQUIRE_SURGE_CLI" -eq 1 ]; then
    printf 'Surge CLI is required but unavailable: %s\n' "$SURGE_CLI" >&2
    exit 1
  fi
  printf 'Surge CLI is unavailable; skipped native module syntax validation.\n'
  exit 0
fi

temporary_profile=$(mktemp "${TMPDIR:-/tmp}/youtube-adblock-profile.XXXXXX")
resolved_module=$(mktemp "${TMPDIR:-/tmp}/youtube-adblock-module.XXXXXX")
trap 'rm -f "$temporary_profile" "$resolved_module"' EXIT HUP INT TERM

# Resolve the module's documented default arguments before passing it to the
# complete-profile validator. Current Surge releases use the legacy
# key:default / {{{key}}} form in installed modules, while the validator also
# understands the query-string / %key% form documented for newer releases.
node - "$MODULE_PATH" "$resolved_module" <<'NODE'
const fs = require("node:fs");

const [, , sourcePath, outputPath] = process.argv;
const source = fs.readFileSync(sourcePath, "utf8");
const argumentLine = source.match(/^#!arguments=(.*)$/m)?.[1] || "";
const defaults = new Map();

const legacyArguments = argumentLine.includes(":") && !argumentLine.includes("&");
const entries = legacyArguments ? argumentLine.split(",") : argumentLine.split("&");

for (const entry of entries) {
  if (!entry) continue;
  const separator = entry.indexOf(legacyArguments ? ":" : "=");
  if (separator <= 0) throw new Error(`Invalid module argument: ${entry}`);
  defaults.set(entry.slice(0, separator), entry.slice(separator + 1));
}

let rendered = source;
for (const [name, value] of defaults) {
  rendered = rendered.replaceAll(`%${name}%`, value);
  rendered = rendered.replaceAll(`{{{${name}}}}`, value);
  if (rendered.includes(`%${name}%`) || rendered.includes(`{{{${name}}}}`)) {
    throw new Error(`Unresolved module argument: ${name}`);
  }
}

fs.writeFileSync(outputPath, rendered);
NODE

# Surge CLI validates complete profiles, while a module intentionally has no
# FINAL rule and uses %APPEND% for MITM hostnames. Build a temporary equivalent
# profile solely for syntax checking; the published module remains unchanged.
awk '
  BEGIN {
    print "[General]"
    print "loglevel = notify"
    print "dns-server = system"
    print ""
  }
  /^#!/ { next }
  /^\[Rule\]$/ {
    print
    in_rule = 1
    next
  }
  /^\[/ && in_rule {
    print "FINAL,DIRECT"
    print ""
    in_rule = 0
  }
  /^hostname = %APPEND% / {
    sub(/^hostname = %APPEND% /, "hostname = ")
  }
  { print }
  END {
    if (in_rule) print "FINAL,DIRECT"
  }
' "$resolved_module" > "$temporary_profile"

"$SURGE_CLI" --check "$temporary_profile"
printf 'Surge CLI accepted the generated profile for module %s.\n' "$MODULE_PATH"
