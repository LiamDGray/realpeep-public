import hashlib
import struct
from dataclasses import dataclass
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    from realpeep.mnr_rollup import OfflineMNRCertificate

# Default n=7 preferred pair polynomials for Gold codes
# x^7 + x + 1     → mask 0x83 (bits 7, 1, 0)
# x^7 + x^3 + 1   → mask 0x89 (bits 7, 3, 0)
DEFAULT_GOLD_POLY1 = 0x83
DEFAULT_GOLD_POLY2 = 0x89
MAX_CODES_N7 = (1 << 7) + 1  # 129 codes in the n=7 Gold family


class LFSR:
    """Galois-configuration Linear Feedback Shift Register.

    Generates a pseudo-random bit sequence defined by a primitive polynomial.

    Args:
        polynomial: Bitmask where bit i corresponds to coefficient of x^i.
                    e.g., x^7 + x + 1 → 0b10000011 (bits 7, 1, 0 set).
        initial_state: Non-zero seed value for the register.
    """

    def __init__(self, polynomial: int, initial_state: int = 1):
        if initial_state == 0:
            raise ValueError("LFSR initial state must be non-zero")
        self.polynomial = polynomial
        self.degree = polynomial.bit_length() - 1
        self.state = initial_state & ((1 << self.degree) - 1)

    def next(self) -> int:
        """Return the next output bit (0 or 1)."""
        bit = self.state & 1
        # Galois shift: if LSB is 1, XOR with polynomial (right-shifted
        # by 1 to drop the x^0 feedback term).
        self.state >>= 1
        if bit:
            self.state ^= (self.polynomial >> 1)
        return bit


class GoldCodeGenerator:
    """Generates Gold codes from two maximal-length LFSRs with preferred-pair polynomials.

    A Gold code is the XOR of two m-sequences. Varying the relative phase
    (shift) between the two LFSRs produces different codes from the same
    family, all with bounded cross-correlation.

    Args:
        poly1: Bitmask for the first primitive polynomial (preferred pair).
        poly2: Bitmask for the second primitive polynomial.
        initial_seed: Seed for both LFSRs.
    """

    def __init__(self, poly1: int, poly2: int, initial_seed: int):
        self.poly1 = poly1
        self.poly2 = poly2
        self.initial_seed = initial_seed

    def generate_code(self, shift_a: int, shift_b: int, length: int) -> np.ndarray:
        """Generate a Gold code of the given length.

        Args:
            shift_a: Number of steps to advance LFSR1 before collection.
            shift_b: Number of steps to advance LFSR2 before collection.
            length: Number of chips (output samples).

        Returns:
            numpy array of [-1, 1] bipolar chips.
        """
        lfsr1 = LFSR(self.poly1, self.initial_seed)
        lfsr2 = LFSR(self.poly2, self.initial_seed)

        # Advance to the desired phase
        for _ in range(shift_a):
            lfsr1.next()
        for _ in range(shift_b):
            lfsr2.next()

        code = np.empty(length, dtype=np.float64)
        for i in range(length):
            code[i] = 1.0 if (lfsr1.next() ^ lfsr2.next()) else -1.0

        return code


class CDMADevice:
    """
    Simulates a device transmitting an Ephemeral Key over a noisy acoustic
    channel using CDMA. Spreading codes are proper Gold codes generated from
    two maximal-length LFSRs with a preferred-pair polynomial.
    """

    def __init__(
        self,
        device_id: str,
        prn_seed: int,
        spreading_factor: int = 128,
        fec_repeats: int = 5,
        gold_code_poly1: int | None = None,
        gold_code_poly2: int | None = None,
    ):
        self.device_id = device_id
        self.spreading_factor = spreading_factor
        self.fec_repeats = fec_repeats

        poly1 = gold_code_poly1 if gold_code_poly1 is not None else DEFAULT_GOLD_POLY1
        poly2 = gold_code_poly2 if gold_code_poly2 is not None else DEFAULT_GOLD_POLY2

        # Generate a proper Gold code
        self.gold_gen = GoldCodeGenerator(poly1, poly2, prn_seed)
        self.code_idx = prn_seed % MAX_CODES_N7

        # The natural Gold period for n=7 is 2^7 - 1 = 127.
        # Pad/truncate to the requested spreading_factor.
        raw_code = self.gold_gen.generate_code(
            shift_a=0, shift_b=self.code_idx, length=spreading_factor
        )
        self.prn_code = raw_code.astype(np.float64)

    def _string_to_bits(self, s: str) -> np.ndarray:
        """Convert string to bipolar bits (-1, 1)."""
        result = []
        for char in s:
            bits = format(ord(char), '08b')
            result.extend([1 if b == '1' else -1 for b in bits])
        return np.array(result)

    def generate_signal(self, key: str) -> np.ndarray:
        """
        Applies Forward Error Correction (FEC) and Spreads the signal via CDMA.
        """
        # 1. Convert to bits
        bits = self._string_to_bits(key)

        # 2. Forward Error Correction (Message-Level Repetition / Interleaving)
        # Instead of repeating adjacent bits (which fails to burst errors),
        # we tile the entire message N times.
        fec_bits = np.tile(bits, self.fec_repeats)

        # 3. CDMA Spreading
        # Multiply each FEC bit by the entire PRN sequence
        # Output length = len(fec_bits) * spreading_factor
        signal = np.kron(fec_bits, self.prn_code)

        return signal


