#!/usr/bin/env bash
# Convert a short clip into the Y4M fixture Chromium expects for
# --use-file-for-fake-video-capture. This lets the recorded demo show a
# deterministic "camera" without a real webcam or a human face.
#
# Usage: make_fake_camera.sh <input.mp4> <output.y4m>
set -euo pipefail
IN="${1:?input video required}"
OUT="${2:?output y4m required}"
mkdir -p "$(dirname "$OUT")"
ffmpeg -hide_banner -loglevel error -y -i "$IN" \
    -vf "fps=10,scale=480:270:flags=lanczos" \
    -pix_fmt yuv420p -f yuv4mpegpipe "$OUT"
ls -lh "$OUT"
