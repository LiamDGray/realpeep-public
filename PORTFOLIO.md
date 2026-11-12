# RealPeep — Portfolio Brief

> A one-page orientation for reviewers, collaborators, and AI-training platforms.
> The detailed docs are linked at the bottom; this page is the five-minute version.

## What this is

RealPeep is a research-grade, open-source system for **anonymous proof of capture**:
proving that a video came from real hardware at a real time, without revealing which
device recorded it. It combines a Circom ZK circuit, acoustic co-location, a frame hash
chain, timestamp anchoring, and a duress/coercion-signalling protocol.

It is a **substantial engineering project, not a tutorial or template**: a Python
package, a stateless Node.js DSP library, a Circom circuit with `circom_tester`, an
Android app, Cloudflare Workers, a Playwright/Puppeteer e2e suite, CI, and a research
and business document set.

**Status: research prototype (TRL 3–4), not a shipping product.** The circuit, DSP,
hash chain, duress key derivation, and web demo are implemented and tested. On-device
proof generation, real-time phone audio capture, the chain bridge, and a production
Android pipeline are not built yet. See [what is real vs simulated](#what-is-real-vs-simulated).

**Demo:** [90-second narrated walkthrough](https://github.com/LiamDGray/realpeep-public/releases/tag/demo-v1)
— recorded with CPU-only Kokoro TTS, Playwright, and ffmpeg.

## Why it is substantial

| Evidence | Number / link |
|---|---|
| Test suite | **119 Python**, **170 Jest**, **3 Circom** tests; full CI green |
| ZK circuit | **19,006 constraints** (depth-20 EdDSA-Poseidon + Merkle inclusion) |
| Languages / stacks | Python, JavaScript/Node, Circom, Kotlin/Android, Cloudflare Workers + D1 |
| CI | GitHub Actions, circuit-artifact staleness gate, local replica + pre-push hook |
| Security work | Threat model, duress prior-art assessment, self-review of the duress construction |
| Product work | Risk register, vertical-slice plan, comparison with C2PA and Birthmark |
| Demo | <https://realpeep.pages.dev/demo/> |

## What I would work on next

The build order is deliberately **one vertical slice at a time**:

1. **Duress protocol v0.1** — replace the 8-bit marker with a transcript-bound,
   one-time, negligible-false-positive tag; add a threshold notary; bind the tag to the
   proof; run a safety review. This is the most differentiated part of the system.
2. **On-device ZK** — benchmark Groth16 proving on the Pixel 8a, ThinkPad P51, and the
   Moto XT1955-5 low-end floor; replace the dev trusted setup with a documented ceremony.
3. **Single-device capture → proof → offline verify** — CameraX frame hashing, Merkle
   root, proof bundle, offline verifier. No mesh or blockchain.
4. Then: OpenTimestamps anchor, two-device acoustic co-location, C2PA sidecar, pilot.

The reasoning, budgets, and kill criteria are in
[docs/roadmap/VERTICAL_SLICES.md](docs/roadmap/VERTICAL_SLICES.md).

**Live task:** [duress v0.1 issue #1](https://github.com/LiamDGray/realpeep-public/issues/1)
— the red tests and acceptance criteria are ready on the `duress/v0.1-red` branch.

## Engineering judgment (examples)

These are the kinds of decisions I want to be evaluated on, not just the code:

1. **Fix the root cause, not the symptom.** When CI went red after a deliberate
   relative-link change, I updated the stale tests to assert the new intended behavior
   *and* added a regression check for subpath mounting, instead of reverting the product
   change.
2. **Make tooling deterministic.** A new Ruff default set turned 68 pre-existing style
   findings into a red build. I pinned the rule set and the tool version rather than
   auto-fixing unrelated code, so the build cannot drift again.
3. **Kill your own claims.** I reviewed the duress implementation and documented that the
   current 8-bit tag has a `1/256` false-positive rate, the Python nonce repeats, the tag
   is not bound to the proof, and the “indistinguishable proofs” claim is therefore not
   yet true. That is more useful than shipping a demo that looks stronger than it is.
4. **Protect scarce resources.** I added `just ci-local` and a pre-push hook so the exact
   GitHub Actions suite runs before a push; CI also cancels superseded runs. The hook
   immediately caught two probabilistic tests: a duress test that asserted “no false
   positives” with `1/256` odds, and a demo test whose normal nonce could trip a `1/16`
   predicate. Both were fixed with deterministic nonce selection, not retries.
5. **Prioritize the smallest differentiator.** The four-layer stack is a research
   programme. The plan starts with duress and on-device ZK, not with the mesh or a
   custom chain, because those are the parts that can be evaluated without a network
   effect.

## How I work with an AI coding assistant

I use an AI assistant for scaffolding, refactors, test generation, and review. I keep the
following under human control:

- **Tests first.** A change starts with a failing test or a concrete reproduction.
- **Root cause.** If a test fails, I want the mechanism, not a retry or a skip.
- **Security claims.** “Indistinguishable”, “anonymous”, “auditable”, and “production”
  are claims that need a proof or a measurement, not a code comment.
- **Scope.** I prefer one vertical slice that can be demonstrated over four layers that
  are individually plausible and collectively unproven.
- **Review rubric.** Correctness, tests, security, maintainability, and scope — in that
  order. A clever patch that weakens a safety property is not a good patch.

Concrete decision records are in the commit history and the
[technical review](docs/reviews/TECHNICAL_REVIEW_2026.md).

## Run it in five minutes

Prerequisites: Python 3.13, Node 20, [`just`](https://github.com/casey/just), and
[`circom`](https://docs.circom.io/) 2.2.x on `PATH`.

```bash
git clone https://github.com/LiamDGray/realpeep-public.git
cd realpeep

# Browser demo (no build step)
just demo
# → http://localhost:8080/demo/

# Full local replica of GitHub Actions (install + all tests)
just ci-local
```

`just ci-local` checks the Python/Node versions, runs the CI install step, and then the
exact CI suite. A pre-push hook runs it automatically. If you only want the test suite
and dependencies are already installed:

```bash
just ci
```

## What is real vs simulated

| Component | Status |
|---|---|
| Circom identity scrubber | **Tested** on x86 with `circom_tester`; 19k constraints |
| Python/JS DSP and Gold codes | **Tested**; acoustic mesh protocol is simulated |
| Frame hash chain / Merkle tree | **Tested** |
| Duress key derivation | **Demo-grade**; known flaws documented, no notary service |
| Web demo | **Live**; simulated capture and mesh |
| Browser-camera preview | **Optional UI preview only**; labelled not attested; falls back to simulation |
| Real client-side proof | **Prototype**; real frame hashing + EdDSA + Groth16 in the browser; demo TEE key, dev zkey |
| Android app | **Scaffold**; not in CI, no on-device proving benchmark yet |
| On-device ZK proving | **Not built** |
| Real-time phone audio capture | **Not built** |
| Blockchain / OpenTimestamps bridge | **Not built** (library work only) |
| C2PA interop | **Not built**; sidecar plan only |

## Where to look next

- [Architecture](docs/architecture/ARCHITECTURE.md) — module map and data flow
- [Vertical slices](docs/roadmap/VERTICAL_SLICES.md) — build order, device budgets, kill criteria
- [Technical review](docs/reviews/TECHNICAL_REVIEW_2026.md) — honest audit and gaps
- [Duress assessment](docs/research/DURESS_NOVELTY_ASSESSMENT.md) — prior art and publishability
- [Risk register](docs/business/RISK_REGISTER_AND_MITIGATIONS.md) — distribution, buyers, safety
- [Comparison table](docs/comparisons/COMPARISON_TABLE.md) — C2PA, Birthmark, Truepic, OTS

## License

Apache 2.0. Third-party reference PDFs are **not** included in this public mirror.
