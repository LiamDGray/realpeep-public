#!/usr/bin/env bash
#
# Mux the Playwright screen recording with the Kokoro narration, normalize
# loudness, add a soft SRT, and render a 1080p H.264/AAC MP4 (plus a
# burned-in-captions variant).
#
# Usage: demo/recording/assemble.sh [outDir]
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="${1:-$ROOT/demo/recording/out}"
RAW="$OUT_DIR/raw.webm"
NARRATION="$OUT_DIR/narration.wav"
TIMELINE="$OUT_DIR/timeline.json"

[[ -f "$RAW" ]] || { echo "missing $RAW" >&2; exit 1; }
[[ -f "$NARRATION" ]] || { echo "missing $NARRATION" >&2; exit 1; }
[[ -f "$TIMELINE" ]] || { echo "missing $TIMELINE" >&2; exit 1; }

TOTAL="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["total_seconds"])' "$TIMELINE")"
SRT="$OUT_DIR/narration.srt"
ASS="$OUT_DIR/narration.ass"
python3 - "$TIMELINE" "$SRT" "$ASS" <<'PY'
import json
import sys
import textwrap
from pathlib import Path

timeline = json.loads(Path(sys.argv[1]).read_text())
out = Path(sys.argv[2])
ass_out = Path(sys.argv[3])


def ts(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


lines = []
ass_lines = []
for index, segment in enumerate(timeline["segments"], start=1):
    text = segment["text"]
    wrapped = textwrap.wrap(text, width=58) or [text]
    lines.append(str(index))
    lines.append(f"{ts(segment['start'])} --> {ts(segment['end'])}")
    lines.extend(wrapped)
    lines.append("")

    def ass_ts(seconds: float) -> str:
        cs = int(round(seconds * 100))
        h, cs = divmod(cs, 360_000)
        m, cs = divmod(cs, 6_000)
        s, cs = divmod(cs, 100)
        return f"{h}:{m:02d}:{s:02d}.{cs:02d}"

    ass_lines.append(
        f"Dialogue: 0,{ass_ts(segment['start'])},{ass_ts(segment['end'])},Default,,0,0,0,,"
        + r"\N".join(wrapped)
    )
out.write_text("\n".join(lines))
ass_out.write_text(
    """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,28,&H00FFFFFF,&H000000FF,&H00000000,&H90000000,0,0,0,0,100,100,0,0,1,2,1,8,60,60,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    + "\n".join(ass_lines)
    + "\n"
)
print(f"wrote {out}")
print(f"wrote {ass_out}")
PY

VIDEO_FILTER="scale=1920:1080:flags=lanczos,fps=30,format=yuv420p,tpad=stop_mode=clone:stop_duration=2.0"
AUDIO_FILTER="loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000"

ffmpeg -hide_banner -loglevel warning -y \
    -i "$RAW" -i "$NARRATION" \
    -filter_complex "[0:v]$VIDEO_FILTER[v];[1:a]$AUDIO_FILTER[a]" \
    -map "[v]" -map "[a]" \
    -t "$TOTAL" \
    -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
    -c:a aac -b:a 192k -ac 2 \
    -movflags +faststart \
    "$OUT_DIR/realpeep-demo-90s.mp4"

ffmpeg -hide_banner -loglevel warning -y \
    -i "$RAW" -i "$NARRATION" \
    -filter_complex "[0:v]$VIDEO_FILTER,subtitles='$ASS'[v];[1:a]$AUDIO_FILTER[a]" \
    -map "[v]" -map "[a]" \
    -t "$TOTAL" \
    -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
    -c:a aac -b:a 192k -ac 2 \
    -movflags +faststart \
    "$OUT_DIR/realpeep-demo-90s-captions.mp4"

ffmpeg -hide_banner -loglevel warning -y -ss 26 -i "$OUT_DIR/realpeep-demo-90s.mp4" -frames:v 1 "$OUT_DIR/poster.jpg"

for f in realpeep-demo-90s.mp4 realpeep-demo-90s-captions.mp4; do
    printf '%s: ' "$f"
    ffprobe -v error -show_entries format=duration:stream=width,height,codec_name -of default=nw=1 "$OUT_DIR/$f" | tr '\n' ' '
    echo
done
