"""
TDD tests for Phase 3a: Duress Key Derivation.

Both normal and duress passphrases derive indistinguishable Ed25519 keypairs,
but the duress key produces a nonce that triggers silent detection by the notary.
"""
import time

from nacl.signing import SigningKey

# ---------------------------------------------------------------------------
# We will import from the implementation once it exists.
# For now, define what the module must export.
# ---------------------------------------------------------------------------

# These tests use a helper that mirrors the spec: DuressKeyDerivation

# ---------------------------------------------------------------------------
# 1. Test that derivation produces valid Ed25519 keypairs
# ---------------------------------------------------------------------------
def test_derive_produces_valid_keypair():
    """Output is 32-byte private key, 32-byte public key, valid Ed25519."""
    from realpeep.duress_keys import DuressKeyDerivation

    dkd = DuressKeyDerivation(salt=b'testsalt', notary_secret=b'secret' * 4)
    priv, pub, nonce = dkd.derive_normal("my normal passphrase")

    # Correct lengths
    assert isinstance(priv, bytes), f"private key must be bytes, got {type(priv)}"
    assert isinstance(pub, bytes), f"public key must be bytes, got {type(pub)}"
    assert len(priv) == 32, f"private key must be 32 bytes, got {len(priv)}"
    assert len(pub) == 32, f"public key must be 32 bytes, got {len(pub)}"

    # Valid Ed25519: SigningKey(priv) should produce a verify_key that matches pub
    sk = SigningKey(priv)
    assert bytes(sk.verify_key) == pub, "public key does not match derived private key"

    # Round-trip sign/verify
    message = b"test message"
    signed = sk.sign(message)
    sk.verify_key.verify(signed)  # should not raise


# ---------------------------------------------------------------------------
# 2. Deterministic derivation: same passphrase = same key
# ---------------------------------------------------------------------------
def test_same_passphrase_produces_same_key():
    """Same inputs always produce the same keypair."""
    from realpeep.duress_keys import DuressKeyDerivation

    dkd = DuressKeyDerivation(salt=b'testsalt', notary_secret=b'secret' * 4)
    priv1, pub1, _ = dkd.derive_normal("same passphrase")
    priv2, pub2, _ = dkd.derive_normal("same passphrase")

    assert priv1 == priv2, "same passphrase should produce same private key"
    assert pub1 == pub2, "same passphrase should produce same public key"


# ---------------------------------------------------------------------------
# 3. Different passphrases = different keys
# ---------------------------------------------------------------------------
def test_different_passphrases_produce_different_keys():
    """Different inputs produce different outputs."""
    from realpeep.duress_keys import DuressKeyDerivation

    dkd = DuressKeyDerivation(salt=b'testsalt', notary_secret=b'secret' * 4)
    priv1, pub1, _ = dkd.derive_normal("passphrase one")
    priv2, pub2, _ = dkd.derive_normal("passphrase two")

    assert priv1 != priv2, "different passphrases should produce different private keys"
    assert pub1 != pub2, "different passphrases should produce different public keys"


# ---------------------------------------------------------------------------
# 4. Normal nonce is random-looking
# ---------------------------------------------------------------------------
def test_normal_nonce_is_random():
    """Normal mode nonces look random (multiple calls produce different nonces)."""
    from realpeep.duress_keys import DuressKeyDerivation

    dkd = DuressKeyDerivation(salt=b'testsalt', notary_secret=b'secret' * 4)
    nonces = set()
    for _ in range(10):
        _, _, nonce = dkd.derive_normal("passphrase")
        nonces.add(nonce)

    # With os.urandom(32), 10 nonces should all be different
    assert len(nonces) == 10, f"expected 10 unique nonces, got {len(nonces)}"


# ---------------------------------------------------------------------------
# 5. Duress nonce triggers notary detection
# ---------------------------------------------------------------------------
def test_duress_nonce_detected():
    """A duress-derived nonce MUST trigger notary detection."""
    from realpeep.duress_keys import DuressKeyDerivation

    dkd = DuressKeyDerivation(salt=b'testsalt', notary_secret=b'secret' * 4,
                              marker_bits=8)
    priv, pub, nonce = dkd.derive_duress("my duress passphrase")

    assert len(nonce) == 32, f"nonce must be 32 bytes, got {len(nonce)}"
    assert dkd.detect(pub, nonce), "duress nonce should be detected by notary"


# ---------------------------------------------------------------------------
# 6. Normal nonce does NOT trigger notary detection (with high probability)
# ---------------------------------------------------------------------------
def test_normal_nonce_not_detected(monkeypatch):
    """Normal nonces should NOT trigger duress detection.

    The test must not sample random nonces and assert that none match: with
    marker_bits=8 every normal nonce has a 1/256 chance of a false positive, so
    that assertion is flaky by construction. Instead, pin the RNG to a nonce
    that provably does not satisfy the predicate for the derived key.
    """
    from realpeep.duress_keys import DuressKeyDerivation

    dkd = DuressKeyDerivation(salt=b'testsalt', notary_secret=b'secret' * 4,
                              marker_bits=8)

    # Derive the public key first, then pick a nonce that is not a match.
    _, pub, _ = dkd.derive_normal("normal passphrase")
    for counter in range(1000):
        candidate = counter.to_bytes(32, "big")
        if not dkd.detect(pub, candidate):
            break
    else:  # pragma: no cover - astronomically unlikely with marker_bits=8
        raise AssertionError("could not find a non-matching nonce")

    monkeypatch.setattr(
        "realpeep.duress_keys.os.urandom",
        lambda _n: candidate,
    )
    _, pub2, nonce = dkd.derive_normal("normal passphrase")

    assert pub2 == pub
    assert nonce == candidate
    assert not dkd.detect(pub2, nonce), \
        "a known non-matching nonce must not trigger duress detection"


