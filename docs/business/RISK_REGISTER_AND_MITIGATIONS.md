# RealPeep — Commercial & Adoption Risk Register

**Date:** 11 November 2026  
**Status:** Working document for grant applications, pilot design, and go/no-go decisions  
**Companion documents:** [Technical Review 2026](../reviews/TECHNICAL_REVIEW_2026.md) · [Business Plan](BUSINESS_PLAN.md) · [Funding](FUNDING.md) · [Vertical Slices](../roadmap/VERTICAL_SLICES.md)

> The technical risks are covered in the technical review. This document is about the
> risks that **more cryptography cannot fix**: distribution, network effects, buyer
> budgets, standards politics, and the gap between the architecture and a shipped product.

---

## 0. One-page summary

| ID | Risk | Likelihood | Impact | First mitigation | Kill / pivot signal |
|---|---|---|---|---|---|
| R1 | C2PA's distribution beats RealPeep's technical advantages | High | High | Be a C2PA-compatible **layer**, not a replacement container | Platforms reject sidecars and C2PA has no custom-assertion path |
| R2 | Birthmark Standard is "close enough" and gets cited first | High | Medium | Sharpen the delta to **co-location + duress + offline verifier**; cite and engage | Reviewers call the work incremental after a fair comparison |
| R3 | Mesh needs density; a solo developer cannot bootstrap a network effect | Very high | High | Ship single-device value first; make 2 devices the minimum viable mesh; seed co-located teams | <10% of pilot sessions have a second device after 6 months |
| R4 | The people who need it most cannot pay | Very high | High | Fiscal sponsor + grants + cross-subsidy from legal/insurance/media; never paywall safety | No grant and <2 pilots after 12 months |
| R5 | On-device ZK, real-time audio and the chain bridge are unbuilt | Certain | High | Status labels, one vertical slice at a time, benchmark gates | A slice misses its device benchmark twice |
| R6 | Solo-founder / bus-factor risk | High | High | Open governance, contributor ladder, reproducible builds, fiscal sponsor | No second maintainer after 12 months |
| R7 | Safety, privacy and legal exposure of a duress feature | Medium | Very high | Threat model, safety review, no overclaiming, staged rollout | An audit or pilot partner finds an unacceptable coercion failure |
| R8 | Standards politics and platform dependency | High | Medium | Open spec, conformance suite, two implementers before formal standardization | The spec cannot attract a second implementer |

**Portfolio rule:** fund the slice with the strongest evidence, not the grandest architecture.
The four-layer stack is a research programme; the company (or sponsored project) is built
from one useful, demonstrable slice at a time.

---

## 1. R1 — C2PA is the incumbent, and distribution beats technical superiority

### What is true

- C2PA (Coalition for Content Provenance and Authenticity) is backed by Adobe,
  Microsoft, Google, the BBC and a large member base. It has SDKs, a specification,
  conformance tests and shipping products.
- C2PA's core weakness is real: Content Credentials are metadata in the asset. Platforms
  strip or rewrite metadata, and a screenshot or re-encode loses the manifest. A proof
  that travels *outside* the media file has a real advantage.
- The weakness is not enough. A technically better provenance format that no camera,
  editor or platform emits has zero distribution. RealPeep cannot win by asking the
  world to adopt another container.

### What to do

**Position RealPeep as a durable, privacy-preserving assertion that can travel with
C2PA — not as a C2PA replacement.**

1. **Ship a sidecar proof bundle.** A small JSON/CBOR file containing the asset hash,
  the frame-chain root, the ZK proof (or a commitment to it), and the timestamp anchor.
  It survives metadata stripping because it is distributed separately (newsroom upload,
  SecureDrop-style drop, QR code, IPFS, email attachment).
2. **Add a C2PA interoperability spike.** Investigate whether the bundle can be carried
  as a C2PA custom assertion and/or referenced by a soft binding. Do not claim
  "C2PA-compatible" until it passes the official conformance tests. C2PA allows
  vendor-defined assertions, but platform display and validation rules are controlled by
  the ecosystem, not by the spec alone.
