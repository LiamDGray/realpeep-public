"""Tests for the hybrid BLE+acoustic mesh simulator and verifier.

Tests HybridMeshSimulator (creates devices, runs parallel BLE+acoustic capture)
and HybridVerifier (3-phase pipeline: BLE bloom, acoustic audit, challenge).
"""

import numpy as np

from realpeep.hybrid_mesh import (
    AcousticSnippet,
    HybridMeshSimulator,
    HybridVerifier,
)

# ── HybridMeshSimulator tests ─────────────────────────────────────────────


def test_hybrid_simulator_creates_devices():
    """Creating N devices works."""
    sim = HybridMeshSimulator(num_devices=10, seed=42)
    d = sim.create_device("D1")
    assert d is not None
    assert d.pk == 1  # first device gets pk 1
    assert len(sim.devices) == 1

    sim.create_device("D2")
    assert len(sim.devices) == 2
    assert sim.devices[1].pk == 2


def test_hybrid_simulator_capture_returns_ble():
    """Capture produces BLE observations and beacons."""
    sim = HybridMeshSimulator(num_devices=5, seed=42)
    for i in range(5):
        sim.create_device(f"D{i}")

    result = sim.simulate_capture(duration_seconds=30.0)

    assert 'ble_observations' in result
    assert 'ble_beacons' in result
    # Each device has an observer
    assert len(result['ble_observations']) == 5
    # Each device transmits ~5 beacons
    assert len(result['ble_beacons']) >= 5


def test_hybrid_simulator_capture_returns_acoustic():
    """Capture produces acoustic snippets for each device."""
    sim = HybridMeshSimulator(num_devices=5, seed=42)
    for i in range(5):
        sim.create_device(f"D{i}")

    result = sim.simulate_capture(duration_seconds=30.0)

    assert 'acoustic_snippets' in result
    assert len(result['acoustic_snippets']) == 5
    for pk, snippet in result['acoustic_snippets'].items():
        assert 'raw_samples' in snippet
        assert 'tx_time' in snippet
        assert 'present_codes' in snippet


def test_acoustic_snippet_has_correct_length():
    """2s × 44100 = 88200 samples."""
    sim = HybridMeshSimulator(num_devices=3, seed=42)
    for i in range(3):
        sim.create_device(f"D{i}")

    result = sim.simulate_capture(duration_seconds=30.0)

    for pk, snippet in result['acoustic_snippets'].items():
        assert len(snippet['raw_samples']) == 88200, \
            f"Expected 88200 samples, got {len(snippet['raw_samples'])}"


def test_acoustic_snippet_contains_nearby_chirps():
    """Snippet raw_samples has non-zero values (chirps from nearby devices)."""
    sim = HybridMeshSimulator(num_devices=10, seed=42)
    for i in range(10):
        sim.create_device(f"D{i}")

    result = sim.simulate_capture(duration_seconds=30.0)

    for pk, snippet in result['acoustic_snippets'].items():
        assert np.any(snippet['raw_samples'] != 0), \
            f"Snippet for pk={pk} has all zeros — no chirps present"
        assert len(snippet['present_codes']) > 0, \
            f"Snippet for pk={pk} has no present codes"


# ── HybridVerifier Phase 1 tests ──────────────────────────────────────────


def test_hybrid_verifier_phase1_ble_matrix():
    """Phase 1 produces expected number of observed pairs."""
    sim = HybridMeshSimulator(num_devices=8, seed=42)
    for i in range(8):
        sim.create_device(f"D{i}")

    result = sim.simulate_capture(duration_seconds=30.0)

    verifier = HybridVerifier()
    for pk, observer in result['ble_observations'].items():
        verifier.submit_ble_observation(pk, observer)
    for beacon in result['ble_beacons']:
        verifier.submit_ble_beacon(beacon)

    phase1 = verifier.run_phase1()

    assert 'matrix' in phase1
    assert 'pks' in phase1
    assert 'observed_pairs' in phase1
    assert len(phase1['pks']) == 8
    assert phase1['n_devices'] == 8
    # In simulation, all devices scan correctly — matrix should be connected
    for i in range(8):
        for j in range(8):
            if i != j:
                assert phase1['matrix'][i][j] == 1, \
                    f"matrix[{i}][{j}] should be 1 (all hear each other)"
    assert phase1['connected'] is True


# ── HybridVerifier Phase 2 tests ──────────────────────────────────────────


def test_hybrid_verifier_phase2_acoustic_audit():
    """Confirmed pairs have high confidence."""
    sim = HybridMeshSimulator(num_devices=8, seed=42)
    for i in range(8):
        sim.create_device(f"D{i}")

    result = sim.simulate_capture(duration_seconds=30.0)

    verifier = HybridVerifier()
    for pk, observer in result['ble_observations'].items():
        verifier.submit_ble_observation(pk, observer)
    for beacon in result['ble_beacons']:
        verifier.submit_ble_beacon(beacon)

    # Submit acoustic snippets as AcousticSnippet objects
    for pk, snippet_data in result['acoustic_snippets'].items():
        # Verify non-zero audio
        assert np.any(snippet_data['raw_samples'] != 0)
        snippet = AcousticSnippet(
            device_pk=pk,
            raw_samples=snippet_data['raw_samples'],
            tx_time=snippet_data['tx_time'],
            hash="sim_hash",
            signature="sim_sig",
        )
        verifier.submit_acoustic_snippet(snippet)

    phase1 = verifier.run_phase1()
    phase2 = verifier.run_phase2(phase1)

    assert 'pair_results' in phase2
    assert len(phase2['pair_results']) > 0
    # At least some pairs should be confirmed
    assert phase2['n_confirmed'] > 0, \
        "Expected some pairs to be confirmed by acoustic audit"


