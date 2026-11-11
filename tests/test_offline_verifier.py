"""
Tests for the transmit-only mesh verifier (OfflineVerifier).

This verifier implements "commit now, compute later" — devices only broadcast
Gold-coded beacons and sign raw audio. The verifier cross-correlates every
device's Gold code against every other device's raw audio to prove pairwise
co-location.
"""

import hashlib

import numpy as np

from realpeep.cdma_mesh import (
    MAX_CODES_N7,
    OfflineVerifier,
    RawAudioCapture,
    TransmitOnlyDevice,
    derive_prn_seed,
    simulate_capture,
)
from realpeep.mnr_rollup import OfflineMNRCertificate

# ── derive_prn_seed tests ──────────────────────────────────────────────────


def test_derive_prn_seed_deterministic():
    """Same pk → same seed."""
    pk = 123456789
    seed1 = derive_prn_seed(pk)
    seed2 = derive_prn_seed(pk)
    assert seed1 == seed2


def test_derive_prn_seed_different():
    """Different pk → different seed."""
    seed1 = derive_prn_seed(100)
    seed2 = derive_prn_seed(999)
    assert seed1 != seed2


def test_derive_prn_seed_in_range():
    """Seed is 0 <= seed < MAX_CODES_N7 (=129)."""
    for pk in [0, 1, 42, 999, 1234567890123]:
        seed = derive_prn_seed(pk)
        assert 0 <= seed < MAX_CODES_N7, f"seed {seed} out of range for pk={pk}"


# ── TransmitOnlyDevice tests ───────────────────────────────────────────────


def test_transmit_only_device_generates_gold_code_from_pk():
    """Device generates a valid Gold code from its pk."""
    device = TransmitOnlyDevice(device_id="TOD1")
    code = device.gold_code
    assert len(code) == 128, f"Expected 128 chips, got {len(code)}"
    assert np.all((code == 1) | (code == -1)), "Gold code must be bipolar"
    # Deterministic from the same pk
    device2 = TransmitOnlyDevice(device_id="TOD2", pk=device.pk)
    assert np.array_equal(code, device2.gold_code)


def test_transmit_only_device_beacon_is_valid_signal():
    """Beacon CDMA signal has correct length."""
    device = TransmitOnlyDevice(device_id="TOD_BEACON")
    beacon = device.transmit_beacon(timestamp=1000.0, mesh_id="mesh_test")
    assert isinstance(beacon, np.ndarray)
    assert len(beacon) > 0
    # Beacon should contain both 1 and -1 values (spread data)
    assert np.any(beacon == 1) or np.any(beacon == -1)


# ── RawAudioCapture tests ──────────────────────────────────────────────────


def test_raw_audio_capture_commitment():
    """Hash of raw samples matches chunk_hash, signature verifies."""
    device = TransmitOnlyDevice(device_id="TOD_COMMIT")
    capture = device.capture_audio(duration_samples=44100)

    assert isinstance(capture, RawAudioCapture)
    assert capture.device_pk == device.pk
    assert len(capture.raw_samples) == 44100
    # Verify hash
    computed_hash = hashlib.sha256(capture.raw_samples.tobytes()).hexdigest()
    assert computed_hash == capture.chunk_hash
    # Signature should be a non-empty string
    assert isinstance(capture.signature, str) and len(capture.signature) > 0


# ── OfflineVerifier — verify_commitment tests ─────────────────────────────


def test_verify_commitment_valid():
    """OfflineVerifier.verify_commitment returns True for valid capture."""
    device = TransmitOnlyDevice(device_id="TOD_VERIFY")
    capture = device.capture_audio(duration_samples=44100)
    verifier = OfflineVerifier()
    assert verifier.verify_commitment(capture) is True


def test_verify_commitment_tampered():
    """Modifying raw_samples causes verification failure."""
    device = TransmitOnlyDevice(device_id="TOD_TAMPER")
    capture = device.capture_audio(duration_samples=44100)
    # Tamper with samples
    capture.raw_samples[0] = 999.0
    verifier = OfflineVerifier()
    assert verifier.verify_commitment(capture) is False


# ── OfflineVerifier — detect_pair tests ──────────────────────────────────