# ---------------------------------------------------------------------------
# 7. Normal and duress keys are indistinguishable by format
# ---------------------------------------------------------------------------
def test_keys_indistinguishable_by_format():
    """Both normal and duress derive keys of identical format/length."""
    from realpeep.duress_keys import DuressKeyDerivation

    dkd = DuressKeyDerivation(salt=b'testsalt', notary_secret=b'secret' * 4,
                              marker_bits=8)
    priv_n, pub_n, nonce_n = dkd.derive_normal("normal")
    priv_d, pub_d, nonce_d = dkd.derive_duress("duress")

    # Same types
    for name, val in [("priv_n", priv_n), ("pub_n", pub_n), ("nonce_n", nonce_n),
                       ("priv_d", priv_d), ("pub_d", pub_d), ("nonce_d", nonce_d)]:
        assert isinstance(val, bytes), f"{name} must be bytes"

    # Same lengths
    assert len(priv_n) == len(priv_d) == 32
    assert len(pub_n) == len(pub_d) == 32
    assert len(nonce_n) == len(nonce_d) == 32

    # Both are valid Ed25519 keypairs
    for priv, pub in [(priv_n, pub_n), (priv_d, pub_d)]:
        sk = SigningKey(priv)
        assert bytes(sk.verify_key) == pub
        signed = sk.sign(b"test")
        sk.verify_key.verify(signed)


# ---------------------------------------------------------------------------
# 8. Detection timing is approximately constant-time
# ---------------------------------------------------------------------------
def test_detection_is_constant_time():
    """Detecting a duress nonce vs a normal nonce should take roughly the same time."""
    from realpeep.duress_keys import DuressKeyDerivation

    dkd = DuressKeyDerivation(salt=b'testsalt', notary_secret=b'secret' * 4,
                              marker_bits=8)

    # Get one duress key and one normal key
    _, pub_d, nonce_d = dkd.derive_duress("duress")
    _, pub_n, nonce_n = dkd.derive_normal("normal")

    # Measure duress detection time (should be fast)
    start = time.perf_counter()
    for _ in range(100):
        dkd.detect(pub_d, nonce_d)
    duress_time = time.perf_counter() - start

    # Measure normal detection time (should also be fast)
    start = time.perf_counter()
    for _ in range(100):
        dkd.detect(pub_n, nonce_n)
    normal_time = time.perf_counter() - start

    # Both should be fast. The detection is a single SHA256 — O(1) regardless of outcome.
    # On a loaded machine, timing noise can be high. 20x tolerance catches real
    # side-channels without false positives from scheduler interruption.
    ratio = max(duress_time, normal_time) / max(min(duress_time, normal_time), 1e-9)
    assert ratio < 20.0, \
        f"timing ratio {ratio:.2f} exceeds 20x — possible timing side-channel"


# ---------------------------------------------------------------------------
# 9. Duress nonce search terminates within reasonable iterations
# ---------------------------------------------------------------------------
def test_duress_nonce_search_terminates():
    """For marker_bits=8, search should find a valid nonce within ~1000 iterations."""
    from realpeep.duress_keys import DuressKeyDerivation

    # Marker bits of 8 means expected ~256 iterations to find a match
    dkd = DuressKeyDerivation(salt=b'testsalt', notary_secret=b'secret' * 4,
                              marker_bits=8)

    start = time.perf_counter()
    _, pub, nonce = dkd.derive_duress("duress search test")
    elapsed = time.perf_counter() - start

    # Should be fast (< 1 second for k=8)
    assert elapsed < 5.0, f"duress nonce search took {elapsed:.2f}s — too slow"

    # Must be detected
    assert dkd.detect(pub, nonce), "derived duress nonce must be detected"

    # Verify the nonce is 32 bytes
    assert len(nonce) == 32


# ---------------------------------------------------------------------------
# 10. Full integration flow
# ---------------------------------------------------------------------------
def test_full_flow():
    """Derive two different passphrases (one normal, one duress). 
    Verify the duress one is detected, normal one is not."""
    from realpeep.duress_keys import DuressKeyDerivation

    dkd = DuressKeyDerivation(salt=b'testsalt', notary_secret=b'secret' * 4,
                              marker_bits=8)

    # Normal derivation
    priv_n, pub_n, nonce_n = dkd.derive_normal("everyday passphrase")
    assert not dkd.detect(pub_n, nonce_n), \
        "normal passphrase should NOT trigger duress"

    # Duress derivation (different passphrase)
    priv_d, pub_d, nonce_d = dkd.derive_duress("emergency passphrase")
    assert dkd.detect(pub_d, nonce_d), \
        "duress passphrase MUST trigger duress"

    # Both produce valid Ed25519 keys
    for priv, pub in [(priv_n, pub_n), (priv_d, pub_d)]:
        assert len(priv) == 32
        assert len(pub) == 32
        sk = SigningKey(priv)
        assert bytes(sk.verify_key) == pub
        signed = sk.sign(b"integration test")
        sk.verify_key.verify(signed)

    # Keys are different
    assert priv_n != priv_d, "normal and duress keys should differ"
    assert pub_n != pub_d, "normal and duress public keys should differ"

    # Nonces are different
    assert nonce_n != nonce_d, "normal and duress nonces should differ"
