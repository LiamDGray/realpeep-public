# Native prover decision memo

**Date:** 11 November 2026  
**Status:** research complete; **defer rapidsnark** (decision 12 Nov 2026)  
**Scope:** Android native proving, browser WASM, and the shared Rust core

## Decision (12 November 2026)

**Do not integrate a native Groth16 prover in this cycle.** The Pixel 8a runs the
warm browser proof in **4.7 s total / 2.1 s prove** (Moto: ~11 s / ~7.7 s), and
the native-code credibility artifact is now the Rust/JNI core. Adding rapidsnark
would mean LGPL compliance, JNI plus zkey/witness plumbing, and a new native ABI
for a demo that already completes in under five seconds on the fast target.
Revisit if a target exceeds ~10 s warm, if proving must be offline/no-JS, or if a
production Android client requires it. The Rust core can stay behind the same
`Prover` boundary.

## Bottom line

- **Android native:** use **rapidsnark** (LGPL-3.0) through JNI. It consumes the
  existing `.zkey` and a `.wtns` witness, so it does not require changing the
  Circom circuit. Use `circom-witnesscalc` for witness generation, or snarkjs
  for the first spike.
- **Browser WASM:** keep **snarkjs 0.7.6** in one **long-lived worker**, with
  the wasm/zkey preloaded. The old “worker is 2.5–3× slower” number was an
  artifact of creating a new worker and reloading artifacts per proof; the
  corrected warm number is ~1.5 s prove / ~4.2 s total.
- **Shared Rust core:** Rust for frame hashing, Merkle, canonical transcript,
  duress tag, bundle serialization, and FFI. Do **not** rewrite the prover in
  Rust first. Keep a `Prover` boundary with snarkjs (web) and rapidsnark
  (native) backends; treat `ark-circom` as a pure-Rust fallback.
- **Do not** port rapidsnark to WASM or build a custom arkworks WASM prover for
  this 19k-constraint circuit. The browser path is already fast enough to test
  on the Moto; native is for the Android app, not the browser.

## Artifact facts

- `demo/circuit-artifacts/scrubber.zkey` is zkey **version 1**, 10 sections,
  `nVars=19026`, `nPublic=3`, `domainSize=32768`.
- Max constraint index 19009; `19009 - 3 = 19006` constraints, matching the
  circuit.
- `snarkjs.zKey.exportVerificationKey(zkey)` matches the committed
  `verification_key.json` (nPublic=3, IC length 4).
- No `.r1cs` is committed; only wasm, zkey, and vkey. This matters for
  `ark-circom`, which wants an `.r1cs`.

## Options

### rapidsnark (recommended for Android)

- C++ prover with a small C API; consumes `.zkey` + `.wtns` and emits proof and
  public-signal JSON.
- Upstream has Android build scripts; `iden3/android-rapidsnark` is the wrapper.
  It targets arm64-v8a/x86_64, minSdk 24, and has 16 KB page-size support.
- zkey is `mmap`ed, so the 9.2 MB file is not copied into the Java heap.
- Mopro's Android benchmarks show rapidsnark roughly 13–15× faster than snarkjs
  on several circuits. Expect a similar order for this circuit, but measure on
  the Moto and Pixel.
- Pin a tag/commit: the project is still 0.0.x (v0.0.8 released 2026-01-07).
- **License:** LGPL-3.0. Dynamic linking via JNI is the intended path; provide
  notices, source, and relinkability. Static linking is a harder compliance
  question.

### ark-circom / ark-groth16 (Rust fallback only)

- Reads the section-based zkey v1 layout and can run the same wasm through
  Wasmer, but `CircomConfig` also wants an `.r1cs`.
- Proof compatibility is not automatic: use `CircomReduction` /
  `create_proof_with_reduction`; plain `Groth16::prove` with a snarkjs zkey
  produced proofs that did not verify.
- G2 tuple ordering (`c1` first) and snarkjs JSON output are compatibility traps.
- Cold zkey load has been reported as slow; benchmark, do not assume.
- WASM/Wasmer is described upstream as hacky and slow; not a production browser
  path.
