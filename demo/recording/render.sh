#!/usr/bin/env bash
#
# End-to-end CPU-only demo render:
#   Kokoro-82M narration -> Playwright screen recording -> ffmpeg mux
#
# Prerequisites:
#   python3 -m venv .venv && .venv/bin/pip install kokoro-onnx soundfile
#   cd demo/recording && npm ci && npx playwright install chromium
#   ffmpeg with libx264, aac and libass
#
# Environment:
#   KOKORO_PYTHON          Python with kokoro-onnx (default: python3)
#   KOKORO_MODEL_DIR       model cache (default: demo/recording/.cache)
#   PLAYWRIGHT_BROWSERS_PATH  if Playwright browsers are not in the default cache
#   CHROME_BIN             override Chromium executable
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="${1:-$ROOT/demo/recording/out}"
KOKORO_PYTHON="${KOKORO_PYTHON:-python3}"
KOKORO_MODEL_DIR="${KOKORO_MODEL_DIR:-$ROOT/demo/recording/.cache}"

mkdir -p "$OUT_DIR"

printf '==> 1/3 narration (Kokoro-82M int8, CPU)\n'
(cd "$ROOT" && "$KOKORO_PYTHON" demo/recording/make_narration.py \
    --model-dir "$KOKORO_MODEL_DIR" --out-dir "$OUT_DIR")

printf '==> 2/3 screen recording (Playwright)\n'
(cd "$ROOT" && node demo/recording/record_demo.mjs "$OUT_DIR")

printf '==> 3/3 mux + captions (ffmpeg)\n'
"$ROOT/demo/recording/assemble.sh" "$OUT_DIR"

printf '\nOutputs:\n'
ls -lh "$OUT_DIR"/realpeep-demo-90s*.mp4 "$OUT_DIR"/narration.srt "$OUT_DIR"/poster.jpg
