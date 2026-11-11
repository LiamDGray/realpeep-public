# Recording the 90-second demo (FOSS, CPU-only)

**Last verified:** 11 November 2026  
**Output:** `realpeep-demo-90s.mp4` (1920×1080, H.264/AAC, 90.7 s) and a
captioned variant.  
**Pipeline:** Kokoro-82M (TTS) → Playwright (screen recording) → ffmpeg (mux,
loudness, captions).

> The recording is a demo artifact, not evidence that the system is production-ready.
> The narration says so explicitly.

---

## 1. Why this stack

| Job | Choice | Why | Alternatives |
|---|---|---|---|
| TTS | **Kokoro-82M int8** via `kokoro-onnx` + ONNX Runtime | Apache-2.0 weights, 82M parameters, CPU-capable, 54 voices; good quality for English | **Piper** is faster and smaller, but the engine is GPL-3.0 and each voice has its own license; **Coqui XTTS v2** weights are non-commercial; **Chatterbox** is retired research |
| Screen recording | **Playwright** `recordVideo` | Deterministic browser-only capture, no display server, integrates with the scripted actions; Apache-2.0 | **OBS Studio** (GPL) for full desktop; **wf-recorder** on Wayland; **ffmpeg x11grab** on X11; **asciinema + agg** for terminal-only segments |
| Assembly | **ffmpeg** + libass | Mux, EBU R128 loudness, H.264/AAC, ASS/SRT captions, no GUI | Kdenlive/Shotcut for manual edits; not needed for a scripted 90 s cut |
| Captions | **ASS** burned-in + **SRT** sidecar | ASS lets us pin `PlayResX/Y` so captions are the right size at 1080p; SRT is portable/accessibility | Whisper alignment only if the narration is improvised; scripted TTS already gives exact timings |

The pipeline is **CPU-only**: Kokoro int8 runs on ONNX Runtime CPU; Playwright
records the browser; ffmpeg encodes with libx264. No GPU is required.

---

## 2. Pipeline

```
narration.json
   │  make_narration.py (Kokoro-82M int8)
   ▼
segment WAVs + timeline.json + narration.wav
   │  record_demo.mjs (Playwright + local static server)
   ▼
raw.webm (1600×900, VP9, cursor + lower-thirds)
   │  assemble.sh (ffmpeg)
   ▼
realpeep-demo-90s.mp4            (clean, lower-thirds)
realpeep-demo-90s-captions.mp4   (burned-in ASS captions)
narration.srt                    (sidecar)
poster.jpg
```

### Timing model

1. Generate the narration **first**.
2. Measure each segment's duration and write `timeline.json` with absolute
   `start`/`end` times.
3. The Playwright recorder reads the timeline and performs each action at its
   absolute start time (`at(seconds)`), so slow page loads or animations do not
   accumulate drift.
4. Add a **1 s pre-roll** before the first spoken word so the page can paint.
5. Mux with `-t <total>`; pad the last video frame if the recorder stops a little
   early.

---

## 3. Reproduce

### Install

```bash
# TTS (CPU)
python3 -m venv .venv-tts
. .venv-tts/bin/activate
pip install kokoro-onnx soundfile

# Playwright
cd demo/recording
npm ci
npx playwright install chromium
cd ../..

# ffmpeg with libx264, aac, libass
ffmpeg -version | grep -E 'libx264|libass'
```

The model files are ~109 MB (int8) + 27 MB (voices), cached outside the repository
and checked against pinned SHA-256 digests. `make_narration.py` downloads them on
first run.

### Render

```bash
# from the repo root, with the TTS venv active
just record-demo
# or:
demo/recording/render.sh /tmp/realpeep-demo
```

Environment variables:

- `KOKORO_PYTHON` — Python with `kokoro-onnx` (default `python3`)
- `KOKORO_MODEL_DIR` — model cache (default `demo/recording/.cache`)
- `PLAYWRIGHT_BROWSERS_PATH` — if Playwright browsers are not in the default cache
- `CHROME_BIN` — override the Chromium executable

### Files

| File | Purpose |
|---|---|
| `demo/recording/narration.json` | Voice, speed, pre-roll, segment text and pauses |
| `demo/recording/make_narration.py` | Kokoro synthesis, WAVs, timeline, mixed narration |
| `demo/recording/record_demo.mjs` | Playwright actions, cursor, lower-thirds, video |
| `demo/recording/evidence.html` | Local “green build / honest status” slide |
| `demo/recording/assemble.sh` | ffmpeg mux, loudnorm, ASS/SRT, poster |
| `demo/recording/render.sh` | End-to-end wrapper |
| `docs/DEMO_SCRIPT.md` | Human 90-second narration/click script |

---

## 4. Quality gates

- **Duration:** 90 ± 2 s (`ffprobe`).
- **Video:** 1920×1080, 30 fps, H.264 High, `yuv420p`, `+faststart`.
- **Audio:** AAC 48 kHz stereo, **−16 LUFS integrated**, true peak ≤ −1.5 dBTP
  (`loudnorm`). The RIAA/EBU R128 target is appropriate for web/social.
- **Captions:** soft `.srt` always; burned-in ASS variant at 1080p with
  `PlayResX: 1920`, `PlayResY: 1080`, top-aligned so it does not collide with the
  lower-third.
- **Visuals:** no black frames, no browser chrome, no OS cursor; a CSS cursor and
  click ripples are injected by Playwright.
- **Honesty:** the narration states the 4-bit demo marker and the simulated mesh;
  no “production”, “unbreakable”, or “anonymous” without qualification.
