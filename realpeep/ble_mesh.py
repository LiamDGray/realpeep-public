"""BLE transmit-only mesh for RealPeep.

Implements a "commit now, compute later" architecture using BLE advertising
channels. Devices broadcast beacons at random intervals; observers passively
collect nonces into a Bloom filter; the verifier reconstructs an N×N adjacency
matrix from unilateral observation commitments and issues a group MNR certificate.

The simulator (BleSimulator) is swappable with real BLE hardware by implementing
the same scan() interface: returns list of BleBeacon within range.
"""

import hashlib
import math
import random
from dataclasses import dataclass

from bitarray import bitarray

# ---------------------------------------------------------------------------
# BleBeacon
# ---------------------------------------------------------------------------


@dataclass
class BleBeacon:
    """A single BLE presence beacon broadcast by a device."""

    type: str = "presence"
    pk: int = 0  # ephemeral public key (simulated as int for simplicity)
    nonce: int = 0  # random 64-bit nonce
    mesh_id: int = 0  # truncated hash of video seed
    signature: str = ""  # sign(sk, pk || nonce || mesh_id)


# ---------------------------------------------------------------------------
# BleDevice
# ---------------------------------------------------------------------------


class BleDevice:
    """A transmit-only device that broadcasts BLE presence beacons.

    At capture time the device only transmits — it never listens, never
    decodes, and never verifies. Everything happens at verifier time.
    """

    def __init__(self, device_id: str, sk: int, pk: int, mesh_id: int):
        self.device_id = device_id
        self.sk = sk
        self.pk = pk
        self.mesh_id = mesh_id

    def create_beacon(self) -> BleBeacon:
        """Create a beacon with random nonce and signature."""
        nonce = random.randint(0, 2**64)
        data = f"{self.pk}:{nonce}:{self.mesh_id}"
        sig = hashlib.sha256(f"{self.sk}:{data}".encode()).hexdigest()[:16]
        return BleBeacon(pk=self.pk, nonce=nonce, mesh_id=self.mesh_id, signature=sig)


# ---------------------------------------------------------------------------
# BleObserver (Bloom filter)
# ---------------------------------------------------------------------------


class BleObserver:
    """Passively observes BLE beacons and builds a bloom filter commitment.

    The bloom filter is a compact probabilistic data structure that records
    which nonces were observed. It is serialised and uploaded to the verifier
    as the device's observation commitment.
    """

    def __init__(self, capacity: int = 5000, fpr: float = 0.02):
        """Initialize with bloom filter of given capacity and false positive rate.

        Args:
            capacity: Expected number of items to insert.
            fpr: Desired false positive rate (0 < fpr < 1).
        """
        self.size = self._optimal_size(capacity, fpr)
        self.num_hashes = self._optimal_hashes(self.size, capacity)
        self.bitarray = bitarray(self.size)
        self.bitarray.setall(0)
        self.count = 0

    def observe(self, beacon: BleBeacon) -> None:
        """Add beacon's nonce to bloom filter."""
        for seed in range(self.num_hashes):
            idx = hashlib.sha256(f"{beacon.nonce}:{seed}".encode()).digest()
            idx = int.from_bytes(idx[:4], "big") % self.size
            self.bitarray[idx] = 1
        self.count += 1

    def check(self, nonce: int) -> bool:
        """Check if a nonce might be in the filter.

        Returns False if definitely NOT present; True if possibly present
        (with false positive probability = fpr).
        """
        for seed in range(self.num_hashes):
            idx = hashlib.sha256(f"{nonce}:{seed}".encode()).digest()
            idx = int.from_bytes(idx[:4], "big") % self.size
            if not self.bitarray[idx]:
                return False
        return True

    def serialize(self) -> bytes:
        """Serialize bloom filter for commitment.

        Format: [4-byte count][bitarray bytes].
        """
        count_bytes = self.count.to_bytes(4, "big")
        return count_bytes + self.bitarray.tobytes()

    @classmethod
    def deserialize(cls, data: bytes, capacity: int = 5000, fpr: float = 0.02):
        """Deserialize a bloom filter from bytes.

        Args:
            data: Serialized bloom filter bytes (count + bitarray).
            capacity: Expected number of items (for reconstructing params).
            fpr: Desired false positive rate (for reconstructing params).

        Returns:
            A BleObserver instance with the deserialized filter.
        """
        obs = cls(capacity, fpr)
        count = int.from_bytes(data[:4], "big")
        obs.count = count
        obs.bitarray = bitarray()
        obs.bitarray.frombytes(data[4:])
        return obs

    @staticmethod
    def _optimal_size(n: int, p: float) -> int:
        """Compute optimal bit array size: m = -n * ln(p) / (ln(2)^2)."""
        return int(-n * math.log(p) / (math.log(2) ** 2))

    @staticmethod
    def _optimal_hashes(m: int, n: int) -> int:
        """Compute optimal number of hash functions: k = (m/n) * ln(2)."""
        return int((m / n) * math.log(2))


