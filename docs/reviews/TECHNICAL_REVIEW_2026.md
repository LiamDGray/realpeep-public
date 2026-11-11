# RealPeep — Comprehensive Technical Review

**Date:** June 2026  
**Reviewer:** Hermes Agent  
**Project:** ~/src/realpeep  
**Focus:** Architecture completeness, literature coverage, implementation status, and gap analysis

---

## 1. Executive Summary

RealPeep is a **zero-trust architecture for anonymous video provenance** with five interlocking defense layers:

| Layer | Purpose | Status |
|-------|---------|--------|
| **ZK Identity Scrubbing** (Circom) | Prove video came from real hardware without revealing device identity | ✅ Implemented |
| **Asymmetric Liveness** (CME/SPCI/HCSJ) | Physical-property checks that cannot be spoofed by software | ✅ Implemented |
| **Acoustic CDMA Mesh** (18–22 kHz) | Prove physical co-location of devices via ultrasonic beacons | ✅ Core DSP done; mesh protocol partially demo'd |
| **Frame Hash Chain → Blockchain** | Tamper-proof video integrity chain anchored on-chain | ✅ Library done; blockchain bridge not started |
| **Duress Protocol** | Indistinguishable proofs that silently signal coercion | ⚠️ Demo-only; production key derivation not started |

**Overall assessment:** The architectural design and cryptographic reasoning are solid. The core mathematical libraries (CDMA in Python/JS, ZK circuit in Circom, verifiers in Python, frame hash chain) are implemented and tested. **What's missing is the production integration** — the bridge between these components into a working mobile app with real-time audio capture, real ZK proof generation, and blockchain submission.

---

## 2. Literature Review

### 2.1 ZK & Blockchain for Anonymous Evidence Provenance

**Directly relevant papers found on arXiv:**

1. **"The Birthmark Standard: Privacy-Preserving Photo Authentication via Hardware Roots of Trust and Consortium Blockchain"** — Sam Ryan (arXiv:2602.04933, Feb 2026)
   - Most directly comparable work to RealPeep
   - Uses PRNU/NUC sensor fingerprint → Merkle tree → consortium blockchain
   - Key difference: RealPeep uses TEE signatures + ZK; Birthmark uses sensor-entropy fingerprints
   - RealPeep's mesh consensus layer has no equivalent in Birthmark
   - **Should be cited in RealPeep's MNR_LITERATURE_REVIEW.md**

2. **"Beyond PRNU: Learning Robust Device-Specific Fingerprint for Source Camera Identification"** — Manisha et al. (arXiv:2111.02144, 2021)
   - Deep learning approach to camera identification, complementing RealPeep's TEE-based approach
   - Suggests that neural PRNU could serve as a fallback identification method

3. **C2PA (Coalition for Content Provenance and Authenticity)** — Industry standard (non-arxiv)
   - Signed metadata embedded in image/video files
   - **Critical weakness:** metadata is stripped by social media platforms — exactly the gap RealPeep addresses
   - RealPeep's approach (ZK proof separate from media file) avoids this entirely

**Gap in RealPeep's literature:** No comparison to Birthmark Standard or discussion of PRNU-based approaches vs TEE-based approaches. The Birthmark paper is very recent (Feb 2026) and RealPeep's lit review predates it.

### 2.2 Acoustic CDMA for Near-Ultrasonic Communication

**Key references RealPeep should cite:**

1. **"Orthogonal Frequency Division Multiplexing for Underwater Acoustic Communications"** — Standard reference for acoustic channel capacity limits
   - RealPeep's 4 kHz bandwidth @ 18–22 kHz is within standard ultrasonic communication bounds
   - Shannon-Hartley limit at 4 kHz bandwidth with reasonable SNR (10–20 dB) → max ~13 kbps theoretical; RealPeep's 4–15 bps per device is conservative

2. **Gold Codes / Walsh-Hadamard sequences** for CDMA spreading
   - RealPeep currently uses `numpy.random.seed()` PRN — this is NOT a proper Gold code
   - **Must replace with proper Gold code generation** for real multi-access interference analysis
   - Gold codes guarantee bounded cross-correlation; random PRN does not

