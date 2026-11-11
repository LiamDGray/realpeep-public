# 90-Second Demo Script

**Goal:** show the two things that are actually differentiated — anonymous capture and
duress signalling — without overclaiming what is built.

> **Recorded cut:** [demo-v1 release](https://github.com/LiamDGray/realpeep-public/releases/tag/demo-v1)
> (90.7 s, 1080p, narrated) · **Recording pipeline:** [DEMO_RECORDING.md](DEMO_RECORDING.md)

**Setup (2 minutes before):**

- Open <https://realpeep.pages.dev/demo/> in Chrome, 1440×900, 100% zoom.
- Close other tabs and notifications; mute system audio.
- Make sure the page is fully loaded and the PIN pad is visible.
- Have a terminal ready with the repo at `master` and `just ci-local` already run once.
- If you do not want your face in the recording, deny the camera prompt; the phone
  falls back to the simulated view. The recorded `demo-v1` cut uses `?camera=off`.
- Do **not** run the acoustic mesh or claim the mesh is real hardware.

---

## 0:00–0:10 — Frame it

> “RealPeep is a research prototype for anonymous proof of capture. It asks: can you prove
> a video came from real hardware, in a real place, without revealing which device — and
> can you signal coercion without the captor knowing? Two slices today: duress and ZK.”

---

## 0:10–0:20 — Show the surface

- Point at the nav: **Main Demo** / **Advanced: Hash Chain & Anchoring**.
- Point at the live URL and say: “Everything here is client-side; no server, no upload.”

---

## 0:20–0:35 — Capture flow

- Click PIN keys **1 2 3 4**.
- Click **Record**, wait one second, click **Stop**.
- Let the certificate card appear.
- Say: “This is the capture/hash-chain flow. If the browser camera is available, the
  phone shows a live preview — labelled as not hardware-attested. The mesh certificate
  is simulated; the frame hash chain and the verifier are real code.”

---

## 0:35–0:50 — Normal ZK proof

- Scroll to **Zero-Knowledge Transmission Pipeline**.
- Click **Normal passphrase**.
- Click **Run ZK Pipeline**; wait for the five-second animation.
- Switch to **Notary view**.
- Say: “The notary sees a valid proof and a clear result. No duress flag.”

---

## 0:50–1:05 — Duress proof

- Click **Duress passphrase**.
- Click **Run ZK Pipeline**; wait.
- Stay on **Captor view** first: the status is **VERIFIED**.
- Switch to **Notary view**: the **DURESS FLAG DETECTED** alert appears.
- Say: “The captor sees a valid proof. Only the notary sees the signal. That is the
  property the next slice has to make real.”

---

## 1:05–1:20 — Be honest about the gap

> “The demo uses a 4-bit marker, so it is not a security result. The code review documents
> the problems: 8-bit marker in the Python path, a reusable nonce, no transcript binding,
> and no threshold notary. The next slice replaces that with a 32-bit, one-time,
> transcript-bound tag and a 2-of-3 notary.”

---

## 1:20–1:30 — Prove the engineering

- Switch to the terminal.
- Show the CI badge or run `just ci-local`; point at the tail:
  - 119 Python tests, 170 Jest tests, 3 Circom tests, Ruff clean, Puppeteer e2e.
- Say: “The circuit is 19,006 constraints. Next is on-device proving on a Pixel 8a and a
  Moto G7 Power as the low-end floor.”

---

## What not to say

- Do not say “production-ready”, “unbreakable”, “anonymous” without qualification, or
  “the mesh proves co-location” — the current mesh is simulated.
- Do not claim the duress protocol is secure; the repo documents why it is not yet.
- Do not show the `ref/` PDFs or any third-party material; they are not part of the
  public artifact.

## 30-second version

> “RealPeep proves capture, not identity: a Circom ZK circuit, a frame hash chain, and a
> duress/coercion protocol. This demo shows a normal proof and a duress proof that look
> identical to a captor; only the notary sees the flag. The current demo is deliberately
> weak — the next slice makes the tag one-time and transcript-bound, then we prove on a
> Pixel 8a and a Moto G7 Power.”

## After the demo

- Link: [PORTFOLIO.md](../PORTFOLIO.md) for the five-minute brief.
- Task: `duress/v0.1` issue — transcript-bound one-time tag, threshold notary.
- Benchmark: on-device Groth16 proving on Pixel 8a / ThinkPad P51 / Moto XT1955-5.
