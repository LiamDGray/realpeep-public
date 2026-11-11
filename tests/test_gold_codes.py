"""
Tests for Gold code generation and CDMA integration.

Verifies that Gold codes from LFSR preferred pairs have the correct
cross-correlation and auto-correlation properties required for CDMA.
"""
import numpy as np

from realpeep.cdma_mesh import (
    LFSR,
    AcousticChannel,
    CDMADevice,
    GoldCodeGenerator,
    MatchedFilterReceiver,
)

# n=7 preferred pair: x^7 + x + 1 and x^7 + x^3 + 1
POLY1 = 0x83  # bits for exponents 7, 1, 0
POLY2 = 0x89  # bits for exponents 7, 3, 0
N_DEGREE = 7
PERIOD = (1 << N_DEGREE) - 1  # 127


# ── LFSR correctness ──────────────────────────────────────────────────────

def test_lfsr_period():
    """LFSR with primitive polynomial produces maximal-length sequence."""
    lfsr = LFSR(POLY1, initial_state=1)
    seen_states = set()
    for _ in range(PERIOD * 2):
        bit = lfsr.next()
        assert bit in (0, 1)
        seen_states.add(lfsr.state)
    # Should loop after PERIOD steps, so we see at most PERIOD distinct states
    # (all non-zero states of an n-bit register)
    assert len(seen_states) == PERIOD


def test_lfsr_deterministic():
    """Same initial state gives same sequence."""
    seq1 = [LFSR(POLY1, 0x55).next() for _ in range(200)]
    seq2 = [LFSR(POLY1, 0x55).next() for _ in range(200)]
    assert seq1 == seq2


def test_lfsr_different_polys():
    """Different polynomials produce different sequences over a full period."""
    lfsr1 = LFSR(POLY1, 0x2A)
    lfsr2 = LFSR(POLY2, 0x2A)
    seq1 = [lfsr1.next() for _ in range(PERIOD)]
    seq2 = [lfsr2.next() for _ in range(PERIOD)]
    assert seq1 != seq2


# ── Gold code generation ──────────────────────────────────────────────────

def test_gold_code_length():
    """Generated Gold code has the requested length."""
    gen = GoldCodeGenerator(POLY1, POLY2, initial_seed=0x3F)
    code = gen.generate_code(shift_a=0, shift_b=5, length=127)
    assert len(code) == 127


def test_gold_codes_are_bipolar():
    """All values are either +1 or -1 (no zeros)."""
    gen = GoldCodeGenerator(POLY1, POLY2, initial_seed=0x2A)
    code = gen.generate_code(shift_a=0, shift_b=3, length=127)
    assert np.all((code == 1) | (code == -1))
    assert not np.any(code == 0)


def test_different_shifts_produce_different_codes():
    """Two codes with different shifts are distinct."""
    gen1 = GoldCodeGenerator(POLY1, POLY2, initial_seed=0x10)
    gen2 = GoldCodeGenerator(POLY1, POLY2, initial_seed=0x10)

    code_a = gen1.generate_code(shift_a=0, shift_b=0, length=127)
    code_b = gen2.generate_code(shift_a=0, shift_b=7, length=127)

    assert not np.array_equal(code_a, code_b)


def test_same_seed_same_shift_produces_same_code():
    """Deterministic: same seed + same shift → identical code."""
    gen1 = GoldCodeGenerator(POLY1, POLY2, initial_seed=0x2A)
    gen2 = GoldCodeGenerator(POLY1, POLY2, initial_seed=0x2A)

    code1 = gen1.generate_code(shift_a=3, shift_b=5, length=127)
    code2 = gen2.generate_code(shift_a=3, shift_b=5, length=127)
    assert np.array_equal(code1, code2)


def test_gold_code_zero_shift_is_xor_of_lfsrs():
    """When both shifts are 0, the Gold code is the XOR of the two LFSR outputs."""
    lfsr1 = LFSR(POLY1, initial_state=0x3F)
    lfsr2 = LFSR(POLY2, initial_state=0x3F)

    expected = np.array([
        1 if (lfsr1.next() ^ lfsr2.next()) == 1 else -1
        for _ in range(127)
    ])

    gen = GoldCodeGenerator(POLY1, POLY2, initial_seed=0x3F)
    actual = gen.generate_code(shift_a=0, shift_b=0, length=127)
    assert np.array_equal(actual, expected)


# ── Cross-correlation bounds ──────────────────────────────────────────────

