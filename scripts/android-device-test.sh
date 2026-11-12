#!/usr/bin/env bash
#
# Prepare a connected Android device for the RealPeep native and JS tests.
#
# Usage:
#   scripts/android-device-test.sh [--js]
#
# --js also starts a local static server and opens the real-proof page in the
# device browser via adb reverse (localhost is a secure context, so webcam works).
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="com.realpeep.app"
PORT="${PORT:-8099}"
OPEN_JS=0
[[ "${1:-}" == "--js" ]] && OPEN_JS=1

command -v adb >/dev/null 2>&1 || { echo "adb not found" >&2; exit 1; }
adb get-state >/dev/null 2>&1 || { echo "no device/emulator connected" >&2; exit 1; }

echo "==> device: $(adb shell getprop ro.product.model | tr -d '\r') / API $(adb shell getprop ro.build.version.sdk | tr -d '\r')"

echo "==> installing debug APK"
(cd "$ROOT/platform/android" && ./gradlew :app:installDebug --no-daemon)

echo "==> granting runtime permissions (ignore failures for unsupported APIs)"
for perm in \
  android.permission.CAMERA \
  android.permission.RECORD_AUDIO \
  android.permission.ACCESS_FINE_LOCATION \
  android.permission.BLUETOOTH_SCAN \
  android.permission.BLUETOOTH_ADVERTISE \
  android.permission.BLUETOOTH_CONNECT \
  android.permission.POST_NOTIFICATIONS; do
  adb shell pm grant "$PKG" "$perm" >/dev/null 2>&1 || true
done

echo "==> clearing logcat and launching app"
adb logcat -c
adb shell am start -n "$PKG/.MainActivity" >/dev/null

cat <<'MSG'

Native test checklist:
  1. Enter a 4-digit PIN; Record should enable.
  2. Confirm "Frames" and "Audio" counts both increase.
  3. Confirm the BLE TX/RX chips change when a second device is nearby.
  4. Stop; confirm the session JSON/log contains non-zero frame and audio counts.

Watch logs:
  adb logcat -s RealPeep.Main RealPeep.FrameCapture RealPeep.AudioRecorder RealPeep.Advertiser RealPeep.Scanner
MSG

if [[ "$OPEN_JS" == "1" ]]; then
  echo "==> starting local static server on 127.0.0.1:$PORT"
  (cd "$ROOT" && python3 -m http.server "$PORT" --bind 127.0.0.1) &
  SERVER_PID=$!
  trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
  sleep 0.7
  adb reverse "tcp:$PORT" "tcp:$PORT" >/dev/null
  echo "==> opening http://localhost:$PORT/demo/real-proof.html"
  adb shell am start -a android.intent.action.VIEW -d "http://localhost:$PORT/demo/real-proof.html" >/dev/null
  cat <<MSG

JS baseline checklist (Moto XT1955-5 / 3 GB):
  - "Prove the public-domain clip" and record prove/verify/total times.
  - Note whether Chrome asks for camera permission for "Use webcam".
  - Watch for a tab crash / reload; check `adb logcat -b crash`.
  - Report frameCount, prove ms, total ms, and whether the proof verified.

The server runs until this script exits; press Ctrl-C when done.
MSG
  wait "$SERVER_PID"
fi
