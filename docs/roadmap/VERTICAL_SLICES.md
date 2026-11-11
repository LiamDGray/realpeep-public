# RealPeep — Vertical Slices

**Date:** 11 November 2026  
**Purpose:** replace the four-layer “build everything” plan with a sequence of
user-visible, testable, benchmarked slices.  
**Companion:** [Risk register](../business/RISK_REGISTER_AND_MITIGATIONS.md) · [Duress assessment](../research/DURESS_NOVELTY_ASSESSMENT.md) · [Roadmap](ROADMAP.md)

---

## 0. The rule

A slice is done only when **all** of the following exist:

1. A user-visible outcome (not a module, not a simulation).
2. A test suite that fails without the slice and passes with it.
3. A number from the target hardware (time, memory, false-positive rate, battery).
4. A reproducible demo on a clean checkout.
5. A short note on what is simulated and what is real.

The four-layer stack is a research programme. The project is built one slice at a time.

---

## 1. Dependency graph

```
Slice 0: green CI + reproducible build
   │
   ├── Slice 1: duress protocol v0.1  ← most differentiated, smallest
   │        │
   │        └── Slice 2: on-device ZK  ← second most valuable
   │                 │
   │                 └── Slice 3: single-device capture → proof → offline verify
   │                          │
   │                          ├── Slice 4: timestamp anchor
   │                          │
   │                          └── Slice 5: two-device acoustic co-location
   │                                   │
   │                                   └── Slice 6: C2PA sidecar / interop
   │                                            │
   │                                            └── Slice 7: pilot
```

Slices 1 and 2 can overlap in time (different skill sets), but neither should depend on
the mesh or the chain. The mesh is Slice 5, after a single-device product exists.

---

## 2. Target hardware matrix

| Device | OS | CPU / RAM | Role | Constraints |
|---|---|---|---|---|
| **Google Pixel 8a** | Android 17 | Tensor G3, 8 GB | Primary modern target | Current Android, Play Store WebView, CameraX, strong TEE |
| **Lenovo ThinkPad P51** | Ubuntu (24.04 LTS or current) | x86_64, 16–32 GB | Reference / CI / desktop verifier | Fastest baseline; useful for proof and DSP development |
| **Motorola XT1955-5 “ocean”** | Android 10 | Snapdragon 632, 3 GB | Low-end floor | `minSdk 29`; old WebView; memory pressure; no modern TEE APIs |

Rules:

- **Pixel 8a** is the “does it work on a current phone?” target.
- **Moto XT1955-5** is the “does it still work on the cheapest supported phone?” target.
  If a slice only meets its budget on the Pixel, it is not done.
- **ThinkPad P51** is the reproducible baseline and the verifier. It is not a substitute
  for a phone benchmark.

Record for every benchmark: device, OS build, app commit, circuit artifact hash, prover
version, elapsed time, peak RSS, battery/thermal notes.

---

## 3. Slice 0 — Green CI and reproducible build (done / ongoing)

**Outcome:** `just ci` is green on master and on PRs; a clean checkout can reproduce it.

**Work:**

- Fix the stale navigation tests and the lint drift. *(done)*
- Pin tool versions that affect CI semantics (Ruff; consider pinning pytest, Jest, Circom).
- Add a `status` check that the committed circuit artifacts match the source.
- Keep the e2e server on an ephemeral port and fail fast if the browser cannot launch.
- Do **not** add Android to CI until Slice 2 defines the Gradle/device matrix; a broken
  Android job would hide the core CI signal.

**Acceptance:** red on a deliberately broken test; green on master; no skipped suites
that are claimed as passing.

**Next:** add a CI job for the Android unit tests once the Android module is known to
build on a clean runner (likely after Slice 2 starts).

---

## 4. Slice 1 — Duress protocol v0.1 (3–4 weeks)

**Why first:** it is the most differentiated part of the architecture, it is smaller than
on-device ZK, and it can be evaluated without the mesh or the chain. It is also the
easiest place to get someone hurt through a false positive, so it must be built carefully.

**Outcome:** a user can create a normal or duress session; both produce a publicly valid
proof bundle; a notary (2-of-3) detects duress with negligible false positives; an
observer without the notary key cannot tell the difference, including across repeated
proof generation.

### 4.1 Design fixes before implementation

