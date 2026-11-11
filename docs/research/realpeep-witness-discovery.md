# Literature-to-Design: Witness Discovery for RealPeep

**Use case:** After a protest/atrocity, find other witnesses (friends of friends) whom mutual friends vouch for as safe to contact.

---

## Why the Existing Literature Maps Perfectly

RealPeep's existing architecture already solves the hard problems. The literature tells us what *not* to do and which cryptographic primitives fit.

---

## 1. The Mesh Is Better Than ZK-PoL

**Literature finding:** ZK Proof-of-Location papers (Wu 2020, Bogdanov 2025, Tao 2023) all require an external trust anchor — GPS satellite signatures, WiFi AP attestations, roadside units. This creates a new trust dependency on the anchor.

**RealPeep insight:** You don't need ZK-PoL. RealPeep's **acoustic CDMA mesh** (Layer 2) already proves co-presence physically — "multiple devices, same room, same time" via Gold-code correlation, matched filter, and FEC recovery. This is *stronger* than any cryptographic location proof because:

- No GPS needed (GPS can be spoofed, jammed, or unavailable indoors)
- No infrastructure dependency (mesh is peer-to-peer)
- The physics of acoustic ranging bounds participants to tens of meters
- Mesh consensus requires multiple independent devices agreeing — Sybil-resistant by construction

**Design implication:** Witness vouching should use the mesh session as the trust root, not GPS coordinates or ZK proofs of location.

---

## 2. PSI for Friend-of-Friend Discovery (Not Hash-Based)

**Literature finding:** "All the Numbers Are US" (Hagen 2020) proved that hash-based contact discovery is broken — WhatsApp, Signal, and Telegram all leaked contact graphs via enumeration attacks. The mitigation is **Private Set Intersection (PSI)** (Pinkas 2014, Akhavan Mahdavi 2023 PEPSI, Yang 2025).

**Design implication:**

```
After protest:
  Witness A ↔ Witness B
     │              │
     └─── PSI ──────┘  ← finds mutual friends without leaking contacts
  
  Result: {mutual_friend_1, mutual_friend_2}
  
  Each mutual friend can attest:
  "I know A. I know B. I vouch they're safe."
```

The PSI primitive maps to RealPeep's use case because:
- **Unbalanced PSI** (one party with few contacts, server with many) works when witnesses query a directory
- **Threshold PSI** (require 3+ mutual friends to vouch) prevents single-point coercion
- **PSI with delegated blind quantum computing** (Amoretti 2022) is overkill — classical PSI is sufficient

**What not to do:** Never hash phone numbers and upload. Hagen et al. showed this is enumeration-vulnerable even with keyed hashes.

---

## 3. The Mesh Session as a Vouching Graph

The acoustic mesh already creates a natural trust graph:

```
        ┌─── Device A ───┐
        │                 │
  mesh session S      mesh session S
        │                 │
        └─── Device B ───┘
        
  Fact: A and B were in the same room at the same time
  Proof: Mesh attestation with Gold-code sequence signatures
  Trust: "If I trust A, and A was co-present with B, I can trust B for this event"
```

This is a transitive trust chain rooted in physical co-presence — no social graph upload required.

**Related literature:**
- **Proximity testing SoK** (Gambs 2020): Classifies this as "peer-verified co-presence" — the strongest class of location proof because it doesn't rely on any infrastructure.
- **Staying Fresh** (Li 2023): Algorithms for timely social information diffusion — relevant for propagating witness attestations across the mesh.

---

## 4. Graduated Trust via Duress Keys

RealPeep's existing `duress_keys.py` already has:
- PBKDF2 → Ed25519 key derivation with graduated coercion resistance
- Nonce selection that reveals duress state
- Notary detection for forced attestations

**Extend this to witness vouching:**

| Trust Level | Vouch Meaning | Crypto Required |
|-------------|---------------|-----------------|
| Level 0 | "I was in the same mesh session" | Mesh attestation only (existing) |
| Level 1 | "I know this person IRL" | PSI + signed attestation |
| Level 2 | "I'll put my reputation on it" | Level 1 + threshold multi-sig |
| Level 3 | "I'll testify publicly" | Level 2 + ZK-scrubbed identity binding |