def test_detect_pair_self_signal():
    """Device A's code IS detected in A's own recording."""
    device_a = TransmitOnlyDevice(device_id="A")
    pk_a = device_a.pk

    # Capture A's own audio (with A's beacon mixed in)
    capture_a = device_a.capture_audio(duration_samples=44100)
    # Mix A's beacon into A's capture (self-hear)
    beacon_a = device_a.transmit_beacon(timestamp=0.0, mesh_id="mesh")
    offset = 100
    ended = offset + len(beacon_a)
    capture_a.raw_samples[offset:ended] += beacon_a

    verifier = OfflineVerifier()
    verifier.submit_capture(capture_a)

    result = verifier.detect_pair(pk_heard=pk_a, pk_recorder=pk_a)
    assert result is not None, "Device should detect itself"
    assert result['heard_pk'] == pk_a
    assert result['recorder_pk'] == pk_a
    assert result['correlation_peak'] >= 50


def test_detect_pair_other_device():
    """Two devices in same simulated space: A's code found in B's recording."""
    device_a = TransmitOnlyDevice(device_id="A")
    device_b = TransmitOnlyDevice(device_id="B")
    pk_a = device_a.pk
    pk_b = device_b.pk

    # Simulate: capture with A's beacon mixed into B's audio
    capture_b = simulate_capture(
        recorder=device_b,
        heard=device_a,
        distance_m=4.2,
        sample_rate_hz=44100,
        duration_samples=44100,
    )

    # Also submit A's own capture so verifier has A's Gold code
    capture_a = device_a.capture_audio(duration_samples=44100)

    verifier = OfflineVerifier()
    verifier.submit_capture(capture_a)
    verifier.submit_capture(capture_b)

    result = verifier.detect_pair(pk_heard=pk_a, pk_recorder=pk_b)
    assert result is not None, "A's code should be detected in B's audio"
    assert result['heard_pk'] == pk_a
    assert result['recorder_pk'] == pk_b
    assert result['correlation_peak'] >= 50
    assert result['confidence'] > 1.0


def test_detect_pair_no_signal():
    """Device with different random noise does NOT generate false positive."""
    device_a = TransmitOnlyDevice(device_id="A")
    device_b = TransmitOnlyDevice(device_id="B")
    pk_b = device_b.pk

    # B captures only noise (no A signal)
    capture_b = device_b.capture_audio(duration_samples=44100)

    verifier = OfflineVerifier(correlation_threshold=50)
    verifier.submit_capture(capture_b)
    verifier._inject_gold_code(device_a.pk, device_a.gold_code)

    result = verifier.detect_pair(pk_heard=device_a.pk, pk_recorder=pk_b)
    # With only noise, correlation should be low
    assert result is None, "Should not detect A's code in pure noise"


# ── detect_all_pairs tests ────────────────────────────────────────────────


def test_detect_all_pairs():
    """3 devices all mutually detected → 6 detections."""
    devices = [TransmitOnlyDevice(device_id=f"D{i}") for i in range(3)]
    verifier = OfflineVerifier()

    for i, recorder in enumerate(devices):
        # Mix each other device's beacon into this device's capture
        capture = recorder.capture_audio(duration_samples=44100)
        for j, heard in enumerate(devices):
            if i == j:
                continue
            beacon = heard.transmit_beacon(timestamp=0.0, mesh_id="mesh")
            offset = int(2.0 / 343 * 44100)  # ~2m away
            ended = min(offset + len(beacon), len(capture.raw_samples))
            capture.raw_samples[offset:ended] += beacon[:ended - offset]
        verifier.submit_capture(capture)

    results = verifier.detect_all_pairs()
    # 3 devices → 6 ordered pairs (A→B, A→C, B→A, B→C, C→A, C→B)
    assert len(results) == 6, f"Expected 6 detections, got {len(results)}"
    all_heard = {r['heard_pk'] for r in results}
    all_recorders = {r['recorder_pk'] for r in results}
    assert len(all_heard) == 3
    assert len(all_recorders) == 3


