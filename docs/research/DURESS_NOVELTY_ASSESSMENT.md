# Is the RealPeep duress protocol novel — and is it publishable?

**Date:** 11 November 2026  
**Scope:** the duress/coercion-signalling component only  
**Code reviewed:** `realpeep/duress_keys.py`, `demo/duress-core.js`, `tests/test_duress_keys.py`, `circuit/scrubber.circom`, `docs/roadmap/ROADMAP.md` §§3a–3d, `docs/research/duress-patterns-research.md`

---

## TL;DR

**The mechanism is not a new cryptographic primitive.** Duress/panic credentials, deniable
encryption, coercion-resistant voting, designated-verifier proofs and steganographic
subliminal channels all predate RealPeep. A reviewer will find that prior art quickly.

**The system-level question can be novel enough for a privacy/security workshop** —
*“can a coerced user produce a provenance proof that is publicly valid, indistinguishable
from a normal proof, and silently recognizable only by a threshold notary?”* — but only
if the construction is formalized, the current 8-bit tag is replaced, and the coercion
model is evaluated. As implemented today it is a **demo, not a publishable result**.

| Question | Answer |
|---|---|
| Is “two passphrases produce equally valid keys” novel? | **No.** Duress PINs, panic passwords and hidden volumes are established prior art. |
| Is “a notary-only tag in a proof field” novel? | **No as a primitive.** It is a keyed PRF / covert-channel tag with a designated verifier. |
| Is “coercion-evident *provenance* with a silent notary and multi-witness capture” novel? | **Potentially yes as a system/problem framing.** Needs a rigorous comparison and a formal model. |
| Is the current implementation publishable? | **No.** 8-bit marker, deterministic nonce reuse, no proof binding, client-side notary secret in the demo, no formal definitions, no evaluation. |
| Where could it be published? | **Workshop first:** WPES, HotPETs, FOCI, PETS short paper, USENIX Security / IEEE S&P workshops. Main conference only after a formal construction, proof and strong evaluation. |
| What is the single most important fix? | **Make the tag a negligible-probability, transcript-bound, one-time value — not an 8-bit marker over a reusable nonce.** |

---

## 1. What the code actually does today

### Python prototype (`realpeep/duress_keys.py`)

1. `derive_keypair(passphrase, salt, iterations=100_000)` uses PBKDF2-HMAC-SHA256 to
   derive a 32-byte seed and an Ed25519 keypair.
2. `derive_normal()` returns a fresh `os.urandom(32)` nonce.
3. `derive_duress()` searches a counter from zero:
   `candidate = SHA256(counter)[:32]`, accepted when
   `SHA256(notary_secret || ephemeral_pubkey || candidate)[0] == 0`
   (with the default `marker_bits=8`).
4. `check_duress()` recomputes the same predicate. The notary is expected to flag a
   matching nonce.

### Demo (`demo/duress-core.js`)

- Uses a 32-bit non-cryptographic string hash (`h = h*31 + c`), not SHA-256.
- Searches for a hash starting with the hex digit `0` — a **4-bit** marker, not 8.
- Contains a hard-coded `DEMO_NOTARY_CONTEXT` value in **client-side source** (now
  clearly labelled as a public demo domain separator, not a credential).
- Uses `Math.random()` for nonces, not a CSPRNG.

The demo is a teaching aid. It must never be used as evidence that the protocol is
secure, and the hard-coded notary secret should be removed or replaced with an explicit
“simulation only” mock so nobody mistakes it for a deployment.

### What is missing

- The nonce/tag is **not an input to `circuit/scrubber.circom`**. The circuit has public
  inputs `payload_hash`, `ephemeral_pubkey`, `authorized_merkle_root`; there is no duress
  tag and no constraint binding it to the proof. The “proofs are indistinguishable” claim
  is therefore **not implemented**.
- There is no notary service, no API, no persistence, no replay protection, no threshold,
  no key rotation, no audit log and no response-indistinguishability test.
- There is no secure storage, no secure element integration, and no defense against the
  stated “attacker has full access to the device” threat model.
