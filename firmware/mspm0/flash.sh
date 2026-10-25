#!/usr/bin/env bash
# Flash a built program to the LaunchPad over USB (onboard XDS110) and start it.
#   ./flash.sh blink     (after ./build.sh blink)
#   ./flash.sh bws
set -euo pipefail
cd "$(dirname "$0")"
APP="${1:-bws}"
OUT="build/$APP.out"
[ -f "$OUT" ] || { echo "$OUT not found: run ./build.sh $APP first" >&2; exit 1; }
DSLITE="${DSLITE:-$(ls -d /c/ti/ccs*/ccs/ccs_base/DebugServer/bin/DSLite.exe 2>/dev/null | sort -V | tail -1)}"
[ -x "$DSLITE" ] || { echo "DSLite not found (install CCS)" >&2; exit 1; }
# -e progress messages, -f flash, -v verify, -u run after loading, -t timeout (s)
"$DSLITE" flash -c common/MSPM0G3507.ccxml -e -f -v -u -t 120 "$OUT"