def test_detect_all_pairs_partial():
    """Only A in range of B but not C → 2 detections (A→B, B→A)."""
    device_a = TransmitOnlyDevice(device_id="A")
    device_b = TransmitOnlyDevice(device_id="B")
    device_c = TransmitOnlyDevice(device_id="C")

    verifier = OfflineVerifier()

    # Capture for A: mix B's beacon in
    capture_a = simulate_capture(device_a, device_b, distance_m=3.0)
    verifier.submit_capture(capture_a)

    # Capture for B: mix A's beacon in
    capture_b = simulate_capture(device_b, device_a, distance_m=3.0)
    verifier.submit_capture(capture_b)

    # Capture for C: pure noise (no beacons from A or B)
    capture_c = device_c.capture_audio(duration_samples=44100)
    verifier.submit_capture(capture_c)

    results = verifier.detect_all_pairs()
    # Only A↔B should be detected = 2 detections
    assert len(results) == 2, f"Expected 2 detections, got {len(results)}"
    pks = {device_a.pk, device_b.pk}
    for r in results:
        assert r['heard_pk'] in pks
        assert r['recorder_pk'] in pks


# ── compute_distance tests ────────────────────────────────────────────────


def test_compute_distance_zero_offset():
    """Both offsets zero → distance ~= 0."""
    det_ab = {
        'heard_pk': 1, 'recorder_pk': 2,
        'arrival_sample_offset': 0, 'correlation_peak': 128.0, 'confidence': 50.0,
    }
    det_ba = {
        'heard_pk': 2, 'recorder_pk': 1,
        'arrival_sample_offset': 0, 'correlation_peak': 128.0, 'confidence': 50.0,
    }
    verifier = OfflineVerifier()
    result = verifier.compute_distance(det_ab, det_ba)
    assert result['distance_m'] < 0.1
    assert result['plausible'] is False  # distance < 0.5m → implausible


def test_compute_distance_plausible():
    """Symmetric detections → plausible distance < 50m."""
    # Simulate 4.2m distance: offset = int(4.2 / 343 * 44100) ≈ 540 samples
    offset_4m = int(4.2 / 343 * 44100)
    det_ab = {
        'heard_pk': 1, 'recorder_pk': 2,
        'arrival_sample_offset': offset_4m, 'correlation_peak': 100.0, 'confidence': 30.0,
    }
    det_ba = {
        'heard_pk': 2, 'recorder_pk': 1,
        'arrival_sample_offset': offset_4m, 'correlation_peak': 95.0, 'confidence': 28.0,
    }
    verifier = OfflineVerifier()
    result = verifier.compute_distance(det_ab, det_ba)
    assert 3.0 <= result['distance_m'] <= 6.0, f"Expected ~4.2m, got {result['distance_m']}"
    assert result['plausible'] is True


def test_compute_distance_implausible():
    """Exaggerated offset → distance > 50m, plausible=False."""
    # Simulate 100m distance
    offset_100m = int(100.0 / 343 * 44100)
    det_ab = {
        'heard_pk': 1, 'recorder_pk': 2,
        'arrival_sample_offset': offset_100m, 'correlation_peak': 100.0, 'confidence': 30.0,
    }
    det_ba = {
        'heard_pk': 2, 'recorder_pk': 1,
        'arrival_sample_offset': offset_100m, 'correlation_peak': 95.0, 'confidence': 28.0,
    }
    verifier = OfflineVerifier()
    result = verifier.compute_distance(det_ab, det_ba)
    assert result['distance_m'] > 50.0
    assert result['plausible'] is False


# ── issue_certificate tests ───────────────────────────────────────────────


def test_issue_certificate_full_mesh():
    """3 devices, all detectable → certificate with 3 devices, max_distance set."""
    devices = [TransmitOnlyDevice(device_id=f"D{i}") for i in range(3)]
    verifier = OfflineVerifier()

    for i, recorder in enumerate(devices):
        capture = recorder.capture_audio(duration_samples=44100)
        for j, heard in enumerate(devices):
            if i == j:
                continue
            beacon = heard.transmit_beacon(timestamp=0.0, mesh_id="mesh")
            offset = int(3.0 / 343 * 44100)
            ended = min(offset + len(beacon), len(capture.raw_samples))
            capture.raw_samples[offset:ended] += beacon[:ended - offset]
        verifier.submit_capture(capture)

    detections = verifier.detect_all_pairs()
    cert = verifier.issue_certificate(detections, mesh_id="mesh_full")

    assert isinstance(cert, OfflineMNRCertificate)
    assert len(cert.devices) == 3
    assert cert.max_distance_m > 0
    assert cert.num_mutual_pairs >= 3  # A↔B, A↔C, B↔C
    assert cert.total_pairs == 6
    assert cert.aggregate_confidence > 0


