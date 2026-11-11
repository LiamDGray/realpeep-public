# RealPeep: Business Plan & Game Plan

July 2026

## Executive Summary

RealPeep is an open-source architecture for anonymous, physics-based video
provenance. It proves a video came from real hardware in a real physical
location at a real time — without revealing the device identity. The target
users are journalists, human rights workers, protesters, and whistleblowers.

The business model is **grant-funded open source with an optional paid tier**.
The game plan is to publish, standardize, and achieve platform ubiquity —
following the sigstore model: open protocol → reference implementation →
ecosystem adoption.

---

## 1. Problem & Solution

### The Problem

- Deepfakes are indistinguishable from real footage
- Existing provenance tools (C2PA, Truepic) reveal device identity
- Journalists and activists need to prove authenticity without being tracked
- Metadata-based solutions (C2PA) fail when social media strips metadata
- No existing tool provides anonymous, physics-based, multi-witness provenance

### RealPeep's Solution

A 4-layer provenance stack:

| Layer | What it proves | Technology |
|-------|---------------|------------|
| 1. ZK Identity Scrubbing | "Real hardware, not a deepfake" | Circom ZK circuit + TEE signature |
| 2. Multi-Witness Mesh | "Multiple devices, same room, same time" | BLE + acoustic CDMA + optical TLK co-location |
| 3. Frame Hash Chain | "Video hasn't been tampered with" | SHA-256 per-frame + Merkle tree |
| 4. Blockchain Anchor | "Video existed at this point in time" | OpenTimestamps (Bitcoin) + Stellar |

All four layers independently verifiable. All open source. No trust required.

---

## 2. Market & Comparables

### Target Users

| Segment | Size (est.) | Urgency | Monetization |
|---------|------------|---------|-------------|
| Journalists / media | ~500K globally | High — deepfake accusations are career-ending | Free (press verification) |
| Human rights workers | ~100K | Critical — evidence of atrocities | Free |
| Citizen journalists / protesters | ~10M | High — footage is their only defense | Free (limited) or $8/mo |
| Legal / insurance investigators | ~1M | Medium — evidence chain of custody | $8/mo |
| Content platforms (YouTube, TikTok) | ~5 | Low (they use C2PA already) | Enterprise (future) |

### Comparables

| Tool | Anonymity | Liveness | Mesh | Cost |
|------|-----------|----------|------|------|
| C2PA / CAI | ❌ Device ID exposed | ❌ | ❌ | Free (Adobe-funded) |
| Truepic | ❌ | ❌ | ❌ | Enterprise ($ undisclosed) |
| Birthmark Standard | ✅ (anonymity set) | ❌ | ❌ | Free (academic) |
| OpenTimestamps | N/A | ❌ | ❌ | Free (bitcoin fees only) |
| **RealPeep** | ✅ ZK-anonymous | ✅ CME+SPCI+HCSJ | ✅ BLE+acoustic+optical | Free (press) / $8/mo |

RealPeep's unique differentiator: **anonymous physics-based co-location proof.**
Nobody else has it.

---

## 3. Business Model

### Cost Structure (per session, batched)

| Cost item | Per session |
|-----------|------------|
| R2 storage (few KB JSON) | ~$0.000001 |
| Verifier compute (CDMA pairwise, 50 devices) | ~$0.001 |
| OpenTimestamps Bitcoin anchor (batched 1000:1) | ~$0.002 |
| Stellar anchor (operational, near-zero) | ~$0.00001 |
| **Total** | **~$0.003** |

### Revenue Model

| Tier | Who | Price | Quota | Annual per-user revenue |
|------|-----|-------|-------|------------------------|
| Press | Verified journalists, NGOs, HRDs | Free | 50 sessions/mo, 5GB | $0 |
| Standard | Everyone else | $8/mo | 200 sessions/mo, 25GB | $96 |
| Donations | Supporters | Any | — | Variable |

**Cost to serve Standard user:** $0.003 × 200 = $0.60/month.
**Gross margin on Standard:** ($8 - $0.60) / $8 = **92.5%**.

### Path to Sustainability

| Phase | Revenue source | Annual target |
|-------|---------------|---------------|
| Phase 1 (Y1) | NLnet grant + self-funding | €20K–€50K |
| Phase 2 (Y1-Y2) | OTF/Knight grant + MOSS | $100K–$300K |
| Phase 3 (Y2+) | Paid tier + donations + follow-on grants | $50K–$150K |
| Phase 4 (Y3+) | Enterprise (platform integration) | $200K+ |