- **The Python and Android implementations already disagree.** `DuressKeys.kt` draws a
  fresh `SecureRandom` nonce per call; the Python `generate_nonce()` starts a deterministic
  counter at zero and reuses the same nonce for the same key. Both use an 8-bit marker.
  There are no cross-implementation test vectors, so “the protocol” is not defined well
  enough to reproduce or audit.
- The tests check format, detection, a loose timing ratio and a search bound. They do not
  test indistinguishability, false-positive rates at scale, nonce reuse, transcript
  binding, or notary compromise.

---

## 2. Prior art map

The following is a map, not a systematic review. A submission needs a real related-work
section with exact citations and a comparison table.

| Line of work | Representative work | What it already covers | What RealPeep would add |
|---|---|---|---|
| Duress / panic credentials | ATM duress PINs (ANSI X9.8 / ISO 9564); TrueCrypt/VeraCrypt hidden volumes; Clark & Hengartner, “Panic Passwords” (HotSec 2008) | Two credentials, one silently signals coercion; plausible deniability | Applying it to a **provenance proof** rather than authentication or disk encryption |
| Deniable encryption | Canetti, Dwork, Naor & Ostrovsky, “Deniable Encryption” (CRYPTO 1997) | Ciphertexts that decrypt to different plaintexts under coercion | A proof that remains publicly valid in both branches |
| Coercion-resistant voting | Juels, Catalano & Jakobsson, “Coercion-Resistant Electronic Elections” (2005/2010); receipt-free voting | Coercion models, receipt-freeness, indistinguishability games | A notary-only signal in a capture/provenance setting |
| Designated-verifier proofs | Jakobsson, Sako & Impagliazzo (EUROCRYPT 1996); Groth & Sahai (EUROCRYPT 2008) | Proofs verifiable only by a designated party; deniability | A side-channel proof that does not break public verifiability of the main proof |
| Subliminal / covert channels | Simmons, “The Prisoners’ Problem and the Subliminal Channel” (CRYPTO 1983) | Hiding a message in a supposedly random value | A keyed predicate checked only by a notary |
| Honey encryption / decoys | Juels & Ristenpart, “Honey Encryption” (EUROCRYPT 2014) | Decoy keys that produce plausible plaintexts | Decoy provenance bundles, if the captor can demand fresh proofs |
| Anonymous hardware provenance | Birthmark Standard (arXiv:2602.04933); C2PA | Hardware roots of trust, anonymity sets, signed capture metadata | Co-location + duress + offline verification; see the comparison |
| Steganographic key derivation | General PRF/keyed-hash constructions; hidden-volume key schedules | Deriving a tag from a secret without revealing it | A formal coercion game for provenance |

**Conclusion from the map:** the individual ingredients are well studied. The defensible
contribution is the **combination and the threat model**, not “we invented duress keys.”

---

## 3. Where the novelty could actually be

A credible paper should claim one or more of these, with a precise model and a proof:

1. **Coercion-evident provenance, not just coercion-resistant authentication.**
   The prover must produce a proof that a public verifier accepts exactly as it accepts a
   normal proof, while a notary (or threshold of notaries) learns a single bit: “this
   proof was generated under duress.” The captor may watch generation, demand repeats,
   inspect storage, and know the algorithm (Kerckhoffs). This is a different game from
   “enter a duress PIN instead of a normal PIN.”

2. **A tag that is pseudorandom to everyone without the notary key and one-time.**
   The tag must be bound to the full transcript (payload hash, ephemeral key, timestamp,
   witness set), must not repeat across sessions, and must have negligible false-positive
   probability. This is the technical core; it is a keyed-PRF/VRF design problem.

3. **Coercion in a multi-witness mesh.**
   A witness can be coerced after capture. The protocol needs a way to distinguish
   “witness was detained and could not refresh” from “witness is lying,” without turning
   a missed heartbeat into a public accusation. This is a genuinely new systems problem,
   but it also raises serious safety and false-accusation issues.

4. **Silent escalation with plausible deniability.**
   The notary’s response must be indistinguishable (same status code, same latency
   distribution, same bytes on the wire). The notary must not become a single point of
   failure or a coercion oracle. Threshold notaries and transparency logs are part of the
   design, not an afterthought.

