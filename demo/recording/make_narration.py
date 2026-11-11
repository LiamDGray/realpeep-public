#!/usr/bin/env python3
"""Generate the 90-second demo narration with Kokoro-82M (Apache-2.0, CPU).

Kokoro is run through kokoro-onnx + ONNX Runtime, so no GPU is required. The
model files are cached outside the repository and checked against pinned
SHA-256 digests. The script writes one WAV per segment plus a timeline JSON
that the Playwright recorder follows.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import urllib.request
from pathlib import Path

import numpy as np
import soundfile as sf

MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.int8.onnx"
VOICES_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin"
MODEL_SHA256 = "ae315a79b623f244700e4afb9246c46a26066782e049ba174bf3ba433970ee9c"  # pragma: allowlist secret
VOICES_SHA256 = "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d"  # pragma: allowlist secret


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(url: str, dest: Path, expected: str) -> None:
    if dest.exists() and sha256(dest) == expected:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    print(f"==> downloading {url}")
    with urllib.request.urlopen(url) as response, tmp.open("wb") as f:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)
    digest = sha256(tmp)
    if digest != expected:
        tmp.unlink()
        raise SystemExit(f"checksum mismatch for {dest}: {digest} != {expected}")
    tmp.replace(dest)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="demo/recording/narration.json")
    parser.add_argument("--out-dir", default="demo/recording/out")
    parser.add_argument("--model-dir", default=os.environ.get("KOKORO_MODEL_DIR", "demo/recording/.cache"))
    args = parser.parse_args()

    config = json.loads(Path(args.config).read_text())
    out_dir = Path(args.out_dir)
    model_dir = Path(args.model_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    model = model_dir / "kokoro-v1.0.int8.onnx"
    voices = model_dir / "voices-v1.0.bin"
    fetch(MODEL_URL, model, MODEL_SHA256)
    fetch(VOICES_URL, voices, VOICES_SHA256)

    from kokoro_onnx import Kokoro

    kokoro = Kokoro(str(model), str(voices))
    sr = int(config.get("sample_rate", 24000))
    voice = config.get("voice", "af_heart")
    speed = float(config.get("speed", 1.0))

    timeline = []
    cursor = float(config.get("pre_roll_seconds", 0.0))
    audio_parts: list[np.ndarray] = []
    for segment in config["segments"]:
        text = " ".join(segment["text"].split())
        print(f"==> {segment['id']}: {len(text)} chars")
        samples, sample_rate = kokoro.create(text, voice=voice, speed=speed, lang="en-us")
        if sample_rate != sr:
            raise SystemExit(f"unexpected sample rate {sample_rate}, expected {sr}")
        samples = np.asarray(samples, dtype=np.float32)
        wav_path = out_dir / f"{segment['id']}.wav"
        sf.write(wav_path, samples, sr, subtype="PCM_16")

        duration = len(samples) / sr
        start = cursor
        end = start + duration
        timeline.append(
            {
                "id": segment["id"],
                "text": text,
                "audio": str(wav_path),
                "start": round(start, 3),
                "end": round(end, 3),
                "duration": round(duration, 3),
            }
        )
        audio_parts.append(samples)
        cursor = end + float(segment.get("pause_after", 0.0))

    total = cursor + float(config.get("tail_seconds", 0.0))
    full = np.zeros(int(round(total * sr)), dtype=np.float32)
    for item, part in zip(timeline, audio_parts, strict=True):
        offset = int(round(item["start"] * sr))
        full[offset : offset + len(part)] += part
    peak = float(np.max(np.abs(full))) or 1.0
    if peak > 0.99:
        full = full * (0.99 / peak)
    narration = out_dir / "narration.wav"
    sf.write(narration, full, sr, subtype="PCM_16")

    timeline_path = out_dir / "timeline.json"
    timeline_path.write_text(
        json.dumps(
            {
                "voice": voice,
                "speed": speed,
                "sample_rate": sr,
                "total_seconds": round(total, 3),
                "segments": timeline,
            },
            indent=2,
        )
        + "\n"
    )
    print(f"==> narration: {narration} ({total:.1f}s)")
    print(f"==> timeline:  {timeline_path}")
    if total < 85:
        print(f"warning: narration is only {total:.1f}s; add text or pauses", file=sys.stderr)
    if total > 100:
        print(f"warning: narration is {total:.1f}s; trim text", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