**Break-even point:** ~50 paid Standard users covers infrastructure costs.
**Sustainability point:** ~500 paid users + 1 active grant = full-time developer.

---

## 4. Product Roadmap

### Phase 1: Prove It Exists (Now – Month 3)

**Deliverable:** Working Android prototype + arXiv preprint + NLnet application.

| Milestone | Date |
|-----------|------|
| Android app on 2+ real devices, BLE mesh working | Week 2 |
| Record real session (2 phones, same room) | Week 3 |
| Architecture preprint on arXiv (cs.CR) | Month 2 |
| Chirp-based CDMA demo in web simulator | Month 2 |
| USENIX Security / NDSS submission | Month 3 |
| NLnet NGI Zero PET application | Month 3 |

**Cost:** $0 (Cloudflare free tier, existing devices).

### Phase 2: Make It Credible (Month 3 – 9)

**Deliverable:** Security audit + iOS app + pilot users + OTF grant.

| Milestone | Date |
|-----------|------|
| NLnet grant awarded (€20K–€50K) | Month 4–5 |
| External security audit | Month 6 |
| iOS reference app (Swift) | Month 7 |
| 3+ pilot journalist organizations | Month 8 |
| Mozilla MOSS application | Month 8 |
| OTF Internet Freedom Fund application | Month 9 |

**Cost:** €30K–€50K (funded by NLnet grant).

### Phase 3: Make It Standard (Month 9 – 24)

**Deliverable:** IETF draft + C2PA interop + platform adoption.

| Milestone | Date |
|-----------|------|
| IETF draft: "Anonymous Hardware Provenance" | Month 10 |
| C2PA assertion type specification | Month 12 |
| Reference verifier hosted (realpeep.dev) | Month 14 |
| SecureDrop plugin | Month 16 |
| Paid tier launch ($8/mo) | Month 18 |
| Open Collective / GitHub Sponsors | Month 18 |
| OTF Phase 2 grant | Month 20 |

### Phase 4: Ubiquity (Month 24 – 36)

| Milestone | Date |
|-----------|------|
| Signal "verified capture" integration | Month 24 |
| Court-admissible evidence precedent | Month 30 |
| C2PA ecosystem integration (Adobe, camera apps) | Month 30 |
| ISO standard proposal | Month 36 |

---

## 5. Technical Differentiators (for Grant Applications)

### 5.1 Chirp-Based CDMA for Acoustic Mesh

**Problem:** Indoor acoustics is doubly-dispersive — multipath reflections cause
both time AND frequency dispersion. Gold codes (sinusoidal-based) perform
poorly in reverberant rooms because multipath creates multiple correlation peaks
that are hard to disambiguate.

**Solution:** Chirp-based spreading codes (AFDM / LoRa-style). When de-chirped
(multiplied by the conjugate chirp), different path delays map to different
frequency bins — the FFT naturally separates them. A single sharp peak in
the frequency domain identifies the line-of-sight path, regardless of how
many reflections exist.

**Computational comparison:**

| Method | Complexity | Multipath resilience | Demo status |
|--------|-----------|---------------------|-------------|
| Gold code + time-domain correlation | O(N×M) | Multiple peaks, ambiguous | ✅ Current demo |
| Gold code + FFT correlation | O(N log N) | Same as above, faster | Not implemented |
| **Chirp + de-chirp + FFT** | **O(N log N)** | **Single peak: paths map to distinct bins** | **Not yet** |

Chirp demodulation is NOT heavier than Gold code correlation — it's the same
computational complexity (FFT-based) with better multipath behavior. LoRa
devices running on coin cells do this in real time.

### 5.2 Temporal Luminance Keying (Optical Mesh)

Novel modulation scheme using whole-screen luminance toggling. Survives any
level of H.264/H.265 compression because the DCT DC coefficient is preserved
at all quantization levels. No prior art in the screen-camera communication
literature.

### 5.3 Rotational Block Keying (Novel, Future)

Rotating screen patterns as a third modulation dimension (space × time × angle).
No prior art in SCC/OCC literature through July 2026. Deferred pending
implementation and peer review.