3. **Blind Multiuser Detection via Independent Component Analysis (ICA)**
   - RealPeep's MNR_LITERATURE_REVIEW.md mentions ICA for offline code extraction
   - This is an active research area: Bell & Sejnowski (1995) Infomax ICA, Hyvärinen & Oja (2000) FastICA
   - **No implementation of ICA exists** in the codebase — the demo assumes code seeds are known

4. **CSMA/CA for acoustic channels**
   - The MESH_MNR_PROTOCOL.md correctly references CSMA/CA (Carrier Sense Multiple Access with Collision Avoidance)
   - No implementation or simulation of the random backoff or collision detection exists

### 2.3 Mutual Non-Repudiation & Fair Exchange

1. **Even & Yacobi Impossibility Result** — Correctly cited in MNR_LITERATURE_REVIEW.md
   - RealPeep correctly identifies Gradual Release and Optimistic Blockchain as the two viable workarounds
   - **Missing reference:** *Asokan, Shoup, Waidner (1998)* "Optimistic Fair Exchange of Digital Signatures"
   - **Missing reference:** *Garfinkel & Spafford (2002)* on commitment-based non-repudiation

2. **Designated-Verifier Proofs**
   - RealPeep's Phase 3d plans to use Groth-Sahai designated-verifier NIZK for duress receipts
   - This is a well-studied approach: *Groth & Sahai (2008)* "Efficient Non-interactive Proof Systems for Bilinear Groups"
   - **No implementation exists**

### 2.4 Steganographic Storage

1. **TrueCrypt/VeraCrypt hidden volume** — Correctly cited in STEGANOGRAPHIC_STORAGE.md
   - Pattern 1 (Deniable Hidden Container) is well-specified
2. **Provos & Honeyman (2003)** — Correctly cited
3. **Shamir (1979) Secret Sharing** — Correctly cited
4. **Missing reference:** *Anderson & Petitcolas (1998)* — listed in references but not discussed for capacity vs security trade-offs

### 2.5 Deepfake Detection & Liveness

Papers found on arXiv that are relevant to RealPeep's CME/SPCI/HCSJ approach:

