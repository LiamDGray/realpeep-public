# Native Execution Plan

**Started:** 12 November 2026  
**Scope:** Pixel 16 KB compatibility → mixed-mesh device dedup → duress v0.1 →
Rust/JNI native core. rapidsnark remains an evidence-gated follow-up.

This plan is deliberately ordered so each phase is shippable on its own and
raises the credibility of the native artifact without overstating it.

## Phase 1 — Pixel 16 KB compatibility — **Done**

**Problem:** Pixel 8a/Android 17 warns that
`lib/arm64-v8a/libimage_processing_util_jni.so` is not 16 KB aligned. CameraX
1.3.4 ships the native library; the app otherwise runs.

**Work**
- Upgrade CameraX to the first release with 16 KB-aligned native libraries; if
  that requires compileSdk 35/36 and a newer AGP, upgrade those too.
- Remove or exclude CameraX image-processing native code if it is unused by the
  Preview + ImageAnalysis path, only if proven safe.
- Verify every packaged `arm64-v8a` LOAD segment has `Align 0x4000` with
  `readelf -lW`, and no 16 KB warning appears on the Pixel.
- Add a CI/device check for alignment.

**Acceptance:** Pixel 8a launches the debug and release APK with no 16 KB
compatibility warning; camera preview and frame hashing still work; Moto still
builds/installs.

## Phase 2 — Stable mesh device tag — **Done**

**Problem:** `BleScanner` counts unique nonces as devices. It only shows 1 today
because the short beacon is static; rotating beacons would inflate the count.

**Work**
- Add a 4-byte stable `deviceTag` (truncated SHA-256 of the session public key)
  to the short beacon. Keep the full beacon's public key.
- Deduplicate observations by tag/public key; keep the Bloom filter for nonces.
- Add unit tests for tag derivation, short-beacon size/round-trip, and dedup.
- Retest Moto + Pixel: both must show `Mesh: 1` after multiple rotations.

**Acceptance:** two-device test with beacon rotation still shows one device per
peer; unit tests cover the tag and size budget.

## Phase 3 — Duress v0.1 — **Done (Python reference)**

**Problem:** current Python/JS duress code uses an 8-bit marker, deterministic
nonce reuse, no transcript binding, a client-side notary secret, and no
threshold. It is a demo, not a protocol.

**Work**
- Write the v0.1 spec with a canonical transcript hash, per-notary tag/nonce,
  2-of-3 threshold, one-time/replay handling, and explicit demo-only caveats.
- Implement the Python reference library and tests: normal/duress generation,
  threshold detection, transcript binding, replay rejection, false-positive
  analysis.
- Add a JS demo path only if it can share test vectors with the Python
  reference; otherwise keep the demo clearly labelled as a simulation.
- Do not claim indistinguishability or novelty beyond the design memo.

**Acceptance:** all duress tests pass; a normal session is not flagged; a
duress session is flagged by ≥2 of 3 notaries; replay is rejected; docs state
the remaining gaps.

## Phase 4 — Rust/JNI native core — **Done (arm64)**

**Problem:** the Android app hashes frames in Kotlin; the Rust core is not wired
into the app. This is the native-credibility artifact.

**Work**
- Add `aarch64-linux-android`/`armv7-linux-androideabi` Rust targets and NDK.
- Build `realpeep-core` as a `cdylib` with a small JNI surface for SHA-256 frame
  chain and Merkle root (plus transcript hash where practical).
- Add a Kotlin `NativeCore` loader with a safe fallback to the Kotlin
  implementation; use it in `HashChain` or a parallel benchmark path.
- Add JVM/device tests comparing Rust vectors with Kotlin/Python.
- Verify 16 KB LOAD alignment and ABI packaging; benchmark per-frame cost.

**Acceptance:** app loads the native library on Pixel and Moto, frame/audio
counts and hashes match the Kotlin reference, and the 16 KB check passes.

## Phase 5 — rapidsnark decision

Only after Phases 1–4:
- Compare Pixel/Moto JS proof with a rapidsnark JNI spike.
- Decide by measured latency/memory/complexity and licensing, not by novelty.
- If not justified, document the decision and keep the native core as the
  native deliverable.

## Out of scope / non-claims

- No claim that the 4-digit PIN, client-side notary key, or demo TEE key is a
  security boundary.
- No claim of 1990s credentials; the artifact itself is the evidence.
- No production Android 17 claim until the 16 KB warning is gone.