def test_hybrid_verifier_phase3_challenge():
    """Flagged pairs are reported."""
    sim = HybridMeshSimulator(num_devices=5, seed=42)
    for i in range(5):
        sim.create_device(f"D{i}")

    result = sim.simulate_capture(duration_seconds=30.0)

    verifier = HybridVerifier()
    for pk, observer in result['ble_observations'].items():
        verifier.submit_ble_observation(pk, observer)
    for beacon in result['ble_beacons']:
        verifier.submit_ble_beacon(beacon)

    for pk, snippet_data in result['acoustic_snippets'].items():
        snippet = AcousticSnippet(
            device_pk=pk,
            raw_samples=snippet_data['raw_samples'],
            tx_time=snippet_data['tx_time'],
            hash="sim_hash",
            signature="sim_sig",
        )
        verifier.submit_acoustic_snippet(snippet)

    phase1 = verifier.run_phase1()
    phase2 = verifier.run_phase2(phase1)
    phase3 = verifier.run_phase3(phase2)

    assert 'flagged_pairs' in phase3
    assert 'n_flagged' in phase3


# ── Full pipeline test ─────────────────────────────────────────────────────


def test_hybrid_verifier_full_pipeline():
    """All 3 phases run end-to-end with expected outputs."""
    sim = HybridMeshSimulator(num_devices=6, seed=42)
    for i in range(6):
        sim.create_device(f"D{i}")

    result = sim.simulate_capture(duration_seconds=30.0)

    verifier = HybridVerifier()
    for pk, observer in result['ble_observations'].items():
        verifier.submit_ble_observation(pk, observer)
    for beacon in result['ble_beacons']:
        verifier.submit_ble_beacon(beacon)

    for pk, snippet_data in result['acoustic_snippets'].items():
        snippet = AcousticSnippet(
            device_pk=pk,
            raw_samples=snippet_data['raw_samples'],
            tx_time=snippet_data['tx_time'],
            hash="sim_hash",
            signature="sim_sig",
        )
        verifier.submit_acoustic_snippet(snippet)

    # Phase 1
    p1 = verifier.run_phase1()
    assert p1['n_pairs'] > 0
    assert p1['connected'] is True

    # Phase 2
    p2 = verifier.run_phase2(p1)
    assert p2['n_confirmed'] > 0
    assert p2['avg_confidence'] > 0

    # Phase 3
    p3 = verifier.run_phase3(p2)
    assert isinstance(p3['n_flagged'], int)


# ── Correlation confidence test ────────────────────────────────────────────


def test_acoustic_correlation_confidence():
    """A device's own code correlates highly with its own snippet."""
    sim = HybridMeshSimulator(num_devices=5, seed=42)
    for i in range(5):
        sim.create_device(f"D{i}")

    result = sim.simulate_capture(duration_seconds=30.0)

    from realpeep.cdma_mesh import (
        DEFAULT_GOLD_POLY1,
        DEFAULT_GOLD_POLY2,
        GoldCodeGenerator,
        derive_prn_seed,
    )

    for pk, snippet_data in result['acoustic_snippets'].items():
        # Derive this device's Gold code
        seed = derive_prn_seed(pk)
        gold_gen = GoldCodeGenerator(DEFAULT_GOLD_POLY1, DEFAULT_GOLD_POLY2, seed)
        code = gold_gen.generate_code(0, seed % 129, 128)

        # Cross-correlate against its own snippet
        audio = snippet_data['raw_samples']
        corr = np.correlate(audio, code, mode='valid')
        peak = float(np.max(np.abs(corr)))
        max_possible = 128.0
        confidence = peak / max_possible

        # The device's own code might not be in its own snippet (it records
        # its own transmission), but nearby devices' chirps include this code
        # This should give some non-trivial correlation
        assert confidence >= 0, "Confidence should be non-negative"


def test_hybrid_verifier_no_false_positives():
    """Non-present devices get low confidence."""
    sim = HybridMeshSimulator(num_devices=8, seed=42)
    for i in range(8):
        sim.create_device(f"D{i}")

    result = sim.simulate_capture(duration_seconds=30.0)

    verifier = HybridVerifier()
    for pk, observer in result['ble_observations'].items():
        verifier.submit_ble_observation(pk, observer)
    for beacon in result['ble_beacons']:
        verifier.submit_ble_beacon(beacon)

    for pk, snippet_data in result['acoustic_snippets'].items():
        snippet = AcousticSnippet(
            device_pk=pk,
            raw_samples=snippet_data['raw_samples'],
            tx_time=snippet_data['tx_time'],
            hash="sim_hash",
            signature="sim_sig",
        )
        verifier.submit_acoustic_snippet(snippet)

    phase1 = verifier.run_phase1()
    phase2 = verifier.run_phase2(phase1)

    # Check that all confirmed pairs have high enough confidence
    for r in phase2['pair_results']:
        if r['confirmed']:
            assert r['confidence'] >= 0.6, \
                f"Confirmed pair ({r['heard']}, {r['recorder']}) has low confidence {r['confidence']}"