class AcousticChannel:
    """
    Simulates the physical space where multiple CDMA signals collide, plus noise.
    """
    def __init__(self, noise_std: float = 2.0, packet_loss_pct: float = 0.0):
        self.noise_std = noise_std
        self.packet_loss_pct = packet_loss_pct

    def mix_signals(self, signals: list[np.ndarray]) -> np.ndarray:
        """Sum all device signals, add AWGN, and simulate acoustic blockages."""
        # Assume all signals are same length for simplicity in this prototype
        mixed = np.sum(signals, axis=0).astype(float)

        # Add Additive White Gaussian Noise (AWGN)
        noise = np.random.normal(0, self.noise_std, size=len(mixed))
        mixed += noise

        # Simulate burst errors (siren / physical obstruction)
        if self.packet_loss_pct > 0:
            drop_len = int(len(mixed) * self.packet_loss_pct)
            drop_start = np.random.randint(0, len(mixed) - drop_len)
            mixed[drop_start:drop_start + drop_len] = 0.0

        return mixed


class MatchedFilterReceiver:
    """
    Extracts a specific device's key from the noisy multi-device channel.
    """
    def __init__(self, spreading_factor: int = 128, fec_repeats: int = 5):
        self.spreading_factor = spreading_factor
        self.fec_repeats = fec_repeats

    def _bits_to_string(self, bits: np.ndarray) -> str:
        """Convert bipolar bits (-1, 1) back to ASCII string."""
        binary_str = "".join(['1' if b > 0 else '0' for b in bits])
        chars = []
        for i in range(0, len(binary_str), 8):
            byte = binary_str[i:i+8]
            if len(byte) == 8:
                chars.append(chr(int(byte, 2)))
        return "".join(chars)

    def extract_key(self, mixed_signal: np.ndarray, prn_code: np.ndarray, key_length_chars: int) -> str:
        """
        Uses cross-correlation to extract the spread bits, then reverses FEC.
        """
        expected_total_bits = key_length_chars * 8 * self.fec_repeats
        expected_signal_len = expected_total_bits * self.spreading_factor

        # Ensure we only process the relevant chunk
        signal = mixed_signal[:expected_signal_len]

        # 1. Matched Filter (De-spreading)
        # We reshape the signal into blocks of `spreading_factor` length.
        # Then we take the dot product (correlation) with the PRN code.
        reshaped = signal.reshape(-1, self.spreading_factor)
        correlations = np.dot(reshaped, prn_code)

        # The correlation result gives us the soft FEC bits.
        # >0 means likely 1, <0 means likely -1.

        # 2. Reverse Forward Error Correction (Interleaved Majority Voting)
        # We need to reshape the correlations to group the tiled message blocks
        # correlations length = key_length_chars * 8 * fec_repeats
        num_bits = key_length_chars * 8
        fec_blocks = correlations.reshape(self.fec_repeats, num_bits)

        # Sum across the repeated message copies (axis=0)
        voted_bits = np.sum(fec_blocks, axis=0)

        # 3. Hard Decision
        hard_bits = np.where(voted_bits > 0, 1, -1)

        # 4. Convert back to string
        return self._bits_to_string(hard_bits)


# ── Transmit-only mesh (offline verifier) ─────────────────────────────────