5. **A negative result / evaluation.**
   “We implemented duress signalling for provenance and measured its false-positive rate,
   its detectability under repeated generation, and its usability with journalists.” A
   careful negative result is publishable at a workshop and is more honest than a claim of
   perfect indistinguishability.

---

## 4. Why the current construction is not yet publishable

### 4.1 The 8-bit marker has an unacceptable false-positive rate

With `marker_bits = 8`, a normal nonce is flagged with probability `2^-8 = 1/256`.
Across 1,000 normal sessions, the expected number of false alarms is about **3.9**.
For a safety system that may trigger a legal-observer alert or an embassy notification,
that is not a tolerable error rate. A false alarm can also endanger the user if the
notary acts overtly. A publishable design needs a false-positive probability that is
negligible (e.g., `2^-32` or lower) and a human review path.

### 4.2 The Python duress nonce repeats across proofs

`generate_nonce(is_duress=True, ...)` always starts at `counter = 0` and is deterministic
in `(notary_secret, ephemeral_pubkey)`. In `derive_duress()`, `ephemeral_pubkey` is the
**static public key derived from the passphrase**, so two duress proofs made with the same
passphrase produce the **same nonce**. Normal nonces are fresh `os.urandom(32)` values.

A captor who demands two proofs therefore sees:

- normal mode: two different nonces;
- duress mode: the same nonce twice.

That is a direct violation of the stated threat model (“captor forces repeated proof
generation”) and an obvious distinguisher. Even without repeats, a leaked duress nonce is
reusable forever because there is no binding to the transcript and no one-time state. A
captor can replay a known duress nonce into a later proof to trigger a false alarm, or the
notary can be tricked into flagging an innocent session.

### 4.3 The distributions are not indistinguishable

A normal nonce is uniform over `2^256`; a duress nonce is uniform over a subset `S` of
size `2^248` (for 8 marker bits). For someone who knows `S` (i.e., who holds the notary
secret), the two distributions are almost perfectly distinguishable: the total-variation
distance is `1 - 2^-8`. Without the secret, the predicate is a PRF, so the security
argument must be computational and cannot rely on the nonce looking uniform — it must
prove that `S` is pseudorandom. The current code only asserts this. An 8-bit tag is
anyway too small: if the notary secret leaks, an attacker can find a valid duress tag in
about `2^8` trials, and the false-positive rate is `1/256`. A publishable design needs a
negligible false-positive rate and a proof that accounts for repeated queries,
adaptively chosen transcripts and the notary oracle.

### 4.4 The tag is not bound to the proof

`check_duress(notary_secret, ephemeral_pubkey, nonce)` only sees the public key and the
nonce. It does not bind the payload hash, the Merkle root, the timestamp, the witness set
or the proof itself. An attacker who can modify the bundle can move a tag between
sessions. The tag must be computed over a canonical transcript hash, and the verifier
must reject mismatches. Without this, the tag is a bearer token, not a proof of coercion.

### 4.5 The notary is a single point of failure and an oracle

- If `notary_secret` leaks, every duress tag becomes identifiable and forgeable.
- A malicious or compromised notary can flag any user by constructing a matching tag.
- If the notary’s response differs in status code, body, timing or rate limiting, the
  captor can detect duress. This must be tested, not assumed.
- A threshold notary (e.g., 2-of-3 across jurisdictions) plus key rotation and a
  transparency log is the minimum credible design for a deployment.

### 4.6 The key derivation and device threat model are under-specified

- PBKDF2-HMAC-SHA256 at 100,000 iterations is weak by current password-hashing guidance.
  Use Argon2id with a memory cost appropriate to the device, and specify salt and
  parameter storage.
- The stated attacker “has full access to the device, can read storage and watch
  generation.” A pure-Python/PyNaCl prototype does not meet that threat model. A secure
  element, attested generation, or a trusted display is required, and even then the
  “watch generation” adversary is hard.
