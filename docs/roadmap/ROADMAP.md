# RealPeep Roadmap

## Phase 1: Core Anonymous Provenance (Completed)
- [x] Integrate hardware TEE (Secure Enclave) mock layer.
- [x] Design Circom Identity Scrubber (`scrubber.circom`).
- [x] Implement formal mathematical constraints using `circomlib` (`EdDSAPoseidonVerifier`).
- [x] Establish TDD wrapper with `circom_tester`.

## Phase 2: Acoustic Metadata Scrubbing (Completed)
- [x] Implement asynchronous CDMA Acoustic Mesh.
- [x] Port pure mathematics to stateless Node.js module with strict TDD.
- [x] Implement Sliding Correlator (DLL) for multi-path/async signal acquisition.
- [x] Map UI physics limits to Shannon-Hartley capacity laws.

## Phase 3: The Formal Duress Protocol (Next)

### Deployment Scenarios — When Duress Mode Is Used

A duress situation is any scenario where the user must appear to comply with a captor's demands while secretly signaling coercion. The following scenarios drive the protocol design:

#### Scenario A: Rubber-Hose Arrest
**Situation:** Police or state security forces detain a protester/journalist and confiscate their phone. They demand the passphrase to "prove" the provenance data is legitimate.

**How duress works:** The user provides their duress passphrase. The captor can inspect the ZK proof, verify it against the public ledger, and see a valid provenance attestation — they have no reason to suspect coercion. The notary silently detects the duress flag and escalates (legal observer alert, embassy notification, mesh-wide proof freeze).

**Key constraint:** The duress key must be indistinguishable from the real key to anyone who does not hold the notary's secret. The captor must be able to verify the proof and see it pass.

#### Scenario B: Checkpoint Device Inspection
**Situation:** Armed checkpoint where all devices must submit to inspection. The inspector demands the user generate a new provenance proof for inspection on the spot.

**How duress works:** The user's software — triggered by the duress passphrase at unlock — generates a proof using a nonce satisfying the notary's hidden predicate (steganographic embedding). The inspector sees a valid proof. The notary receives the flagged proof and initiates silent protocols.

**Key constraint:** The captor can watch the entire proof generation process. The duress trigger must be invisible — no visible "duress mode" UI, no suspicious latency, no unusual device behavior.