def derive_prn_seed(pk: int) -> int:
    """Deterministically derives a Gold code seed from an ephemeral public key.

    gold_seed = first 4 bytes of SHA256(encode(pk)) → interpret as int
    → mod MAX_CODES_N7

    This means ANYONE who knows pk can reconstruct the device's Gold code.
    """
    # Encode pk as 8 bytes big-endian
    pk_bytes = struct.pack('>Q', pk)
    h = hashlib.sha256(pk_bytes).digest()
    # First 4 bytes → unsigned int
    seed = struct.unpack('>I', h[:4])[0]
    return seed % MAX_CODES_N7


@dataclass
class RawAudioCapture:
    """A device's raw audio recording with commitment and signature.

    The device records raw audio, hashes it, signs the hash+timer, and
    stores everything for later offline verification.
    """
    device_pk: int            # The ephemeral pk of the recording device
    raw_samples: np.ndarray   # The actual audio samples
    chunk_hash: str           # SHA256 of raw_samples
    chunk_timestamp: float    # Device's local clock
    signature: str            # sign(sk, chunk_hash || timestamp)


class TransmitOnlyDevice:
    """A stripped-down device that does NOT listen or decode at capture time.

    It only broadcasts Gold-coded beacons and signs raw audio captures.
    The offline verifier later cross-correlates codes against raw audio to
    prove pairwise co-location.

    This is the "commit now, compute later" design.
    """

    def __init__(self, device_id: str, sk: int | None = None,
                 pk: int | None = None, spreading_factor: int = 128):
        self.device_id = device_id
        self.spreading_factor = spreading_factor

        # Generate ephemeral keypair if not provided
        if sk is None:
            # In production: use X25519 or similar. For simulation: use
            # a deterministic keypair from device_id hash.
            from hashlib import sha256
            seed = sha256(device_id.encode()).digest()
            sk_int = struct.unpack('>Q', seed[:8])[0]
            self.sk = sk_int
            derived_pk = struct.unpack('>Q', sha256(seed).digest()[:8])[0]
            self.pk = pk if pk is not None else derived_pk
        else:
            self.sk = sk
            self.pk = pk if pk is not None else sk * 2654435761  # simple derivation

        # Derive Gold code seed from pk
        self._gold_seed = derive_prn_seed(self.pk)
        self._gold_code = None

    @property
    def gold_code(self) -> np.ndarray:
        """Gold code deterministically derived from pk.

        Returns a bipolar (-1, 1) numpy array of length spreading_factor.
        """
        if self._gold_code is None:
            gen = GoldCodeGenerator(
                DEFAULT_GOLD_POLY1, DEFAULT_GOLD_POLY2, self._gold_seed
            )
            code_idx = self._gold_seed % MAX_CODES_N7
            raw = gen.generate_code(
                shift_a=0, shift_b=code_idx, length=self.spreading_factor
            )
            self._gold_code = raw.astype(np.float64)
        return self._gold_code

    def transmit_beacon(self, timestamp: float, mesh_id: str) -> np.ndarray:
        """Create beacon data and spread with Gold code.

        Returns the CDMA-modulated beacon signal.
        """
        # Beacon payload: pk (hex) + timestamp + mesh_id + signature
        pk_hex = format(self.pk, 'x')
        beacon_str = f"{pk_hex}|{timestamp}|{mesh_id}|sig"
        # Convert to bits and spread
        bits = self._string_to_bits(beacon_str)
        signal = np.kron(bits, self.gold_code)
        return signal.astype(np.float64)

    def _string_to_bits(self, s: str) -> np.ndarray:
        """Convert string to bipolar bits (-1, 1)."""
        result = []
        for char in s:
            bits = format(ord(char), '08b')
            result.extend([1 if b == '1' else -1 for b in bits])
        return np.array(result, dtype=np.float64)

    def capture_audio(self, duration_samples: int = 44100) -> RawAudioCapture:
        """Record a raw audio capture (simulated: zeros with ambient noise).

        Returns a RawAudioCapture with hash commitment and signature.
        """
        # Simulate: ambient noise (very low amplitude) + zeros
        from hashlib import sha256
        # pk may exceed 2^32-1, so hash it down to a valid seed
        seed_bytes = sha256(struct.pack('>Q', self.pk)).digest()
        seed_int = struct.unpack('>I', seed_bytes[:4])[0]
        rng = np.random.RandomState(seed=seed_int)
        noise = rng.normal(0, 0.1, size=duration_samples)
        raw = noise.astype(np.float64)

        # Compute hash commitment
        chunk_hash = hashlib.sha256(raw.tobytes()).hexdigest()
        timestamp = 1000.0  # simulated device clock

        # Create signature: sign(chunk_hash || timestamp) with sk
        sig_data = f"{chunk_hash}|{timestamp}".encode()
        # Simulated Ed25519-style signature using sk XOR
        sig_bytes = hashlib.sha256(
            struct.pack('>Q', self.sk) + sig_data
        ).digest()
        signature = sig_bytes.hex()

        return RawAudioCapture(
            device_pk=self.pk,
            raw_samples=raw,
            chunk_hash=chunk_hash,
            chunk_timestamp=timestamp,
            signature=signature,
        )


