# RealPeep Funding: Grant-Funded Model — SWOT Analysis

July 2026

---

## 1. Potential Funding Organizations

### Press Freedom & Journalist Safety

| Organization | Why RealPeep fits | Grant type |
|-------------|-------------------|------------|
| **Open Technology Fund (OTF)** | Funds internet freedom + anti-censorship tools. RealPeep's core use case (journalist + protester provenance) is exactly OTF's mandate. | $50K–$300K, multiple phases |
| **Freedom of the Press Foundation (FPF)** | Runs SecureDrop. Provenance for whistleblower submissions is an obvious adjacency. | Smaller grants, $10K–$50K |
| **Committee to Protect Journalists (CPJ)** | Journalist safety. RealPeep proves a journalist's footage is real to combat "fake news" accusations. | Emergency + technology grants |
| **The Signals Network** | Whistleblower support. Anonymous provenance aligns with their mission. | Direct funding or partnership |

### Human Rights & Digital Security

| Organization | Why RealPeep fits | Grant type |
|-------------|-------------------|------------|
| **Ford Foundation** | Digital rights + internet freedom focus. Has funded similar tools. | $100K–$500K |
| **Mozilla Foundation** | Open internet, privacy. RealPeep's zero-trust architecture aligns with Mozilla's values. | $25K–$150K (Mozilla Open Source Support) |
| **Access Now** | Digital security helpline for activists. RealPeep fits their technology arm. | Small grants or partnership |
| **EFF** | Digital rights litigation. RealPeep evidence could be cited in cases. | Unlikely to fund directly; endorsement valuable |

### Open Source & Internet Infrastructure

| Organization | Why RealPeep fits | Grant type |
|-------------|-------------------|------------|
| **NLnet Foundation** | NGI Zero grants. Funds open internet research. RealPeep's novel architecture (ZK + CDMA mesh) qualifies as research. | €5K–€50K per project |
| **Protocol Labs** | Filecoin/IPFS ecosystem. RealPeep's content-addressed proofs could use IPFS for bundle storage. | Developer grants |
| **Linux Foundation / CNCF** | Sigstead integration aligns with in-toto + sigstore ecosystem. | Indirect — collaboration, not funding |
| **Ethereum Foundation** | ZK + privacy tech. The duress protocol and ZK identity scrubber are novel ZK applications. | ESP grants ($10K–$100K+) |

### Journalism Innovation

| Organization | Why RealPeep fits | Grant type |
|-------------|-------------------|------------|
| **Knight Foundation** | Journalism + technology innovation. Provenance for citizen journalism. | $50K–$500K |
| **Google News Initiative** | Media verification tools. | $25K–$100K |
| **International Fact-Checking Network (IFCN)** | Fact-checkers need provenance tools. | Partnership or small grants |

### Philanthropy

| Organization | Why RealPeep fits | Grant type |
|-------------|-------------------|------------|
| **Omidyar Network** | Tech + society. Funds tools that challenge power structures. | $100K–$500K |
| **Open Society Foundations** | Human rights, journalism, accountability. | $50K–$300K |

### Multi-Funder Strategy

The strongest path is **OTF (primary) + NLnet (research) + Knight (journalism)**. These three cover different aspects (freedom tooling, research novelty, journalism application) and are complementary — a grant from one strengthens applications to the others.

---

## 2. SWOT Analysis

### Strengths

- **Solves a real, urgent problem.** Deepfake provenance, journalist safety, and evidence authentication are growing crises. No existing tool provides anonymous, physics-based video provenance.
- **Unique competitive moat.** RealPeep is the only system combining ZK identity scrubbing + liveness detection + CDMA mesh consensus + frame hash chain + blockchain anchoring. Truepic and C2PA address parts; nobody addresses the whole stack.
- **Open source, verifiable, zero-trust.** Funders in this space strongly prefer open-source tools. The architecture requires no trust in RealPeep infrastructure — verification is offline. This is a differentiator from Truepic (proprietary, centralized).
- **Novel and publishable.** Multiple novel contributions: rotational block keying for optical SCC, TLK compression survival, chirp-based CDMA for acoustic, duress/normal key indistinguishability. Academic publication potential strengthens grant applications.
- **Complementary to existing tools.** RealPeep doesn't compete with SecureDrop (it proves what SecureDrop received is real). Doesn't compete with Archivista/Witness (Sigstead interops with both). Positioned as a component, not a platform.
- **Sigstead integration.** The CNCF/supply-chain security ecosystem (in-toto, sigstore, DSSE) is well-funded and growing. RealPeep's use of these standards makes it more fundable — it's not reinventing wheels.

### Weaknesses

- **No production deployment.** The Android app is scaffolded but untested on real devices. The verifier is Python simulation, not a deployed service. Funders want to see a working prototype, not just architecture.
- **Single developer.** Grant reviewers prefer teams with multiple contributors, institutional backing, or a track record of shipped tools. Solo projects are riskier.
- **Novelty is double-edged.** The novel architecture needs peer review, security audit, and academic validation before it's credible to funders. "Has anyone else reviewed this?" is a question every grant application must answer.
- **Limited capacity.** ME/CFS limits the pace of development. Grants come with deadlines, reporting requirements, and deliverables. The administrative overhead may exceed the development bandwidth.
- **No user community yet.** Funders want evidence of demand — users, pilot partners, letters of support from journalism organizations. RealPeep has none.