#### Scenario C: Coerced Witness on the Mesh
**Situation:** A mesh witness (Device B, who captured Device A's CDMA beacon offline) is later detained and forced to upload their attestation under duress. The captor wants the attestation to "prove" the event happened when the witness was actually coerced into lying.

**How duress works:** The witness uploads their offline attestation as normal. But because the witness cannot refresh their heartbeat before the deadline (detained), the attestation carries an implicit duress signal — the network sees a valid attestation but with a stale/expired heartbeat. The consensus layer retroactively marks the attestation as coerced.

**Key constraint:** The captor should not know that attestations have a heartbeat deadline (it's protocol-level, not user-facing). Even if they do know, they cannot forge a fresh heartbeat without the user's cooperation.

#### Scenario D: Family / Close Contact Coercion
**Situation:** The user is not detained, but a family member is held hostage and the user is forced to generate a proof to "prove" a false narrative.

**How duress works:** Same as Scenario A — duress passphrase → flagged proof. The notary detects the flag and can correlate with other flagged proofs from the same geographic area to detect coordinated coercion.

#### Scenario E: Retroactive Repudiation
**Situation:** A proof was generated freely, but later the user is threatened into "admitting" it was fake. They need cryptographic deniability to survive interrogation.

**How duress works:** Designated-verifier proofs allow the user to plausibly claim any proof was forged by the notary. The user can "confess" to the captor that the proof is fake, but has no way to *prove* it's fake — the notary could have simulated it. The captor cannot distinguish a real proof from a notary-simulated one.

**Key constraint:** This requires designated-verifier proofs, which changes the verifiability model. Recommended as a Phase 3.5 enhancement, not the initial implementation.

---

### Sub-Phase 3a: Duress-Derived Keys (Primary Implementation)

- [x] Research validated duress cryptography patterns (see `duress-patterns-research.md`)
- [ ] **Design the duress key derivation scheme**
      - User memorizes two passphrases (normal + duress)
      - Both produce valid ZK secret keys of identical format
      - The duress key generates a proof where a designated public input field satisfies a predicate known only to the notary
      - The normal key produces no such predicate match
- [ ] **Implement duress-aware key generation in the software layer**
      - Key derivation function produces keys that are indistinguishable by format
      - Proof generation wrapper checks a flag (passed at invocation) for duress vs normal mode
      - No changes to the Circom circuit itself — the predicate is in input selection, not constraints
- [ ] **Implement the notary-side duress detection**
      - On receiving a proof, check the designated public input against the predicate
      - `SHA256(notary_secret || ephemeral_pubkey)` yields a specific duress marker pattern
      - On match: silently flag the session, trigger escalation protocol
      - No visible response — no acknowledgment, no latency change, no error
- [ ] **Test that a captor with full access to both passphrases cannot distinguish normal from duress**
      - Cryptanalysis: prove both key distributions are computationally indistinguishable
      - Integration test: verify that public verifiers accept both proof types identically

### Sub-Phase 3b: Steganographic Nonce Embedding (Reinforcement)

- [ ] **Identify embedding points in the proof serialization**
      - Groth16: use a designated public input field (ephemeral pubkey or coercion-marker field)
      - PLONK/Halo2: use the proof nonce or challenge value
      - JSON/protobuf serialization: use low-order bits of timestamp or padding bytes (covert channel layer)
- [ ] **Implement the nonce selection algorithm**
      - Normal: `nonce = random()`
      - Duress: find `nonce` such that `H(notary_pubkey || nonce)` has the first k bits equal to a pre-agreed duress marker
      - Performance: the expected number of trials is `2^k` — k=16 gives ~65k attempts, acceptable for a proof that takes seconds to generate
- [ ] **Prove indistinguishability from random**
      - Statistical test suite (NIST SP 800-22) on duress nonces vs true random nonces
- [ ] **Mesh consensus layer: detect embedded flags in aggregated attestations**

### Sub-Phase 3c: Timed-Release Heartbeat for Mesh Rollback

- [x] Design the MNR protocol specification (see `MESH_MNR_PROTOCOL.md`)
- [x] Document the 4-round asynchronous exchange (broadcast → receive → ack → chain)
- [x] Document round-trip distance computation (timestamp-independent)
- [x] Document chain hash cross-linking for causal ordering
- [x] Design demo implementation plan (see `demo/mesh-mnr-plan.md`)
- [ ] **Design the heartbeat protocol**
      - Each mesh node generates attestations with an embedded heartbeat deadline (future timestamp)
      - The node must re-sign ("refresh") the attestation before the deadline to keep it valid
      - The notary tracks deadlines; if an attestation's deadline expires, it is marked as "potentially coerced"
- [ ] **Implement the offline attestation with deadline**
      - During the offline acoustic mesh phase, the node includes a commitment to a future timestamp
      - The commitment is derived from the node's key + a time beacon (e.g., a future block header hash)
- [ ] **Implement the rollback consensus**
      - If a node's attestations expire, the mesh consensus layer retroactively marks them as coerced
      - The network prioritizes attestations with fresh heartbeats over expired ones
      - A coercion threshold (e.g., >50% of witnesses expired) triggers full proof invalidation
- [ ] **Test scenario: captor forces heartbeat continuation**
      - If the captor forces the user to keep refreshing (keeping them alive), the heartbeat continues
      - Mitigation: the duress passphrase can intentionally produce a malformed heartbeat that the notary recognizes as coerced
      - Mitigation: allow the user to "accidentally" miss the deadline during transit between captors

### Sub-Phase 3d: Designated-Verifier Duress Receipts (Enhancement, Optional)

- [ ] **Add designated-verifier proof generation for the duress flag**
      - The main liveness proof remains publicly verifiable
      - A side proof (the coercion flag) is designated-verifier only
      - The notary holds the verification key; no one else can verify (or simulate) the flag
- [ ] **Implement Groth-Sahai designated-verifier NIZK for the coercion bit**
      - In bilinear groups; compatible with existing Circom toolchain
      - Trust assumption: CRS setup must be transparent or publicly verifiable
- [ ] **Document the deniability guarantees**
      - The user can later claim any duress proof was simulated by the notary
      - The captor cannot prove the proof was genuinely generated by the user
      - This gives the user escape from retribution after release

### Attack Trees & Hardening

- [ ] **Threat: captor forces repeated proof generation**
      - Captor demands 100 proofs with the same passphrase to detect steganographic patterns
      - Mitigation: duress nonce selection must use a deterministic secret so repeated proofs look different but all carry the flag
      - Mitigation: limit the number of lifetime duress activations per device (dead man's switch if exceeded)
- [ ] **Threat: captor has physical access to the device and inspects proof-generation code**
      - Captor reads the binary/app and identifies the duress predicate check
      - Mitigation: the notary public key used for the predicate is fetched at runtime from a trusted endpoint, not embedded
      - Mitigation: white-box cryptography to obfuscate the predicate logic
      - Accepted risk: a sophisticated captor with full static analysis can eventually reverse-engineer the mechanism
- [ ] **Threat: captor is the notary**
      - If the notary itself is compromised, the duress flag becomes visible to the attacker
      - Mitigation: multi-notary threshold (any k-of-n notaries must agree to trigger escalation)
      - Mitigation: the notary key is split via Shamir's secret sharing across jurisdictions
- [ ] **Threat: duress passphrase brute force**
      - Captor has both passphrases and tries to determine which is duress
      - Mitigation: both passphrases are equally valid keys for the same encryption scheme
      - Mitigation: the key derivation function produces keys that are computationally indistinguishable regardless of source passphrase

## Phase 4: Frame-Level Hash Chain & Blockchain Anchoring (Next)
- [ ] Design per-frame hash chain for video integrity at capture time
- [ ] Implement Merkle tree optimization for segment-level verification
- [ ] Implement real-time hashing during camera capture (before storage)
- [ ] Design offline→online rollup: Merkle root → public blockchain
- [ ] Select anchoring target (Bitcoin OP_RETURN / Ethereum calldata / OpenTimestamps)
- [ ] Write verification tool — takes video + hash chain, recomputes roots, checks blockchain
- [ ] Test: prove frame removal, insertion, reordering, and truncation are all detectable
- [ ] Document the full four-layer provenance model:
      (ZK Identity → Acoustic Mesh → Hash Chain → Blockchain)

## Phase 4.5: Mesh Mutual Non-Repudiation (MPNR) & Decentralized CDMA
- [ ] Review literature (see `MNR_LITERATURE_REVIEW.md`) on TTP-free fair exchange.
- [ ] **Implement Decentralized CDMA (Anonymous Spreading Codes)**
      - Devices autonomously generate PRN codes based on ephemeral public keys/random seeds.
      - Establish Bluetooth/Wi-Fi side-channel to broadcast selected code seeds (or implement Blind ICA detection offline).
- [ ] **Implement "Commit Now, Compute Later" Superposition Signing**
      - Capture raw mic chunks (the acoustic superposition).
      - Hash the raw chunks and sign them directly (Gradual Release).
      - Defer matched filtering and nonce extraction to offline verification logic.
- [ ] **Implement Optimistic Blockchain Rollups**
      - Upload signed partial acoustic transcripts to the sidechain/smart contract.
      - Smart contract acts as the "Offline TTP" to enforce atomicity and penalize retroactive denial.
- [ ] **Implement Optical Mesh Mode (Temporal Luminance Keying)**
      - Reuse existing SPCI display pipeline and CDMA matched-filter infrastructure.
      - TLK survives H.264/H.265/VP9 compression: DCT DC coefficient preserved.
      - See `MESH_MNR_PROTOCOL.md` §"Optical Variant" for compression survival analysis.

## Phase 5: Steganographic On-Device Storage (Next)
- [x] Research validated steganographic hiding patterns (see `STEGANOGRAPHIC_STORAGE.md`)
- [ ] **Implement hidden container format**
      - Encrypted container with outer (decoy) and inner (hidden) volumes
      - Inner volume header placed at random offset in outer volume's free space
      - Both volumes filled with random data at creation (no detectability difference)
- [ ] **Implement cover file embedding module**
      - LSB embedding in existing photo library images
      - Spectrogram embedding in audio files (sub-20Hz / >18kHz bands)
      - MIME/magic byte masquerade for encrypted video files
- [ ] **Implement secret sharing distribution**
      - Shamir's (K, N) threshold split of video across multiple cover files
      - User memorizes K = minimum shares needed (recovery without device knowledge)
      - Error correction (Reed-Solomon) on each share to survive cover file modification
- [ ] **Implement hybrid flow: live stream first, fall back to local stego**
      - Attempt WebRTC/segmented upload → on failure → encrypt → embed → hide
      - Continuously retry upload while hidden; on success → wipe local stego copies
- [ ] **Implement recovery tool**
      - User enters duress passphrase + identifies stego anchor file
      - Tool locates all shares across device, reconstructs, decrypts
      - Works from any device the user logs into (cloud sync of share locations)
- [ ] **Document the deniability threat model**
      - What each captor type can detect (basic→intermediate→advanced→adversarial)
      - Which patterns are appropriate for each threat level
      - See `STEGANOGRAPHIC_STORAGE.md` for the full analysis

## Phase 6: Production Provers
- [ ] Port/Wrap the `circom` implementation into a mobile-friendly `Halo2` or `Nova` prover.
- [ ] Benchmark client-side proof generation on edge devices (iOS/Android).
- [ ] Optimize hashing limits (Poseidon depth vs. Merkle depth tradeoff).

## Phase 5: Native Integration
- [ ] Translate the DSP engine to low-level C++/Rust for CoreAudio/Oboe integration.
- [ ] Link TEE Keymaster/Secure Enclave directly to the proving pipeline.
- [ ] Deploy field tests for acoustic multi-access interference limits.

## Phase 7: Sigstead Integration (Deferred)

RealPeep's session-level provenance records will be signed and chain-linked
using Sigstead (`~/src/sigstead`), which provides standard in-toto v1
Statements, DSSE envelopes, and offline verification.

- [ ] **Option A (primary): Sign with ephemeral Ed25519 key**
      - Use the session's existing ephemeral Ed25519 keypair as signing identity
      - Preserves anonymity — no OIDC identity bound to the record
- [ ] **Option B (configurable): Sign with sigstore keyless (OIDC)**
      - For attributed provenance (journalists, legal evidence)
- [ ] **Verifier-side integration**
      - Sigstead runs on the verifier server, NOT on the phone
      - Constructs in-toto Statements from RealPeep bundle data
- [ ] **Offline verification**
      - Third-party auditor downloads R2 bundle, runs `sigstead verify`

See `SIGSTEAD_INTEGRATION.md` for full rationale and architecture.