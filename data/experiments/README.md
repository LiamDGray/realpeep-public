# Experiments

Design explorations and parameter sweeps that informed RealPeep's architecture.
These are NOT production code — they're one-off investigations run to answer
specific questions during development. Each documents what we learned.

## Directory

| File | Question | Key finding |
|------|----------|-------------|
| `cost_model.py` | How long does acoustic correlation take at scale? | With snippets (2s) + narrow search window (±100ms) + BLE neighbor filtering, N=5000 verifies in ~14s, not 4.9 days |
| `calibrate.js` | What SF/FEC/noise combos survive CDMA? | Manual calibration run; fed into the sweep |
| `sweep.js` | Systematic parameter sweep: SF × FEC × noise × devices | Determined feasible operating regions; `results.csv` |
| `smart_sweep.js` | Adaptive sweep: stop early when config is clearly broken | Same conclusions, 40% fewer runs |
| `results.csv` | Raw sweep output | Used to choose defaults: SF=128, FEC=5 |
| `atof/` | Acoustic Time-of-Flight proof: can a verifier detect relay attacks via audio latency? | Yes — round-trip delay > speed-of-sound bound detects replays |
| `ztmp/` | Zero-Trust Multi-Party: can depth sensors + crypto guarantee "real person in frame"? | Hardware root-of-trust works, but depth sensors are rare on phones |
| `main.py` | Original end-to-end demo (pre-mesh) | Validated ZK + CDMA + simulator integration |
| `generate_synthetic_video.py` | Can we synthesize test videos with known ground truth? | Yes — used for SPCI unit tests |
| `pixel_extractor.py` | Can we extract and verify SPCI challenge frames from real video? | Works for synthetic; real video needs camera calibration |
| `run_atof.py` | Driver for the AToF experiment | Run: `cd experiments && python3 run_atof.py` |
| `run_ztmp.py` | Driver for the ZTMP experiment | Run: `cd experiments && python3 run_ztmp.py` |

## Running

All Python scripts assume they're run from the project root:

```bash
cd ~/src/realpeep
python3 experiments/cost_model.py
python3 experiments/main.py
python3 experiments/run_atof.py
```

JS scripts require Node:

```bash
cd ~/src/realpeep
node experiments/sweep.js
```

## What we built based on these

- **cost_model.py** → hybrid 3-phase verifier (BLE bloom filter + acoustic snippet audit)
- **sweep.js / calibrate.js** → SF=128, FEC=5 defaults in `realpeep-js/src/dsp.js`
- **atof/** → relay attack detection via acoustic latency (not yet in main codebase)
- **ztmp/** → hardware root-of-trust approach shelved (too few phones have depth sensors)
- **pixel_extractor.py** → SPCI verifier in `realpeep/spci.py`
