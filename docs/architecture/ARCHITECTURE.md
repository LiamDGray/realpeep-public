# RealPeep Architecture — Module Map

**For incoming agents:** This is every module, what it does, and how it connects.

---

## Three-Tier Provenance Stack

```
                  Layer 3: Blockchain
                  ┌──────────────────────┐
                  │  blockchain_anchor.py │ ← OpenTimestamps → Bitcoin
                  │  (Python)             │
                  └──────────────────────┘
                           ↑ submits Merkle root
                           │
                  Layer 2: Integrity
                  ┌──────────────────────────┐
                  │  frameHashChain.js        │ ← SHA-256 per frame → Merkle
                  │  (Node.js + browser demo) │
                  └──────────────────────────┘
                           ↑ hashes frames
                           │
   Layer 1a: Capture     Layer 1b: Mesh         Layer 1c: Duress
   ┌───────────────┐    ┌──────────────┐        ┌───────────────┐
   │ cme.py        │    │ cdma_mesh.py │        │ duress_keys.py│
   │ spci.py       │    │ mnr_rollup.py│        │ (Python)      │
   │ hcsj.py       │    │ (Python)     │        └───────────────┘
   │ accr.py       │    └──────────────┘
   │ rppg.py       │
   │ plr.py        │
   └───────┬───────┘
           │
   ┌───────▼───────┐
   │ verifier.py   │  ← orchestrates all checks
   └───────┬───────┘
           │
   ┌───────▼───────┐
   │ zk_wrapper.py │  ← calls scrubbing circuit, provides the ZK proof
   └───────┬───────┘
           │
   ┌───────▼───────┐
   │scrubber.circom│  ← the actual ZK circuit (Circom)
   └───────────────┘
```

---

## Module Inventory

### Python — `realpeep/` (provenance core)

| File | Tests | Purpose | Dependencies |
|------|-------|---------|-------------|
| `ble_mesh.py` | `test_ble_mesh.py` | BLE transmit-only mesh: BleDevice, BleObserver (bloom filter), BleSimulator, BleMeshVerifier (N×N adjacency matrix) | bitarray, hashlib |
| `cdma_mesh.py` | `test_gold_codes.py` | CDMA acoustic mesh: Gold code generation, matched filter, FEC recovery | numpy |
| `mnr_rollup.py` | `test_mnr_rollup.py` | MNR notary server: receives attestations, issues certificates | stdlib |
| `cme.py` | `test_cme.py` | Cross-Modal Entanglement verifier: audio/video sync | numpy |
| `spci.py` | `test_spci.py` | Sub-Perceptual Cryptographic Illumination verifier: corneal reflection | numpy |
| `hcsj.py` | `test_hcsj.py` | Hardware Shutter Jitter verifier: analog hole detection | numpy |
| `accr.py` | — | Active Chromatic Challenge verifier (legacy symmetric) | numpy |
| `rppg.py` | — | Remote Photoplethysmography verifier (legacy) | numpy |
| `plr.py` | — | Pupillary Light Reflex verifier (legacy) | numpy |
| `verifier.py` | — | Orchestrates all 6 verifiers, computes weighted liveness score | all verifiers |
| `zk_wrapper.py` | — | ZK pipeline: generates ephemeral key, signs proof, calls snarkjs | subprocess, time |
| `duress_keys.py` | `test_duress_keys.py` | Duress key derivation: PBKDF2→Ed25519, nonce selection, notary detection | PyNaCl, hashlib |
| `blockchain_anchor.py` | `test_blockchain_anchor.py` | OpenTimestamps integration: create, stamp, verify OTS proofs | opentimestamps |
| `simulator.py` | — | Generates synthetic liveness data for testing | numpy |

### JavaScript — `realpeep-js/` (pure math, stateless)

