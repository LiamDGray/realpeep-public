# RealPeep: Anonymous Provenance & Mesh Consensus

> **Public mirror.** This is a sanitized snapshot of an active private
> development repository. Third-party reference PDFs and deployment
> credentials are excluded; see [PUBLIC_MIRROR.md](PUBLIC_MIRROR.md).


[![CI](https://github.com/LiamDGray/realpeep-public/actions/workflows/ci.yml/badge.svg)](https://github.com/LiamDGray/realpeep-public/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

RealPeep is a zero-trust architecture for verifiable cryptographic proof of physical event provenance (e.g., video capture) that mathematically strips the identity of the capturing device — no metadata, no surveillance, no tracking.

The only thing it proves is physics — and physics can't be faked.

> **Project status (November 2026): research prototype, not a shipping product.**
>
> - **Tested:** Circom identity-scrubber circuit (19k constraints), Python/JS DSP and
>   Gold-code primitives, frame hash chain, duress key derivation (demo-grade), web demo.
> - **Simulated / demo-only:** acoustic and BLE mesh, duress notary detection (there is no
>   notary service yet), C2PA interop, and the optional browser-camera preview in the
>   simulated phone (labelled “not hardware-attested”).
> - **Not built:** on-device ZK proving, real-time acoustic capture on phones, blockchain
>   bridge, production Android capture pipeline, audited duress deployment.
>
> Read the [risk register](docs/business/RISK_REGISTER_AND_MITIGATIONS.md) and
> [vertical-slice plan](docs/roadmap/VERTICAL_SLICES.md) before relying on a claim in this
> README. The architecture is the research programme; the product is built one slice at a
> time.
>
> **New here?** Start with the five-minute **[portfolio brief](PORTFOLIO.md)**.
>
> **Watch:** the **[90-second narrated demo](https://github.com/LiamDGray/realpeep-public/releases/tag/demo-v1)**
> (1080p; CPU-only Kokoro TTS + Playwright + ffmpeg).

---

## Architecture (4-Layer Provenance Model)

```
Layer 1: ZK Identity Scrubbing + Liveness   →  "Real hardware, not a deepfake"
Layer 2: Acoustic CDMA Mesh Consensus        →  "Multiple devices, same room, same time"
Layer 3: Frame-Level Hash Chain              →  "Video hasn't been tampered with"
Layer 4: OpenTimestamps Blockchain Anchor    →  "Video existed at this point in time"
```

Each layer independently verifiable. All layers together form an unbreakable chain.

---

## Repo Map

```
realpeep/
│
├── realpeep/                       # Python provenance core (the package)
│   ├── cdma_mesh.py                # Gold-code CDMA acoustic mesh + matched filter
│   ├── mnr_rollup.py               # MNR notary server
│   ├── duress_keys.py              # Duress key derivation & detection
│   ├── blockchain_anchor.py        # OpenTimestamps anchoring
│   ├── cme.py / spci.py / hcsj.py  # Asymmetric liveness verifiers
│   ├── verifier.py                 # Orchestrates all 6 verifiers
│   ├── zk_wrapper.py               # ZK proof pipeline (calls snarkjs)
│   ├── ble_mesh.py                 # BLE beacon/observer mesh
│   └── hybrid_mesh.py              # BLE + Acoustic hybrid
│
├── realpeep-js/                    # Stateless Node.js DSP engine
│   └── src/
│       ├── frameHashChain.js       # Per-frame SHA-256 → Merkle
│       └── dsp.js                  # CDMA matched filter, Shannon-Hartley
│
├── circuit/                        # ZK circuit (Circom)
│   └── scrubber.circom             # EdDSA + Merkle inclusion proof
│
├── demo/                           # Interactive web simulator
│   ├── index.html + app.js         # Main demo (liveness, mesh, DSP)
│   ├── advanced.html + .js         # Hash chain demo
│   ├── recording/                  # Kokoro TTS + Playwright 90-second demo
│   └── styles.css                  # Dark theme
│
├── tests/                          # Python test suite
│   ├── test_gold_codes.py          # 17 tests — CDMA Gold code properties
│   ├── test_duress_keys.py         # 10 tests — duress derivation
│   ├── test_blockchain_anchor.py   # 9 tests — OTS anchoring
│   ├── test_cme.py / spci.py / hcsj.py / mnr_rollup.py
│   ├── demo-e2e.test.js            # End-to-end browser tests
│   └── package.json                # E2E test runner (Puppeteer)
│
├── platform/                       # 📱 Platform-specific clients
│   └── android/                    # — Android app (CameraX, Kotlin)
│       ├── STATUS.md               # — Build/test status, defects, Moto plan
│       └── docs -> ../../docs/     # Symlink to shared architecture docs
│
├── rust/                           # 🦀 Shared deterministic primitives
│   └── realpeep-core/              # — hash chain, Merkle, transcript, duress placeholder
│
├── workers/                        # Cloudflare Workers
├── functions/                      # Cloudflare Functions
│
├── docs/                           # 📋 All documentation
│   ├── architecture/               # Core technical design
│   │   ├── ARCHITECTURE.md         # — Complete module map & data flow
│   │   ├── MESH_MNR_PROTOCOL.md    # — 4-round acoustic mesh MNR protocol spec
│   │   ├── HYBRID_VERIFIER.md      # — BLE + Acoustic hybrid architecture
│   │   ├── FULL_PSEUDOCODE.md      # — Full system pseudocode
│   │   ├── STEGANOGRAPHIC_STORAGE.md  # — 6 steganographic hiding patterns
│   │   ├── JAMMING_RESILIENCE.md   # — BLE mesh jamming analysis
│   │   └── MUTUAL_NON_REPUDIATION.md # — Collective witness design, 5 scenarios
│   ├── comparisons/                # Technology comparisons
│   │   ├── COMPARISON_TABLE.md     # — RealPeep vs C2PA, Birthmark, Truepic, etc.
│   │   └── SIGSTEAD_INTEGRATION.md # — Sigstead signed provenance layer
│   ├── business/                   # Business & strategy
│   │   ├── BUSINESS_PLAN.md
│   │   ├── FUNDING.md              # — SWOT-funded model analysis
│   │   ├── PATH_TO_REACH.md
│   │   ├── RISK_REGISTER_AND_MITIGATIONS.md # — Adoption, buyer & safety risks
│   │   ├── WHO_USES_THIS.md        # — Non-technical user scenarios
│   │   └── SCALING.md              # — Scaling analysis
│   ├── reviews/
│   │   └── TECHNICAL_REVIEW_2026.md # — Full codebase audit & recommendations
│   ├── literature/
│   │   ├── MNR_LITERATURE_REVIEW.md
│   │   └── SPATIOTEMPORAL_MESH_LIT_REVIEW.md
│   ├── research/
│   │   ├── DURESS_NOVELTY_ASSESSMENT.md # — Prior art & publishability
│   │   ├── duress-patterns-research.md
│   │   ├── attack-model.md
│   │   ├── dashcam-witness-network.md
│   │   ├── illumination-forensics.md
│   │   ├── literature-synthesis.md
│   │   ├── neopixel-witness-analysis.md
│   │   ├── realpeep-witness-discovery.md
│   │   ├── timestamping-security.md
│   │   └── wireless-neopixel-hardware.md
│   └── roadmap/
│       ├── ROADMAP.md              # — Full implementation plan
│       └── VERTICAL_SLICES.md      # — Build order: duress → on-device ZK
│
├── data/                           # 📊 Data, test assets, logs
│   ├── frames/
│   │   ├── real/                   # 90 real camera frames (test data)
│   │   └── deepfake/               # 90 deepfake frames (test data)
│   ├── experiments/                # Experiment scripts & results
│   ├── logs/                       # System/crash logs
│   └── *.json                      # Audit logs, verification summaries
│
├── realpeep-architecture.html      # SVG architecture diagram
├── justfile                        # Task runner
├── pyproject.toml                  # Python package config
├── wrangler.toml                   # Cloudflare Pages config
├── .pre-commit-config.yaml         # Git hooks
└── ...                             # Standard config files
```

---

## Getting Started

### Prerequisites

- Python **3.13**
- Node **20**
- [`just`](https://github.com/casey/just)
- [`circom`](https://docs.circom.io/) 2.2.x on `PATH` (needed for the circuit tests)

### Run GitHub Actions locally before pushing

CI runs on **Python 3.13** and **Node 20**. The exact replica is:

```bash
just ci-local
```

It verifies the toolchain versions (see `.python-version` and `.nvmrc`), runs
`just install`, then runs `just ci` — the same commands as
`.github/workflows/ci.yml`. A **pre-push hook** invokes it automatically, so a red
CI run does not consume private-repo minutes. Set
`CI_LOCAL_ALLOW_VERSION_MISMATCH=1` only when you deliberately want to test a
different local toolchain.

```bash
# Run all Python tests
python3 -m pytest tests/ -v

# Run ZK circuit tests
just test-circom

# Run JS pure-math tests
cd realpeep-js && npm test

# Open browser demo
just demo
# → http://localhost:8080/demo/
```

[Live deployment on Cloudflare Pages](https://realpeep.pages.dev/demo/)

---

## Key Docs for Newcomers

| Start here | Why |
|---|---|
| [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) | Module map, data flow, and dev conventions |
| [realpeep-architecture.html](realpeep-architecture.html) | SVG diagram with component status |
| [docs/comparisons/COMPARISON_TABLE.md](docs/comparisons/COMPARISON_TABLE.md) | RealPeep vs competing technologies |
| [docs/business/RISK_REGISTER_AND_MITIGATIONS.md](docs/business/RISK_REGISTER_AND_MITIGATIONS.md) | Commercial, adoption, and safety risks — and what to do about them |
| [docs/research/DURESS_NOVELTY_ASSESSMENT.md](docs/research/DURESS_NOVELTY_ASSESSMENT.md) | Is the duress protocol novel / publishable? Prior art and gaps |
| [docs/roadmap/VERTICAL_SLICES.md](docs/roadmap/VERTICAL_SLICES.md) | Build order: duress first, then on-device ZK |
| [docs/roadmap/NATIVE_HARDENING_PLAN.md](docs/roadmap/NATIVE_HARDENING_PLAN.md) | Native Android hardening + Rust core plan |
| [docs/research/NATIVE_PROVER_DECISION.md](docs/research/NATIVE_PROVER_DECISION.md) | rapidsnark vs ark-circom vs warm snarkjs |
| [docs/research/DURESS_V01_SPEC.md](docs/research/DURESS_V01_SPEC.md) | Duress v0.1: exact transcript-bound tag, 2-of-3 notary, replay state |
| [docs/DEVICE_BASELINE.md](docs/DEVICE_BASELINE.md) | Moto G7 Power native + Chrome proof baseline |
| [docs/roadmap/ROADMAP.md](docs/roadmap/ROADMAP.md) | Full implementation plan & milestones |
| [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) | 90-second walkthrough (clicks + narration) |
| [docs/DEMO_RECORDING.md](docs/DEMO_RECORDING.md) | FOSS, CPU-only recording pipeline (Kokoro + Playwright + ffmpeg) |
| [docs/REAL_CLIENT_PROOF.md](docs/REAL_CLIENT_PROOF.md) | Real browser frame-hash + Groth16 proof, with measured CPU cost |
| [docs/reviews/TECHNICAL_REVIEW_2026.md](docs/reviews/TECHNICAL_REVIEW_2026.md) | Codebase audit, gaps, recommendations |
| [platform/android/](platform/android/) | Android app — CameraX capture, frame hash chain, audio recording |

---

## License

Apache 2.0
