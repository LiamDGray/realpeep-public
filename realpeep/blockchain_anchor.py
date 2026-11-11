"""
Blockchain Anchoring — OpenTimestamps integration for RealPeep.

Anchors Merkle roots from the frame hash chain to the Bitcoin blockchain
via OpenTimestamps calendar servers, producing cryptographic proofs of
data existence at a specific point in time.
"""
import io
import time

from opentimestamps.calendar import RemoteCalendar
from opentimestamps.core.notary import PendingAttestation
from opentimestamps.core.op import OpSHA256
from opentimestamps.core.serialize import (
    StreamDeserializationContext,
    StreamSerializationContext,
)
from opentimestamps.core.timestamp import DetachedTimestampFile, Timestamp


class BlockchainAnchor:
    """Anchors a Merkle root hash to the Bitcoin blockchain via OpenTimestamps.

    Creates pending OTS timestamps, submits them to calendar servers,
    waits for Bitcoin attestations, and verifies proof validity.
    """

    DEFAULT_CALENDAR = "https://alice.btc.calendar.opentimestamps.org"

    def __init__(self, calendar_url=None):
        """Initialize with an optional calendar server URL.

        Args:
            calendar_url: OpenTimestamps calendar server URL.
                          Defaults to DEFAULT_CALENDAR.
        """
        self.calendar_url = calendar_url or self.DEFAULT_CALENDAR

    def create_timestamp(self, merkle_root_hex: str) -> bytes:
        """Create a pending OTS timestamp for a Merkle root.

        Args:
            merkle_root_hex: 64-character hex string (32 bytes) of the Merkle
                             root to timestamp.

        Returns:
            Serialized OTS proof as bytes (DetachedTimestampFile).

        Raises:
            ValueError: If the input is not a 64-character hex string.
        """
        try:
            h = bytes.fromhex(merkle_root_hex)
        except ValueError:
            raise ValueError(
                f"Merkle root must be valid hex, got: {merkle_root_hex!r}"
            )

        if len(h) != 32:
            raise ValueError(
                f"Merkle root must be 32 bytes (64 hex chars), "
                f"got {len(h)} bytes ({len(h) * 2} hex chars)"
            )

        pending = PendingAttestation(self.calendar_url)
        file_hash_op = OpSHA256()
        ts_obj = Timestamp(h)
        ts_obj.attestations.add(pending)
        dts = DetachedTimestampFile(file_hash_op, ts_obj)

        buf = io.BytesIO()
        ctx = StreamSerializationContext(buf)
        dts.serialize(ctx)
        return buf.getvalue()

    def verify_timestamp(self, ots_data: bytes) -> dict:
        """Verify an OTS proof.

        Args:
            ots_data: Serialized OTS proof bytes (DetachedTimestampFile).

        Returns:
            Dict with keys:
                - valid (bool): Whether the proof is structurally valid.
                - hash (str): The hex-encoded hash that was timestamped.
                - pending (bool): True if no Bitcoin block attestation exists yet.
                - error (str|None): Error message if invalid, else None.
        """
        try:
            buf = io.BytesIO(ots_data)
            ctx = StreamDeserializationContext(buf)
            dts = DetachedTimestampFile.deserialize(ctx)

            # Check if any attestation has a block height (Bitcoin attestation)
            has_btc = any(
                hasattr(att, "height")
                for _msg, att in dts.timestamp.all_attestations()
            )

            h = dts.timestamp.msg
            return {
                "valid": True,
                "hash": h.hex(),
                "pending": not has_btc,
                "error": None,
            }
        except Exception as e:
            return {
                "valid": False,
                "hash": "",
                "pending": True,
                "error": str(e),
            }

    def stamp_and_wait(
        self, merkle_root_hex: str, timeout: int = 30
    ) -> bytes:
        """Submit a hash to the calendar and wait for an upgraded timestamp.

        Contacts the OpenTimestamps calendar server, submits the hash,
        polls until a timestamp with a Bitcoin attestation is available
        or the timeout expires.

        Args:
            merkle_root_hex: 64-character hex string (32 bytes).
            timeout: Maximum seconds to wait for an upgraded timestamp.

        Returns:
            Serialized OTS proof bytes (potentially upgraded with a Bitcoin
            attestation).

        Raises:
            ValueError: If the input is not a valid 32-byte hex string.
        """
        h = bytes.fromhex(merkle_root_hex)
        if len(h) != 32:
            raise ValueError(
                f"Merkle root must be 32 bytes (64 hex chars), "
                f"got {len(h)} bytes ({len(h) * 2} hex chars)"
            )
        calendar = RemoteCalendar(self.calendar_url)

        # Submit the hash to the calendar
        calendar.submit(h)

        # Poll for an upgraded timestamp
        deadline = time.time() + timeout

        while time.time() < deadline:
            try:
                # Get the timestamp from the calendar
                ts = calendar.get_timestamp(h)

                # Wrap in a DetachedTimestampFile for serialization
                file_hash_op = OpSHA256()
                dts = DetachedTimestampFile(file_hash_op, ts)

                # Check if we have a Bitcoin attestation
                has_btc = any(
                    hasattr(att, "height")
                    for _msg, att in ts.all_attestations()
                )

                if has_btc:
                    # Got it! Serialize and return
                    buf = io.BytesIO()
                    ctx = StreamSerializationContext(buf)
                    dts.serialize(ctx)
                    return buf.getvalue()

            except Exception:
                pass

            time.sleep(2)

        # Timeout — return whatever we have (even if pending)
        try:
            ts = calendar.get_timestamp(h)
            file_hash_op = OpSHA256()
            dts = DetachedTimestampFile(file_hash_op, ts)
            buf = io.BytesIO()
            ctx = StreamSerializationContext(buf)
            dts.serialize(ctx)
            return buf.getvalue()
        except Exception:
            # Last resort: return a basic pending timestamp
            return self.create_timestamp(merkle_root_hex)

    def timestamp_bytes_to_hex(self, ots_data: bytes) -> str:
        """Convert OTS proof bytes to a hex string for storage.

        Args:
            ots_data: Serialized OTS proof bytes.

        Returns:
            Hex-encoded string.
        """
        return ots_data.hex()

    def timestamp_hex_to_bytes(self, hex_str: str) -> bytes:
        """Convert a hex string back to OTS proof bytes.

        Args:
            hex_str: Hex-encoded string.

        Returns:
            OTS proof bytes.
        """
        return bytes.fromhex(hex_str)