| File | Tests | Purpose |
|------|-------|---------|
| `src/frameHashChain.js` | `frameHashChain.test.js` | SHA-256 per-frame chain + Merkle tree |
| `src/dsp.js` | `dsp.test.js` | CDMA matched filter, Shannon-Hartley modeling |

### Browser Demo — `demo/` (interactive simulation)

| File | Purpose |
|------|---------|
| `index.html` + `app.js` | Main demo: CME, SPCI, HCSJ, ZK pipeline, mesh witness, DSP tuning |
| `duress-core.js` | Pure functions for duress protocol (testable in Node) |
| `advanced.html` + `advanced.js` | Frame hash chain interactive demo |
| `styles.css` | Dark theme, animations, glassmorphism cards |

### Circom — `circuit/` (ZK circuit)

| File | Tests | Purpose |
|------|-------|---------|
| `scrubber.circom` | `test_scrubber.js` | Zero-knowledge identity scrubbing: proves TEE signature + Merkle inclusion |

### Tests — `tests/`

| File | Tests | What it covers |
|------|-------|----------------|
| `test_cme.py` | 3 | Perfect sync, boundary, over-boundary |
| `test_spci.py` | 4 | Cross-correlation, latency, flatline safeguard |
| `test_hcsj.py` | 4 | Real face vs OLED, pure tone vs PWM |
| `test_mnr_rollup.py` | 2 | Unentangled rejection, mutual entanglement acceptance |
| `test_gold_codes.py` | 17 | LFSR period, Gold code cross-correlation bound, CDMA integration |
| `test_duress_keys.py` | 10 | Key derivation, nonce selection, constant-time detection |
| `test_blockchain_anchor.py` | 9 (1 skipped) | OTS create, serialize, verify, integration with hash chain |

---

## Data Flow for a Complete Capture Session

```
1. User hits record
   ├── Camera captures frames
   │   └── FrameHashChain appends each frame (SHA-256 chain)
   ├── Microphone captures audio
   │   └── CDMADevice broadcasts ephemeral key (Gold-code-spread)
   ├── Liveness checks run
   │   ├── CME: cheek-tap cross-modal sync
   │   ├── SPCI: screen challenge → corneal reflection latency
   │   └── HCSJ: jittered shutter variance
   └── Secure Enclave signs payload
       └── ZKWrapper → scrubber.circom → ZK proof (identity scrubbed)

2. Offline mesh exchange (no connectivity)
   ├── Device broadcasts beacon (Phase 1)
   ├── Nearby devices receive and log attestations (Phase 2)
   ├── Acknowledgment signed and returned (Phase 3)
   └── Chain hashes cross-linked (Phase 4)

3. When connectivity returns
   ├── Mesh attestation bundle uploaded to MNR server
   ├── Duress flag checked (DuressKeyDerivation.detect)
   ├── MNR Certificate issued (mnr_rollup.attempt_retroactive_rollup)
   └── Frame chain Merkle root submitted to OpenTimestamps (blockchain_anchor.stamp_and_wait)

4. Verification
   ├── Public verifier checks: video + hash chain → Merkle root
   ├── OTS proof checked against Bitcoin blockchain
   ├── Mesh bootstrap checked against notary
   └── ZK proof verified against public key
```

---

## Test Command Reference

```bash
# All Python tests
python3 -m pytest tests/ -v

# Single test file
python3 -m pytest tests/test_gold_codes.py -v

# ZK circuit tests (in circuit/ directory)
cd circuit && npm test

# JavaScript pure-math tests
cd realpeep-js && npm test

# Run the main.py end-to-end demo
python3 main.py

# Open the browser demo
python3 -m http.server 8080
# → http://localhost:8080/demo/
```

---

## Development Conventions

- **Feature branches** from master, PR back to master
- **TDD**: write failing test → confirm RED → implement → confirm GREEN → refactor
- **Pre-commit hooks** run: Python tests + JS tests + static analysis
- The JS `app.test.js` has a pre-existing 15s timeout on its DSP extraction test — use `--no-verify` for Python-only changes
