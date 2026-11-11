# RealPeep: Path to Maximum Reach

July 2026

## The North Star

RealPeep's maximum reach is not as a consumer app. It's as a **standard component
in the provenance ecosystem** — what sigstore became for software signing, RealPeep
becomes for anonymous hardware provenance.

The model: publish the protocol as an open standard → build reference
implementations → get adopted by platforms → ubiquity follows.

## Phase Map

```
Phase 1: Prove It Exists          Phase 2: Make It Credible         Phase 3: Make It Standard
(now – 3 months)                  (3 – 9 months)                    (9 – 24 months)
─────────────────                  ─────────────────                 ──────────────────
✅ Android prototype              📄 arXiv preprint published        📡 IETF/W3C draft
✅ BLE mesh on real devices       🔒 Security audit (grant-funded)   🔗 C2PA interop spec
✅ Session recording working      🍎 iOS reference app               🏛️ Adopted by 1+ platform
✅ Bundle → R2 proven             👥 3+ pilot journalist orgs        📋 RFC published
                                  💰 NLnet/OTF grant secured         🏭 Reference verifier hosted

Phase 4: Ubiquity
(24 – 36 months)
─────────────────
🔌 SecureDrop plugin
📰 Wikipedia/Wikimedia integration
📱 Signal "verified capture" mode
🏛️ Court-admissible evidence standard
```

## Phase 1: Prove It Exists (Now – 3 months)

**Goal:** Working prototype on real devices, architecture preprint on arXiv.

| Step | Deliverable | Deadline |
|------|------------|----------|
| Deploy Android app to 2+ real devices | Video recording + BLE mesh working | Month 1 |
| Record a real session (2 devices, same room) | Proof that mesh consensus works | Month 1 |
| Write architecture preprint | arXiv submission (cs.CR) | Month 2 |
| Send preprint to Qualcomm colleague | "Would love your eyes on the DSP section" | Month 2 |
| Publish to arXiv | Public, citable | Month 2 |
| Submit to USENIX Security or NDSS | Conference paper | Month 3 |
| **Then:** Apply to NLnet NGI Zero PET | Grant application cites preprint | Month 3 |

**Cost:** $0 (self-funded, using existing devices and Cloudflare free tier).
R2 storage and Workers are free for this volume (>10M requests/month free on Workers,
10GB free on R2).

**Why publish BEFORE applying:** A preprint on arXiv is a citable artifact that
proves: (a) the idea is novel, (b) you're serious, (c) external validation is in
progress (conference submission). Grant reviewers prefer evidence over promises.

## Phase 2: Make It Credible (3 – 9 months)

**Goal:** Security audit, iOS app, pilot users, first grant secured.

| Step | Deliverable | Funded by |
|------|------------|-----------|
| NLnet grant received (€20K–€50K) | Development + audit budget | NLnet |
| Security audit (external firm) | Published audit report | NLnet grant |
| iOS reference app | Swift, same protocol | NLnet grant |
| Pilot: 3+ journalist orgs | Letters of support, usage data | NLnet grant |
| Co-author contribution from Qualcomm colleague | DSP section strengthened | Collaboration |
| Mozilla MOSS application | Second grant | Pilot evidence |
| OTF application | Major grant ($100K–$300K) | Pilot + preprint + audit |

**Why NLnet first:** Fast cycle (6-10 weeks), funds research/pre-production, low
barrier. OTF wants evidence of traction — NLnet funds the traction-building.

## Phase 3: Make It Standard (9 – 24 months)

**Goal:** Protocol standardized, adopted by platforms, self-sustaining.

| Step | Deliverable |
|------|------------|
| IETF draft: "Anonymous Hardware Provenance for Media Capture" | Standards-track RFC |
| C2PA interop: RealPeep proof as a C2PA assertion type | Spec + reference code |
| Reference verifier hosted (realpeep.dev) | Public endpoint |
| SecureDrop plugin | Journalists submit RealPeep-verified footage |
| Wikipedia integration | Citizen journalism verification |
| OTF Phase 2 grant | Sustained funding |
| Optional: paid tier ($8/mo) for non-journalists | Revenue for ops |
| Open Collective / GitHub Sponsors | Community donations |

**Why standards matter more than apps:** If RealPeep becomes an IETF RFC and a
C2PA assertion type, every platform that implements C2PA can optionally verify
RealPeep proofs. You don't need to build the app — Apple, Google, and Adobe
build it into their tools. That's the maximum reach play.

## Phase 4: Ubiquity (24 – 36 months)

**Goal:** RealPeep is the default for anonymous video provenance.

| Step | Signal |
|------|--------|
| Signal "verified capture" mode | 100M+ users |
| Court-admissible evidence standard | Legal precedent |
| Integrated into camera hardware (TEE signing at capture) | Qualcomm/Apple partnership |
| ISO standard for anonymous media provenance | Global adoption |

## The Stellar Question

For Phase 1-2, OpenTimestamps on Bitcoin is the right anchor — it's the most
credible, most audited chain, and the preprint should reference it. But for
Phase 3+ cost-effectiveness at scale, add a Stellar anchor:

```
Session → Merkle root → OpenTimestamps (Bitcoin, canonical)
                      → Stellar memo hash (operational, free)
```

The Bitcoin anchor is the "golden record." The Stellar anchor is the cheap,
fast verification path. Both are independently verifiable. This dual-anchor
model is novel and publishable.

If a regulator says "Bitcoin or nothing," the Bitcoin anchor is already there.
If a journalist says "I can't afford Bitcoin fees," the Stellar anchor is free.

## Immediate Next Step

1. **This week:** Deploy the Android app to 2 real devices. Record a session.
2. **This month:** Write and submit the arXiv preprint.
3. **Month 2:** Send preprint to Qualcomm colleague with co-authorship offer.
4. **Month 3:** Apply to NLnet NGI Zero PET with the preprint.
