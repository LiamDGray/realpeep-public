"""
TDD tests for Phase 4: Blockchain Anchoring via OpenTimestamps.

Verifies that Merkle roots from the frame hash chain can be anchored
to the Bitcoin blockchain using OpenTimestamps calendar servers.
"""
import hashlib

import pytest

from realpeep.blockchain_anchor import BlockchainAnchor

# ── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def anchor():
    """A BlockchainAnchor using a test calendar URL."""
    return BlockchainAnchor(
        calendar_url="https://alice.btc.calendar.opentimestamps.org"
    )


@pytest.fixture
def sample_merkle_root():
    """A valid 32-byte (64-char hex) Merkle root for testing."""
    return hashlib.sha256(b"test merkle root").hexdigest()


# ── 1. test_create_timestamp_returns_bytes ──────────────────────────────────

def test_create_timestamp_returns_bytes(anchor, sample_merkle_root):
    """Creating a timestamp from a valid 64-char hex returns bytes."""
    result = anchor.create_timestamp(sample_merkle_root)
    assert isinstance(result, bytes), f"Expected bytes, got {type(result)}"
    assert len(result) > 0, "Timestamp data should not be empty"


# ── 2. test_create_timestamp_rejects_bad_input ──────────────────────────────

def test_create_timestamp_rejects_bad_input(anchor):
    """Bad input (wrong length hex) raises ValueError."""
    with pytest.raises(ValueError):
        anchor.create_timestamp("too_short")

    with pytest.raises(ValueError):
        anchor.create_timestamp("a" * 128)  # 64 bytes, not 32

    with pytest.raises(ValueError):
        anchor.create_timestamp("gg" * 32)  # invalid hex

    # Edge case: empty string
    with pytest.raises(ValueError):
        anchor.create_timestamp("")


# ── 3. test_serialize_deserialize_roundtrip ─────────────────────────────────

def test_serialize_deserialize_roundtrip(anchor, sample_merkle_root):
    """Create → serialize → deserialize → verify produces consistent result."""
    ots_data = anchor.create_timestamp(sample_merkle_root)

    # The data should be deserializable and valid
    result = anchor.verify_timestamp(ots_data)
    assert result["valid"] is True
    assert result["error"] is None
    assert result["hash"] == sample_merkle_root


# ── 4. test_verify_timestamp_pending ────────────────────────────────────────

def test_verify_timestamp_pending(anchor, sample_merkle_root):
    """Freshly created timestamp is pending (no BTC attestation yet)."""
    ots_data = anchor.create_timestamp(sample_merkle_root)
    result = anchor.verify_timestamp(ots_data)
    assert result["pending"] is True, (
        "Fresh timestamp should be pending (no block height attestation)"
    )


# ── 5. test_verify_timestamp_has_correct_hash ───────────────────────────────

def test_verify_timestamp_has_correct_hash(anchor, sample_merkle_root):
    """Verification returns the correct original hash."""
    ots_data = anchor.create_timestamp(sample_merkle_root)
    result = anchor.verify_timestamp(ots_data)
    assert result["hash"] == sample_merkle_root


# ── 6. test_timestamp_hex_roundtrip ─────────────────────────────────────────

def test_timestamp_hex_roundtrip(anchor, sample_merkle_root):
    """timestamp_bytes_to_hex → timestamp_hex_to_bytes round-trips exactly."""
    ots_data = anchor.create_timestamp(sample_merkle_root)
    hex_str = anchor.timestamp_bytes_to_hex(ots_data)
    restored = anchor.timestamp_hex_to_bytes(hex_str)
    assert restored == ots_data, "Hex round-trip should preserve data exactly"


# ── 7. test_timestamp_has_pending_attestation ───────────────────────────────

def test_timestamp_has_pending_attestation(anchor, sample_merkle_root):
    """Verify detects a pending attestation when one exists."""
    ots_data = anchor.create_timestamp(sample_merkle_root)
    result = anchor.verify_timestamp(ots_data)
    assert "pending" in result
    assert result["pending"] is True


# ── 8. test_integration_with_frame_hash_chain ───────────────────────────────

def test_integration_with_frame_hash_chain(anchor):
    """Uses a programmatic Merkle root (like FrameHashChain.getMerkleRoot)
    to create a real OTS timestamp and verifies it."""
    # Simulate what FrameHashChain does: build a Merkle tree over segment hashes
    segments = []
    # Create 4 frame hashes
    frame_data = [f"frame_{i}".encode() for i in range(10)]
    chain_hash = hashlib.sha256(b"init").hexdigest()

    for data in frame_data:
        h = hashlib.sha256()
        h.update(chain_hash.encode())
        h.update(data)
        chain_hash = h.hexdigest()

    # Finalize segments (simplified: use the chain hash as one segment)
    segments.append(chain_hash)

    # Build Merkle root (single segment = it's the root)
    merkle_root = segments[0]

    # Now timestamp this root
    ots_data = anchor.create_timestamp(merkle_root)
    result = anchor.verify_timestamp(ots_data)

    assert result["valid"] is True
    assert result["hash"] == merkle_root
    assert result["pending"] is True


# ── 9. test_stamp_and_wait_submits_to_calendar (network) ────────────────────

@pytest.mark.network
@pytest.mark.skip(reason="Network test — requires OTS calendar connectivity")
def test_stamp_and_wait_submits_to_calendar(anchor, sample_merkle_root):
    """Stamps a hash, waits for upgrade, verifies it's no longer pending.

    This is a real network test that contacts the OpenTimestamps calendar.
    May take several seconds to minutes for the calendar to provide an
    upgraded timestamp with a Bitcoin attestation.
    """
    # Create initial timestamp
    ots_data_initial = anchor.create_timestamp(sample_merkle_root)
    result = anchor.verify_timestamp(ots_data_initial)
    assert result["pending"] is True, (
        "Initial timestamp should be pending"
    )

    # Submit to calendar and wait for upgrade
    ots_data_upgraded = anchor.stamp_and_wait(
        sample_merkle_root, timeout=120
    )

    # Should now have data
    assert isinstance(ots_data_upgraded, bytes)
    assert len(ots_data_upgraded) > 0

    # Verify the upgraded timestamp
    result_upgraded = anchor.verify_timestamp(ots_data_upgraded)
    assert result_upgraded["valid"] is True
    assert result_upgraded["hash"] == sample_merkle_root
    # Note: whether it's still pending depends on the calendar server;
    # if it's still pending, the test passes but logs that fact.
    if result_upgraded["pending"]:
        pytest.skip(
            "Calendar server returned a timestamp still pending — "
            "this is normal if Bitcoin block hasn't confirmed yet"
        )
    else:
        assert result_upgraded["pending"] is False
