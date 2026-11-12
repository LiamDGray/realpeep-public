# Real client-side proof (prototype)

**Page:** `/demo/real-proof.html`  
**Code:** `demo/real-proof.js`, `demo/vendor/zk-kit.bundle.js`  
**Clip:** `demo/assets/public-domain/nasa-earth-iss-5s.mp4`  
**Status:** working prototype, measured on desktop Chrome; **not** hardware-attested.

## What it actually does

1. Captures 20 frames from a public-domain NASA clip or the local webcam at 320×180.
2. SHA-256 hashes each frame and builds a binary Merkle root with WebCrypto.
3. Maps the root into the BN254 scalar field.
4. Signs that field element with a **demo** EdDSA-Poseidon key derived in JavaScript
   (`@zk-kit/eddsa-poseidon`, MIT).
5. Builds the witness input for `circuit/scrubber.circom` and generates a Groth16
   proof with `snarkjs` (WASM, CPU) **in a Web Worker**, so the page can paint
   progress and stay responsive.
6. Verifies the proof with the committed verification key.

The proof is real. The root of trust is not: the TEE key is a public demo key in
the page, the zkey is the repository’s development artifact, and the mesh and
OpenTimestamps layers are absent.

## Measured cost (this machine, Intel ThinkPad-class CPU)

Chrome headless, 20 frames at 320×180, public-domain clip.

**Main-thread proof (lower bound, page freezes):**

| Stage | Time |
|---|---|
| Capture frames | 2,463 ms |
| SHA-256 frame chain + Merkle root | 1 ms |
| Demo EdDSA signature + witness | 73 ms |
| **Groth16 prove (browser WASM)** | **1,832 ms** |
| Verify | 34 ms |
| **Total** | **4,432 ms** |

**Worker proof (current page, UI responsive):**

| Stage | Time |
|---|---|
| Capture frames | ~2,500 ms |
| SHA-256 frame chain + Merkle root | 1–2 ms |
| Demo EdDSA signature + witness | 120–180 ms |
| **Groth16 prove in worker** | **~5,000–6,100 ms** (5.7 s first run, 5.0 s warm) |
| Verify | 80–200 ms |
| **Total** | **~8.4–9.0 s** |

In the main demo’s embedded real-proof panel, the same pipeline measured
**9.8 s total** (prove 7.2 s) with the page’s animations running. The worker
keeps the UI alive, but it is roughly **2.5–3× slower** than the main-thread
proof on this machine. That is a real tradeoff, not a rounding error.

Separate proof-only benchmark with Chrome CPU throttling (main thread, same circuit/zkey):

| CPU throttle | Prove | Verify | JS heap |
|---|---:|---:|---:|
| 1× | 1.90 s | 25 ms | ~97 MB |
| 4× | 4.16 s | 76 ms | ~97 MB |
| 6× | 5.98 s | 114 ms | ~97 MB |
| 8× | 8.16 s | 141 ms | ~97 MB |

Node (same machine) proves in 1.82 s and verifies in 18 ms, so the WASM path is
close to native.

## Is a typical client fast enough?

- **Desktop/laptop:** yes. Main-thread proof is ~1.8 s; the worker version is
  ~5–7 s but keeps the page responsive.
- **Modern phone (Pixel 8a class):** likely a few seconds for a main-thread
  proof and somewhat longer in a worker. The circuit is only 19,006 constraints
  and the heap is ~97 MB. A main-thread estimate is ~5–10 s total; worker
  overhead is the open question. This is an estimate, not a device measurement.
- **Low-end phone (Moto G7 Power / 3 GB):** likely 8–20 s main-thread and may be
  memory constrained. This is exactly the device to benchmark before claiming
  support.
- **Real-time 30 fps capture + proof per frame:** no. Hash/sign at capture time,
  prove once over a Merkle root, and show progress. The current demo is
  proof-per-clip, not proof-per-frame.

The browser main thread blocks during `fullProve`; a production version should
run the prover in a Web Worker and report progress. The prototype does not.

## Is it worthwhile?

Yes, as a **vertical slice** and a performance benchmark:

- It makes the demo honest and impressive: real frames, real hash chain, real
  EdDSA signature, real Groth16 proof, real verification, all in the tab.
- It measures the dominant cost for the on-device ZK slice (prove time, heap)
  before committing to Android native/WASM work.
- It gives Alignerr/grant reviewers something they can run themselves.

It is **not** a product root of trust. Do not use it as evidence that a device
is hardware-attested, and do not claim court admissibility from this page.

## Reproduce

```bash
# Serve the repo root (the page loads /demo/circuit-artifacts and the clip)
python3 -m http.server 8080
# → http://localhost:8080/demo/real-proof.html
```

Click **Prove the public-domain clip** or **Use webcam**. The page needs network
access for the pinned `snarkjs` CDN script; everything else is local.

## Known gaps

- Demo TEE key is in JavaScript; a real implementation needs Android Keystore /
  StrongBox or a secure enclave, and a device attestation chain.
- The committed zkey is a development trusted setup; production needs a
  documented ceremony or a universal setup.
- Frame roots use SHA-256 and are reduced mod the BN254 scalar field; this is a
  demo commitment, not a formal hash-to-field construction.
- Mesh co-location and OpenTimestamps are not included.
- The worker keeps the UI responsive but is ~2.5–3× slower than a main-thread
  proof here. A production client should benchmark both on the target device and
  consider a native prover (rapidsnark) for the mobile path.
- No mobile device benchmark yet; Pixel 8a and Moto XT1955-5 are the targets.

## Licensing

- `@zk-kit/eddsa-poseidon`, `poseidon-lite`: MIT (vendored bundle).
- `snarkjs`: GPL-3.0, loaded from a pinned CDN URL at runtime; not vendored into
  the Apache-2.0 tree. Review this before distributing a production bundle.
- NASA clip: public domain / NASA media guidelines; see
  `demo/assets/public-domain/ATTRIBUTION.md`.
