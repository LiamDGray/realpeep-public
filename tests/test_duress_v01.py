"""
Duress v0.1 — red tests for the first live-session slice.

Run:
    pytest tests/test_duress_v01.py -q

These are expected to fail on the current demo-grade implementation. The goal
is to make them pass without weakening the public-verifiability property.
"""

from realpeep.duress_keys import DuressKeyDerivation


def _dkd():
    return DuressKeyDerivation(
        salt=b"testsalt",
        notary_secret=b"notary-test-secret",
        marker_bits=8,
    )


def test_default_marker_is_at_least_32_bits():
    """A 1/256 false-positive rate is not acceptable for a safety feature."""
    dkd = _dkd()
    assert dkd.marker_bits >= 32


def test_duress_nonce_is_fresh_per_session():
    """Two duress proofs for the same key must not reuse the same nonce."""
    dkd = _dkd()
    _, _, nonce_a = dkd.derive_duress("same passphrase")
    _, _, nonce_b = dkd.derive_duress("same passphrase")
    assert nonce_a != nonce_b


def test_tag_is_bound_to_the_transcript():
    """The notary must bind the tag to the proof transcript, not just a pubkey."""
    dkd = _dkd()
    _, pub, nonce = dkd.derive_duress("same passphrase")
    transcript = b"payload_hash||ephemeral_pubkey||merkle_root||timestamp"
    # v0.1 API: detect(ephemeral_pubkey, nonce, transcript=...)
    assert dkd.detect(pub, nonce, transcript=transcript) is False


def test_threshold_notary_component_exists():
    """A single notary secret is a single point of failure."""
    from realpeep.duress_v01 import ThresholdNotary  # noqa: F401