- **Review:** watch the full 90 s at 1× before publishing; check the first/last
  frames and the audio sync.

Useful checks:

```bash
ffprobe -v error -show_entries format=duration:stream=width,height,codec_name -of default=nw=1 out/realpeep-demo-90s.mp4
ffmpeg -hide_banner -i out/realpeep-demo-90s.mp4 -af ebur128=framelog=quiet -f null -
ffmpeg -hide_banner -i out/realpeep-demo-90s.mp4 -af volumedetect -f null -
ffmpeg -hide_banner -i out/realpeep-demo-90s.mp4 -vf blackdetect=d=0.2 -an -f null -
```

---

## 5. Screen-recording notes

**Browser-only demo:** Playwright's `recordVideo` is the best default. It records
exactly the viewport, works headless under Xvfb/CI, and does not capture desktop
notifications. It does **not** draw the OS cursor, so the recorder injects a CSS
cursor and click ripple via `addInitScript`; the same script adds the lower-thirds.

**Browser camera in the simulated phone:** when the phone pane is told to record,
it calls `getUserMedia({ video: true, audio: false })` and shows the local camera
inside the simulated phone. This is a **preview only**:

- The pane displays `Browser camera · preview only · not hardware-attested`.
- The frame is **not** fed into the TEE signature, the mesh, or the certificate.
- If the camera is missing, denied, or the page is not a secure context, it falls
  back to the original simulated viewfinder; the label says so.
- On stop, the last frame is frozen on screen and the tracks are stopped.
- `?camera=off` disables the camera entirely (no prompt, no fallback note). The
  Playwright recorder uses this for the deterministic cut.
- `?camera=auto` is the default for a live demo.
- To exercise the camera path deterministically, use Chromium's fake device:
  `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`.
- Do **not** publish a recording containing a real face or room without consent.
  The published `demo-v1` cut uses the simulated fallback on purpose.

**Full desktop or terminal:** use OBS Studio (interactive, GPL-2.0), `wf-recorder`
on Wayland, or `ffmpeg -f x11grab` on X11. For terminal-only segments, record with
`asciinema` and render to GIF/MP4 with `agg`; do not fake a terminal in HTML. The
90-second cut avoids a terminal by using a local evidence slide, which is honest
and reproducible.

**Avoid:** recording a 4K desktop and downscaling; recording browser chrome;
using the OS cursor without a highlight; burning captions with the default ASS
`PlayRes` (they will be enormous at 1080p — set `PlayResX/Y` explicitly).

---

## 6. TTS notes (CPU-only)

- Kokoro int8 on this CPU measured ~1.6× real time for the 90 s script (about
  2 minutes of synthesis). It is a batch job, not real-time.
- `af_heart` was used for the final cut. Kokoro voices are part of the
  Apache-2.0 model release; check the voice card if you redistribute the audio.
- `espeak-ng` is not required by this pipeline; `kokoro-onnx` handles G2P.
- Keep the narration **short and declarative**. The script is ~1,100 characters
  for 90 s; rushing TTS is worse than cutting a sentence.
- Do not clone a real person's voice for a public demo. Use a model voice.

Licenses:

| Component | License |
|---|---|
| Kokoro-82M weights | Apache-2.0 |
| `kokoro-onnx` | MIT |
| ONNX Runtime | MIT |
| Playwright | Apache-2.0 |
| Chromium | BSD-style |
| ffmpeg build | GPL/LGPL depending on build; output is not affected |
| DejaVu Sans (captions) | Bitstream Vera / public-domain-ish |
| RealPeep repo | Apache-2.0 |

---

## 7. Known limitations

- Playwright records the page, not the OS; there is no native cursor or window
  chrome. That is a feature for a clean product demo, but not a substitute for a
  full desktop recording.
- The evidence slide is local HTML, not a terminal capture. It shows the actual
  test counts and CI status, but it is a designed slide.
- The demo runs the **simulated** mesh and the **4-bit** browser duress marker.
  The narration says so; do not cut those lines out.
- The video is a communication artifact. The reproducible evidence remains
  `just ci-local` and the test suite.

---

## 8. Publishing

Publish the MP4 and SRT as a **GitHub Release asset** rather than committing an
11 MB binary to the repository. The release URL is stable and can be used in an
application or portfolio page.

```bash
gh release create demo-v1 \
  out/realpeep-demo-90s.mp4 \
  out/realpeep-demo-90s-captions.mp4 \
  out/narration.srt \
  out/poster.jpg \
  --title "RealPeep 90-second demo" \
  --notes "CPU-only Kokoro-82M narration + Playwright screen recording + ffmpeg."
```

---

## 9. References

- Kokoro-82M model card (Apache-2.0): <https://huggingface.co/hexgrad/Kokoro-82M>
- `kokoro-onnx` (MIT): <https://github.com/thewh1teagle/kokoro-onnx>
- Open-source TTS license comparison (Nov 2026): <https://www.cartesia.ai/learn/open-source-tts>
- Playwright video recording: <https://playwright.dev/docs/videos>
- FFmpeg `loudnorm`: <https://ffmpeg.org/ffmpeg-filters.html#loudnorm>
- EBU R128 / ITU-R BS.1770 loudness: <https://tech.ebu.ch/publications/r128>
- OBS Studio: <https://obsproject.com/>
- wf-recorder: <https://github.com/ammen99/wf-recorder>
- asciinema + agg: <https://docs.asciinema.org/manual/agg/>