1. **"SAVe: Self-Supervised Audio-visual Deepfake Detection Exploiting Visual Artifacts and Audio-visual Misalignment"** — Shahzad et al. (arXiv:2603.25140, Mar 2026)
   - Audio-visual synchronization as a deepfake signal — directly relevant to CME
   - Different approach (ML-based vs RealPeep's physics-based), but same fundamental insight

2. **"Explicit Correlation Learning for Generalizable Cross-Modal Deepfake Detection"** — Yu et al. (arXiv:2404.19171, 2024)
   - Cross-modal correlation learning — relevant framing for SPCI

3. **"CAD: A General Multimodal Framework for Video Deepfake Detection via Cross-Modal Alignment and Distillation"** — Du et al. (arXiv:2505.15233, 2025)
   - Multi-modal alignment — RealPeep's CME is a physical-hardware instantiation of the same principle

---

## 3. Architecture Comparison: RealPeep vs Comparable Technologies

| Feature | **RealPeep** | **C2PA** | **Birthmark Standard** | **Truepic** | **OpenTimestamps** | **Keybase** |
|---------|:-----------:|:--------:|:----------------------:|:-----------:|:-----------------:|:----------:|
| **Hardware Root of Trust** | ✅ Secure Enclave (TEE) signature | ✅ Device signing key | ✅ PRNU/NUC sensor fingerprint | ✅ Signed at capture | ❌ | ❌ |
| **Identity Scrubbing (ZK)** | ✅ Circom circuit removes device PII | ❌ Metadata contains device ID | ✅ Key table anonymity set ≥1000 | ❌ | ❌ | ❌ |
| **Liveness Detection** | ✅ CME + SPCI + HCSJ (physics) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Offline Mesh Consensus** | ✅ Acoustic CDMA (18–22 kHz) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Frame-level Hash Chain** | ✅ SHA-256 per frame → Merkle | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Blockchain Anchor** | ⏳ Planned (Bitcoin/Ethereum) | ❌ | ✅ Consortium blockchain | ❌ | ✅ Bitcoin timestamp | ❌ |
| **Duress Protocol** | ✅ Indistinguishable proofs | ❌ | ❌ | ❌ | ❌ | ✅ (Keybase duress) |
| **Steganographic Storage** | ⏳ Planned (5 patterns) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Survives Metadata Strip** | ✅ Proof is separate from media | ❌ Metadata embedded in file | ✅ Anchored to blockchain | ❌ | ✅ (if timestamp ptr survives) | ❌ |
| **Public Verifiability** | ✅ Anyone with proof file + verifier | ✅ But key distribution is opaque | ✅ Via consortium chain | ❌ Proprietary | ✅ Bitcoin full node | ❌ |
| **Anonymity** | ✅ ZK scrubbing — no device ID | ❌ Signing key can be traced | ✅ Key-table anonymity | ❌ | N/A | ✅ Ephemeral proofs |
| **Multi-witness Collocation** | ✅ Unique to RealPeep | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Mobile Client** | ⏳ Planned | ✅ SDK exists | ⏳ Raspberry Pi prototype | ✅ iOS/Android app | ✅ API | ✅ App |
| **Production Ready** | ❌ Prototype/architecture | ✅ Industry standard v2.0 | ✅ Auth spec + verification tool | ✅ Commercial product | ✅ Production | ✅ Production |

**RealPeep's unique competitive advantages:**
- **Only system that proves physical co-location** (mesh consensus) — no rival has this
- **Only system combining ZK identity scrubbing + liveness + mesh + hash chain** in one architecture
- **Duress protocol** is unique in the provenance space (Keybase has something similar but for identity proofs, not video)

**RealPeep's disadvantages vs incumbents:**
- No production mobile app (vs Truepic, C2PA SDK)
- No blockchain integration yet (vs Birthmark which anchors to consortium chain)
- No real-time audio capture bridge (the acoustic channel design is simulated only)

---

## 4. Implementation Status — Detailed Breakdown

### 4.1 What Exists (Files with actual code)

| Component | Files | Language | Tests? | Quality |
|-----------|-------|----------|--------|---------|
| **ZK Identity Scrubber** | `circuit/scrubber.circom` | Circom | ✅ via circom_tester | Strong — uses proper EdDSAPoseidonVerifier |
| **CDMA Mesh Engine** | `realpeep/cdma_mesh.py` | Python | ❌ No dedicated tests | Moderate — uses numpy PRNG not Gold codes |
| **MNR Rollup Server** | `realpeep/mnr_rollup.py` | Python | ✅ test_mnr_rollup.py | Simple but correct |
| **ZK Wrapper** | `realpeep/zk_wrapper.py` | Python | ❌ (covered by main.py run) | Mock — calls snarkjs (may not be installed) |
| **Verifier Suite** | `realpeep/cme.py`, `spci.py`, `hcsj.py`, `accr.py`, `rppg.py`, `plr.py`, `verifier.py` | Python | ✅ test_cme.py, test_spci.py, test_hcsj.py | Strong — proper cross-correlation, normalized variance |
| **Frame Hash Chain** | `realpeep-js/src/frameHashChain.js` | JS | ✅ frameHashChain.test.js | Correct SHA-256 chain + Merkle tree |
| **Demo UI (Duress)** | `demo/index.html`, `app.js`, `duress-core.js`, `styles.css` | HTML/CSS/JS | ✅ duress-core.test.js, demo-integration.test.js | Good — polished UI, TDD-clean pure functions |
| **Demo UI (Hash Chain)** | `demo/advanced.html`, `advanced.js` | HTML/JS | ✅ advanced-demo.test.js | Simple but functional manual test UI |
| **DSP Simulator** | `demo/app.js` (DSP section) | JS | ✅ app.test.js | Interactive parameter sweep UI |
| **Full End-to-End** | `main.py` | Python | ❌ | Runs all components in sequence |
| **CI Pipeline** | `.github/workflows/ci.yml` | YAML | ✅ | Runs ZK + JS tests |

### 4.2 What's Documented But Not Built (Planned components)

From ROADMAP.md:

| Component | Phase | Priority | Gap |
|-----------|-------|----------|-----|
| Duress key derivation | 3a | High | No KDF implementation, no key format spec |
| Duress-aware key generation | 3a | High | No wrapper code |
| Notary-side duress detection | 3a | High | Only simulated in demo JS — no server endpoint |
| Steganographic nonce embedding | 3b | High | No nonce selection algorithm |
| Timed-release heartbeat | 3c | Medium | Only simulated in demo JS |
| Designated-verifier duress receipts | 3d | Medium | No Groth-Sahai code |
| Blockchain anchoring (Bitcoin OP_RETURN) | 4 | High | No submission code |
| Verification tool (video + chain → blockchain) | 4 | High | Not started |
| Decentralized CDMA (anonymous codes) | 4.5 | Medium | No implementation |
| Superposition signing ("commit now, compute later") | 4.5 | Medium | **Not yet spec'd clearly** |
| Optimistic blockchain rollups | 4.5 | Medium | No smart contract code |
| Steganographic storage (all 5 patterns) | 5 | Medium | No implementation |
| Production provers (Halo2/Nova) | 6 | Low | No code |
| Native iOS/Android integration | 5 | Low | No code |
| Attack tree hardening | — | Ongoing | Mitigation ideas without implementation |

### 4.3 Attack Tree Status (from ROADMAP.md)

| Threat | Mitigation Status |
|--------|------------------|
| Captor forces repeated proof generation → detect duress pattern | Mitigation described; **not implemented** |
| Captor inspects proof-generation code | Partial — runtime notary key fetch planned |
| Captor is the notary (compromised notary) | Multi-notary threshold described; **not implemented** |
| Duress passphrase brute force | Key indistinguishability described; **not implemented** |
| Captor forces heartbeat continuation | Duress heartbeat malformation described; **not implemented** |

---

## 5. Critical Gaps & Recommendations

### 🔴 Critical (Must fix before MVP)

1. **No real acoustic hardware bridge.** The entire CDMA simulation runs on synthetic data. Without an actual microphone → FFT → matched-filter pipeline, the acoustic mesh cannot be validated.  
   **Fix:** Port `cdma_mesh.py` to use `pyaudio` or `sounddevice` for microphone capture, or build the JS DSP into a WebAudio API demo that uses real microphone input.

2. **Gold codes not Walsh-Hadamard codes.** The current `numpy.random.seed()` PRN does not guarantee bounded cross-correlation.  
   **Fix:** Replace with proper Gold code generation (2 LFSRs with preferred pair polynomials). This changes BER under multi-access interference.

3. **Blockchain anchoring is entirely unimplemented.** The frame hash chain produces a Merkle root but there's no code to submit it to Bitcoin OP_RETURN, Ethereum calldata, or OpenTimestamps.  
   **Fix:** Implement a `submit_to_blockchain()` module using `bitcoinlib`, `web3.py`, or the OpenTimestamps API.

4. **Duress key derivation not implemented.** The entire duress protocol hinges on the user memorizing two passphrases that produce indistinguishable keys. No KDF exists.  
   **Fix:** Implement PBKDF2-HMAC-SHA256 → Ed25519 keypair for both passphrases. Prove (in tests) that both key distributions are computationally indistinguishable.

### 🟡 High Priority

5. **Notary server is a single-file Python prototype.** No authentication, no persistence (in-memory dict), no API.  
   **Fix:** Deploy as a FastAPI service with SQLite/PostgreSQL backend.

6. **No ZK proof generation on mobile.** The Circom circuit + snarkjs toolchain works on x86 but has never been tested on iOS/Android.  
   **Fix:** Port to WASM (snarkjs already supports WASM) and benchmark on mobile CPUs.

7. **Missing literature citations.** No comparison to Birthmark Standard (arXiv:2602.04933), no discussion of PRNU vs TEE approaches.  
   **Fix:** Add Birthmark comparison to MNR_LITERATURE_REVIEW.md.

8. **Multi-round MNR protocol demo not built.** The MESH_MNR_PROTOCOL.md describes a 4-round exchange with Device C, but the demo in `app.js` still does a single-round simulation.  
   **Fix:** Implement the 4-round protocol as specified in `demo/mesh-mnr-plan.md`.

### 🟢 Medium Priority

9. **Steganographic storage.** Five patterns documented; zero implemented.  
   **Fix:** Start with Pattern 1 (deniable hidden container) using VeraCrypt format.

10. **Shamir's secret sharing for witness distribution.** Documented as Pattern 5 but not implemented.  
    **Fix:** Implement `splits()` and `combine()` using `secretsharing` or manual Lagrange interpolation.

11. **No constant-time comparisons.** The duress predicate check needs to be constant-time to prevent timing side-channel attacks.  
    **Fix:** Use `hmac.compare_digest()` for all sensitive comparisons.

12. **Bloom filter simulation.** The MESH_MNR_PROTOCOL.md specifies bloom filters but no implementation exists.  
    **Fix:** Add `simulateBloomFilter()` to `duress-core.js`.

### 📚 Documentation Gaps

13. **`MNR_LITERATURE_REVIEW.md` is only 57 lines.** It correctly identifies the Even-Yacobi impossibility result but needs expansion with specific paper citations for: Gradual Release protocols, Optimistic Fair Exchange, Blind Multiuser Detection, and Designated-Verifier NIZKs.

14. **No formal threat model.** The system describes attack scenarios narratively but lacks a structured threat model (e.g., STRIDE, LINDDUN, or Dolev-Yao).  
    **Fix:** Add a `THREAT_MODEL.md` with adversary capabilities, trust boundaries, and security properties.

---

## 6. Key Files Referenced

| File | Purpose |
|------|---------|
| `circuit/scrubber.circom` | ZK identity scrubber circuit |
| `realpeep/cdma_mesh.py` | CDMA acoustic mesh simulation |
| `realpeep/mnr_rollup.py` | MNR notary server logic |
| `realpeep/zk_wrapper.py` | ZK pipeline wrapper (mock) |
| `realpeep/cme.py` | Cross-Modal Entanglement verifier |
| `realpeep/spci.py` | Cryptographic Illumination verifier |
| `realpeep/hcsj.py` | Hardware Shutter Jitter verifier |
| `realpeep/verifier.py` | Full verification pipeline |
| `realpeep-js/src/frameHashChain.js` | Frame hash chain + Merkle tree |
| `demo/index.html` | Main interactive demo |
| `demo/app.js` | Demo logic (ZK pipeline, mesh, DSP) |
| `demo/duress-core.js` | Pure functions for duress protocol |
| `demo/advanced.html` | Hash chain demo |
| `main.py` | End-to-end verification run |
| `ROADMAP.md` | Full implementation plan (206 lines) |
| `MUTUAL_NON_REPUDIATION.md` | Use-case deep dives (416 lines) |
| `STEGANOGRAPHIC_STORAGE.md` | Stego pattern analysis (400 lines) |
| `MESH_MNR_PROTOCOL.md` | Protocol spec (490 lines) |
| `MNR_LITERATURE_REVIEW.md` | Literature review (57 lines — needs expansion) |
| `WHO_USES_THIS.md` | Non-technical user scenarios |

---

## 7. Recommended Next Steps (Priority Order)

1. **Gold code implementation** — swap `numpy.random.seed()` PRN for proper Gold code polynomials
2. **Duplicate notary server** — build FastAPI wrapper with persistence
3. **Blockchain anchoring module** — submit Merkle root to Bitcoin testnet via OP_RETURN
4. **Duress key derivation** — implement PBKDF2 → Ed25519 for both passphrases
5. **Multi-round MNR demo** — implement the 4-round protocol per `mesh-mnr-plan.md`
6. **Update literature review** — add Birthmark Standard, cross-modal deepfake detection papers
7. **Implement nonce-duress predicate** — notary-side detection endpoint
8. **Add attack-tree mitigations** — constant-time comparisons, key indistinguishability tests
9. **Build the comparison table** (this document) as `COMPARISON_TABLE.md` in repo
10. **Define formal threat model** — structured adversary analysis