3. **Make verification a two-line integration.** Publish a small verifier library and a
  hosted verification page. A newsroom should be able to drop in a "physics check"
  result next to the existing Content Credentials panel.
4. **Publish the comparison honestly.** C2PA answers "who signed this and what did they
  claim?" RealPeep answers "was this captured by real hardware, in the same room as
  other devices, without revealing which device?" Those are complementary questions.
5. **Distribution partners, not platform prayers.** Start with organizations that already
  handle evidence: newsrooms, fact-checkers, human-rights documentation groups, legal
  investigators. They can adopt a sidecar without waiting for Adobe or Google.

### Nonprofit / standards angle

- C2PA itself is a project of the Joint Development Foundation (part of the Linux
  Foundation). The realistic path to influence is participation in the C2PA community
  and a public extension proposal, not a competing standard.
- If RealPeep's proof format needs neutral governance, use the **Joint Development
  Foundation** or an **IETF** working group *after* there are two independent
  implementers. A solo project founding a standards body is a red flag to funders and
  reviewers.

### Leading indicators

- A newsroom or fact-checking organization runs the sidecar verifier on a real story.
- A C2PA sample asset + RealPeep sidecar verifies end-to-end in CI.
- At least one external implementer reads the spec and produces a compatible bundle.

---

## 2. R2 — Birthmark Standard is the closest academic competitor

### What is true

- The Birthmark Standard (arXiv:2602.04933, Feb 2026) is the closest academic work:
  hardware-rooted photo authentication, an anonymity set built from a key table, and a
  consortium blockchain operated by journalism organizations.
- Our own literature review already flags it as the paper to cite. Not citing it would
  be a credibility failure with reviewers and grant panels.
- "Anonymous hardware provenance" alone is no longer a novel claim. If the pitch stops
  there, Birthmark is the obvious objection.

### What to do

1. **Cite it in the literature review, the comparison table, the README and every
   grant application.** Add a short, fair "what Birthmark does better" section.
2. **Sharpen the delta.** RealPeep's defensible differences are:
   - **Physical co-location** via the acoustic/BLE mesh (Birthmark has no mesh).
   - **Duress-aware receipts** with a silent notary signal (Birthmark has no duress).
   - **Offline verification** of a self-contained proof bundle (Birthmark relies on a
     consortium chain and validator set).
   - **TEE signature vs PRNU fingerprint** trade-off: revocable vs unrevocable,
     digital vs analogue, different failure modes.
3. **Do not claim "the only anonymous provenance system."** Claim "the only system that
   combines anonymous capture, co-location, and coercion signaling" — and only after the
   slices exist.
4. **Engage the authors.** A technical comparison note, a shared test vector, or an
   invitation to review the threat model is cheaper than a rivalry and more credible to
   funders.
5. **Consider an optional PRNU/Birthmark-compatible layer.** If a device lacks a usable
   TEE, a sensor-fingerprint fallback could broaden coverage. Keep it optional; it has
   different privacy and revocation properties.

### Publishable delta

The paper is not "anonymous provenance" (Birthmark), and it is not "duress passwords"
(prior art). The paper is the **combination and its formal coercion model**: a
multi-witness capture system where a coerced prover still produces a publicly valid
proof, and only a threshold notary can tell. See
[the duress novelty assessment](../research/DURESS_NOVELTY_ASSESSMENT.md).

### Leading indicators

- A reviewer or grant panel says the Birthmark comparison is fair and the delta is clear.
- Birthmark authors or another group cite the comparison or reuse a test vector.

---

## 3. R3 — The mesh has a cold-start problem that a solo developer cannot solve

### What is true

Acoustic co-location consensus is valuable only when **more than one device in the same
room** runs it. The value is roughly a network effect: with `n` devices the number of
witness relationships is `n(n-1)/2`. At `n = 1` the mesh adds nothing. A solo developer
in Tucson cannot manufacture density by writing code.

This is not a marketing problem that a better demo solves. It is a structural adoption
problem.

### What to do

**Do not make the mesh a launch requirement. Make it an assurance level.**

- **Level 0 — single device:** capture, frame hash chain, ZK proof, offline verification,
  optional timestamp. Useful on day one. This is the product.
