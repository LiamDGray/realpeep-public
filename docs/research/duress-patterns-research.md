# Duress Mode: Validated Cryptographic Patterns for RealPeep Phase 3

**Project:** RealPeep — Anonymous Provenance & Mesh Consensus
**Phase:** 3 — The Formal Duress Protocol
**Date:** 2026-06-26

---

## Threat Model

RealPeep's duress mode must hold against:

- **Attacker has physical control of the user** — rubber-hose coercion, gunpoint, arrest
- **Attacker has full access to device** — can read storage, inspect RAM, watch proof generation
- **Attacker will analyze all protocol data** — ZK proofs, mesh attestations, timestamps, nonces
- **User cannot visibly do anything suspicious** — no "type duress password" visible to attacker
- **ZK proof travels over TCP** — publicly inspectable; verifier may be compromised
- **Mesh witnesses offline during capture** — come online later, must signal coercion retroactively

Design goal: **The captor can never distinguish "normal" from "duress" by inspecting any data they can access, even with full knowledge of the algorithms.**

---

## Pattern 1: Duress-Derived Keys (Highest Practicality)

**Citation:** ATM duress PIN standards (ANSI X9.8 / ISO 9564); generalized as "coercion-resistant authentication" in security engineering literature (Anderson, *Security Engineering*, Ch. 19).

### How It Works

The user memorizes **two passphrases** — one normal, one duress. Both produce a valid ZK secret key, but the duress-derived key produces a proof where a specific public input (e.g., the nonce or a designated witness field) satisfies a predicate checkable only by the notary.

```
Normal passphrase   → normal key   → normal proof (no flag)
Duress passphrase   → duress key   → proof embedded with hidden flag
```

The captor cannot distinguish the two keys because both produce proofs that pass public verification. The hidden flag is detectable only by the notary who holds the extraction secret.

### Trust Assumptions

- Notary must be trusted to process the flag without visible consequence
- Both keys must be indistinguishable (same format, same generation algorithm)
- The user must be able to plausibly give the duress key as "the real key"

### Real-World Examples

- **ATM Panic PINs** — ATMs in Germany, UK, US (limited) allow entering a duress PIN that disables cash dispensing while alerting police. The attacker cannot distinguish the duress PIN from the normal PIN.
- **Prison phone systems** — inmates can enter a duress code that silently records the call for authorities.
- **VeraCrypt hidden volumes** — two passwords; one opens decoy data, the other opens hidden data. Both keys are equally valid.

### Relevance to RealPeep

**High.** Direct fit. The user memorizes two passphrases. Under duress, they use the duress phrase. The resulting ZK proof validates normally (passes the liveness checks) but carries the flag. The notary raises the alert.

**Limitations:**
- If the attacker demands proof *generation* (not just keys), the user's software must know which phrase is duress. The attacker can watch the user type — no visible difference if both phrases look like normal passphrases.
- If the attacker demands both passphrases, the user gives the normal one first, then the duress one. The attacker cannot tell which is which.

---

## Pattern 2: Steganographic Coercion Flags via Nonce Embedding (Highest Stealth)

**Citation:** G. J. Simmons, "The Prisoners' Problem and the Subliminal Channel," *CRYPTO '83*. Extended in L. von Ahn, N. Hopper, J. Langford, "Covert Two-Party Computation," *STOC '05*.

### How It Works

The ZK proof contains fields that must be randomly generated for cryptographic soundness (nonces, blinding factors, sigma-protocol challenges). Under duress, the user's software generates these values such that they **satisfy a hidden predicate** known only to the notary.

**Example:** The proof nonce `r` is chosen so that `SHA256(notary_public_key || r)` has the first `k` bits equal to a pre-agreed duress marker. The notary checks this; the captor sees only a random-looking nonce.

```
Normal:  r = random()              → nonce looks random
Duress:  r = find_duress_nonce()   → nonce still looks random, but satisfies predicate
```

### Trust Assumptions

- The captor cannot distinguish the embedding distribution from truly random values
- The notary has a public key that the embedding code uses (or a shared secret)
- The embedding algorithm is deterministic in the coercion, not learnable from repeated proofs

### Real-World Examples

