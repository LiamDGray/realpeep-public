# Native Limits Plan

**Started:** 12 November 2026  
**Scope:** close as many remaining Android/native limits as can be done and
tested with the Moto G7 Power (Android 10), an x86_64 emulator, and no Pixel 8a
during the run. Keep `targetSdk 34`.

## Assumptions

- The Pixel 8a is temporarily unavailable. The Moto is the Android 10 hardware
  target; an x86_64 emulator stands in for ABI/UI validation, not for StrongBox
  or real-device performance.
- Android 17 does not add a feature this slice needs. We keep `targetSdk 34`;
  the 16 KB compatibility fix is already done.
- The Rust core remains the source of truth for deterministic primitives. The
  Kotlin implementation remains the fallback for any ABI without a packaged
  library.
- The native Groth16 prover and in-circuit duress binding are artifact-changing
  projects. They are not faked; this plan records what is feasible now and what
  remains.

## Phase 1 — All Android ABIs — **Done**

- Add Rust targets `x86_64-linux-android`, `i686-linux-android`; keep arm64 and
  armv7.
- Build `librealpeep_core.so` for arm64-v8a, armeabi-v7a, x86_64, x86 with NDK
  r28c; keep 16 KB LOAD alignment on 64-bit ABIs.
- Package all four in `jniLibs`; verify each with `scripts/check-16kb.sh`.
- Make `NativeCore` availability per-ABI and keep the Kotlin fallback.

**Acceptance:** APK contains four ABIs; every 64-bit lib has `0x4000`
alignment; native tests pass on arm64 Moto and x86_64 emulator.

## Phase 2 — x86_64 emulator — **Done**

- Install an Android 10 (API 29) x86_64 system image + emulator.
- Boot headless with KVM, install the APK, run unit tests and
  `connectedDebugAndroidTest`.
- Verify the app loads `librealpeep_core.so` and hashes match Kotlin.

**Acceptance:** emulator boots; instrumented tests pass; camera/BLE may be
unavailable in the emulator and are not claimed.

## Phase 3 — TEE/StrongBox attestation — **Done (TEE on Moto; StrongBox pending Pixel)**

- Add a hardware-backed EC P-256 key in AndroidKeyStore; prefer StrongBox when
  the device reports it, fall back to TEE/secure hardware.
- Sign a canonical attestation payload containing the session ID and ephemeral
  Ed25519 public key; expose whether the key is inside secure hardware.
- Store the attestation/certificate chain with the session metadata and show a
  small status in the app.
- Add instrumented tests: key generation, sign/verify, hardware flag, and
  fallback behavior.

**Acceptance:** on the Moto, a hardware-backed/TEE key signs and verifies; the
app records the attestation; the test reports whether StrongBox is available.
This binds a hardware attestation to the session key but does **not** replace
the Ed25519 proof or claim the demo TEE key is a hardware root.

### StrongBox emulator

There is no official Android Emulator StrongBox. On an emulator the Keystore
provider is software/TEE-emulated; `setIsStrongBoxBacked(true)` is not backed by
a StrongBox secure element, so the code falls back. AOSP Cuttlefish has a
virtual `secure_env`/keymaster implementation, but that is a virtual secure
environment, not a StrongBox-certified tamper-resistant element. StrongBox
therefore requires real hardware (the Pixel 8a) or a dedicated secure element;
we did not represent emulator/TEE behavior as StrongBox.

## Phase 4 — Remaining limits — **Mock OTS done; real OTS remains**

Record, rather than fake:

- **Native Groth16 prover:** still deferred. The JS prover is 4.7 s warm on the
  Pixel and 11–13 s on the Moto; rapidsnark needs LGPL/JNI/witness/zkey work and
  is not justified by the current demo.
- **In-circuit duress binding:** the v0.1 envelope is signed but the circuit does
  not consume a duress tag. Adding a public input and regenerating the dev zkey
  is a separate circuit/trusted-setup change.
- **Mesh verification/OTS:** full extended beacons now verify their Ed25519
  signature; the short legacy beacon remains unsigned. A mock OpenTimestamps
  calendar/client exists and is device-tested; real `.ots`/Bitcoin anchoring
  remains future work.
- **Android 17 target:** 16 KB is fixed; `targetSdk 34` stays.
- **Compose UI test on API 37:** skipped on Pixel due Compose 1.6 harness; update
  separately when the toolchain moves.