- **Level 1 — two devices, same room:** one witness. The minimum viable mesh; a
  journalist and a colleague, a camera operator and a fixer, two protesters.
- **Level 2 — multi-witness:** stronger co-location evidence; useful for newsrooms,
  legal observers, and documentation teams. Never required for a valid proof.

Concrete adoption tactics:

1. **Sell the pair, not the crowd.** Onboarding should be "bring one colleague." A
   two-device kit (two phones, a charger, a one-page guide) is more useful than a
   city-scale mesh roadmap.
2. **Seed existing co-located groups.** Newsrooms, legal-observer teams, protest marshal
   teams, film crews, fact-checking desks, campus journalism labs. These groups already
   work in the same room; the mesh does not have to create the behavior.
3. **Event-based deployment.** A single newsroom or documentation team covering one
   event is a better pilot than a general app launch. Measure witness yield per event.
4. **Asynchronous witness with consent.** A device that recorded the room can contribute
   a witness attestation later, if the humans consent and the audio is minimized. This
   lowers the synchronization burden but raises privacy and consent issues; design them
   explicitly, do not hand-wave them.
5. **Never gate core value on density.** A user with one phone must still get a useful
   proof. Otherwise the product is worthless until critical mass, and critical mass never
   arrives.
6. **Simulate before you scale.** Keep the Python/JS mesh simulator for research and
   demos, but label it as simulation. The first real milestone is two physical devices in
   one room, not fifty simulated ones.

### Metrics

- **Second-device activation:** fraction of new users who complete a session with a
  second device within 14 days. Target: >25% in a seeded pilot.
- **Witness yield:** fraction of sessions with at least one co-located witness. Target:
  >30% in newsroom pilots.
- **Repeat co-location:** fraction of pairs that run a second session. This is the real
  network-effect signal.
- **False co-location rate:** measured on real audio in reverberant rooms, not simulated.

### Kill / pivot signal

If, after six months of seeded pilots, fewer than 10% of sessions have a second device,
stop investing in mesh infrastructure. Keep the simulator and the protocol research;
move the product to single-device provenance + timestamping + C2PA interop.

---

## 4. R4 — The buyer is the least able to pay

### What is true

Journalists, human-rights workers and protesters are precisely the users who cannot buy
enterprise licences. The business plan is grant-funded. Grants are slow, competitive and
not income next month. A solo developer with ME/CFS cannot out-write a university
consortium, and grant cycles can be 6–18 months.

The mistake to avoid is building a generic SaaS and hoping at-risk users convert. They
will not, and asking them to is a values failure as well as a business failure.

### What to do

**Use price discrimination with a hard rule: safety is never paywalled.**

| Segment | Who | Price | Why |
|---|---|---|---|
| At-risk / public interest | Journalists, HRDs, protesters, whistleblowers | Free, quota-limited | Mission; grant-funded |
| Professional evidence | Legal investigators, insurers, forensic labs, media companies | Paid seat / per-case | They have budgets and liability needs |
| Integration / support | Newsrooms, NGOs, platforms | Support contract, integration fee | Services revenue, not a paywall |
| Training / audit | Organizations deploying capture devices | Workshop / audit fee | Uses the same expertise |
| Donations | Supporters | Any | Community runway |

**Funding architecture**

1. **Fiscal sponsorship first.** A 501(c)(3) fiscal sponsor lets foundations grant and
   individuals donate without creating a new charity. Candidates to evaluate:
   - **Software Freedom Conservancy** — strong FOSS fit, community governance, takes a
     percentage of restricted funds.
   - **Open Source Collective** — lightweight fiscal host for open-source projects;
     good for donations and small grants.
   - **Freedom of the Press Foundation** — mission-aligned for press tools; explore a
     project partnership or sponsorship, not necessarily a full fiscal host.
   - **Software in the Public Interest** — established fiscal sponsor for FOSS.
   Verify current terms, fees and eligibility before applying. Do not assume any
   organization will host the project.