The current prototype has an 8-bit marker, a deterministic reusable nonce, no transcript
binding, a client-side notary secret in the demo, and no notary service. See
[the duress assessment](../research/DURESS_NOVELTY_ASSESSMENT.md). The slice starts by
fixing those, not by polishing the UI.

Minimum design:

- 32-bit or stronger tag (target false positive ≤ `2^-32`; 64-bit preferred if the
  performance budget allows).
- One-time tag per session, bound to a canonical transcript hash
  `H(payload_hash || ephemeral_pubkey || merkle_root || witness_set || timestamp || version)`.
- No nonce reuse; no runtime search that leaks timing. Precompute a tag pool in the
  secure element, or use a constant-time construction.
- Threshold notary (2-of-3), key rotation, audit log, indistinguishable responses.
- Tag bound to the ZK proof by a public input, a signature, or an envelope proof.
- Argon2id (or a documented, current password KDF) for passphrase-derived keys; specify
  salt and parameter storage.
- Explicit “simulation only” labels on the demo; remove the hard-coded notary secret.

### 4.2 Implementation tasks

| # | Task | Evidence |
|---|---|---|
| 1 | Failing tests for tag size, no reuse, transcript binding, false-positive budget | Red pytest |
| 2 | Tag construction + canonical transcript hash | Green pytest + test vectors |
| 3 | Tag pool / secure storage (Android Keystore or StrongBox where available) | Android unit test + Pixel/Moto run |
| 4 | Notary service (2-of-3) with identical responses | API tests + timing distribution |
| 5 | Proof/envelope binding | Circuit or envelope test |
| 6 | Demo flow: normal vs duress, no visible difference | Browser e2e + screen recording |
| 7 | Safety review with a press-freedom / human-rights advisor | Written review |

### 4.3 Acceptance criteria

- 10,000 simulated normal sessions produce **zero** false positives at the chosen tag
  size (and the theoretical rate is documented).
- 1,000 duress sessions produce 1,000 detections.
- No tag repeats across 10,000 sessions.
- A captor who sees two proofs from the same user cannot distinguish normal from duress;
  a statistical test on the tag distribution reports no advantage beyond the stated bound.
- The notary’s response time and bytes are indistinguishable for normal and duress.
- The tag is invalid if any transcript field is changed.
- The notary cannot flag a user without a valid tag; a single notary cannot do it alone.
- Benchmark on Pixel 8a and Moto XT1955-5.

### 4.4 Publishable artifact

A workshop paper is plausible after this slice, not before. Target WPES, HotPETs, FOCI,
or a PETS short paper. The paper’s contribution is the coercion model and the
provenance-specific construction, not “duress passwords.”

**Kill / pivot:** if the false-positive budget cannot be met on the Moto without an
unacceptable UX cost, keep duress as a research prototype and do not ship it to at-risk
users.

---

## 5. Slice 2 — On-device ZK proof generation (4–6 weeks)

**Why second:** it unlocks the core “real hardware, not a deepfake” claim, and the circuit
is already small enough to be plausible on a phone.

**Current facts (measured 11 Nov 2026):**

- `circuit/scrubber.circom` is a depth-20 EdDSA-Poseidon + Merkle inclusion circuit.
- `snarkjs r1cs info`: **19,006 constraints**, 19,026 wires, 3 public inputs, 45 private
  inputs.
- Committed demo artifacts: `scrubber.wasm` 2.6 MB, `scrubber.zkey` 9.2 MB (dev
  contribution; **not** a production trusted setup).
- The circuit has no duress tag and no binding to video frames yet. The proof is a
  building block, not the product.

**Outcome:** the Pixel 8a generates a Groth16 proof for the scrubber circuit locally,
with no network, in a stated time and memory budget; the ThinkPad verifies it offline; the
Moto meets a relaxed but explicit budget or is documented as unsupported.

### 5.1 Approach

1. **Baseline in Node/WASM on the ThinkPad.** Use the existing `snarkjs` path and a fixed
   witness. Record prove/verify time and memory. This is the reference number.
2. **Android, WASM first.** Load `snarkjs` + the `.wasm`/`.zkey` in a WebView or a JS
   engine. This is the fastest path to a real measurement; it also exposes WebView and
   memory limits on Android 10.