class OfflineVerifier:
    """Offline verifier that cross-correlates Gold codes against raw audio.

    This is the core of the "compute later" model. It receives captures
    from multiple devices, cross-correlates each device's Gold code against
    every other device's raw audio, detects pairwise proximity, computes
    distances, and issues certificates.
    """

    def __init__(self, gold_poly1=DEFAULT_GOLD_POLY1,
                 gold_poly2=DEFAULT_GOLD_POLY2,
                 correlation_threshold=50):
        self.gold_poly1 = gold_poly1
        self.gold_poly2 = gold_poly2
        self.correlation_threshold = correlation_threshold
        self.captures: dict[int, RawAudioCapture] = {}
        self.gold_codes: dict[int, np.ndarray] = {}

    def submit_capture(self, capture: RawAudioCapture):
        """Submit a device's raw audio capture to the verifier.

        Derives the Gold code from the device's pk and stores both.
        """
        pk = capture.device_pk
        self.captures[pk] = capture
        # Derive Gold code from device pk
        seed = derive_prn_seed(pk)
        code_idx = seed % MAX_CODES_N7
        generator = GoldCodeGenerator(
            self.gold_poly1, self.gold_poly2, seed
        )
        self.gold_codes[pk] = generator.generate_code(
            shift_a=0, shift_b=code_idx, length=128
        )

    def _inject_gold_code(self, pk: int, code: np.ndarray):
        """Manually inject a Gold code for a pk (used in test setup)."""
        self.gold_codes[pk] = code

    def verify_commitment(self, capture: RawAudioCapture) -> bool:
        """Verify that the raw_samples hash matches the signed chunk_hash."""
        computed = hashlib.sha256(capture.raw_samples.tobytes()).hexdigest()
        return computed == capture.chunk_hash

    def detect_pair(self, pk_heard: int, pk_recorder: int) -> dict | None:
        """Run matched filter: does pk_heard's Gold code appear in pk_recorder's audio?

        Returns None if no detection, or a dict with:
        - heard_pk: int
        - recorder_pk: int
        - correlation_peak: float
        - arrival_sample_offset: int
        - confidence: float  (peak / noise_floor)
        - distance_m: float | None
        """
        gold = self.gold_codes[pk_heard]
        audio = self.captures[pk_recorder].raw_samples

        # Cross-correlation
        corr = np.correlate(audio, gold, mode='valid')
        peak = np.max(np.abs(corr))
        noise_floor = np.mean(np.abs(corr))  # simple noise estimate
        confidence = peak / (noise_floor + 1e-9)

        if peak < self.correlation_threshold:
            return None

        offset = int(np.argmax(np.abs(corr)))
        return {
            'heard_pk': pk_heard,
            'recorder_pk': pk_recorder,
            'correlation_peak': float(peak),
            'arrival_sample_offset': offset,
            'confidence': float(confidence),
            'distance_m': None,  # Computed later if symmetric
        }

    def detect_all_pairs(self) -> list[dict]:
        """Run detect_pair for every (heard, recorder) pair.

        Returns list of all detections.
        """
        results = []
        pks = list(self.captures.keys())
        for heard in pks:
            for recorder in pks:
                if heard == recorder:
                    continue
                result = self.detect_pair(heard, recorder)
                if result:
                    results.append(result)
        return results

    def compute_distance(self, detection_AB: dict, detection_BA: dict,
                         sample_rate_hz: float = 44100) -> dict:
        """Compute round-trip distance from symmetric detections.

        detection_AB: A's code found in B's audio (A was heard by B)
        detection_BA: B's code found in A's audio

        distance = ((t_A_arrival - t_B_claimed) + (t_B_arrival - t_A_claimed))
                   / 2 * speed_of_sound

        The round-trip approach eliminates clock skew.
        """
        offset_AB = detection_AB['arrival_sample_offset']
        offset_BA = detection_BA['arrival_sample_offset']

        # Convert sample offsets to time
        time_AB = offset_AB / sample_rate_hz
        time_BA = offset_BA / sample_rate_hz

        # Round-trip distance (eliminates clock skew)
        distance = (time_AB + time_BA) / 2 * 343.0

        return {
            'pk_A': detection_AB['heard_pk'],
            'pk_B': detection_BA['heard_pk'],
            'distance_m': float(distance),
            'plausible': 0.5 <= distance <= 50.0,
            'time_AB': float(time_AB),
            'time_BA': float(time_BA),
        }

    def issue_certificate(self, detections: list[dict],
                          mesh_id: str = "offline_mesh") -> 'OfflineMNRCertificate':
        """Compute all distances and issue MNR certificate.

        Builds a pairwise graph, computes mutual pairs, and returns
        an OfflineMNRCertificate.
        """
        from realpeep.mnr_rollup import OfflineMNRCertificate

        # Build set of unique device pks from detections
        detected_pks = set()
        for d in detections:
            detected_pks.add(d['heard_pk'])
            detected_pks.add(d['recorder_pk'])
        device_pks = list(detected_pks)
        device_hex = sorted(format(pk, 'x') for pk in device_pks)

        # Find mutual pairs (A heard B AND B heard A) — deduplicated
        mutual_set = set()
        mutual_distances = []
        for d in detections:
            a, b = d['heard_pk'], d['recorder_pk']
            # Canonical ordering to avoid double-counting
            pair_key = (min(a, b), max(a, b))
            if pair_key in mutual_set:
                continue
            # Find the reverse detection
            reverse = [
                r for r in detections
                if r['heard_pk'] == b and r['recorder_pk'] == a
            ]
            if reverse:
                mutual_set.add(pair_key)
                dist_result = self.compute_distance(d, reverse[0])
                mutual_distances.append(dist_result)

        # Max distance
        if mutual_distances:
            max_distance = max(p['distance_m'] for p in mutual_distances)
        else:
            max_distance = 0.0

        # Aggregate confidence
        if detections:
            agg_confidence = float(np.mean([d['confidence'] for d in detections]))
        else:
            agg_confidence = 0.0

        # Certificate ID: deterministic from content
        cert_content = f"{mesh_id}|{','.join(device_hex)}|{max_distance}|{agg_confidence}"
        cert_id = "offline_" + hashlib.sha256(cert_content.encode()).hexdigest()[:16]

        return OfflineMNRCertificate(
            mesh_id=mesh_id,
            devices=device_hex,
            pairwise_detections=detections,
            max_distance_m=max_distance,
            num_mutual_pairs=len(mutual_distances),
            total_pairs=len(detections),
            aggregate_confidence=agg_confidence,
            certificate_id=cert_id,
        )