- The passphrases themselves are the weakest link: users choose weak passphrases, and a
  captor can demand both. The protocol needs a story for this (e.g., a device-generated
  duress credential stored in the secure element, not a memorized phrase).

### 4.7 The demo leaks the notary secret and uses a toy hash

`demo/duress-core.js` ships a public demo context value in client source and checks a 4-bit marker
with a 32-bit non-cryptographic hash. Anyone who reads the page can detect a duress
nonce. This is fine for a UI demo only if it is clearly labelled; it must not be used to
support a security claim.

### 4.8 There is no proof that the ZK proof itself is the same in both modes

Because the tag is not in the circuit, the ZK proof is literally unchanged. That sounds
good (“indistinguishable!”) but it also means the duress signal is a **separate,
unauthenticated side value**, not part of the proof. The system needs a binding proof:
either the tag is a public input constrained by the circuit, or a separate signature/NIZK
binds it to the same transcript. Otherwise the notary cannot know the tag belongs to the
proof it received.

---

## 5. A design sketch that could be publishable

This is a sketch for the vertical slice, not a finished protocol.

**Goal:** a proof bundle `B` (payload hash, ephemeral key, witness set, timestamp) and a
tag `t` such that:

- Public verifier accepts `(B, proof)` in both normal and duress modes.
- A threshold notary can decide “duress” with negligible false-positive probability.
- Without the notary key, `t` is pseudorandom and independent of the mode.
- `t` is one-time and bound to `B`.
- Repeated proofs under coercion do not reveal the mode.

One approach:

1. **Precompute a pool of one-time tags at provisioning time.** For each session slot,
   generate a random nonce `r` and a tag `t = HMAC-SHA256(k_notary, H(B) || r)`. Store the
   pool in the secure element. A duress session uses a tag whose top `d` bits are zero
   (`d >= 32`, ideally 64); a normal session uses a uniform tag. The notary checks the
   predicate. The pool avoids runtime search timing and nonce reuse; refill only when the
   device is safe.
2. **Bind the tag to the transcript.** `H(B)` covers the payload hash, ephemeral key,
   Merkle root, witness set, timestamp and protocol version. The proof must commit to the
   tag (e.g., include `t` as a public input or in a signed envelope).
3. **Threshold notary.** Split `k_notary` across 2-of-3 independent operators. No single
   operator can identify or forge a tag. The response is a fixed-length, constant-time
   “accepted” message; escalation happens out of band.
4. **Formal game.** Define correctness, soundness, tag pseudorandomness, coercion
   indistinguishability (with repeated and adaptive queries), notary compromise, and
   replay resistance. Prove the construction in the random oracle model; discuss the
   limitations.
5. **Evaluation.** False-positive rate at `10^8` simulated normal sessions; detection at
   `10^4` duress sessions; generation/verification time on Pixel 8a, Moto G7 Power and
   ThinkPad P51; storage and pool exhaustion; usability with a small, ethically reviewed
   user study (not with at-risk users until safety review).

Even this sketch has open problems: pool exhaustion, secure-element availability on
Android 10, threshold notary governance, and the fact that a captor can demand “use the
normal passphrase” (the user can comply with the duress credential and claim it is
normal, but the captor may compare with a previously known credential). These are the
interesting research questions; the paper should name them.

---

## 6. Publishability assessment

### Workshop: plausible, conditional

A strong workshop paper could be titled *“Coercion-Evident Provenance: Silent Duress
Signalling for Verifiable Capture.”* Suitable venues include:

- **WPES** (Workshop on Privacy in the Electronic Society, co-located with CCS)
- **HotPETs** (Hot Topics in Privacy Enhancing Technologies)
- **FOCI** (Free and Open Communications on the Internet, co-located with USENIX Security)
- **PETS** short paper / artifact track
- **USENIX Security** or **IEEE S&P** workshops on usable security, censorship, or
  human rights

What the paper needs:

- A precise coercion model and a formal indistinguishability game.
- A construction with a proof (or a clear argument and a negative result).
- A fair related-work section covering duress credentials, deniable encryption,
  coercion-resistant voting, designated-verifier proofs and covert channels.
