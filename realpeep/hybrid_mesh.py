"""Hybrid BLE + acoustic mesh simulator and three-phase verifier.

HybridMeshSimulator runs both BLE and acoustic channels side by side,
simulating a capture session. HybridVerifier implements the three-phase
pipeline: Phase 1 (BLE bloom, fast), Phase 2 (acoustic snippet correlation,
targeted), and Phase 3 (challenge, on demand).

This is the "commit now, compute later" architecture:
- Devices only transmit and record during capture time
- All verification happens server-side after upload
"""

from dataclasses import dataclass

import numpy as np

from realpeep.ble_mesh import (
    BleBeacon,
    BleDevice,
    BleObserver,
    JammingAwareBleSimulator,
)
from realpeep.cdma_mesh import (
    DEFAULT_GOLD_POLY1,
    DEFAULT_GOLD_POLY2,
    GoldCodeGenerator,
    derive_prn_seed,
)

# ═══════════════════════════════════════════════════════════════════════════
# AcousticSnippet
# ═══════════════════════════════════════════════════════════════════════════


@dataclass
class AcousticSnippet:
    """A 2-second raw audio snippet recorded by a device.

    Contains the acoustic channel data that the verifier uses for
    cross-correlation-based proximity verification in Phase 2.

    Attributes:
        device_pk: Ephemeral public key of the recording device.
        raw_samples: 2 s × 44100 Hz = ~88k float samples.
        tx_time: Seconds within the snippet where this device transmitted.
        hash: SHA-256 of raw_samples (commitment).
        signature: Sign(sk, hash || tx_time) — authenticates the snippet.
    """
    device_pk: int
    raw_samples: np.ndarray
    tx_time: float
    hash: str
    signature: str


# ═══════════════════════════════════════════════════════════════════════════
# Thresholds
# ═══════════════════════════════════════════════════════════════════════════

# Minimum number of nonces that must match in a bloom filter
THRESHOLD_BLE_OBSERVED = 1

# Normalized cross-correlation peak threshold for acoustic confirmation
THRESHOLD_ACOUSTIC_PEAK = 0.6

# Search window for acoustic correlation (±100 ms)
ACOUSTIC_SEARCH_WINDOW = 0.100  # seconds


# ═══════════════════════════════════════════════════════════════════════════
# HybridMeshSimulator
# ═══════════════════════════════════════════════════════════════════════════


class HybridMeshSimulator:
    """Simulates both BLE and acoustic channels for N devices.

    Runs the full capture-time workflow:
    1. Each device creates BLE beacons and builds bloom filters.
    2. Each device records a 2 s raw audio snippet containing acoustic
       chirps from nearby devices.
    3. Returns all observations, beacons, and snippets for the verifier.

    Args:
        num_devices: Number of devices in the mesh (hint, not prescriptive).
        seed: Random seed for reproducibility.
    """

    def __init__(self, num_devices: int = 10, seed: int = 42):
        self.devices: list[BleDevice] = []
        self.ble_sim = JammingAwareBleSimulator(seed=seed)
        self.mesh_id = 1
        self.seed = seed

    def create_device(self, device_id: str) -> BleDevice:
        """Create a new device with BLE + acoustic capabilities.

        Args:
            device_id: Human-readable identifier for the device.

        Returns:
            The newly created BleDevice instance.
        """
        pk = len(self.devices) + 1
        sk = pk * 100 + 1
        device = BleDevice(device_id, sk, pk, self.mesh_id)
        self.devices.append(device)
        self.ble_sim.register_device(device)
        return device

    def simulate_capture(self, duration_seconds: float = 30.0) -> dict:
        """Run a full capture session with BLE and acoustic channels.

        Pre-generates all BLE beacons so that the same beacons are both
        observed (bloom filter) and collected (for verifier submission).
        This ensures consistent nonces between scan and submission.

        Args:
            duration_seconds: Duration of the BLE scan phase (unused in sim
                              but kept for interface compat).

        Returns:
            dict with:
            - 'ble_observations': dict[pk] = BleObserver (bloom filter)
            - 'ble_beacons': list of all beacons transmitted
            - 'acoustic_snippets': dict[pk] = AcousticSnippet data dict
        """
        # Pre-generate all beacons for all devices so the same beacons
        # are both observed (scanned) and submitted to the verifier
        all_beacons: list[BleBeacon] = []
        for device in self.devices:
            for _ in range(5):  # each device transmits ~5 beacons
                all_beacons.append(device.create_beacon())

        # BLE: each device builds a bloom filter from OTHER devices' beacons
        ble_observations: dict[int, BleObserver] = {}
        for device in self.devices:
            observer = BleObserver()
            for b in all_beacons:
                if b.pk != device.pk:
                    observer.observe(b)
            ble_observations[device.pk] = observer

        # Acoustic: simulate 2 s raw audio snippets
        acoustic_snippets: dict[int, dict] = {}
        for device in self.devices:
            snippet = self._simulate_acoustic_snippet(device)
            acoustic_snippets[device.pk] = snippet

        return {
            'ble_observations': ble_observations,
            'ble_beacons': all_beacons,
            'acoustic_snippets': acoustic_snippets,
        }

    def _simulate_acoustic_snippet(self, device: BleDevice) -> dict:
        """Simulate a 2 s raw audio recording containing chirps from nearby devices.

        Embeds actual Gold codes from nearby devices at realistic offsets,
        so the verifier's cross-correlation can detect them in Phase 2.
        Each device's own chirp is placed at the center of the snippet.

        Args:
            device: The device whose acoustic snippet to simulate.

        Returns:
            dict with:
            - 'raw_samples': numpy array of 2s × 44100 Hz = 88200 samples
            - 'tx_time': the sample offset where this device transmitted
            - 'present_codes': list of pks whose codes are embedded
        """
        sr = 44100
        duration_s = 2.0
        samples = int(sr * duration_s)
        audio = np.zeros(samples, dtype=np.float64)

        # Own chirp at center of snippet
        tx_offset = samples // 2

        # Add a small amount of ambient noise so audio isn't perfectly silent
        rng = np.random.RandomState(seed=self.seed + device.pk)
        audio += rng.normal(0, 0.01, size=samples)

        # Add chirps from nearby devices (K ~ 3-10)
        nearby = [d for d in self.devices if d.pk != device.pk]
        rng.shuffle(nearby)
        num_nearby = min(rng.randint(3, 10), len(nearby))
        present = nearby[:num_nearby]

        present_codes: list[int] = []
        for other in present:
            # Generate actual Gold code for this device
            seed = derive_prn_seed(other.pk)
            gen = GoldCodeGenerator(
                DEFAULT_GOLD_POLY1, DEFAULT_GOLD_POLY2, seed
            )
            gold_code = gen.generate_code(other.pk % 129, 0, 128)

            # Place at a random offset near the center (±500 samples ≈ ±11ms)
            offset = tx_offset + rng.randint(-500, 500)
            if 0 <= offset < samples:
                code_len = len(gold_code)
                end = min(offset + code_len, samples)
                actual_len = end - offset
                audio[offset:end] += gold_code[:actual_len]  # full amplitude
                present_codes.append(other.pk)

        return {
            'raw_samples': audio,
            'tx_time': tx_offset / sr,  # in seconds
            'present_codes': present_codes,
        }