3. **Native fallback.** If WASM is too slow or memory-hungry on the Moto, evaluate
   `rapidsnark` (C++) via JNI, or a Rust prover. Do not port to Halo2/Nova yet; the
   circuit is small and Groth16 is adequate for the slice.
4. **Trusted setup.** The committed zkey is a dev artifact. For anything user-facing,
   run a documented MPC ceremony (even a small one) or use a universal-setup system.
   Label the dev artifact clearly and never reuse it for production claims.
5. **Witness pipeline.** Start with a deterministic fixture (no camera) so the benchmark
   is about proving, not capture. Slice 3 connects the camera.
6. **Artifact packaging.** Keep the zkey out of the APK if possible; download on first
   use with a pinned hash, or ship it compressed. Measure install size and first-run cost.

### 5.2 Acceptance criteria

| Metric | Pixel 8a (target) | Moto XT1955-5 (floor) | ThinkPad P51 (reference) |
|---|---|---|---|
| Prove time | ≤ 10 s | ≤ 30 s | ≤ 3 s |
| Verify time | ≤ 250 ms | ≤ 500 ms | ≤ 100 ms |
| Peak RSS during prove | ≤ 512 MB | ≤ 384 MB | ≤ 1 GB |
| Network required | none | none | none |
| Proof validity | verifies with the committed verification key | same | same |
| Reproducibility | artifact hash recorded | same | same |

If the Moto cannot meet the floor, document it as unsupported and keep `minSdk 29` for
the app but gate proof generation by a device capability check. Do not silently fail.

### 5.3 Risks

- **Trusted setup.** A dev zkey is not a security foundation. Plan the ceremony before
  any external claim.
- **WebView variance.** Android 10’s WebView may be old; Play Store updates help, but
  offline devices may not. Test the actual device.
- **Memory.** 9.2 MB zkey + 2.6 MB wasm + JS heap can exceed low-end budgets; measure,
  don’t assume.
- **Thermal throttling.** A 10 s proof may become 20 s on a hot phone; record temperature
  and battery.
- **Circuit scope.** The current circuit proves a TEE signature over a payload hash and
  Merkle inclusion. It does not prove “this video is real” or “this frame came from a
  camera.” Slice 3 must connect the payload to the capture pipeline.

**Kill / pivot:** if proving on the Moto is impossible within 60 s and 512 MB, ship the
Pixel/ThinkPad slice as a “desktop/verifier + modern phone” product and treat the Moto as
a verifier-only device.

---

## 6. Slice 3 — Single-device capture → proof → offline verify (3–4 weeks)

**Outcome:** a user records a short video on the phone; the app hashes frames into a
Merkle root, generates a ZK proof over the capture transcript, writes a self-contained
bundle, and a separate offline verifier accepts it. No mesh, no blockchain, no network.

**Work:**

- CameraX frame callback → SHA-256 per frame → Merkle tree (reuse the JS/Python logic;
  port to Kotlin and test against shared vectors).
- Capture transcript: device attestation key (or a clearly labelled dev key), frame
  count, timestamps, resolution, app version, nonce.
- Prove with Slice 2; write `bundle.json` + `proof.json` + `public.json` + a human-readable
  certificate.
- Offline verifier: a CLI and a small web page; no server dependency.
- Tamper tests: remove, insert, reorder, truncate frames; expect rejection.
- Device test: Pixel 8a and Moto (if supported).

**Acceptance:** a 10-second 720p clip produces a bundle that verifies on a different
machine with no network; all tamper tests fail closed; the certificate names exactly what
is and is not proven.

**Do not add:** mesh, OTS, C2PA, steganography. Those are later slices.

---

## 7. Slice 4 — Timestamp anchor (2 weeks)

**Outcome:** the bundle’s Merkle root is anchored with OpenTimestamps; the verifier checks
the OTS proof when online and degrades gracefully offline.

**Work:**

- Use the existing `realpeep/blockchain_anchor.py` and `demo/blockchain-anchor.js` as
  references; do not build a new timestamp protocol.
- Batch anchors; store the `.ots` proof next to the bundle.
- Verify against a Bitcoin block header; document the trust assumptions (calendar
  servers, Bitcoin finality).
- Test: an unanchored bundle is still valid but labelled “unanchored”; a tampered anchor
  fails.