Duress keys already handle the coercion case: if forced to vouch, a duress-level signature creates a recognizable (to you) but indistinguishable (to the adversary) signal.

**Related literature:**
- **Duress key finding** from the literature review: No paper in our set addresses coercion-resistant witness vouching. This is genuinely novel.

---

## 5. Avoid the Fediverse Location Gap

**Literature finding:** The Fediverse has no location-based discovery protocol. ActivityPub has no standard proximity query, no private proximity testing, and no cross-server location privacy.

**Design implication:** Since RealPeep is already a standalone protocol (not a Fediverse platform), this gap is an opportunity rather than a problem. Design the witness discovery as:
1. **Mesh-local** — within acoustic range during event
2. **PSI-mediated** — for post-event friend-of-friend discovery
3. **Self-hosted directory** — no centralized server, no federation dependency

This avoids the entire "federated location privacy" unsolved problem.

---

## 6. What *Not* to Build

From the literature, these approaches would be wrong for RealPeep's use case:

| Approach | Why Wrong | Paper |
|----------|-----------|-------|
| **Geo-indistinguishability / DP** | Noise makes precise "were you at this protest?" unprovable | Andrés 2011 |
| **Blockchain ZK-PoL** | On-chain verification adds latency and cost, no benefit for mesh-local trust | Wu 2020, Shen 2020 |
| **Fully Homomorphic Encryption** | 10²–10⁴× slowdown, not needed (we only need PSI, not arbitrary computation) | Li 2020 |
| **K-anonymity location cloaking** | Temporal correlation attacks break it; unique mobility patterns are common | Xing 2021 |
| **Centralized trust directory** | Single point of failure, surveillance target, "All Numbers Are US" attack | Hagen 2020 |

---

## 7. Proposed Protocol Sketch

```
Phase 1 — During event (mesh-local):
  - Devices broadcast Gold-code sequence (existing CDMA mesh)
  - Each device records which other devices it heard
  - Mesh attestations are signed and exchanged via the mesh
  - Results in: "signed roster of co-present devices"

Phase 2 — Post-event discovery (PSI-mediated):
  - Witness A wants to find others from the same event
  - A broadcasts: "mesh session S, seek contacts" (via Tor/darknet/PT)
  - Other devices from session S respond
  - A ↔ B run private set intersection:
      Input_A = {A's contacts}
      Input_B = {B's contacts}
      Output  = {mutual contacts}
  - Mutual contacts are asked to vouch (Level 1+)
  - Vouch attestations are signed and exchanged

Phase 3 — Trust aggregation:
  - Threshold: require 2+ mutual contacts to vouch
  - Mesh session: require 3+ co-present devices to confirm event
  - Duress keys: any vouch can be made under duress
  - End result: "Verified peer witness" credential
```

**No GPS. No ZK location proofs. No federated protocol. No blockchain for discovery.** Only PSI + existing mesh + graduated trust.

---

## 8. Research Gaps RealPeep Could Fill

1. **Coercion-resistant witness vouching** — No paper in our set addresses this. RealPeep's duress keys + PSI vouching would be novel.

2. **Practical PSI for mesh-scale social discovery** — PSI papers assume client-server or pairwise; mesh-scale PSI (N parties, limited-range broadcast) is unexplored.

3. **Mesh consensus as location trust anchor** — Every ZK-PoL paper assumes an external oracle; none uses peer-to-peer acoustic ranging as the trust root. This is a genuinely different approach.

---

## Key Papers Supporting This Design

| Paper | What It Contributes |
|-------|-------------------|
| Pinkas et al. 2014 — "Scalable PSI" | PSI primitive for friend discovery |
| PEPSI 2023 (Akhavan Mahdavi) | Unbalanced PSI practical for mobile |
| Gambs 2020 — "SoK: Proximity Testing" | Classifies peer-verified co-presence as strongest |
| Hagen 2020 — "All Numbers Are US" | Why NOT to use hash-based discovery |
| Caprolu 2023 — "Watch Nearby!" | Real-world privacy failure of GPS-based discovery |
| Yang 2025 — "Efficient Fuzzy PSI" | PSI with tolerance for inexact matching |