2. **Grant pipeline, diversified by funder type.** Keep 6–8 live applications; expect a
   low hit rate. Prioritize:
   - **NLnet NGI Zero** — fast cycle, small grants, open-internet research; best first
     application.
   - **Open Technology Fund (OTF)** — internet-freedom tooling; larger, slower, strong
     mission fit.
   - **Mozilla MOSS** — open-source tooling; smaller.
   - **Knight / Google News Initiative / IFCN** — journalism technology; pilot-oriented.
   - **Ford / Open Society / Omidyar** — human rights and accountability; larger, slower.
   - **Ethereum Foundation ESP** — only if the ZK contribution is genuinely novel and
     useful beyond RealPeep; do not pitch a provenance tool as a crypto project.
   - **NSF / EU Horizon** — requires a university partner; consider a collaboration
     rather than a solo application.
3. **Keep the burn near zero.** Donated/free-tier infrastructure, no office, no hires
   until a grant is signed. The project can survive pauses; a grant-funded payroll cannot.
4. **Services before product.** Paid integration, training and expert-witness support can
   generate modest income while the product matures. This is not a scalable business, but
   it is honest runway.
5. **Donations as a supplement, not a plan.** Open Collective / GitHub Sponsors are useful
   for community signaling and small costs. They will not fund full-time development.

### The "nonprofit-sponsored standard" question

The model the user has in mind — Linux, Apache, EFF — is a spectrum, not a single move:

| Organization | What it is good for | Fit for RealPeep | Timing |
|---|---|---|---|
| **Apache Software Foundation** | Neutral, mature project governance; Apache-2.0 | Good long-term home for the reference implementation, but requires contributor diversity and a proven community | After 2+ maintainers and a release |
| **Linux Foundation / Joint Development Foundation** | Neutral standards hosting, corporate participation | Best fit for the **specification** and conformance suite once there are 2+ implementers | After a draft spec and an interop demo |
| **Software Freedom Conservancy** | Fiscal sponsorship and legal support for FOSS | Good fit for the project entity; mission-aligned | Early, once there is a grant or donations to administer |
| **EFF** | Advocacy, litigation, privacy expertise | Not a fiscal sponsor or standards body; valuable as a reviewer, advocate, or ally | As needed for policy/legal review |
| **OpenSSF** | Security best practices, supply-chain tooling | Adjacent; useful for Sigstead/in-toto integration and security review | Opportunistic |

**Recommendation:** do not choose a foundation logo first. Build the artifacts a
foundation needs: an open spec, a conformance suite, a security policy, two independent
implementers, and a neutral contributor process. Then apply for fiscal sponsorship (SFC
or OSC) and, later, standards hosting (JDF/LF). Apache is a destination, not a starting
move.

### Kill / pivot signal

If after 12 months there is no grant and fewer than two pilot organizations, narrow the
product to the paid professional-evidence segment (legal/insurance/forensics) and keep
the public-interest tier as a funded side effect. Do not keep broadening the architecture
to attract funders.

---

## 5. R5 — The technical claims are ahead of the code

### What is true

The technical review is honest: on-device ZK proof generation, real-time audio capture
and the blockchain bridge are unbuilt. The README and comparison table sometimes read as
if they are features. Reviewers, funders and users will notice.

### What to do

1. **Publish a status matrix** with four labels: `spec`, `demo`, `tested`, `production`.
   Every ✅ in the README must link to a test, a benchmark or a deployed artifact.
2. **Separate simulation from measurement.** The acoustic mesh is simulated; the ZK
   circuit is tested on x86 with `circom_tester`; the Android app is a scaffold. Say so.
3. **One vertical slice at a time.** See [Vertical Slices](../roadmap/VERTICAL_SLICES.md).
   Each slice has a user-visible outcome, a device benchmark, a test suite and a demo.
4. **Use Technology Readiness Levels (TRL) in grant applications.** RealPeep is TRL 3–4
   (experimental proof of concept), not TRL 7 (operational). Funders respect a realistic
   TRL and a milestone plan more than a grand stack.
5. **Add a claims checklist to the PR template.** "Does this change a README claim? If
   yes, link the evidence or downgrade the claim."
6. **Security review before safety claims.** A duress feature that has not been audited
   must not be marketed as protection. The duress assessment recommends a staged rollout.

### Leading indicators