def simulate_capture(recorder: TransmitOnlyDevice, heard: TransmitOnlyDevice,
                     distance_m: float = 4.2, sample_rate_hz: float = 44100,
                     duration_samples: int = 44100) -> RawAudioCapture:
    """Simulate a capture where `heard`'s beacon is mixed into `recorder`'s audio.

    The beacon is added at a sample offset corresponding to the acoustic
    propagation delay at the given distance.

    Args:
        recorder: The device doing the recording.
        heard: The device whose beacon should be heard.
        distance_m: Physical distance between devices (meters).
        sample_rate_hz: Audio sample rate (Hz).
        duration_samples: Length of the capture in samples.

    Returns:
        A RawAudioCapture with the beacon mixed in.
    """
    # Start with recorder's own audio (ambient noise)
    capture = recorder.capture_audio(duration_samples=duration_samples)

    # Generate heard's beacon
    beacon = heard.transmit_beacon(timestamp=capture.chunk_timestamp, mesh_id="sim")

    # Compute offset from acoustic propagation delay
    # delay_samples = distance / speed_of_sound * sample_rate
    speed_of_sound = 343.0  # m/s
    offset = int(distance_m / speed_of_sound * sample_rate_hz)

    # Mix beacon into capture at the computed offset
    ended = min(offset + len(beacon), len(capture.raw_samples))
    capture.raw_samples[offset:ended] += beacon[:ended - offset]

    # Recompute hash after mixing
    capture.chunk_hash = hashlib.sha256(capture.raw_samples.tobytes()).hexdigest()

    return capture
