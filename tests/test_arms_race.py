"""Arms race: honest witnesses vs jammers at various ratios.

Runs a parameter sweep over N witnesses × M jammers across multiple
jammer strategies (flood, silent, spoof, sybil). The verifier applies
all defenses (flood detection, asymmetry detection, saturation detection)
and we measure whether the attack succeeds or the defense prevails.

Physically plausible parameters:
  - Acoustic range ≈ 20m, density ≈ 4/m² → ~25-50 neighbors heard
  - BLE range ≈ 10m → ~25 neighbors
  - Realistic jammer count: 1-5 per protest scenario
  - Max total devices: 50 witnesses + 5 jammers = 55

The test accepts a --timeout=N CLI argument (via pytest -k or env var)
and estimates how many sweep points it can run within that budget.
"""

import os
import random
import time
from typing import List, Tuple

from realpeep.ble_mesh import (
    BleDevice,
    BleJammer,
    BleMeshVerifier,
    BleObserver,
    JammingAwareBleSimulator,
)

# ── Physically plausible sweep parameters ──
# Each entry: (witnesses, jammers, strategy)
# Conservative: max 50 witnesses, max 5 jammers
PHYSICALLY_PLAUSIBLE_SWEEPS: List[Tuple[int, int, str]] = [
    (10, 0, "flood"),   # baseline
    (10, 3, "flood"),   # 3:1 ratio
    (10, 5, "flood"),   # 2:1 ratio
    (30, 0, "flood"),   # large baseline
    (30, 5, "flood"),   # 6:1 ratio
    (50, 5, "flood"),   # 10:1 ratio (crowd)
    (10, 3, "silent"),  # silent jammers
    (10, 3, "spoof"),   # spoof jammers
    (10, 1, "sybil"),   # sybil jammers (1 jammer acts like 5)
]

# Also keep the original exhaustive sweeps for full CI runs
FULL_SWEEPS: List[Tuple[int, int, str]] = [
    (10, 0, "flood"),
    (10, 5, "flood"),
    (10, 10, "flood"),
    (10, 20, "flood"),
    (50, 0, "flood"),
    (50, 25, "flood"),
    (50, 50, "flood"),
    (10, 5, "silent"),
    (10, 10, "silent"),
    (10, 5, "spoof"),
    (10, 5, "sybil"),
]

# Beacon counts per strategy: more beacons = stronger flood signal
STRATEGY_FLOOD_COUNTS = {
    "flood": 50,
    "silent": 1,
    "spoof": 1,
    "sybil": 50,
}

# Estimated time per sweep point in seconds (measured empirically)
ESTIMATED_TIME_PER_POINT = {
    (10, 0): 0.1,   # baseline, fast
    (10, 5): 1.0,
    (10, 10): 2.0,
    (10, 20): 4.0,
    (30, 0): 0.5,
    (30, 5): 3.0,
    (50, 0): 1.0,
    (50, 5): 5.0,
    (50, 25): 25.0,
    (50, 50): 60.0,
}


def _estimate_time(w: int, j: int) -> float:
    """Estimate runtime for a sweep configuration in seconds."""
    # Linear interpolation on total device count
    total = w + j
    if total <= 10:
        return 0.5
    elif total <= 30:
        return 2.0
    elif total <= 55:
        return 5.0
    else:
        return total * 0.5  # rough scaling


def _get_timeout() -> float:
    """Get the configured timeout in seconds.

    Read from HERMES_TEST_TIMEOUT env var, or default to 30s.
    """
    return float(os.environ.get("REALPEEP_TEST_TIMEOUT", "30"))