- An implementation and a reproducible evaluation on real devices.
- An ethics section and a safety review; duress research can put people at risk.
- An artifact that reviewers can run.

### Main conference: not yet

S&P, CCS, USENIX Security, NDSS and PETS would likely reject the current version as
“application of known duress-password ideas with a weak tag and no formal model.” A main
conference version would need a genuinely new construction, a strong proof, a large
evaluation, and a clear answer to “why is this not just a panic password?” The
multi-witness coercion problem is the most promising source of a deeper contribution.

### Reviewer objections to prepare for

1. “This is a duress password with extra steps.” — Answer with the formal game and the
   provenance-specific constraints (public verifiability, transcript binding, repeated
   generation, multi-witness).
2. “The notary is a trusted third party; that defeats the point.” — Be explicit about the
   trust model; threshold notaries and transparency logs reduce, but do not eliminate,
   trust. Compare with C2PA’s trust list and Birthmark’s consortium chain.
3. “The false-positive rate is unacceptable.” — Fix it before submitting; report the
   exact rate and the human escalation policy.
4. “The captor can just demand the normal passphrase.” — Analyze this; the user can use
   the duress credential and claim it is normal, but repeated demands and prior
   credentials complicate it. This is a core research question, not a footnote.
5. “Where is the user study?” — At minimum, a usability pilot with non-at-risk
   participants and a safety review; ideally a journalist advisory group.

---

## 7. Concrete next steps (duress vertical slice)

| Step | Work | Evidence |
|---|---|---|
| 1 | Write failing tests for: 32-bit tag, no nonce reuse, transcript binding, false-positive budget | `tests/test_duress_keys.py` red |
| 2 | Replace the 8-bit predicate with a 32-bit (or stronger) PRF tag; use a per-session random seed and a tag pool | Tests green; no repeated tags in 10k sessions |
| 3 | Bind the tag to a canonical transcript hash; add a versioned bundle format | Tamper tests fail closed |
| 4 | Build a notary service with threshold shares and indistinguishable responses | API tests; timing distribution |
| 5 | Add a proof/signature binding the tag to the ZK proof (circuit public input or envelope signature) | Circuit test / envelope test |
| 6 | Benchmark on Pixel 8a, Moto G7 Power, ThinkPad P51 | Table in the paper |
| 7 | Safety review with a press-freedom organization | Written review |
| 8 | Write and submit the workshop paper | Artifact + preprint |

**Do not deploy the duress feature to at-risk users before steps 1–5 and 7 are complete.**
A false alarm or a detectable duress mode is worse than no feature.

---

## 8. Bottom line

- **Novel primitive?** No.
- **Novel system/problem?** Potentially, if framed as coercion-evident provenance with a
  threshold notary and a multi-witness setting, and if the construction is fixed.
- **Publishable now?** No. The current code is a demo with an 8-bit marker, nonce reuse,
  no proof binding, a client-side notary secret in the demo, and no formal model.
- **Publishable at a workshop after the fixes?** Yes, plausibly — with a formal game, a
  stronger one-time tag, a real notary, a device evaluation, and an ethics review.
- **The most valuable thing to do next:** make the duress slice real and safe, then use it
  as the first vertical slice. It is smaller than on-device ZK and it is the most
  differentiated part of the architecture.

---

## Appendix — local references

- [Duress patterns research](duress-patterns-research.md)
- [Roadmap Phase 3](../roadmap/ROADMAP.md)
- [MNR literature review](../literature/MNR_LITERATURE_REVIEW.md)
- [Technical review](../reviews/TECHNICAL_REVIEW_2026.md)
- [Vertical slices](../roadmap/VERTICAL_SLICES.md)

External starting points (verify citations before submission): Canetti–Dwork–Naor–
Ostrovsky (CRYPTO 1997); Jakobsson–Sako–Impagliazzo (EUROCRYPT 1996); Juels–Catalano–
Jakobsson (coercion-resistant elections); Juels–Ristenpart (EUROCRYPT 2014); Simmons
(CRYPTO 1983); Clark–Hengartner (panic passwords); Birthmark Standard arXiv:2602.04933;
C2PA specification.
