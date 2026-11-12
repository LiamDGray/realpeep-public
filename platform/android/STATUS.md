# Android app status

**Last verified:** 12 November 2026 on the Moto G7 Power (Android 10)  
**Build:** `./gradlew :app:assembleDebug` — success (debug APK ~64 MB)  
**Unit tests:** `./gradlew :app:testDebugUnitTest` — **49 tests, 0 failures**  
**Instrumented tests:** 2 on the Moto (PIN state, session overwrite) — see [docs/DEVICE_BASELINE.md](../../docs/DEVICE_BASELINE.md)  
**CI:** `.github/workflows/android.yml` builds the debug APK and runs the unit tests on changes under `platform/android/`

Toolchain: `minSdk 29`, `compileSdk 34`, `targetSdk 34`, AGP 8.5.2, Kotlin 2.0.10,
Gradle 8.7, JDK 21, CameraX 1.3.4, Compose BOM 2024.06.00.

> This is a **working capture scaffold**, not a production provenance client. It
> captures camera/audio/BLE data and hashes it, but it does **not** generate a ZK
> proof, use a hardware-backed key, or implement the duress mode end to end.

## Implemented

- Jetpack Compose single-activity UI with a PIN dialog and record/stop flow.
- CameraX preview plus `ImageAnalysis` per-frame JPEG hashing into `HashChain`
  (SHA-256 chain + Merkle root).
- `AudioRecord` 44.1 kHz mono PCM capture in 100 ms chunks into a separate
  `HashChain`.
- BLE advertising and scanning with Ed25519-signed beacons (extended
  advertising) plus a 21-byte legacy fallback, a Bloom filter, and observation
  bundles. Extended capability is checked from the controller, not the API level.
- Android Keystore-backed AES-256-GCM encrypted offline storage.
- BouncyCastle Ed25519 software keys (`EphemeralKey`) and PIN-derived keys
  (`DuressKeys`, 8-bit marker, PBKDF2 100k).
- JVM unit tests for hash chain, audio chunking, duress key format, Gold codes,
  Bloom filter, frame chain, and PIN validation; two instrumented tests for the
  PIN flow and session overwrite.
- Installation-wide, encrypted key-derivation salt (Android Keystore-backed
  preferences) so a PIN can be re-derived after a process restart.

## Not implemented

- On-device Circom/Groth16 proof generation, witness generation, or verification.
- Android Keystore/StrongBox hardware attestation; the current keys are software
  BouncyCastle keys.
- A normal-vs-duress PIN UX; `Session.isDuress` is never set and the duress tag
  is not bound to a proof.
- Mesh verification, observation upload, MNR rollup, or OpenTimestamps anchoring.
- A real video recording file; frames are JPEG-compressed for hashing only.
- Rust/JNI core, native prover, or a device CI lane (the two instrumented tests
  are run manually on the Moto).

## Known defects found in this audit

1. **Audio chunks were always zero bytes.** `CHUNK_SIZE_BYTES` used
   `(100 / 1000).toInt()` = 0, so `AudioRecord.read(buffer, 0, 0)` never advanced
   the audio chain. Fixed; regression test added (8820 bytes per 100 ms).
2. **BLE advertisement size is now handled, but needs device validation.**
   The full 117-byte signed beacon uses `startAdvertisingSet` with
   `setLegacyMode(false)` and a capability gate:
   `isLeExtendedAdvertisingSupported` plus `leMaximumAdvertisingDataLength >=
   125`. One advertising set is kept alive and rotated with
   `setAdvertisingData`; the callback is not reused for a new start. If extended
   advertising is unsupported (the Moto G7 Power is Bluetooth 4.2), the
   advertiser falls back to a 21-byte **unsigned** short presence beacon that
   fits the 31-byte legacy packet. The scanner accepts both, and only uses the
   short beacon as a nonce trigger. Validate on the Moto and Pixel.
3. **PIN/key lifecycle is still demo-grade.** The installation salt is now
   generated once and stored in AndroidKeystore-backed encrypted preferences, so
   the same PIN derives the same key after restart. But there is still no
   normal/duress PIN enrollment, no attempt limiting, and only 10,000 PINs.
4. **Four-digit PIN is the only credential.** 10,000 possibilities; no rate
   limiting, secure element, or strong passphrase. Fine for a UX demo, not for
   the threat model.
5. **Frame hashing runs JPEG compression on the main executor** and builds NV21
   from YUV planes without handling row/pixel strides. It can jank and can
   produce device-dependent output; hash raw/deterministic frames on a background
   executor.
6. **Foreground service notification is not requested at runtime.** The
   manifest now declares `POST_NOTIFICATIONS`, and the service uses
   `ServiceCompat.startForeground(..., CONNECTED_DEVICE)`. On Android 13+ the
   notification may still be hidden if the user denies it; recording is not
   blocked.
7. **Target SDK is 34, not Android 17/API 36.** The Pixel 8a can run it in
   compatibility mode, but Play requirements, 16 KB page-size native libraries,
   and newer permission behavior are not configured.

## What to test on the Moto XT1955-5 (Android 10, 3 GB)

Run `scripts/android-probe.sh` first (read-only device/BLE/Chrome/thermal facts),
then `scripts/android-device-test.sh --js` to install, grant permissions, launch,
and set up `adb reverse`. Manual checklist:

- `./gradlew :app:installDebug`, grant camera/mic/BLE/location, record 10 s.
- Confirm `frameCount` and `audioChunkCount` both grow (audio now fixed).
- Confirm BLE advertises and scans with a second device; expect the 117-byte
  legacy advertisement to fail until defect 2 is fixed.
- Measure camera + audio + BLE concurrency: 3 GB RAM, Snapdragon 632, thermal
  throttling.
- For the JS baseline, serve the real-proof page over `adb reverse tcp:8080
  tcp:8080` and open `http://localhost:8080/demo/real-proof.html` in Chrome;
  record prove time, memory, and whether the tab is killed.

## Rust core: recommended shape

A shared Rust core is a good fit for the deterministic primitives, but **do not
rewrite the circuit or the prover first**.

```
realpeep-core (Rust)
  ├── frame: SHA-256 frame chain, Merkle root, canonical transcript
  ├── duress: tag derivation/verification (once the v0.1 spec is fixed)
  ├── bundle: versioned serialization/parsing + verification
  ├── dsp: Gold code / matched filter primitives (optional)
  └── ffi:
      ├── wasm-bindgen  → browser primitives
      └── UniFFI/JNI    → Android/Kotlin
```

Keep the Circom circuit and zkey as the source of truth. For native proving,
evaluate **rapidsnark** (mature C++ prover) or `ark-circom` (Rust) against the
committed zkey; do not hand-roll Groth16 or EdDSA-Poseidon. The current browser
prover already works; the Rust core is most valuable for eliminating drift
between Python, JS, and Kotlin and for native frame/transcript performance.

Suggested order:

1. Validate the extended/short BLE paths on the Moto and Pixel, then add the
   normal/duress PIN enrollment and an instrumented smoke test.
2. Extract the Rust core for frame hash/Merkle/transcript/duress tag; add shared
   test vectors against Python/JS/Kotlin.
3. Add UniFFI/JNI bindings to Android and wasm-bindgen to the browser.
4. Benchmark native vs snarkjs proof on the Pixel 8a and Moto before porting the
   prover.
5. Only then choose rapidsnark vs ark-circom for native proving.

Rust risks: field endianness/Poseidon constants, zkey compatibility, NDK/16 KB
page alignment, binary size, and GPL boundaries around circomlib/snarkjs.