- Every advertised feature has a test or benchmark link.
- A grant reviewer or external developer can reproduce the demo from a clean checkout.
- The status matrix changes only when evidence lands, not when code is scaffolded.

---

## 6. Additional risks worth tracking

### R6 — Solo founder / bus factor

- **Mitigation:** open governance from day one, a `CONTRIBUTING.md`, good-first-issues,
  reproducible builds, a security policy, and a named backup maintainer. Fiscal
  sponsorship also reduces the "personal bank account" risk. Document decisions in ADRs
  so the project survives a pause.
- **Signal:** a second person merges a non-trivial PR or runs a release.

### R7 — Safety, privacy and legal exposure of the duress feature

- **Mitigation:** a written threat model, a safety review with a press-freedom or
  human-rights organization, no public "this will protect you" claims, false-positive
  budgets, a coordinated disclosure process, and an ethics section in any paper.
- **Signal:** an external safety reviewer signs off on the coercion model and the
  notary escalation policy.

### R8 — Standards politics and platform dependency

- **Mitigation:** open spec under a permissive license, conformance tests, two
  independent implementations, no dependency on a single CDN or chain. Keep the verifier
  offline-capable and the proof format versioned.
- **Signal:** a second implementation passes the conformance suite.

### R9 — Legal admissibility and chain of custody

- **Mitigation:** work with a media lawyer and an expert witness; document hash agility,
  timestamp proof formats, and verification steps; publish a "how to verify in court"
  guide. Do not claim court admissibility without a precedent or a legal opinion.
- **Signal:** a lawyer or court accepts a RealPeep bundle in a real or moot proceeding.

### R10 — Witness privacy and consent

- **Mitigation:** local processing by default, minimize audio retention, explicit consent
  for witness mode, no upload of raw room audio unless the user chooses, and a data
  retention policy. Acoustic co-location can reveal presence; treat it as sensitive.
- **Signal:** a privacy review of the witness flow; no raw audio leaves the device in the
  default configuration.

---

## 7. 90-day action plan

| When | Action | Output |
|---|---|---|
| Week 1 | Green CI; status matrix; README honesty pass | Reproducible build; no red claims |
| Week 2 | Draft duress novelty assessment; fix the 8-bit marker and nonce reuse | Research note + failing tests |
| Week 3–4 | Duress vertical slice v0.1: notary API, constant-time detection, threshold design | Demo + benchmark + threat model |
| Week 5–6 | Single-device capture-to-proof slice on Pixel 8a | Measured proof time/memory |
| Week 7–8 | C2PA sidecar spike + one newsroom conversation | Interop note; pilot candidate |
| Week 9–10 | Grant pack: NLnet + SFC/OSC fiscal sponsorship conversation | Submitted application |
| Week 11–12 | Two-device acoustic pilot plan; legal/safety review | Pilot protocol + consent forms |
| Week 13 | Go/no-go review against the kill signals above | Written decision |

---

## 8. Decision rules

1. **No layer is "done" until a user can see the outcome.** Tests and simulations are
   inputs, not deliverables.
2. **No adoption claim without a distribution path.** A better proof format that no one
   emits is a research artifact, not a product.
3. **No safety claim without an external review.** Duress features can get people hurt.
4. **No standards body before two implementers.** Governance is earned with artifacts.
5. **No hires before a signed grant.** Runway is a security property.

---

## Appendix — sources and local references

- C2PA: <https://c2pa.org/> — specification, conformance, membership.
- Birthmark Standard: arXiv:2602.04933 (Feb 2026), as cited in
  [the MNR literature review](../literature/MNR_LITERATURE_REVIEW.md).
- NLnet NGI Zero: <https://nlnet.nl/propose/>
- Open Technology Fund: <https://www.opentech.fund/>
- Software Freedom Conservancy: <https://sfconservancy.org/>
- Open Source Collective: <https://oscollective.org/>
- Joint Development Foundation: <https://jointdevelopment.org/>
- Apache Software Foundation: <https://www.apache.org/>
- EFF: <https://www.eff.org/>
- OpenSSF: <https://openssf.org/>

> Funding programmes, fees and eligibility change. Verify every programme's current call
> before applying; this document is a strategy map, not a grant legal opinion.
