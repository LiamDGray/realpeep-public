# Native Hardening Plan

**Started:** 11 November 2026  
**Goal:** make the Android capture app runnable and measurable on the Moto
XT1955-5, and extract the shared deterministic primitives into Rust without
rewriting the Circom prover.

This is deliberately a **hardening slice**, not a four-layer rewrite.

## Decisions

1. **Test the JS proof on the Moto before porting the prover.** It is a cheap
   worst-case baseline for WebView/Chrome on a 3 GB device and may be sufficient
   for the demo.
2. **Fix the native capture path before adding ZK.** The audio chunk bug is
   fixed, and the BLE layer now uses extended advertising with a 21-byte legacy
   fallback. Both need validation on the Moto.
3. **Keep Circom/snarkjs as the proof source of truth.** Evaluate rapidsnark or
   ark-circom for native later; do not hand-roll Groth16 or EdDSA-Poseidon.
4. **Extract only deterministic primitives into Rust first:** frame hash chain,
   Merkle root, canonical transcript, and the duress tag placeholder. Compile to
   WASM and Android via `wasm-bindgen`/UniFFI once the vectors match.
5. **No duress claims until the v0.1 spec exists.** The Android app has PIN-
   derived keys but no normal/duress enrollment, threshold notary, or proof
   binding.

## Workstreams

| # | Work | Status | Acceptance |
|---|---|---|---|
| 1 | Audio chunk regression | **Done** | `CHUNK_SIZE_BYTES == 8820`; 100 ms chunks advance the chain; test added |
| 2 | PIN/key lifecycle | **Done (partial)** | installation salt stored in Keystore-backed prefs; same PIN re-derives after restart |
| 3 | Android CI | **Done** | `.github/workflows/android.yml` runs unit tests + `assembleDebug` on Android changes |
| 4 | Device test harness | **Done** | `scripts/android-device-test.sh` installs, grants permissions, launches, and can open the JS baseline via `adb reverse` |
| 5 | BLE advertisement size | **Implemented; needs device validation** | capability-gated extended advertising with one rotating set; 21-byte unsigned legacy fallback; scanner accepts both |
| 6 | Normal/duress PIN enrollment | **Next** | two PINs, explicit mode, no visible difference; still demo-grade until notary exists |
| 7 | Instrumented smoke test | **Next** | one `androidTest` that records 1 s, checks frame/audio counts, and exercises BLE callback |
| 8 | Rust core primitives | **Done (isolated)** | `rust/realpeep-core` with 20 tests, fmt/clippy clean; not wired to app |
| 9 | Rust CI | **Done** | `.github/workflows/rust.yml` runs fmt/clippy/test on `rust/**` |
| 10 | Rust FFI/WASM | **Planned** | UniFFI/JNI + wasm-bindgen; vectors match Python/JS/Kotlin |
| 11 | Native prover decision | **Research** | memo comparing rapidsnark / ark-circom / snarkjs; Android/WASM benchmark plan |
| 12 | Moto JS baseline | **Waiting on device** | prove/verify/total ms, heap, tab survival, thermal notes |

## Why these first

- The BLE advertisement size was a **functional blocker** for a two-device
  mesh test. It is now implemented (extended + short fallback), pending device
  validation; a UI-only run still says nothing about co-location.
- The audio chunk bug meant the audio chain could never advance; that would have
  made a device test look like a camera-only success.
- Android CI prevents the "it built in July" problem; the module had no build
  gate at all.
- The Rust crate is isolated so it cannot destabilize the app or the web demo.
  It gives us a place to agree on byte-level rules before any FFI work.

## Subagent usage

Three subagents were used because the tasks were independent:

- **Android BLE research** — extended advertising limits, scan behavior, Kotlin
  sketch; no file edits.
- **Rust core scaffold** — isolated `rust/realpeep-core` crate and tests; edited
  only that directory.
- **Native prover research** — rapidsnark vs ark-circom vs snarkjs, licensing
  and compatibility; no file edits.

We did **not** let subagents edit the same Android files concurrently. Android
integration stayed with the main agent.

## Next order

1. Land the BLE extended/fallback implementation and scan reassembly.
2. Add the normal/duress PIN enrollment **without** claiming security.
3. Add one instrumented test; run it on the Moto.
4. Run the JS baseline on the Moto and record numbers.
5. Wire Rust primitives into Android/wasm behind a feature flag.
6. Choose a native prover only after the device benchmark.

## Out of scope

- Full Rust rewrite of the app.
- Native Groth16 prover before the BLE/PIN/device baseline.
- Mesh verification/upload/OTS in this slice.
- Production key management or a claim that the 4-digit PIN is secure.