- **License:** MIT OR Apache-2.0.

### circom-witnesscalc

- Compiles the Circom source to its own graph and produces a standard `.wtns`.
- Does not consume `scrubber.wasm`; it replaces witness generation.
- Native Android/iOS builds are documented; not a browser library.
- Pairs well with rapidsnark. The build tool uses the GPL circom compiler at
  build time; keep it build-time-only and review the generated graph licensing.
- **Runtime license:** MIT OR Apache-2.0.

### snarkjs in WebView/Node

- Current browser baseline; 1.8 s main-thread, ~1.5 s warm worker, ~97 MB heap
  on desktop.
- Fine for CI and the Moto baseline. In a WebView it adds GPL bundling, 12 MB of
  assets, and WebView memory pressure.
- First optimization is a long-lived worker, already implemented; measure before
  concluding it is too slow.

### Custom Rust/WASM prover

- Would need zkey parsing, witness handling, MSM/FFT, and a snarkjs-compatible
  JSON serializer.
- `ark-circom`'s WASM path already depends on Wasmer-in-WASM and is not a
  production path.
- At 19k constraints, snarkjs's warm worker is competitive; a custom prover adds
  size and weeks of work without a clear win.

## Licensing notes (engineering assessment, not legal advice)

- circom, circomlib, snarkjs: **GPL-3.0**. The circuit includes circomlib; treat
  the compiled wasm (and conservatively the zkey) as GPL-covered. CDN loading
  reduces but does not eliminate combined-work questions.
- rapidsnark: **LGPL-3.0**; dynamic JNI linking is intended, with notices,
  source, and relinkability.
- ark-circom/arkworks: MIT OR Apache-2.0.
- circom-witnesscalc runtime: MIT OR Apache-2.0; its build tool uses GPL circom.
- A proprietary app needs a licensing review before shipping.

## Verification plan

1. **Freeze artifacts:** pin circom 2.1.4 + snarkjs 0.7.6; record SHA-256 of
   wasm/zkey/vkey; confirm zkey version 1, nVars 19026, nPublic 3, domain 32768.
2. **vkey integrity:** export vk from zkey and diff against the committed vkey.
3. **Witness parity:** use the known-good input in
   `circuit/tests/test_scrubber.js`; generate `.wtns` with snarkjs and
   circom-witnesscalc; compare witness values and public signals.
4. **Cross-prover matrix:** prove with snarkjs, rapidsnark CLI, and an
   ark-circom harness; verify every proof with every verifier. Check public
   signal order and G2 formatting.
5. **Negative tests:** tampered proof, wrong public signal, invalid signature,
   wrong Merkle root, wrong witness length.
6. **Devices:** Moto XT1955-5 (Android 10, 3 GB) and Pixel 8a (Android 17).
   Measure cold/warm witness, prove, verify, peak PSS, APK size, tab kill, and
   thermal throttling; check 16 KB LOAD alignment with `readelf -lW`.
7. **Licensing gate:** SBOM and written review before shipping.

## Uncertainties

- No rapidsnark/ark-circom Android build or device benchmark was performed here.
- Speed ranges are extrapolated from Mopro's S23 Ultra benchmarks and desktop
  snarkjs numbers, not measured on the Moto/Pixel.
- circom-witnesscalc graph compatibility with this exact circomlib
  Poseidon/EdDSA circuit is untested.
- ark-circom's current cold zkey-load cost is unknown.
- Future zkey format changes are a risk for every non-snarkjs parser; pin
  versions and cross-verify.

## Sources

- [rapidsnark](https://github.com/iden3/rapidsnark)
- [android-rapidsnark](https://github.com/iden3/android-rapidsnark)
- [ark-circom](https://github.com/arkworks-rs/circom-compat)
- [circom-witnesscalc](https://github.com/iden3/circom-witnesscalc)
- [Mopro benchmarks](https://github.com/zkmopro/mopro/blob/main/docs/docs/performance.md)
- [snarkjs 0.7.6](https://www.npmjs.com/package/snarkjs/v/0.7.6)
- [Android 16 KB pages](https://developer.android.com/guide/practices/page-sizes)
