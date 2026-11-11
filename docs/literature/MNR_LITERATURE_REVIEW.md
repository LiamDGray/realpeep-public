1|# Mutual Non-Repudiation (MNR): Literature Review & Practical Implementation
2|
3|*This document outlines how RealPeep's acoustic mesh approach maps to established cryptographic literature on multi-party non-repudiation (MPNR) and fair exchange. §7 covers the optical screen-to-camera mesh mode.*
4|
5|---
6|
7|## 0. Related Systems & Comparable Work
8|
9|### The Birthmark Standard (arXiv:2602.04933, Feb 2026)
10|**Sam Ryan** — Privacy-Preserving Photo Authentication via Hardware Roots of Trust and Consortium Blockchain.
11|
12|The most directly comparable work to RealPeep. Uses manufacturing-unique sensor entropy (PRNU/NUC maps) to generate hardware-rooted authentication keys. Authentication records are anchored to a consortium blockchain operated by journalism organizations. Verified with ProVerif.
13|
14|| Aspect | Birthmark Standard | RealPeep |
15||--------|-------------------|----------|
16|| Root of trust | PRNU/NUC sensor fingerprint | Secure Enclave (TEE) signature |
17|| Anonymity | Key-table anonymity set (≥1000 devices) | ZK proof — no device identity revealed |
18|| Liveness detection | None | CME + SPCI + HCSJ (physics-based) |
19|| Mesh consensus | None | Acoustic CDMA co-location proof |
20|| Blockchain | Consortium chain (journalism orgs) | Planned: public chain (Bitcoin/Ethereum) |
21|| Duress | None | Indistinguishable passphrase protocol |
22|| Hardware | Raspberry Pi 4 prototype | Simulated (no hardware bridge yet) |
23|
24|**Key insight:** Birthmark and RealPeep solve the same problem (anonymous hardware provenance) with complementary approaches. Birthmark uses PRNU (sensor fingerprint, analog, difficult to revoke); RealPeep uses TEE (digital key, can be revoked via Merkle tree update). A combined approach would be optimal — PRNU as fallback when TEE is unavailable, TEE as primary when available.
25|
26|### C2PA (Coalition for Content Provenance and Authenticity)
27|Industry standard (v2.1) backed by Adobe, Microsoft, BBC, and others. Embeds cryptographically signed metadata directly into image/video files (manifest + claim).
28|
29|**Why RealPeep differs:**
30|- C2PA metadata is stripped by social media platforms — RealPeep's proof is separate from the media file
31|- C2PA reveals the signing device identity — RealPeep scrubs it with ZK
32|- C2PA has no liveness detection, mesh consensus, or duress protocol
33|
34|### Beyond PRNU: Learning Robust Device-Specific Fingerprint (arXiv:2111.02144)
35|**Manisha et al.** — Deep learning approach to camera sensor identification, demonstrating that learned fingerprints outperform traditional PRNU in low-texture regions. Relevant as a potential fallback identification method for RealPeep.
36|
37|### Truepic
38|Commercial content authenticity platform. Signs photos at capture time with hardware-backed keys. Proprietary verification infrastructure.
39|
40|**Limitation:** No anonymity — the signing key can be traced back to the device. No duress protocol. Centralized verification.
41|
42|### OpenTimestamps
43|Bitcoin-based timestamping protocol. Generates a SHA-256 digest → commits to Bitcoin blockchain via OP_RETURN. Supports Merkle tree aggregation.
44|
45|**Relevance:** RealPeep should use OpenTimestamps format for blockchain anchoring (Phase 4) rather than building a custom submission protocol. OpenTimestamps provides Merkle tree aggregation for batch submissions, minimizing OP_RETURN fees.
46|
47|### Keybase Duress Protocol
48|Keybase supports duress passwords that produce valid-looking but flagged proofs. The same mathematical principle as RealPeep's Phase 3a — indistinguishable keys with embedded predicates.
49|
50|**Key difference:** Keybase proves identity (who you are); RealPeep proves provenance (where your video came from).
51|
52|---
53|
54|## 1. The Impossibility Result (Why async/offline is hard)
55|
56|In cryptography, there is a well-known impossibility result (first formalized by Even and Yacobi) which mathematically proves that **deterministic fair exchange without a Trusted Third Party (TTP) is impossible**. 
57|
58|If Alice and Bob are exchanging signatures offline, someone always has to send their signature first or last. Without a TTP, a malicious actor can simply wait to receive the other parties' signatures and then immediately cut the connection before sending their own, leaving the honest parties with nothing.
59|
60|Because of this, the literature has developed three main workarounds. RealPeep inherently utilizes two of these, while completely side-stepping the need for the third.
61|
62|---
63|
64|## 2. Gradual Release (Interactive Realtime Stream)
65|
66|**The Academic Approach:** 
67|In the literature, this is known as the **Gradual Release of Secrets** (or concurrent/interleaved signatures). Because a perfectly fair 1-step exchange is impossible without a TTP, protocols instead have parties exchange their signatures "bit-by-bit" over many interactive rounds. If an attacker aborts midway through, they only walk away with a mathematically insignificant advantage (e.g., they have 51% of Alice's signature while Alice has 50% of theirs), meaning neither has a valid, complete non-repudiation proof.
68|
69|**The RealPeep Implementation:**
70|The continuous acoustic mesh is a perfect medium for a gradual release protocol. The devices continuously broadcast and sign micro-segments of each other's acoustic environment.
71|
72|*   **Signing the Superposition vs. Extracted Nonces:** We do **not** need to distinguish or extract nonces in real-time. We should sign the acoustic superposition as it is received.
73|    *   **Computational Efficiency ("Commit Now, Compute Later"):** Running 50 simultaneous matched filters to extract CDMA codes in real-time would drain a phone's battery. Instead, the phone simply records a chunk of raw microphone audio, hashes it, and signs the hash. The heavy DSP math is deferred to the offline notary or blockchain verifier later.
74|    *   **Stronger Physical Proof:** The superposition contains not just the nonces, but ambient room noise, exact propagation delays (phase shift), and physical interference patterns. Signing the raw superposition cryptographically commits the device to that exact physical acoustic environment, which is significantly harder to fabricate than extracted text nonces.
75|
76|---
77|
78|## 3. Optimistic Protocols (Side Chain / Public Blockchain)
79|
80|**The Academic Approach:**
81|This maps directly to what the literature calls **Optimistic Fair Exchange using a Blockchain as an Offline TTP**. In an optimistic protocol:
82|1.  **The Offline Phase:** The devices interact locally and optimistically assume everyone is honest. They sign and exchange the acoustic data.
83|2.  **The Dispute/Rollup Phase:** If someone tries to cheat, the system relies on an "Offline TTP" to enforce fairness. Traditionally a centralized server, modern research (2018+) heavily focuses on using blockchains and smart contracts as the decentralized TTP.
84|
85|**The RealPeep Implementation:**
86|*   **At Capture Time (Offline):** Use an interactive, gradual release over the acoustic mesh. If a phone is smashed by an adversary, the interactive stream breaks, and the exchange halts fairly.
87|*   **Post-Capture (Online Rollup):** Once devices reach Wi-Fi, they upload their signed partial transcripts to a sidechain/blockchain. The smart contract acts as the decentralized "judge," finalizing the mutual non-repudiation and ensuring atomicity (Alice's proof is only valid if Bob's is also published).
88|
89|---
90|
91|## 4. Decentralized Code Allocation (Anonymous CDMA)
92|
93|In a decentralized mesh, how do anonymous parties choose CDMA codes without a central cell tower to assign them? This is a solved problem known as **Decentralized CDMA** and **Blind Multiuser Detection**.
94|
95|*   **Code Selection (Decentralized Allocation):** Devices choose codes randomly. A device generates a random seed (e.g., from its ephemeral public key) to generate a long pseudo-random noise (PRN) sequence (like a Gold code). If the code space is massive (e.g., $2^{32}$ possible codes), the probability of two anonymous people in the same crowd picking the same code is statistically zero (Birthday Paradox).
96|*   **Distinguishing Codes (Blind CDMA):** How does the offline verifier later extract the nonces from the signed raw audio?
97|    1.  **Public Broadcast:** Devices can broadcast their chosen code seeds over local Bluetooth/Wi-Fi alongside the acoustic transmission.
98|    2.  **True Blind Detection:** If no side-channel is used, modern DSP uses techniques like *Independent Component Analysis (ICA)* to blindly separate mixed orthogonal signals without knowing the codes in advance.
99|
100|**Key blind recovery references:**
101|
102|- **Gkizeli et al., "Iterative Generalized Least Squares (IGLS) Blind Signature Recovery Algorithm"** — Demonstrates blind recovery of spread-spectrum signatures without prior knowledge of the spreading codes. Directly supports RealPeep's "Commit Now, Compute Later" architecture: the offline verifier can extract individual device nonces from the signed raw acoustic superposition using established DSP techniques.
103|
104|- **"Blind Subspace-Based Signature Estimation in DS-CDMA Systems With Unknown Wide-Sense Stationary Interference"** (IEEE, 2007) — Blind estimation of spreading signatures via subspace methods without training symbols. Establishes that this is a mature DSP subfield with multiple algorithmic approaches (subspace decomposition, iterative least squares, ICA), not an open research problem.
105|
106|---
107|
108|## 5. The Third Workaround (Rationality / Game Theory)
109|
110|For completeness, the third workaround to the TTP-free fair exchange impossibility is **Rationality (Cryptoeconomics)**. This involves making cheating economically irrational by requiring parties to stake a deposit that is slashed if they abort the protocol midway. While powerful in decentralized finance (DeFi), this is less applicable to RealPeep's physical duress scenarios, where the "cost" of an arrest or physical harm outweighs any financial deposit. Thus, RealPeep relies on the first two workarounds: Gradual Release and Optimistic Blockchain Rollups.
111|
112|---
113|
114|## 6. Runner-Up References (Informative but Not Core)
115|
116|These papers provide theoretical grounding or adjacent techniques but are not directly built upon by RealPeep's architecture.
117|
118|- **Survey on Security of Blind Signature and Impossibility of Blind Signature from Lossy-Trapdoor-Permutations** (ISI Kolkata, 2023) — Proves that blind signatures cannot be constructed in a black-box manner from Lossy Trapdoor Permutations in the Random Oracle Model. This formal impossibility result justifies RealPeep's architectural decision to separate cryptographic correctness from physical-layer error tolerance, rather than attempting a unified "lossy signature" primitive.
119|
120|- **"Spreading Codes for Multiuser Estimation in Non-Coherent and Non-Cooperative Environments"** (IEEE, 2013) — PN sequences as node signatures in uncoordinated DS-SS environments. Supports RealPeep's decentralized CDMA code allocation model where devices independently select codes from a large space.
121|
122|- **Multi-signature prototype via linear homomorphic F** (Springer) — An insecure multi-signature construction that demonstrates the challenges of aggregating individual signatures. Relevant as a cautionary reference for RealPeep's multi-witness mesh protocol: naive signature aggregation is vulnerable to rogue-key attacks if not carefully designed.
123|
124|---
125|
126|## 7. Optical Screen-to-Camera Communication: Literature Review
127|
128|*This section surveys the SCC/OCC literature to establish prior art for RealPeep's optical mesh mode and assess novelty of rotational block keying.*
129|
130|### 7.1 Core SCC/OCC Systems (Pre-2026)
131|
132|- **DeepLight** (Tran et al., IPSN 2021) — Robust real-time SCC using DNN-based decoding. Blue channel modulation for imperceptibility. ~0.95 Kbps at 2m range.
133|- **InFrame++** — Simultaneous screen-human viewing and hidden SCC via temporal sampling gap.
134|- **PassiveCam** (Ghiasi et al., 2024) — SCC using passive ambient-lit transparent displays.
135|- **DisCo** — Rolling shutter exploitation for encoding data in screen row temporal patterns.
136|- **SoftLight** — Adaptive VLC over screen-camera with channel-condition-aware modulation.
137|- **MicroFrame** — Multi-complementary color spatial diversity for robust SCC.
138|- **Yokar et al.** (2025) — S2SVLC channel characterization, Lambertian order analysis.
139|- **Space-Time-Color Scheme** — Spatial blocks × temporal frames × color channels. Closest prior art to rotational block keying, but uses color as the third dimension, not rotation/angle.
140|
141|### 7.2 2026 Papers (Google Scholar via hermes-stealth MCP, July 2026)
142|
143|**Directly relevant (SCC/OCC):**
144|
145|- **"Preamble-free display-camera communication exploiting rolling shutter effect and zero-sum orthogonal codes"** (2026) — Uses Zadoff-Chu orthogonal codes for display-camera communication. Closest prior art to RealPeep's CDMA-over-optical, but: (a) uses rolling shutter (not rotation), (b) uses Zadoff-Chu (not Gold codes), (c) addresses clean-capture data transfer (not compressed-video forensic recovery).
146|
147|- **"PreSCC: Robust Screen-Camera Communication via Pre-Correction Against Perspective Distortion and Illumination Interference"** (2026) — Pre-correction for perspective distortion and ambient illumination in SCC. Real-world robustness, but for data transfer.
148|
149|- **"Steganographic Optical Camera Communication: A Framework for Secure Wireless Data Transfer"** (2026) — Hidden/covert OCC with imperceptible data payload. Conceptually aligned with RealPeep's imperceptibility goal; different threat model.
150|
151|- **"Single-Frame 64-QAM Optical Camera Communication Based on Spatial I/Q Modulation"** (2026) — High-order spatial modulation (64-QAM) in a single display frame.
152|
153|- **"Design and Performance Evaluation of Single Frame Display Field Communication (SF-DFC) Based on Data Embedding Optimization"** (2026) — Single-frame DFC with optimized embedding.
154|
155|- **"Index Modulation for Streaming QR Codes"** (2026) — QR code index modulation for streaming.
156|
157|- **"MoiréMop: Lightweight and Pervasive Moiré Removal for Mobile Camera-to-Screen Interaction"** (2026) — Moiré removal for screen-camera. Relevant to rolling shutter skew analysis.
158|
159|- **"YOLO-OBB and Two-Stage Geometric Correction for RGB-LED Array Optical Camera Communication"** (2026) — LED array OCC with oriented bounding box detection.
160|
161|**Rotation in OCC (different modality):**
162|
163|- **"ISI Modeling and BER Performance for Rotating Light-Trail Image Sensor Communication"** (2026) — Models ISI for physically rotating LED light sources on moving objects. Hardware-level rotation, not software screen-pattern rotation. Conceptually distinct.
164|
165|**Surveys:**
166|
167|- **"Survey of Visible Light Communication Research in Japan"** (2026) — No rotational screen modulation discussed.
168|
169|### 7.3 Novelty Assessment
170|
171|**After searching arXiv (2021-2026), Google Scholar (2026), and the broader IEEE-indexed OCC literature:**
172|
173|1. **No paper proposes rotating block patterns as a modulation dimension for screen-camera communication.** The 2026 papers continue established patterns: spatial modulation (QAM, I/Q), rolling shutter, orthogonal codes, QR-based, single-frame. Rotation as a modulation dimension is absent.
174|
175|2. **No SCC/OCC paper addresses video compression survival as a design goal.** The entire field assumes clean capture-to-processing links. RealPeep's context — mesh co-location proof from *already-compressed* video evidence — has no prior art. The DCT DC coefficient insight is novel in this context.
176|
177|3. **"Preamble-free DCC with orthogonal codes"** (2026) is closest to RealPeep's CDMA-over-optical, but differs in encoding mechanism (rolling shutter vs. rotation), code family (Zadoff-Chu vs. Gold), and application (data throughput vs. forensic co-location).
178|
179|4. **"Rotating Light-Trail"** (2026) uses physical LED rotation. Rotational block keying — rotating a software screen pattern — is fundamentally different.
180|
181|**Conclusion:** Rotational block keying for screen-to-camera mesh co-location is novel and publishable. The combination of (a) rotation as a modulation dimension, (b) CDMA/Gold code spreading across the angular domain, and (c) video compression survival as a design constraint has no prior art through July 2026.
182|
183|### 7.4 Recommended Citations for a RealPeep Paper
184|
185|**Core SCC field:**
186|- DeepLight (Tran et al., IPSN 2021)
187|- Space-Time-Color Scheme
188|- Yokar et al. (2025) — S2SVLC channel characterization
189|- DisCo — rolling shutter exploitation
190|- PreSCC (2026) — perspective/illumination robustness
191|- Preamble-free DCC with orthogonal codes (2026) — closest CDMA-like approach
192|
193|**Surveys establishing field scope:**
194|- Survey on Optical Camera Communications: Challenges and Opportunities
195|- Survey of Visible Light Communication Research in Japan (2026)
196|

---

## 8. Mining Results: Cross-Paper Insights for RealPeep (July 2026)

*Analysis of 12 papers from SCC/OCC and CDMA/acoustic literature, mapped to
RealPeep architecture. Priority reflects RealPeep's channel preference: BLE
(primary) → acoustic (secondary) → optical (tertiary).*

### 🔴 Immediate Actions

**1. Chirp-based CDMA for acoustic mesh** ← *Spectrum Spreading 6G (Rou et al., arXiv:2605.00249)*

Rou et al. argue that chirp-based subcarriers (AFDM) outperform sinusoidal
CDMA in doubly-dispersive channels — exactly what indoor acoustics is (multipath
reflections create both time and frequency dispersion). Gold codes are
sinusoidal-based and optimized for AWGN, not reverberant rooms. Linear chirps
(like LoRa uses) have built-in multipath resilience because different path
delays map to different frequency shifts — the matched filter naturally
separates them.

**Action:** Add chirp-based CDMA option to `cdma_mesh.py`. This could materially
improve detection probability in reflective environments (concrete rooms,
tunnels, urban canyons).

**2. Room-isolation as a feature** ← *Ultrasonic DSSS Survey (Ali et al., 2026)*

The survey confirms that ultrasonic waves do not penetrate walls. For
co-location proof, this is a *feature*: if Device A's ultrasonic beacon is
detected in Device B's recording, the devices were in the same room — not just
the same building. This is a stronger claim than BLE (which penetrates walls)
or optical (which requires line-of-sight).

**Action:** Document in `MESH_MNR_PROTOCOL.md`: ultrasonic CDMA proves
*room-level* co-location; BLE proves *building-level* proximity; optical proves
*line-of-sight* co-presence. The three together give a nested confidence model.

**3. Pre-correction for perspective distortion** ← *PreSCC (Zhang et al., 2026)*

Transmitter-side pre-correction outperforms receiver-side post-processing for
perspective distortion and illumination. For optical mesh: if Device A
estimates Device B's approximate position (from BLE proximity or prior frames),
it can pre-warp its screen pattern to compensate for viewing angle.

**Action:** Add optional pre-warp step to optical mesh design: emitting device
applies affine transform to screen pattern before display based on estimated
receiver viewing angle.

### 🟡 Medium Priority

**4. Zadoff-Chu codes for optical mesh** ← *Preamble-free DCC (2026)*

Zadoff-Chu sequences have zero auto-correlation zone — the correlation peak
is perfectly sharp with zero sidelobes in a defined window. Better than Gold
codes (bounded but non-zero cross-correlation). For optical mesh, where
bandwidth is higher and SF can be larger, Zadoff-Chu could eliminate
false-positive cross-correlation between devices entirely.

**Action:** Evaluate Zadoff-Chu as alternative to Gold codes for optical
channel specifically. Zero-correlation-zone means N devices separated with
zero interference if SF > N.

**5. Steganographic dual-use screen** ← *Steganographic OCC (Teli et al., IEEE Access 2026)*

The paper embeds hidden data under watermarked cover images. Applied to
RealPeep: the phone screen could display normal recording UI (viewfinder,
controls) while simultaneously carrying the TLK mesh signal imperceptibly.
A captor inspecting the phone sees normal operation; another device's camera
sees the hidden modulation.

**Action:** Extend SPCI/TLK to support "dual-use mode" where mesh signal is
embedded as imperceptible luminance variation on normal UI. Formalizes TLK as
steganographic, strengthening deniability guarantees.

**6. M-ary amplitude CDMA** ← *Lamb wave NAPC CDMA (Xu et al., MSSP 2026)*

Introduces Negative Amplitude Position Code — modulating both amplitude and
temporal position of code chips. For bandwidth-limited channels (acoustic has
~4 kHz), using amplitude levels (not just on/off) could multiply per-device
bitrate. Two-level TLK (30% vs 100%) already uses amplitude; extending to 3-4
levels is a natural progression.

**Action:** Investigate M-ary TLK (3-4 luminance levels instead of 2) for
optical. For acoustic, investigate amplitude-shift keying on top of CDMA
spreading (each chip carries 2 bits instead of 1).

### 🟢 Future Work

**7. Distributed async MIMO validation** ← *Async MIMO UW (2026)*

The underwater acoustics community independently arrived at the same
architecture RealPeep uses: distributed asynchronous transmitters, centralized
MIMO receiver. This validates RealPeep's "Commit Now, Compute Later" approach
and provides a citable precedent from a different domain.

**8. Adjacent-ISI BER model** ← *Rotating Light-Trail (Asaoka et al., IEEE Comm Letters 2026)*

Closed-form BER for rotating optical sources with adjacent-symbol interference.
If rotational block keying is implemented, this paper provides a ready-made
BER model adapted for screen-pattern rotation.

**9. NLOS CDMA validation** ← *CDMA UAV UV (Li et al., SPIE 2026)*

Demonstrates CDMA mesh consensus works without line-of-sight (UV scatters
through atmosphere). Validates RealPeep's CDMA-over-acoustic (inherently NLOS).

**10. Piezo-Ultrasonic Backscatter** (ACM 2026) — Passive/backscatter mode via
piezo transducers. Not practical for phones without dedicated hardware; footnote
material for future directions.

### What NOT to adopt

- **Single-Frame 64-QAM OCC** (2026): Spatial QAM requires clean capture without
  perspective distortion or compression. Incompatible with RealPeep's
  compressed-video evidence use case. TLK remains correct choice.
- **OSDMA** (Qi et al., 2023): Orthogonal signal division requires a single
  transmitter coordinating multiple streams. RealPeep uses N independent
  transmitters. Not applicable.
