#!/usr/bin/env bash
# Build a firmware project from the command line (same flags as the CCS projectspec).
#   ./build.sh blink     -> build/blink.out
#   ./build.sh bws       -> build/bws.out
# Needs CCS (TI Arm Clang) in C:\ti\ccs* and the MSPM0 SDK in C:\ti\mspm0_sdk_*.
# Override with TICLANG=/path/to/ti-cgt-armllvm_x  SDK=/path/to/mspm0_sdk_x
set -euo pipefail
cd "$(dirname "$0")"

APP="${1:-bws}"
[ -f "$APP/main.c" ] || { echo "usage: $0 blink|bws" >&2; exit 1; }

TICLANG="${TICLANG:-$(ls -d /c/ti/ccs*/ccs/tools/compiler/ti-cgt-armllvm_* 2>/dev/null | sort -V | tail -1)}"
SDK="${SDK:-$(ls -d /c/ti/mspm0_sdk_* 2>/dev/null | sort -V | tail -1)}"
[ -x "$TICLANG/bin/tiarmclang" ] || [ -x "$TICLANG/bin/tiarmclang.exe" ] || { echo "TI Arm Clang not found (install CCS)" >&2; exit 1; }
[ -d "$SDK/source/ti/driverlib" ] || { echo "MSPM0 SDK not found" >&2; exit 1; }

CC="$TICLANG/bin/tiarmclang"
OUT=build
mkdir -p "$OUT"

CFLAGS=(-D__MSPM0G3507__ -O2 -gdwarf-3 -Wall
  -I"$SDK/source/third_party/CMSIS/Core/Include" -I"$SDK/source"
  -mcpu=cortex-m0plus -march=thumbv6m -mfloat-abi=soft -mthumb)

echo "compiler: $TICLANG"
echo "sdk:      $SDK"
"$CC" "${CFLAGS[@]}" -c "$APP/main.c" -o "$OUT/$APP.main.obj"
"$CC" "${CFLAGS[@]}" -c common/startup_mspm0g350x_ticlang.c -o "$OUT/startup.obj"
"$CC" "${CFLAGS[@]}" "$OUT/$APP.main.obj" "$OUT/startup.obj" \
  -l"$SDK/source/ti/driverlib/lib/ticlang/m0p/mspm0g1x0x_g3x0x/driverlib.a" \
  -L"$SDK/source" common/mspm0g3507.cmd \
  -Wl,-m,"$OUT/$APP.map" -Wl,--rom_model -Wl,--warn_sections \
  -L"$TICLANG/lib" -llibc.a -o "$OUT/$APP.out"

echo "built $OUT/$APP.out"