**Acceptance:** a bundle verifies offline; when online, the OTS proof is checked and the
certificate reports the Bitcoin block height and time.

---

## 8. Slice 5 — Two-device acoustic co-location (6–8 weeks)

**Outcome:** two phones in the same room record each other’s CDMA chirps; the verifier
shows a co-location certificate with measured false-accept/false-reject rates in a real
room. This is the first real mesh milestone.

**Work:**

- Real audio capture (Oboe/AAudio on Android; `sounddevice` on Linux) at 48 kHz.
- Gold-code generation (proper preferred pairs, not `numpy.random.seed`), matched filter,
  and a robust peak detector. The current Python uses a PRN, not Gold codes; fix it.
- Two-device protocol: broadcast, receive, timestamp, sign the raw superposition or the
  extracted code (decide and document the trade-off).
- Room tests: quiet office, reverberant room, background music, distance sweep.
- Metrics: detection rate, false co-location rate, timing offset, battery impact.

**Acceptance:** ≥ 95% detection at 1–3 m in a quiet room; ≤ 1% false co-location on
unrelated recordings; documented performance in a reverberant room; two physical devices,
not a simulation.

**Kill / pivot:** if real-room performance is poor, publish the negative result and keep
co-location as a research feature; do not claim it in the product.

---

## 9. Slice 6 — C2PA sidecar / interop (3–4 weeks)

**Outcome:** a RealPeep bundle can be distributed alongside a C2PA-signed asset, and a
verifier can check both. No claim of C2PA conformance until the official tests pass.

**Work:**

- Sidecar bundle format with a stable version and content hash.
- C2PA sample assets: attach/reference the sidecar; test with `c2pa-rs` tooling where
  possible.
- Publish a short “C2PA + RealPeep” note; state clearly what each layer proves.
- One newsroom/fact-checker conversation; record the feedback.

**Acceptance:** a C2PA asset + RealPeep sidecar verifies end-to-end; a stripped-metadata
asset still verifies the RealPeep sidecar; the note is reviewed by someone outside the
project.

---

## 10. Slice 7 — Pilot (8–12 weeks)

**Outcome:** one newsroom or documentation team uses the single-device slice for a real
assignment; two-device co-location is optional. Collect consent, safety feedback, and
witness-yield metrics.

**Work:**

- Pilot agreement, consent forms, data-retention policy, incident response.
- Training session; a “bring one colleague” onboarding.
- Weekly metrics: sessions, second-device activation, verification success, failures,
  user-reported confusion.
- Safety review; no duress deployment to at-risk users until Slice 1 is audited.

**Acceptance:** at least 10 real sessions, 3 users, one verification by a third party, and
a written pilot report. Decide go/no-go for the mesh based on the risk register’s kill
signals.

---

## 11. What not to build yet

- A city-scale mesh, BLE + acoustic hybrid, or 50-device simulation as a product claim.
- A custom blockchain; use OpenTimestamps and existing anchors.
- Halo2/Nova/PLONK migration; the circuit is 19k constraints and Groth16 is adequate for
  the slice.
- Steganographic storage patterns; they multiply the threat surface and are not needed
  for the first product.
- iOS; Android + Linux verifier first.
- C2PA conformance claims before the tests pass.
- A standards body before two independent implementations.

---

## 12. Cadence and evidence

- **Weekly:** one demo, one benchmark, one test report. If a week produces only code and
  no number, the slice is drifting.
- **Per slice:** a short `docs/slices/<name>.md` with the outcome, measurements, what is
  simulated, and what changed in the risk register.
- **Per release:** artifact hashes, circuit source/artifact match, and a signed tag.
- **Per claim:** a link to the test or benchmark. The README is not allowed to be ahead of
  the evidence.

---

## 13. Immediate next actions (two weeks)

1. Merge the CI fix; confirm green on master. *(in progress)*
2. Write failing tests for the duress fixes (tag size, reuse, binding, false positives).
3. Remove the hard-coded notary secret from the demo and label it simulation-only.
4. Build the Node/WASM proving baseline on the ThinkPad; record time and memory.
5. Put the Pixel 8a and Moto XT1955-5 on the bench; record OS builds and available
   WebView/Keystore capabilities.
6. Draft the NLnet application around Slice 1 + Slice 2; use the risk register’s language.