### 5.4 Duress/Indistinguishable Keys

Two passphrases produce computationally indistinguishable Ed25519 keypairs.
Both produce valid-looking proofs. One silently signals coercion to the notary.
Novel application of steganographic key derivation to provenance.

### 5.5 Sigstead Integration

Session records are signed with standard in-toto v1 Statements, DSSE envelopes,
and (optionally) sigstore keyless. Interoperable with the CNCF supply-chain
security ecosystem. Offline-verifiable by any third party.

---

## 6. Go-to-Market Strategy

### 6.1 Academic First

Publish the architecture preprint on arXiv before any grant application. This:
- Establishes novelty (citable artifact)
- Attracts collaborators (Qualcomm colleague via co-authorship)
- Strengthens grant applications (proves the idea is reviewed)

Target conferences: USENIX Security, NDSS, IEEE S&P, ACM CCS.

### 6.2 Standards Second

An IETF RFC or C2PA assertion type is worth more than any app. If RealPeep
becomes a standard, every platform that implements C2PA can optionally verify
RealPeep proofs. This is how sigstore won — not by building the best signing
tool, but by becoming the standard signing format.

### 6.3 Platform Adoption Third

Once standardized, approach platforms for integration:
- **SecureDrop:** Journalists submit RealPeep-verified footage
- **Signal:** "Verified capture" mode for protest recording
- **Wikipedia:** Citizen journalism verification
- **Adobe Photoshop / Premiere:** C2PA assertion import

### 6.4 Community Fourth

GitHub Sponsors, Open Collective, and a paid tier for non-journalists provide
recurring revenue. The community maintains the open-source code; the core team
focuses on standards and platform integration.

---

## 7. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| C2PA becomes mandated, excluding alternatives | Medium | High | Build C2PA interop (RealPeep as C2PA assertion) |
| Apple/Google embed C2PA in camera hardware | Medium | High | Position RealPeep as the anonymous alternative |
| Grant applications rejected | Medium | High | Apply to multiple funders; arXiv preprint de-risks |
| Security vulnerability discovered | Low | Critical | External audit (NLnet-funded); open-source review |
| ME/CFS limits development pace | High | Medium | Attract co-author/collaborator; grants fund contractors |
| Duress protocol seen as "helping criminals" | Low | Medium | Frame as journalist protection; cite Keybase precedent |
| Bitcoin fees spike | Medium | Low | Dual-anchor with Stellar; Stellar is near-zero cost |

---

## 8. Financial Projections

### Phase 1 (Y1, grant-funded)

| Item | Amount |
|------|--------|
| NLnet NGI Zero PET grant | €30,000 |
| Self-funding (time) | $0 (volunteer) |
| Cloudflare free tier | $0 |
| **Total** | **€30,000** |

### Phase 2 (Y1–Y2, grant-funded)

| Item | Amount |
|------|--------|
| NLnet grant (carried forward) | €30,000 |
| Mozilla MOSS | $50,000 |
| OTF Internet Freedom Fund | $150,000 |
| Security audit | -$20,000 |
| Infrastructure (R2, Workers) | -$500 |
| **Total** | **~$210,000** |

### Phase 3 (Y2+, mixed funding)

| Item | Annual |
|------|--------|
| Paid tier (200 users × $8/mo) | $19,200 |
| Donations (GitHub Sponsors + Open Collective) | $5,000 |
| OTF Phase 2 grant | $150,000 |
| Infrastructure costs | -$2,000 |
| **Total** | **~$172,000** |

---

## 9. Immediate Next Steps (This Week)

1. **Deploy Android app to 2 real devices.** Record a BLE mesh session.
   Prove the mesh consensus works with real hardware.
2. **Draft arXiv preprint outline.** Sections: Abstract, Introduction,
   Architecture, CDMA Mesh Protocol, BLE Mesh Protocol, Optical Mesh,
   Duress Protocol, Security Analysis, Related Work.
3. **Implement chirp-based CDMA in web demo.** Replace Gold code correlation
   with chirp de-chirping + FFT. Compare performance in simulated multipath.
4. **Send preprint draft to Qualcomm colleague.** "DSP section on chirp-based
   CDMA for acoustic mesh — would love your eyes."
5. **Submit NLnet NGI Zero PET application.** Cite the preprint (even if
   still in draft — update with arXiv ID later).