# ---------------------------------------------------------------------------
# BleSimulator
# ---------------------------------------------------------------------------


class BleSimulator:
    """Simulates BLE advertising channel.

    Swappable with real BlueZ/BTStack adapter by implementing the same
    scan() interface: returns list of BleBeacon within range.
    """

    def __init__(
        self,
        range_meters: float = 10.0,
        noise_pct: float = 0.0,
        seed: int = 42,
    ):
        self.devices: dict[int, BleDevice] = {}  # pk -> device
        self.range_meters = range_meters
        self.noise_pct = noise_pct
        random.seed(seed)

    def register_device(self, device: BleDevice):
        """Register a device that's broadcasting in this mesh."""
        self.devices[device.pk] = device

    def scan(
        self, observer_pk: int, duration_seconds: float = 30.0
    ) -> list[BleBeacon]:
        """Simulate a BLE scan cycle.

        Returns beacons from all devices in range (pk != observer_pk),
        excluding some based on noise_pct (packet loss simulation).

        Args:
            observer_pk: Public key of the observing device.
            duration_seconds: Duration of the scan (unused in sim, kept for
                              interface compat with real BLE).

        Returns:
            List of BleBeacon objects heard during the scan.
        """
        beacons = []
        for pk, device in self.devices.items():
            if pk == observer_pk:
                continue
            # Simulate packet loss
            if random.random() < self.noise_pct:
                continue
            # Device creates a beacon
            beacons.append(device.create_beacon())
        return beacons


# ---------------------------------------------------------------------------
# BleJammer
# ---------------------------------------------------------------------------


class BleJammer:
    """A malicious device that disrupts BLE mesh observation.

    Strategies:
    - 'flood': broadcasts many beacons with different nonces to fill bloom filters
    - 'silent': never submits observations (but may still broadcast)
    - 'spoof': submits a saturated bloom filter (all bits = 1)
    - 'sybil': creates multiple fake identities
    """

    def __init__(self, device_id: str, strategy: str = 'flood',
                 pk: int = None, mesh_id: int = 0):
        self.device_id = device_id
        self.strategy = strategy
        self.pk = pk or random.randint(10_000, 1_000_000)
        self.mesh_id = mesh_id
        self.sk = self.pk * 2  # fake key

    def create_beacons(self, count: int = 50) -> list[BleBeacon]:
        """Create many beacons with different nonces (flooding)."""
        beacons = []
        for _ in range(count):
            nonce = random.randint(0, 2**64)
            sig = hashlib.sha256(f"{self.sk}:{self.pk}:{nonce}".encode()).hexdigest()[:16]
            beacons.append(BleBeacon(pk=self.pk, nonce=nonce, mesh_id=self.mesh_id, signature=sig))
        return beacons


# ---------------------------------------------------------------------------
# JammingAwareBleSimulator
# ---------------------------------------------------------------------------


class JammingAwareBleSimulator(BleSimulator):
    """BLE simulator that includes jammers alongside honest devices."""

    def __init__(self, range_meters=10.0, noise_pct=0.0, seed=42):
        super().__init__(range_meters, noise_pct, seed)
        self.jammers: list[BleJammer] = []
        self.jammer_flood_counts: dict[int, int] = {}  # pk -> num_beacons_per_scan

    def register_jammer(self, jammer: BleJammer, flood_beacons_per_scan: int = 50):
        """Register a jammer device that will flood the channel."""
        self.jammers.append(jammer)
        self.jammer_flood_counts[jammer.pk] = flood_beacons_per_scan

    def scan(self, observer_pk, duration_seconds=30.0) -> list[BleBeacon]:
        """Returns honest beacons + jammer flood beacons."""
        beacons = super().scan(observer_pk, duration_seconds)
        # Jammers flood the channel — their beacons are also received
        for jammer in self.jammers:
            if random.random() < self.noise_pct:
                continue
            count = self.jammer_flood_counts.get(jammer.pk, 50)
            beacons.extend(jammer.create_beacons(count))
        return beacons