- **Zcash shielded notes** — low-order bits of note commitments carry metadata flags (used for non-duress purposes but same technique)
- **Signal Protocol** — sealed sender padding carries protocol metadata indistinguishable from random
- **TCP/IP covert channels** — low-order bits of timestamp fields in TCP headers carry data (Simmons' original problem)

### Relevance to RealPeep

**High.** The ZK proof in RealPeep has many "random" fields (nonces, public inputs, proof transcript elements). Embedding a duress flag in one of these is:
- **Undetectable** — the captor cannot distinguish coaxed randomness from true randomness
- **Works under full device control** — the code always picks the nonce; the attacker sees the input but not the *intent*
- **Does not change verifiability** — the public proof still validates normally

**RealPeep-specific embedding points:**
1. **Nonce field** in the ZK proof transcript (Groth16 proof has no nonces, but PLONK/Halo2 do)
2. **Poseidon hash preimage** — one of the public input field elements
3. **Padding bytes** in the serialized TCP packet (if using protobuf/JSON)
4. **Ephemeral public key** — choose from a set where some keys carry the flag

---

## Pattern 3: Designated-Verifier Proofs (Formal Deniability)

**Citation:** Y. Tauman Kalai, Y. Lindell, M. Prabhakaran, "Cryptographic Witness Indistinguishability and Deniable Zero-Knowledge," *STOC '05*. Also J. Groth, A. Sahai, "Efficient Non-Interactive Proof Systems for Bilinear Groups," *EUROCRYPT '08* (designated-verifier section).

### How It Works

The prover generates a proof that **only a designated verifier** (holding a secret) can verify. The prover can later claim the proof was forged — the verifier can simulate identical-looking proofs, so the proof is "deniable."

```
Public proof:   Anyone can verify  →  publicly verifiable
Designated:     Only notary can verify  →  deniable by prover
```

### Trust Assumptions

- The designated verifier (notary) is trusted not to collude with the attacker
- Requires a Common Reference String (CRS) setup that may be trapdoored
- The verifier must be online to check (or share the secret with the checking infrastructure)

### Real-World Examples

- **Helios 2.0 voting** — voters can generate a designated-verifier proof that they voted for candidate X, but only they (or their designated verifier) can verify it. Prevents vote-selling.
- **Prêt à Voter** — coercion-resistant voting with designated-verifier receipts.
- **Anonymous credentials** — show a credential to one verifier without fear of showing it to another (unlinkability).

### Relevance to RealPeep

**Medium.** Designated-verifier proofs would mean the duress flag is mathematically undeniable — the prover can always say "you forged that." But it **breaks public verifiability** of the flag. A hybrid approach could work: the main liveness proof is publicly verifiable; a small "coercion flag" proof is designated-verifier only.

**Caveat:** RealPeep's value proposition includes public verifiability of provenance. Designated-verifier for the duress flag doesn't hurt this — the main proof is still public, the flag is a side channel.

---

## Pattern 4: Deniable Encryption / Hidden Volume (Dual Plaintext)

**Citation:** R. Canetti, C. Dwork, M. Naor, R. Ostrovsky, "Deniable Encryption," *CRYPTO '97*. Practical implementation: TrueCrypt / VeraCrypt hidden volumes.

### How It Works

A single ciphertext decrypts to **two different plaintexts** depending on which key is used. The user can reveal the decoy key and plaintext under duress; the real plaintext remains hidden.

```
Ciphertext:
  normal_key → normal_plaintext (decoy, harmless)
  duress_key → hidden_plaintext  (real provenance data)
```

### Trust Assumptions

- The ciphertext must be indistinguishable from random for any key not used
- The keyspace must be large enough that the attacker cannot enumerate
- The user must be able to plausibly claim the decoy key is the only key

### Real-World Examples

- **TrueCrypt/VeraCrypt hidden volumes** — one partition contains a decoy OS and data; a second hidden volume is invisible without the second key
- **StegFS** — steganographic file system where files are hidden in random blocks
- **Rubberhose filesystem (FISH10)** — multiple layers, each with its own plausible deniability

### Relevance to RealPeep

**Medium.** The device could store pre-computed "decoy" ZK proofs that look valid but contain false provenance data. Under duress, the user reveals the decoy proofs. But:
- The attacker may demand **new** proof generation, not just stored proofs
- If the real key is derived from a passphrase, we're back to Pattern 1
- Storage scanning can detect multiple proof databases

---

## Pattern 5: Timed-Release Crypto / Dead Man's Switch (Mesh Rollback)

**Citation:** R. Rivest, A. Shamir, D. Wagner, "Time-Lock Puzzles and Timed-Release Crypto," *MIT/LCS/TR-684*, 1996. Also J. Garay, C. Gentry, K. Pietrzak, "Revocation in the Presence of Duress," *PKC '08*.

### How It Works

The user releases a time-lock encrypted message. The puzzle requires sequential computation to solve. Under duress, the user gives the attacker the puzzle; the attacker cannot solve it faster than the network, which gets the answer at a known future time.

**Dead man's switch variant:** A signed message is withheld unless the user sends a "still alive" heartbeat. If heartbeat stops (duress, arrest), the message auto-releases.

### Trust Assumptions

- The time-lock puzzle must be inherently sequential (no parallel speedup)
- The network must detect the difference between "normal release" and "forced release"
- Heartbeat requires the user to have periodic connectivity

### Real-World Examples

- **Ethereum dead man's switches** — smart contracts that release funds to heirs if no heartbeat
- **MyEtherWallet inheritance** — releases wallet access after configurable timeout
- **Bitcoin timelocks** — `OP_CHECKLOCKTIMEVERIFY` prevents spending until a future block

### Relevance to RealPeep

**Medium for mesh rollback.** Mesh nodes that were offline during capture can have a timer. If the real secret is not refreshed before a deadline, the network **revokes** that node's attestations. Under duress, the user cannot refresh (or deliberately stops the heartbeat).

**Limitations:**
- The attacker may force the user to continue the heartbeat after capture
- Requires the mesh node to have periodic connectivity (which it may not, by design of the acoustic offline mesh)

---

## Pattern 6: Threshold Secret Sharing with Coercion-Aware Shares

**Citation:** A. Shamir, "How to Share a Secret," *Comm. ACM*, 1979. M. K. Franklin, M. Yung, "The Variety of Coercion-Resistant Sharing," *CRYPTO '95*.

### How It Works

Split a secret (e.g., the notary's verification key) into `n` shares such that `k` are needed to reconstruct. Some shares are "decoy" shares that the user can give to the attacker. The real secret is only reconstructible from shares that include one specific **coercion-aware share** held by the notary.

```
Share 1: real (held by mesh node A)
Share 2: real (held by mesh node B)
Share 3: decoy (given to attacker under duress)
Share 4: coercion-aware (held by notary — required for real reconstruction)
```

### Trust Assumptions

- Shares are indistinguishable from random (any subset of <k shares leaks nothing)
- The attacker cannot distinguish decoy shares from real shares
- At least one honest node remains uncompromised to provide the coercion-aware share

### Relevance to RealPeep

**Low unless multi-node.** Works well if RealPeep has multiple notary servers. A single-user system (one phone generating proofs) cannot use this without an external notary that the attacker can also find.

---

## Pattern 7: Chaffing & Winnowing (Not Applicable)

**Citation:** R. Rivest, "Chaffing and Winnowing: Confidentiality without Encryption," *CryptoBytes*, 1998.

**Brief:** The sender transmits many fake packets (chaff) alongside the real one (wheat). The recipient uses a shared secret to filter.

**Why it fails for RealPeep:** The attacker has full access to the device and can see **all** generated proofs — chaff and wheat. They can also watch the generation process. Chaffing is detectable when the attacker controls the endpoint.

---

## Recommended Architecture for RealPeep Phase 3

### Primary: Duress-Derived Key + Steganographic Nonce Embedding

These two patterns are **complementary** and should be combined:

1. **Duress passphrase** → generates the same key format as the normal passphrase
2. **Duress-proof generation** uses a **nonce that satisfies a hidden predicate** checkable only by the notary
3. **The notary** checks every proof against the duress predicate. On match: triggers silent alert protocol
4. **The captor** sees:
   - A valid ZK proof (passes all public checks)
   - A random-looking nonce (indistinguishable from normal)
   - A valid-looking passphrase (identical in format to the real one)

### Secondary: Mesh Node Retroactive Rollback via Heartbeat

1. Each mesh node generates a **signed attestation** during the offline mesh phase
2. The attestation includes a **heartbeat deadline** — a future timestamp
3. If the node does not publish a "still free" heartbeat before the deadline, the network:
   - Revokes the node's attestations
   - Publishes a revocation certificate to the blockchain / public ledger
4. Under duress: the user stops sending heartbeats → attestations are automatically invalidated

### Duress vs Normal: Detection Matrix

| Observer | Normal Proof | Duress Proof | Can detect difference? |
|----------|-------------|-------------|----------------------|
| Captor (all data) | Sees proof, nonce, passphrase | Sees proof, nonce, passphrase | **No** — both are valid, both look identical |
| Notary (with secret) | Checks predicate → no match | Checks predicate → match found | **Yes** — silently triggers alert |
| Public (verifier) | Valid proof | Valid proof | **No** — both pass public verification |
| Mesh peers | Normal attestation | Attestation with approaching deadline | **No** — only the notary knows the deadline will be missed |

### Protocol Flow

```
1. User generates passphrase → normal key
   OR
   User generates passphrase → duress key (same format, different derivation)

2. Software generates ZK proof:
   - Normal mode: random nonce, standard proof
   - Duress mode: nonce selected to satisfy predicate, standard proof

3. Proof sent to notary over TCP

4. Notary:
   - Verifies proof (normal operation)
   - Checks nonce predicate (hidden operation)
   - If matched: flags the session as coercion, triggers silent protocol
     (no visible change to captor — no acknowledgment, no latency difference)

5. [Optional] Notary publishes a revocation to the mesh consensus layer
```

### Implementation Details for Circom

The Circom circuit (`scrubber.circom`) needs no changes — the flag is embedded in **how** the inputs are chosen, not in the constraints. The nonce embedding would be a software-layer concern (in the proof generation wrapper, not the circuit itself).

For a Circom Groth16 proof specifically:
- The proof has no nonce field — the "randomness" is in the blinding of the prover's witness. Different blinding values produce different proofs for the same inputs, but the verifier can't tell which blindings were used.
- **Better approach:** Embed the flag in one of the **public input** field elements. The ephemeral public key or a designated "coercion witness" field can be chosen to satisfy the predicate.

**If using PLONK or Halo2:** Much easier — these have explicit nonces and challenge values that can carry the flag.

---

## Bibliography

1. R. Rivest, "Chaffing and Winnowing: Confidentiality without Encryption," *CryptoBytes*, 1998.
2. R. Canetti, C. Dwork, M. Naor, R. Ostrovsky, "Deniable Encryption," *CRYPTO '97*.
3. G. J. Simmons, "The Prisoners' Problem and the Subliminal Channel," *CRYPTO '83*.
4. L. von Ahn, N. Hopper, J. Langford, "Covert Two-Party Computation," *STOC '05*.
5. Y. Tauman Kalai, Y. Lindell, M. Prabhakaran, "Designated-Verifier Proofs and Deniable NIZK," *STOC '05*.
6. J. Groth, A. Sahai, "Efficient Non-Interactive Proof Systems for Bilinear Groups," *EUROCRYPT '08*.
7. R. Rivest, A. Shamir, D. Wagner, "Time-Lock Puzzles and Timed-Release Crypto," MIT/LCS/TR-684, 1996.
8. J. Garay, C. Gentry, K. Pietrzak, "Revocation in the Presence of Duress," *PKC '08*.
9. A. Shamir, "How to Share a Secret," *Comm. ACM*, 1979.
10. M. K. Franklin, M. Yung, "The Variety of Coercion-Resistant Sharing," *CRYPTO '95*.
11. J. Auspicious, "Rubberhose Filesystem," *Usenix Security*, 2000 (pseudonymous author).
12. ANSI X9.8 / ISO 9564 — Financial services, Personal Identification Number (PIN) management and security (duress PIN provisions, Annex D).
13. R. Anderson, *Security Engineering*, 3rd ed., Wiley, 2020 (Chapter 19 on coercion resistance).

---

## Files

- This document: `~/src/realpeep/duress-patterns-research.md`
