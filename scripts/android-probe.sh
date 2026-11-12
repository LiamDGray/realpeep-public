#!/usr/bin/env bash
#
# Read-only preflight for a USB-connected Android device.
# Prints the facts needed before the Native/JS baseline run.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

command -v adb >/dev/null 2>&1 || { echo "adb not found" >&2; exit 1; }

if ! timeout 10 adb wait-for-device 2>/dev/null; then
  echo "No device. Connect the Moto, enable USB debugging, and accept the RSA prompt." >&2
  adb devices -l || true
  exit 1
fi

state="$(adb get-state 2>/dev/null || true)"
if [[ "$state" != "device" ]]; then
  echo "adb state is '$state' (expected 'device')." >&2
  echo "Unlock the phone and tap 'Allow' on the 'Allow USB debugging?' prompt." >&2
  adb devices -l || true
  exit 1
fi

echo "== device =="
adb devices -l
adb shell getprop ro.product.model | tr -d '\r' | sed 's/^/model: /'
adb shell getprop ro.build.version.release | tr -d '\r' | sed 's/^/android: /'
adb shell getprop ro.build.version.sdk | tr -d '\r' | sed 's/^/api: /'
adb shell getprop ro.product.cpu.abi | tr -d '\r' | sed 's/^/abi: /'
adb shell wm size | tr -d '\r' | sed 's/^/screen: /'

echo "== bluetooth =="
adb shell pm list features 2>/dev/null | grep -i bluetooth | sed 's/^/feature: /' || true
adb shell settings get secure bluetooth_on 2>/dev/null | tr -d '\r' | sed 's/^/bluetooth_on: /'
adb shell dumpsys bluetooth_manager 2>/dev/null | grep -E 'enabled:|state:' | head -4 || true

echo "== location (needed for BLE scan on Android 10) =="
adb shell settings get secure location_mode 2>/dev/null | tr -d '\r' | sed 's/^/location_mode: /'

echo "== chrome =="
adb shell dumpsys package com.android.chrome 2>/dev/null | grep -E 'versionName=' | head -1 || echo "chrome: not installed"

echo "== battery/thermal =="
adb shell dumpsys battery 2>/dev/null | grep -E 'level:|temperature:' | sed 's/^/battery: /' || true
adb shell dumpsys thermalservice 2>/dev/null | grep -E 'Thermal Status|mStatus' | head -3 || true

echo "== screen =="
adb shell dumpsys power 2>/dev/null | grep -E 'mWakefulness=|Display Power' | head -3 || true

cat <<'MSG'

Ready. Useful next commands (these change device state):
  adb shell svc power stayon usb                 # keep screen on while USB-connected
  adb shell settings put system screen_off_timeout 1800000
  adb shell settings put secure location_mode 3  # enable location (BLE scan on API 29)

Then run:
  scripts/android-device-test.sh --js
MSG