# ---------------------------------------------------------------------------
# BleGroupCertificate
# ---------------------------------------------------------------------------


@dataclass
class BleGroupCertificate:
    """A group MNR certificate issued from BLE mesh observation data."""

    mesh_id: int
    devices: list[int]  # list of pks
    matrix_hash: str  # SHA-256 of the adjacency matrix
    connected: bool  # graph is fully connected
    num_devices: int
    num_observations: int  # sum(matrix) / 2
    certificate_id: str


# ---------------------------------------------------------------------------
# BleMeshVerifier
# ---------------------------------------------------------------------------


class BleMeshVerifier:
    """Reconstructs many-to-many adjacency from unilateral observation commitments.

    After all devices upload their bloom filter commitments and beacons,
    the verifier builds an N×N adjacency matrix by checking each device's
    bloom filter for every other device's nonce. If the graph is fully
    connected, it issues a single group MNR certificate.
    """

    def __init__(self):
        self.observations: dict[int, BleObserver] = {}  # pk -> observer with bloom filter
        self.device_nonces: dict[int, set[int]] = {}  # pk -> set of nonces (multiple per device)

    def submit_observation(self, observer_pk: int, observer: BleObserver):
        """Submit a device's observation commitment (bloom filter of heard nonces)."""
        self.observations[observer_pk] = observer

    def submit_beacon(self, beacon: BleBeacon):
        """Submit a device's transmitted beacon (contains its nonce)."""
        self.device_nonces.setdefault(beacon.pk, set()).add(beacon.nonce)

    def build_matrix(self) -> list[list[int]]:
        """Build N×N adjacency matrix from bloom filter checks.

        matrix[i][j] = 1 if device_i's bloom filter contains ANY of
        device_j's nonces.  Devices are sorted by pk.

        Returns:
            An N×N matrix where matrix[i][j] == 1 means device i heard device j.
        """
        pks = sorted(self.observations.keys())
        n = len(pks)
        matrix = [[0] * n for _ in range(n)]

        for i, pk_i in enumerate(pks):
            observer = self.observations[pk_i]
            for j, pk_j in enumerate(pks):
                if i == j:
                    continue
                nonces_j = self.device_nonces.get(pk_j, set())
                if any(observer.check(nonce) for nonce in nonces_j):
                    matrix[i][j] = 1
        return matrix

    def is_connected(self, matrix: list[list[int]]) -> bool:
        """Check if the graph is fully connected.

        A fully connected graph means every device heard every other device
        (all off-diagonal entries are 1).

        Args:
            matrix: N×N adjacency matrix.

        Returns:
            True if the graph is fully connected.
        """
        n = len(matrix)
        for i in range(n):
            for j in range(n):
                if i != j and matrix[i][j] == 0:
                    return False
        return True

    def issue_certificate(self, matrix: list[list[int]]) -> BleGroupCertificate:
        """Issue a group MNR certificate from the adjacency matrix.

        Args:
            matrix: N×N adjacency matrix from build_matrix().

        Returns:
            A BleGroupCertificate summarizing the mesh observation data.
        """
        pks = sorted(self.observations.keys())
        n = len(pks)
        connected = self.is_connected(matrix)
        observations = sum(sum(row) for row in matrix) // 2
        matrix_str = str(matrix).encode()
        matrix_hash = hashlib.sha256(matrix_str).hexdigest()
        cert_id = hashlib.sha256(
            f"{pks}:{matrix_hash}:{observations}".encode()
        ).hexdigest()

        return BleGroupCertificate(
            mesh_id=0,  # set by caller / inferred from beacons
            devices=pks,
            matrix_hash=matrix_hash,
            connected=connected,
            num_devices=n,
            num_observations=observations,
            certificate_id=cert_id,
        )

    # ═══════════════════════════════════════════════════════════════════
    # Jamming detection methods
    # ═══════════════════════════════════════════════════════════════════

    def detect_flood(self) -> list[int]:
        """Detect devices that transmitted an implausible number of beacons.

        A device is flagged if its nonce count > 3 * Q1 (first quartile)
        of all devices' nonce counts, where Q1 is the median of the lower
        half of sorted counts. This is robust even when jammers form the
        majority of devices.

        Returns list of device pks to flag as potential flooders.
        """
        pks = sorted(self.device_nonces.keys())
        counts = sorted([len(self.device_nonces[pk]) for pk in pks if pk in self.device_nonces])
        if not counts:
            return []
        # Use first quartile (Q1) as baseline — robust vs majority-jammer scenarios
        n = len(counts)
        q1_idx = n // 4
        baseline = counts[q1_idx]
        threshold = max(baseline * 3, 10)  # at least 10 nonces to not flag noise
        flagged = []
        for pk in pks:
            count = len(self.device_nonces.get(pk, set()))
            if count > threshold:
                flagged.append(pk)
        return flagged

    def detect_asymmetry(self, matrix: list[list[int]]) -> list[int]:
        """Detect devices that appear asymmetrically in the matrix.

        A jammer that listens but never submits will appear in many bloom
        filters (heard by many) but its own bloom filter will be empty.

        Uses a relaxed threshold: a device is flagged if it is heard by
        more than n/3 peers but hears none (owns_obs == 0). This catches
        silent jammers even when they form a large fraction of the network.

        Returns list of device pks to flag.
        """
        pks = sorted(self.observations.keys())
        n = len(pks)
        if n < 2:
            return []
        flagged = []
        for i, pk_i in enumerate(pks):
            observed_by = sum(1 for j in range(n) if j != i and matrix[j][i] == 1)
            owns_obs = sum(1 for j in range(n) if j != i and matrix[i][j] == 1)
            # If many devices heard me but I heard nothing → asymmetric (jammer)
            if owns_obs == 0 and observed_by > n // 3:
                flagged.append(pk_i)
        return flagged

    def detect_saturated_bloom(self) -> list[int]:
        """Detect devices with saturated bloom filters.

        A bloom filter with >80% bits set is likely a spoofed submission.
        Returns list of device pks to flag.
        """
        flagged = []
        for pk, obs in self.observations.items():
            set_bits = obs.bitarray.count()
            fill_ratio = set_bits / max(obs.size, 1)
            if fill_ratio > 0.80:
                flagged.append(pk)
        return flagged

    def process_with_defenses(self, drop_flood=True, drop_asymmetric=True,
                              drop_saturated=True) -> dict:
        """Build matrix, detect jamming, drop flagged devices, rebuild.

        Returns a dict with:
        - 'original_matrix': before dropping
        - 'final_matrix': after dropping
        - 'flagged_devices': list of {pk, reason} dicts
        - 'dropped_devices': list of pks that were removed
        - 'certificate': BleGroupCertificate or None (if graph disconnected)
        - 'defenses_applied': list of defense names that triggered
        """
        original_matrix = self.build_matrix()
        flagged = []
        dropped = set()
        defenses = []

        if drop_flood:
            flooders = self.detect_flood()
            if flooders:
                defenses.append('flood_detection')
                for pk in flooders:
                    flagged.append({'pk': pk, 'reason': 'flood'})
                    dropped.add(pk)

        if drop_asymmetric:
            asymmetrics = self.detect_asymmetry(original_matrix)
            if asymmetrics:
                defenses.append('asymmetry_detection')
                for pk in asymmetrics:
                    if pk not in dropped:
                        flagged.append({'pk': pk, 'reason': 'asymmetric'})
                        dropped.add(pk)

        if drop_saturated:
            saturated = self.detect_saturated_bloom()
            if saturated:
                defenses.append('saturation_detection')
                for pk in saturated:
                    if pk not in dropped:
                        flagged.append({'pk': pk, 'reason': 'saturated_bloom'})
                        dropped.add(pk)

        # Rebuild matrix excluding dropped devices
        if dropped:
            for pk in dropped:
                self.observations.pop(pk, None)
                self.device_nonces.pop(pk, None)
            final_matrix = self.build_matrix()
        else:
            final_matrix = original_matrix

        cert = None
        if self.is_connected(final_matrix):
            cert = self.issue_certificate(final_matrix)

        return {
            'original_matrix': original_matrix,
            'final_matrix': final_matrix,
            'flagged_devices': flagged,
            'dropped_devices': list(dropped),
            'certificate': cert,
            'defenses_applied': defenses,
        }