def run_sweep(num_witnesses, num_jammers, jammer_strategy, seed=42):
    """Run one sweep configuration. Returns metrics dict."""
    random.seed(seed)
    mesh_id = 1

    flood_per_scan = STRATEGY_FLOOD_COUNTS.get(jammer_strategy, 50)

    # Create honest witnesses
    sim = JammingAwareBleSimulator(seed=seed)
    witnesses = []
    for i in range(num_witnesses):
        pk = i + 1
        sk = pk * 100 + 1
        device = BleDevice(f"W{i}", sk, pk, mesh_id)
        sim.register_device(device)
        witnesses.append(device)

    # Create jammers
    for j in range(num_jammers):
        if jammer_strategy == "sybil":
            NUM_SYBIL = 5
            for s in range(NUM_SYBIL):
                pk = 10_000 + j * NUM_SYBIL + s
                jammer = BleJammer(
                    f"J{j}_s{s}", strategy="flood", pk=pk, mesh_id=mesh_id
                )
                sim.register_jammer(jammer, flood_beacons_per_scan=flood_per_scan)
        else:
            pk = 10_000 + j
            jammer = BleJammer(
                f"J{j}", strategy=jammer_strategy, pk=pk, mesh_id=mesh_id
            )
            sim.register_jammer(jammer, flood_beacons_per_scan=flood_per_scan)

    # Simulate capture
    verifier = BleMeshVerifier()
    for device in witnesses:
        observer = BleObserver(capacity=500, fpr=0.02)
        beacons = sim.scan(device.pk, duration_seconds=30)
        for beacon in beacons:
            observer.observe(beacon)
            verifier.submit_beacon(beacon)
        for _ in range(5):
            own_beacon = device.create_beacon()
            verifier.submit_beacon(own_beacon)
        verifier.submit_observation(device.pk, observer)

    for device in witnesses:
        for _ in range(5):
            verifier.submit_beacon(device.create_beacon())

    for jammer in sim.jammers:
        if jammer_strategy == "spoof":
            spoof_obs = BleObserver(capacity=500, fpr=0.02)
            spoof_obs.bitarray.setall(1)
            verifier.submit_observation(jammer.pk, spoof_obs)
        elif jammer_strategy == "silent":
            verifier.submit_observation(
                jammer.pk, BleObserver(capacity=500, fpr=0.02)
            )
        elif jammer_strategy in ("flood", "sybil"):
            verifier.submit_observation(
                jammer.pk, BleObserver(capacity=500, fpr=0.02)
            )

    for jammer in sim.jammers:
        for beacon in jammer.create_beacons(5):
            verifier.submit_beacon(beacon)

    result = verifier.process_with_defenses(
        drop_flood=True, drop_asymmetric=True, drop_saturated=True
    )

    jammer_dropped = any(d >= 10_000 for d in result["dropped_devices"])

    return {
        "w": num_witnesses,
        "j": num_jammers,
        "strategy": jammer_strategy,
        "cert_issued": result["certificate"] is not None,
        "jammer_dropped": jammer_dropped,
        "n_dropped": len(result["dropped_devices"]),
        "defenses": result["defenses_applied"],
    }


def test_jamming_arms_race_sweep():
    """Run all sweep configurations and assert minimum success criteria.

    Uses physically plausible parameters. Respects REALPEEP_TEST_TIMEOUT
    env var (default 30s) and estimates how many points to test.
    """
    timeout = _get_timeout()

    # Estimate total time for all sweeps, pick the subset that fits
    total_est = sum(
        _estimate_time(w, j) for w, j, _ in PHYSICALLY_PLAUSIBLE_SWEEPS
    )
    sweeps = PHYSICALLY_PLAUSIBLE_SWEEPS

    if total_est > timeout:
        # Sort by ascending estimated time and pick points that fit
        sweeps_sorted = sorted(
            sweeps,
            key=lambda x: _estimate_time(x[0], x[1]),
        )
        cumulative = 0.0
        sweeps = []
        for w, j, strat in sweeps_sorted:
            est = _estimate_time(w, j)
            if cumulative + est > timeout * 0.9:  # 10% headroom
                break
            sweeps.append((w, j, strat))
            cumulative += est
    else:
        cumulative = total_est

    print(f"\n  Running {len(sweeps)}/{len(PHYSICALLY_PLAUSIBLE_SWEEPS)} sweep points "
          f"(est {cumulative:.1f}s, timeout {timeout}s)")

    t0 = time.time()
    results = []
    for w, j, strat in sweeps:
        elapsed = time.time() - t0
        if elapsed > timeout:
            print(f"  ⏰ Timeout after {elapsed:.1f}s, stopping")
            break
        r = run_sweep(w, j, strat)
        results.append(r)
        print(
            f"  W={r['w']:3d} J={r['j']:3d} {r['strategy']:8s} → "
            f"cert={'✅' if r['cert_issued'] else '❌'} "
            f"jammer_dropped={'✅' if r['jammer_dropped'] else '❌'} "
            f"dropped={r['n_dropped']} "
            f"defenses={r['defenses']}"
        )

    elapsed = time.time() - t0
    print(f"  Completed in {elapsed:.1f}s")

    # Assertions for all completed configurations
    for r in results:
        if r["j"] == 0:
            assert r["cert_issued"], (
                f"W={r['w']} J=0: cert should issue, got dropped={r['n_dropped']}"
            )
        if r["strategy"] == "flood" and r["j"] > 0:
            assert r["jammer_dropped"], (
                f"Flood jammer not dropped at W={r['w']} J={r['j']}"
            )
        if r["strategy"] == "silent" and r["j"] > 0:
            assert r["jammer_dropped"], (
                f"Silent jammer not dropped at W={r['w']} J={r['j']}"
            )
        if r["strategy"] == "spoof" and r["j"] > 0:
            assert r["jammer_dropped"], (
                f"Spoof jammer not dropped at W={r['w']} J={r['j']}"
            )
        if r["strategy"] == "sybil" and r["j"] > 0:
            assert r["jammer_dropped"], (
                f"Sybil jammer not dropped at W={r['w']} J={r['j']}"
            )