def test_gold_cross_correlation_bounded():
    """Max cross-correlation between any two Gold codes ≤ theoretical bound.

    For n=7 (odd): bound = 2^((n+1)/2) + 1 = 2^4 + 1 = 17.
    """
    bound = (1 << ((N_DEGREE + 1) // 2)) + 1  # 17

    # Generate several different Gold codes from the same generator
    # by varying shift_b (which selects different family members)
    codes = []
    for shift in range(20):
        gen = GoldCodeGenerator(POLY1, POLY2, initial_seed=0x7F)
        code = gen.generate_code(shift_a=0, shift_b=shift, length=127)
        codes.append(code)

    max_corr = 0
    for i in range(len(codes)):
        for j in range(i + 1, len(codes)):
            # Normalized cross-correlation (dot product)
            corr = np.abs(np.dot(codes[i], codes[j]))
            max_corr = max(max_corr, corr)

    assert max_corr <= bound, f"Max cross-corr {max_corr} exceeds bound {bound}"


# ── Auto-correlation ─────────────────────────────────────────────────────

def test_gold_autocorrelation_spike():
    """Auto-correlation at lag 0 is much larger than at any other lag."""
    gen = GoldCodeGenerator(POLY1, POLY2, initial_seed=0x3F)
    code = gen.generate_code(shift_a=0, shift_b=5, length=127)

    # Full auto-correlation via numpy correlate
    autocorr = np.correlate(code, code, mode='full')
    zero_lag = autocorr[len(code) - 1]  # center value

    # The zero-lag peak should equal the length (127)
    assert zero_lag == 127

    # All other lags should be much smaller
    side_lobes = np.delete(autocorr, len(code) - 1)
    max_side_lobe = np.max(np.abs(side_lobes))

    assert max_side_lobe < zero_lag * 0.5, (
        f"Max side-lobe {max_side_lobe} too large vs zero-lag {zero_lag}"
    )


def test_gold_autocorrelation_stronger_than_cross():
    """For any two distinct codes, auto-corr peak > cross-corr peak."""
    gen = GoldCodeGenerator(POLY1, POLY2, initial_seed=0x7F)
    code_a = gen.generate_code(shift_a=0, shift_b=0, length=127)
    code_b = gen.generate_code(shift_a=0, shift_b=1, length=127)

    auto_peak = np.dot(code_a, code_a)  # = 127
    cross_peak = np.abs(np.dot(code_a, code_b))

    assert auto_peak > cross_peak, (
        f"Auto {auto_peak} not greater than cross {cross_peak}"
    )


# ── CDMADevice integration ───────────────────────────────────────────────

def test_cdma_device_uses_gold_codes():
    """CDMADevice generates valid bipolar Gold-based PRN codes."""
    device = CDMADevice(device_id="TEST", prn_seed=42, spreading_factor=128)

    # PRN code should be bipolar
    assert np.all((device.prn_code == 1) | (device.prn_code == -1))
    assert len(device.prn_code) == 128

    # Verify it's not just a random sequence — check that re-creating
    # with same seed gives same code (deterministic)
    device2 = CDMADevice(device_id="TEST", prn_seed=42, spreading_factor=128)
    assert np.array_equal(device.prn_code, device2.prn_code)


def test_different_seeds_different_codes():
    """Devices with different PRN seeds get different Gold codes."""
    d1 = CDMADevice("A", prn_seed=100, spreading_factor=128)
    d2 = CDMADevice("B", prn_seed=200, spreading_factor=128)
    assert not np.array_equal(d1.prn_code, d2.prn_code)


def test_cdma_device_accepts_custom_polys():
    """CDMADevice accepts optional poly1/poly2 for custom Gold codes."""
    device = CDMADevice(
        device_id="CUSTOM",
        prn_seed=42,
        spreading_factor=128,
        gold_code_poly1=POLY1,
        gold_code_poly2=POLY2,
    )
    assert len(device.prn_code) == 128
    assert np.all((device.prn_code == 1) | (device.prn_code == -1))


def test_cdma_device_defaults_to_n7_preferred_pair():
    """When poly1/poly2 are not specified, defaults to n=7 preferred pair."""
    device = CDMADevice(device_id="DEFAULT", prn_seed=10, spreading_factor=128)
    # Should still produce a valid code
    assert len(device.prn_code) == 128
    assert np.all((device.prn_code == 1) | (device.prn_code == -1))


# ── End-to-end CDMA with Gold codes ──────────────────────────────────────

def test_end_to_end_with_gold_codes():
    """MatchedFilterReceiver can extract keys when devices use Gold codes."""
    keys = ["PK_X_00001", "PK_Y_00002", "PK_Z_00003"]

    devices = [
        CDMADevice(device_id="DEV_X", prn_seed=101, spreading_factor=128),
        CDMADevice(device_id="DEV_Y", prn_seed=202, spreading_factor=128),
        CDMADevice(device_id="DEV_Z", prn_seed=303, spreading_factor=128),
    ]

    # Generate signals
    signals = [d.generate_signal(k) for d, k in zip(devices, keys)]

    # Mix with moderate noise, no packet loss (we want recovery to succeed)
    channel = AcousticChannel(noise_std=3.0, packet_loss_pct=0.0)
    mixed = channel.mix_signals(signals)

    # Extract each key
    receiver = MatchedFilterReceiver()
    for dev, expected_key in zip(devices, keys):
        extracted = receiver.extract_key(
            mixed, prn_code=dev.prn_code, key_length_chars=10
        )
        assert extracted == expected_key, (
            f"{dev.device_id}: expected {expected_key}, got {extracted}"
        )


def test_end_to_end_with_gold_codes_noisy():
    """Recovery still works under moderate noise and loss with Gold codes."""
    keys = ["PK_A_7X9V1", "PK_B_9Y2M4"]

    devices = [
        CDMADevice(device_id="DEV_A", prn_seed=42, spreading_factor=128),
        CDMADevice(device_id="DEV_B", prn_seed=101, spreading_factor=128),
    ]

    signals = [d.generate_signal(k) for d, k in zip(devices, keys)]

    # Same harsh conditions as main.py
    channel = AcousticChannel(noise_std=5.0, packet_loss_pct=0.20)
    mixed = channel.mix_signals(signals)

    receiver = MatchedFilterReceiver()
    for dev, expected_key in zip(devices, keys):
        extracted = receiver.extract_key(
            mixed, prn_code=dev.prn_code, key_length_chars=10
        )
        assert extracted == expected_key, (
            f"{dev.device_id}: expected {expected_key}, got {extracted}"
        )