# ═══════════════════════════════════════════════════════════════════════════
# HybridVerifier
# ═══════════════════════════════════════════════════════════════════════════


class HybridVerifier:
    """Three-phase pipeline combining BLE bloom + acoustic correlation.

    Phase 1 (BLE Bloom, fast):
        Build an N×N adjacency matrix from bloom filter observations.
        Each device's bloom filter is checked for every other device's
        nonces. Output is a pairwise adjacency matrix.

    Phase 2 (Acoustic Audit, targeted):
        For each BLE-observed pair, cross-correlate the heard device's
        Gold code against the recorder device's raw audio snippet within
        a ±100 ms search window. High correlation confirms co-location.

    Phase 3 (Challenge, on demand):
        Report pairs that failed acoustic confirmation for further
        investigation (wider search, distance plausibility checks, etc.).

    Usage:
        verifier = HybridVerifier()
        verifier.submit_ble_observation(pk, observer)
        verifier.submit_ble_beacon(beacon)
        verifier.submit_acoustic_snippet(snippet)

        p1 = verifier.run_phase1()
        p2 = verifier.run_phase2(p1)
        p3 = verifier.run_phase3(p2)
    """

    def __init__(self):
        self.ble_observations: dict[int, BleObserver] = {}
        self.ble_beacons: list[BleBeacon] = []
        self.acoustic_snippets: dict[int, AcousticSnippet] = {}

    def submit_ble_observation(self, pk: int, observer: BleObserver):
        """Submit a device's BLE observation commitment (bloom filter).

        Args:
            pk: Ephemeral public key of the observing device.
            observer: BleObserver with bloom filter of heard nonces.
        """
        self.ble_observations[pk] = observer

    def submit_ble_beacon(self, beacon: BleBeacon):
        """Submit a device's transmitted BLE beacon.

        Args:
            beacon: The BleBeacon that was transmitted.
        """
        self.ble_beacons.append(beacon)

    def submit_acoustic_snippet(self, snippet: AcousticSnippet):
        """Submit a device's acoustic recording snippet.

        Args:
            snippet: AcousticSnippet with raw audio and metadata.
        """
        self.acoustic_snippets[snippet.device_pk] = snippet

    # ── Phase 1: BLE Bloom ───────────────────────────────────────────────

    def run_phase1(self) -> dict:
        """Build BLE adjacency matrix from bloom filter observations.

        For each pair (i, j), checks if device i's bloom filter contains
        ANY of device j's nonces. A 1 in matrix[i][j] means i heard j.

        Returns:
            dict with:
            - 'matrix': N×N adjacency list-of-lists
            - 'pks': sorted list of device public keys
            - 'observed_pairs': list of (hearer_pk, heard_pk) tuples
            - 'n_pairs': number of observed pairs
            - 'n_devices': number of devices
            - 'connected': True if graph is fully connected
        """
        pks = sorted(self.ble_observations.keys())
        n = len(pks)
        matrix = [[0] * n for _ in range(n)]

        # Build nonce lookup: pk → set of nonces
        device_nonces: dict[int, set[int]] = {}
        for b in self.ble_beacons:
            device_nonces.setdefault(b.pk, set()).add(b.nonce)

        for i, pk_i in enumerate(pks):
            obs = self.ble_observations[pk_i]
            for j, pk_j in enumerate(pks):
                if i == j:
                    continue
                nonces_j = device_nonces.get(pk_j, set())
                if any(obs.check(nonce) for nonce in nonces_j):
                    matrix[i][j] = 1

        pairs: list[tuple[int, int]] = []
        for i in range(n):
            for j in range(n):
                if i != j and matrix[i][j] == 1:
                    pairs.append((pks[i], pks[j]))

        return {
            'matrix': matrix,
            'pks': pks,
            'observed_pairs': pairs,
            'n_pairs': len(pairs),
            'n_devices': n,
            'connected': all(
                matrix[i][j] == 1
                for i in range(n)
                for j in range(n)
                if i != j
            ),
        }

    # ── Phase 2: Acoustic Audit ──────────────────────────────────────────

    def run_phase2(self, phase1_result: dict) -> dict:
        """Audit BLE-observed pairs with acoustic snippet cross-correlation.

        For each (hear_pk, recorder_pk) pair from Phase 1, derives the
        heard device's Gold code and cross-correlates against the recorder
        device's raw audio snippet within a ±100 ms search window.

        Args:
            phase1_result: Output from run_phase1().

        Returns:
            dict with:
            - 'pair_results': list of per-pair audit dicts
            - 'n_confirmed': count of acoustically confirmed pairs
            - 'n_flagged': count of pairs that failed confirmation
            - 'avg_confidence': mean confidence across all pairs
        """
        results: list[dict] = []
        for pk_heard, pk_recorder in phase1_result['observed_pairs']:
            snippet = self.acoustic_snippets.get(pk_recorder)
            if snippet is None:
                results.append({
                    'heard': pk_heard,
                    'recorder': pk_recorder,
                    'confidence': 0.0,
                    'confirmed': False,
                    'reason': 'no_acoustic_data',
                })
                continue

            # Get claimed tx time from the recorder's snippet
            tx_time = snippet.tx_time

            # Search window: ±100 ms around claimed tx time
            sr = 44100
            window_samples = int(ACOUSTIC_SEARCH_WINDOW * sr)
            center = int(tx_time * sr)
            start = max(0, center - window_samples)
            end = min(len(snippet.raw_samples), center + window_samples)
            window = snippet.raw_samples[start:end]

            # Generate expected Gold code for the heard device
            seed = derive_prn_seed(pk_heard)
            code_len = 128
            gen = GoldCodeGenerator(
                DEFAULT_GOLD_POLY1, DEFAULT_GOLD_POLY2, seed
            )
            gold_code = gen.generate_code(
                pk_heard % 129, 0, code_len
            )

            # Cross-correlate
            corr = np.correlate(window, gold_code, mode='valid')
            peak = float(np.max(np.abs(corr)))
            max_possible = code_len  # perfect autocorrelation peak
            confidence = peak / max_possible

            confirmed = confidence >= THRESHOLD_ACOUSTIC_PEAK

            results.append({
                'heard': pk_heard,
                'recorder': pk_recorder,
                'confidence': round(confidence, 3),
                'confirmed': confirmed,
                'peak': int(peak),
                'reason': 'ok' if confirmed else 'low_correlation',
            })

        n_confirmed = sum(1 for r in results if r['confirmed'])
        n_flagged = sum(1 for r in results if not r['confirmed'])
        avg_conf = (
            sum(r['confidence'] for r in results) / max(len(results), 1)
        )

        return {
            'pair_results': results,
            'n_confirmed': n_confirmed,
            'n_flagged': n_flagged,
            'avg_confidence': round(avg_conf, 3),
        }

    # ── Phase 3: Challenge ────────────────────────────────────────────────

    def run_phase3(self, phase2_result: dict) -> dict:
        """Report flagged pairs from Phase 2 for further investigation.

        In a production system, this would re-examine flagged pairs with
        a wider search window, check propagation delay plausibility, or
        request additional evidence. In this prototype, we simply report
        them.

        Args:
            phase2_result: Output from run_phase2().

        Returns:
            dict with:
            - 'flagged_pairs': list of scan dicts for non-confirmed pairs
            - 'n_flagged': count of flagged pairs
        """
        flagged = [
            r for r in phase2_result['pair_results']
            if not r['confirmed']
        ]
        return {
            'flagged_pairs': flagged,
            'n_flagged': len(flagged),
        }