### Opportunities

- **Deepfake regulation is coming.** The EU AI Act, US executive orders, and platform policies are all moving toward mandatory provenance. RealPeep can position as "the privacy-preserving compliance tool" — meeting provenance requirements without surveillance.
- **Journalist safety is a funding priority.** OTF, FPF, CPJ, and RSF all have growing budgets for digital safety tools. The 2024-2026 global crackdown on journalists creates urgency.
- **ZK + privacy alignment.** Zero-knowledge proofs are a major funding trend (Ethereum Foundation, Protocol Labs, academic grants). RealPeep's ZK identity scrubber is a novel, non-financial ZK application — differentiates from the DeFi crowd.
- **Mesh consensus is unique.** Nobody else proves physical co-location. This is RealPeep's single strongest differentiator for funding — it's not just "yet another provenance tool," it's a fundamentally new capability.
- **Sigstead + CNCF alignment.** The supply-chain security ecosystem is well-funded. RealPeep's Sigstead integration positions it as a producer in the in-toto ecosystem — fundable as "applying supply-chain security to journalism."
- **Academic publication.** A paper at USENIX Security, NDSS, or IEEE S&P would validate the architecture and open doors to NSF/EU grants tied to university collaborators.
- **Multiple funding angles.** The same tool can be pitched to internet freedom funders (OTF), journalism funders (Knight), research funders (NLnet, NSF), and crypto funders (EF). Each pitch emphasizes different aspects.

### Threats

- **C2PA becomes mandated.** If platforms (Meta, YouTube, X) require C2PA Content Credentials and reject anything else, RealPeep becomes niche. Mitigation: RealPeep's proof is separate from the media file — it doesn't need platform integration. But adoption suffers if platforms only surface C2PA.
- **Apple/Google build provenance into the camera stack.** If iOS and Android embed C2PA signing at the hardware level, a third-party app has no advantage. Mitigation: RealPeep's anonymity is the differentiator — OS-level provenance reveals device identity.
- **Funders prefer established teams.** OTF and Knight have funded the same organizations for years. Breaking in as a solo developer is hard. Mitigation: partner with an existing grantee (FPF, Access Now, a university lab).
- **Duress protocol = "helping criminals."** Some funders may view the duress passphrase as enabling bad actors. Mitigation: frame it as "protection for journalists under interrogation" — the use case, not the mechanism.
- **Slow grant cycles.** OTF applications → review → award → contract → first payment can take 12-18 months. Mitigation: start with NLnet (faster, €5K–€50K) while pursuing larger grants.
- **Sustainability cliff.** Grant funding is temporary. What happens when the grant ends? Mitigation: the open-source model means the tool keeps working without funding. Grants fund development, not operations (which is cheap).

---

## 3. Recommended Grant Strategy

### Phase 1: Seed (Now–6 months)

**Goal:** Build a working prototype, get one pilot user, publish architecture preprint.

| Action | Timeline |
|--------|----------|
| Deploy Android app to real devices, record test sessions | Month 1–2 |
| Get one journalist/organization to pilot (FPF intro?) | Month 2–3 |
| Publish architecture preprint on arXiv | Month 3 |
| Apply to NLnet NGI Zero (fast cycle, low bar) | Month 1 |
| Apply to Ethereum Foundation ESP (ZK novelty) | Month 2 |

**Target:** €20K–€50K from NLnet or EF to fund Phase 2.

### Phase 2: Build (6–18 months)

**Goal:** Production-grade MVP, security audit, 3+ pilot organizations.

| Action | Timeline |
|--------|----------|
| OTF Internet Freedom Fund application | Month 4 |
| Knight Foundation application | Month 5 |
| Security audit (funded by Phase 1 grant) | Month 8 |
| iOS app | Month 8–12 |
| Academic paper submission | Month 12 |
| Mozilla MOSS application | Month 15 |

**Target:** $100K–$300K from OTF or Knight.

### Phase 3: Sustain (18+ months)

**Goal:** Self-sustaining through a mix of grants, donations, and optional paid tier.

| Action | Timeline |
|--------|----------|
| GitHub Sponsors + Open Collective | Month 12 |
| Paid tier launch (Standard $8/mo) | Month 18 |
| Follow-on OTF grant (Phase 2) | Month 18 |
| Partner with university for NSF grant | Month 24 |

### First application: NLnet NGI Zero

NLnet is the best first target:
- **Fast cycle.** Applications reviewed monthly. Decisions in 6–10 weeks.
- **Low bar.** Funds "open internet research" — doesn't require institutional backing.
- **Right size.** €5K–€50K. Enough for a security audit + iOS development.
- **Europe-based.** Less competition than US funders.
- **RealPeep qualifies under:** NGI Zero PET (Privacy & Trust Enhancing Technologies) or NGI Zero Commons Fund.

The application should emphasize:
1. Novel architecture (ZK + CDMA mesh + liveness = unique)
2. Open source, no lock-in, offline verification
3. Human rights use case (journalist safety, protester evidence)
4. Interoperability with existing standards (in-toto, sigstore via Sigstead)