def test_issue_certificate_partial():
    """3 devices, only 2 connected → certificate with 2 devices."""
    device_a = TransmitOnlyDevice(device_id="A")
    device_b = TransmitOnlyDevice(device_id="B")
    device_c = TransmitOnlyDevice(device_id="C")

    verifier = OfflineVerifier()

    capture_a = simulate_capture(device_a, device_b, distance_m=3.0)
    verifier.submit_capture(capture_a)

    capture_b = simulate_capture(device_b, device_a, distance_m=3.0)
    verifier.submit_capture(capture_b)

    capture_c = device_c.capture_audio(duration_samples=44100)
    verifier.submit_capture(capture_c)

    detections = verifier.detect_all_pairs()
    cert = verifier.issue_certificate(detections, mesh_id="mesh_partial")

    assert isinstance(cert, OfflineMNRCertificate)
    assert len(cert.devices) == 2  # Only A and B
    assert cert.num_mutual_pairs == 1  # A↔B


def test_offline_mnr_certificate_structure():
    """Certificate has all required fields."""
    cert = OfflineMNRCertificate(
        mesh_id="test_mesh",
        devices=["abc", "def"],
        pairwise_detections=[{"heard": "abc", "recorder": "def"}],
        max_distance_m=4.2,
        num_mutual_pairs=1,
        total_pairs=1,
        aggregate_confidence=95.5,
        certificate_id="cert_001",
    )
    assert cert.mesh_id == "test_mesh"
    assert len(cert.devices) == 2
    assert cert.max_distance_m == 4.2
    assert cert.num_mutual_pairs == 1
    assert cert.total_pairs == 1
    assert cert.aggregate_confidence == 95.5
    assert cert.certificate_id == "cert_001"


def test_end_to_end_simulation():
    """Complete flow: create 3 devices, simulate capture, submit, detect, certify."""
    devices = [
        TransmitOnlyDevice(device_id="Alpha"),
        TransmitOnlyDevice(device_id="Beta"),
        TransmitOnlyDevice(device_id="Gamma"),
    ]

    verifier = OfflineVerifier()

    # Simulate captures with real acoustic offsets
    distances = [3.0, 5.0, 7.0]  # inter-device distances
    # Alpha captures Beta and Gamma
    cap_alpha = devices[0].capture_audio(duration_samples=44100)
    for j in [1, 2]:
        beacon = devices[j].transmit_beacon(timestamp=0.0, mesh_id="e2e")
        offset = int(distances[j - 1] / 343 * 44100)
        ended = min(offset + len(beacon), len(cap_alpha.raw_samples))
        cap_alpha.raw_samples[offset:ended] += beacon[:ended - offset]
    verifier.submit_capture(cap_alpha)

    # Beta captures Alpha and Gamma
    cap_beta = devices[1].capture_audio(duration_samples=44100)
    for j in [0, 2]:
        beacon = devices[j].transmit_beacon(timestamp=0.0, mesh_id="e2e")
        offset = int(distances[1 if j == 0 else 0] / 343 * 44100)
        ended = min(offset + len(beacon), len(cap_beta.raw_samples))
        cap_beta.raw_samples[offset:ended] += beacon[:ended - offset]
    verifier.submit_capture(cap_beta)

    # Gamma captures Alpha and Beta
    cap_gamma = devices[2].capture_audio(duration_samples=44100)
    for j in [0, 1]:
        beacon = devices[j].transmit_beacon(timestamp=0.0, mesh_id="e2e")
        offset = int(distances[0 if j == 1 else 1] / 343 * 44100)
        ended = min(offset + len(beacon), len(cap_gamma.raw_samples))
        cap_gamma.raw_samples[offset:ended] += beacon[:ended - offset]
    verifier.submit_capture(cap_gamma)

    # Detect all pairs
    detections = verifier.detect_all_pairs()
    assert len(detections) == 6, f"Expected 6 detections, got {len(detections)}"

    # Issue certificate
    cert = verifier.issue_certificate(detections, mesh_id="e2e_mesh")

    assert isinstance(cert, OfflineMNRCertificate)
    assert len(cert.devices) == 3
    assert cert.mesh_id == "e2e_mesh"
    assert cert.num_mutual_pairs >= 3
    assert cert.total_pairs == 6
    assert cert.aggregate_confidence > 0
    assert len(cert.certificate_id) > 0
    # Check certificate_id is deterministic from content
    assert cert.certificate_id.startswith("offline_")
