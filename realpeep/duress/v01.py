"""RealPeep Duress v0.1 — DEMO/LIBRARY SLICE. NOT PRODUCTION.

This module implements a transcript-bound, exact two-label HMAC tag with a
2-of-3 notary access structure and replay state. It deliberately does not claim
indistinguishability, novelty, or protection against a captor who has the
device. The per-device tag key is a client-side secret and is not a security
boundary. See docs/research/DURESS_V01_SPEC.md.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Literal, Sequence

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from nacl.exceptions import BadSignatureError
from nacl.signing import SigningKey, VerifyKey

MAGIC = b"RPDR"
VERSION = 1
SUITE = 1
BODY_LEN = 264
TAG_LEN = 32
SIG_LEN = 64
BUNDLE_LEN = 360
TAG_LABEL = b"RPDR-TAG-v1"
BIND_LABEL = b"RPDR-BIND-v1"
SHARE_LABEL = b"RPDR-SHARE-v1"
BUNDLE_LABEL = b"RPDR-BUNDLE-v1"
RECEIPT_LABEL = b"RPDR-RECEIPT-v1"
REJECT_LABEL = b"RPDR-REJECT-v1"
HKDF_SALT = b"RPDR-v01"
HKDF_INFO_PREFIX = b"RPDR-HKDF-v1" + b"device-tag"
MAX_FUTURE_SKEW_MS = 300_000
MAX_AGE_MS = 30 * 24 * 3600 * 1000


class Mode(Enum):
    NORMAL = 0
    DURESS = 1


class Verdict(Enum):
    NORMAL = "normal"
    DURESS = "duress"
    REPLAY = "replay"
    INVALID = "invalid"


class DuressError(Exception):
    """Base class for duress protocol errors."""


class InvalidBundle(DuressError):
    pass


class ThresholdError(DuressError):
    pass


# ---------------------------------------------------------------------------
# GF(256) and Shamir 2-of-3
# ---------------------------------------------------------------------------


def _gf_mul(a: int, b: int) -> int:
    product = 0
    for _ in range(8):
        if b & 1:
            product ^= a
        high = a & 0x80
        a = (a << 1) & 0xFF
        if high:
            a ^= 0x1B
        b >>= 1
    return product


def _gf_pow(a: int, exponent: int) -> int:
    result = 1
    while exponent:
        if exponent & 1:
            result = _gf_mul(result, a)
        a = _gf_mul(a, a)
        exponent >>= 1
    return result


def _gf_inv(a: int) -> int:
    if a == 0:
        raise ZeroDivisionError("GF(256) inverse of zero")
    return _gf_pow(a, 254)


@dataclass(frozen=True)
class Share:
    index: int
    value: bytes = field(repr=False)
    commitment: bytes

    def __post_init__(self) -> None:
        if not 1 <= self.index <= 255:
            raise ValueError("share index must be 1..255")
        if len(self.value) != TAG_LEN:
            raise ValueError("share value must be 32 bytes")
        if len(self.commitment) != 32:
            raise ValueError("share commitment must be 32 bytes")


def _share_commitment(index: int, value: bytes) -> bytes:
    return hashlib.sha256(SHARE_LABEL + bytes([index]) + value).digest()


def split_credential(
    k_tag: bytes,
    *,
    threshold: int = 2,
    num_shares: int = 3,
    rng: Callable[[int], bytes] = secrets.token_bytes,
) -> tuple[Share, ...]:
    if len(k_tag) != TAG_LEN:
        raise ValueError("k_tag must be 32 bytes")
    if not 2 <= threshold <= num_shares <= 255:
        raise ValueError("need 2 <= threshold <= num_shares <= 255")

    shares: list[Share] = []
    for index in range(1, num_shares + 1):
        x = index
        y = bytearray(TAG_LEN)
        for byte_index, secret_byte in enumerate(k_tag):
            coefficients = [secret_byte] + list(rng(threshold - 1))
            y[byte_index] = _eval_polynomial(coefficients, x)
        value = bytes(y)
        shares.append(Share(index=index, value=value, commitment=_share_commitment(index, value)))
    return tuple(shares)


def _eval_polynomial(coefficients: Sequence[int], x: int) -> int:
    result = 0
    for coefficient in reversed(coefficients):
        result = _gf_mul(result, x) ^ coefficient
    return result


def combine_shares(shares: Sequence[Share], *, threshold: int = 2) -> bytes:
    if len(shares) < threshold:
        raise ThresholdError("not enough shares")
    indices = [share.index for share in shares]
    if len(set(indices)) != len(indices):
        raise ThresholdError("duplicate share indices")
    for share in shares:
        if share.commitment != _share_commitment(share.index, share.value):
            raise ThresholdError("share commitment mismatch")

    secret = bytearray(TAG_LEN)
    for byte_index in range(TAG_LEN):
        value = 0
        for i, share in enumerate(shares):
            numerator = 1
            denominator = 1
            for j, other in enumerate(shares):
                if i == j:
                    continue
                numerator = _gf_mul(numerator, other.index)
                denominator = _gf_mul(denominator, share.index ^ other.index)
            lagrange = _gf_mul(numerator, _gf_inv(denominator))
            value ^= _gf_mul(share.value[byte_index], lagrange)
        secret[byte_index] = value
    return bytes(secret)


# ---------------------------------------------------------------------------
# Transcript and bundle
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Transcript:
    payload_hash: bytes
    capture_pub: bytes
    authorized_merkle_root: bytes
    device_pub: bytes
    enrollment_id: bytes
    witness_root: bytes
    notary_set_id: bytes
    timestamp_ms: int
    session_counter: int
    session_nonce: bytes
    version: int = VERSION
    suite: int = SUITE
    flags: int = 0

    def __post_init__(self) -> None:
        for name in (
            "payload_hash",
            "capture_pub",
            "authorized_merkle_root",
            "device_pub",
            "witness_root",
            "notary_set_id",
            "session_nonce",
        ):
            if len(getattr(self, name)) != 32:
                raise ValueError(f"{name} must be 32 bytes")
        if len(self.enrollment_id) != 16:
            raise ValueError("enrollment_id must be 16 bytes")
        if self.session_counter <= 0:
            raise ValueError("session_counter must be positive")
        if self.timestamp_ms <= 0:
            raise ValueError("timestamp_ms must be positive")
        if self.version != VERSION or self.suite != SUITE or self.flags != 0:
            raise ValueError("unsupported transcript version/suite/flags")

    def body(self) -> bytes:
        return b"".join(
            (
                MAGIC,
                bytes([self.version, self.suite]),
                self.flags.to_bytes(2, "big"),
                self.payload_hash,
                self.capture_pub,
                self.authorized_merkle_root,
                self.device_pub,
                self.enrollment_id,
                self.witness_root,
                self.notary_set_id,
                self.timestamp_ms.to_bytes(8, "big"),
                self.session_counter.to_bytes(8, "big"),
                self.session_nonce,
            )
        )

    def digest(self) -> bytes:
        return hashlib.sha256(self.body()).digest()

    @classmethod
    def from_body(cls, body: bytes) -> "Transcript":
        if len(body) != BODY_LEN:
            raise InvalidBundle("transcript body must be 264 bytes")
        if body[:4] != MAGIC:
            raise InvalidBundle("bad magic")
        version, suite = body[4], body[5]
        flags = int.from_bytes(body[6:8], "big")
        offset = 8
        fields = []
        for length in (32, 32, 32, 32, 16, 32, 32):
            fields.append(body[offset : offset + length])
            offset += length
        timestamp_ms = int.from_bytes(body[offset : offset + 8], "big")
        offset += 8
        session_counter = int.from_bytes(body[offset : offset + 8], "big")
        offset += 8
        session_nonce = body[offset : offset + 32]
        if offset + 32 != BODY_LEN:
            raise InvalidBundle("bad transcript layout")
        return cls(
            payload_hash=fields[0],
            capture_pub=fields[1],
            authorized_merkle_root=fields[2],
            device_pub=fields[3],
            enrollment_id=fields[4],
            witness_root=fields[5],
            notary_set_id=fields[6],
            timestamp_ms=timestamp_ms,
            session_counter=session_counter,
            session_nonce=session_nonce,
            version=version,
            suite=suite,
            flags=flags,
        )


@dataclass(frozen=True)
class Bundle:
    transcript: Transcript
    tag: bytes
    sig: bytes

    def __post_init__(self) -> None:
        if len(self.tag) != TAG_LEN:
            raise InvalidBundle("tag must be 32 bytes")
        if len(self.sig) != SIG_LEN:
            raise InvalidBundle("signature must be 64 bytes")

    def to_bytes(self) -> bytes:
        return self.transcript.body() + self.tag + self.sig

    @classmethod
    def from_bytes(cls, raw: bytes) -> "Bundle":
        if len(raw) != BUNDLE_LEN:
            raise InvalidBundle("bundle must be 360 bytes")
        transcript = Transcript.from_body(raw[:BODY_LEN])
        return cls(transcript=transcript, tag=raw[BODY_LEN : BODY_LEN + TAG_LEN], sig=raw[BODY_LEN + TAG_LEN :])

    def bundle_id(self) -> bytes:
        return hashlib.sha256(BUNDLE_LABEL + self.to_bytes()).digest()


# ---------------------------------------------------------------------------
# Credential / enrollment
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DeviceCredential:
    k_tag: bytes = field(repr=False)
    device_pub: bytes
    enrollment_id: bytes
    notary_set_id: bytes

    def __repr__(self) -> str:
        return "DeviceCredential(<redacted>)"


@dataclass(frozen=True)
class EnrollmentRecord:
    device_pub: bytes
    enrollment_id: bytes
    notary_set_id: bytes
    revoked: bool = False


def derive_device_credential(
    master_key: bytes,
    *,
    device_pub: bytes,
    enrollment_id: bytes,
    notary_set_id: bytes,
) -> bytes:
    if len(master_key) < 16:
        raise ValueError("master key too short")
    if len(device_pub) != 32 or len(enrollment_id) != 16 or len(notary_set_id) != 32:
        raise ValueError("bad enrollment fields")
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=TAG_LEN,
        salt=HKDF_SALT,
        info=HKDF_INFO_PREFIX + device_pub + enrollment_id + notary_set_id,
    )
    return hkdf.derive(master_key)


def enroll(
    master_key: bytes,
    *,
    device_pub: bytes,
    enrollment_id: bytes,
    notary_set_id: bytes,
    threshold: int = 2,
    num_shares: int = 3,
    rng: Callable[[int], bytes] = secrets.token_bytes,
) -> tuple[DeviceCredential, tuple[Share, ...], EnrollmentRecord]:
    k_tag = derive_device_credential(
        master_key,
        device_pub=device_pub,
        enrollment_id=enrollment_id,
        notary_set_id=notary_set_id,
    )
    shares = split_credential(k_tag, threshold=threshold, num_shares=num_shares, rng=rng)
    credential = DeviceCredential(
        k_tag=k_tag,
        device_pub=device_pub,
        enrollment_id=enrollment_id,
        notary_set_id=notary_set_id,
    )
    record = EnrollmentRecord(
        device_pub=device_pub,
        enrollment_id=enrollment_id,
        notary_set_id=notary_set_id,
    )
    return credential, shares, record


# ---------------------------------------------------------------------------
# Tagging / signing
# ---------------------------------------------------------------------------


def tag_for(k_tag: bytes, h_t: bytes, mode: Mode) -> bytes:
    label = b"\x00" if mode is Mode.NORMAL else b"\x01"
    return hmac.new(k_tag, TAG_LABEL + label + h_t, hashlib.sha256).digest()


def classify_tag(k_tag: bytes, h_t: bytes, tag: bytes) -> Literal["normal", "duress", "invalid"]:
    normal = tag_for(k_tag, h_t, Mode.NORMAL)
    duress = tag_for(k_tag, h_t, Mode.DURESS)
    # Compute both before branching; compare in constant time.
    is_normal = hmac.compare_digest(tag, normal)
    is_duress = hmac.compare_digest(tag, duress)
    if is_duress:
        return "duress"
    if is_normal:
        return "normal"
    return "invalid"


def make_bundle(
    signing_key: SigningKey,
    credential: DeviceCredential,
    transcript: Transcript,
    mode: Mode,
) -> Bundle:
    if transcript.device_pub != credential.device_pub:
        raise InvalidBundle("transcript device does not match credential")
    if transcript.notary_set_id != credential.notary_set_id:
        raise InvalidBundle("transcript notary set does not match credential")
    h_t = transcript.digest()
    tag = tag_for(credential.k_tag, h_t, mode)
    signature = signing_key.sign(BIND_LABEL + h_t + tag).signature
    return Bundle(transcript=transcript, tag=tag, sig=signature)


# ---------------------------------------------------------------------------
# Replay store and notary
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Receipt:
    status: Literal["accepted", "rejected"]
    receipt_id: bytes
    # No verdict field: the public response must not leak the mode.


class InMemoryReplayStore:
    def __init__(self) -> None:
        self.records: dict[tuple[bytes, bytes], EnrollmentRecord] = {}
        self.high_water: dict[tuple[bytes, bytes], int] = {}
        self.receipts: dict[bytes, Receipt] = {}
        self.seen_tags: set[tuple[bytes, bytes, bytes]] = set()

    def register(self, record: EnrollmentRecord) -> None:
        self.records[(record.device_pub, record.enrollment_id)] = record

    def get_enrollment(self, device_pub: bytes, enrollment_id: bytes) -> EnrollmentRecord | None:
        return self.records.get((device_pub, enrollment_id))

    def get_high_water(self, device_pub: bytes, enrollment_id: bytes) -> int:
        return self.high_water.get((device_pub, enrollment_id), 0)

    def get_receipt(self, bundle_id: bytes) -> Receipt | None:
        return self.receipts.get(bundle_id)

    def tag_seen(self, device_pub: bytes, enrollment_id: bytes, tag: bytes) -> bool:
        return (device_pub, enrollment_id, tag) in self.seen_tags

    def commit(
        self,
        *,
        device_pub: bytes,
        enrollment_id: bytes,
        counter: int,
        tag: bytes,
        bundle_id: bytes,
        receipt: Receipt,
    ) -> None:
        self.high_water[(device_pub, enrollment_id)] = counter
        self.seen_tags.add((device_pub, enrollment_id, tag))
        self.receipts[bundle_id] = receipt


def verify_bundle(
    bundle: Bundle,
    *,
    shares: Sequence[Share],
    store: InMemoryReplayStore,
    now_ms: int,
    max_future_skew_ms: int = MAX_FUTURE_SKEW_MS,
    max_age_ms: int = MAX_AGE_MS,
    threshold: int = 2,
) -> Verdict:
    transcript = bundle.transcript
    record = store.get_enrollment(transcript.device_pub, transcript.enrollment_id)
    if record is None or record.revoked:
        return Verdict.INVALID
    if record.notary_set_id != transcript.notary_set_id:
        return Verdict.INVALID
    if transcript.timestamp_ms > now_ms + max_future_skew_ms:
        return Verdict.INVALID
    if transcript.timestamp_ms < now_ms - max_age_ms:
        return Verdict.INVALID

    try:
        VerifyKey(transcript.device_pub).verify(
            BIND_LABEL + transcript.digest() + bundle.tag, bundle.sig
        )
    except (BadSignatureError, ValueError):
        return Verdict.INVALID

    bundle_id = bundle.bundle_id()
    if store.get_receipt(bundle_id) is not None:
        return Verdict.REPLAY
    if transcript.session_counter <= store.get_high_water(
        transcript.device_pub, transcript.enrollment_id
    ):
        return Verdict.REPLAY
    if store.tag_seen(transcript.device_pub, transcript.enrollment_id, bundle.tag):
        return Verdict.REPLAY

    try:
        k_tag = combine_shares(shares, threshold=threshold)
    except ThresholdError:
        return Verdict.INVALID
    verdict = classify_tag(k_tag, transcript.digest(), bundle.tag)
    if verdict == "invalid":
        return Verdict.INVALID

    receipt = Receipt(
        status="accepted",
        receipt_id=hashlib.sha256(RECEIPT_LABEL + bundle_id).digest(),
    )
    store.commit(
        device_pub=transcript.device_pub,
        enrollment_id=transcript.enrollment_id,
        counter=transcript.session_counter,
        tag=bundle.tag,
        bundle_id=bundle_id,
        receipt=receipt,
    )
    return Verdict.DURESS if verdict == "duress" else Verdict.NORMAL


class InMemoryNotary:
    """Demo notary: 2-of-3 shares, in-memory replay state, private audit log."""

    def __init__(self, shares_by_enrollment: dict[tuple[bytes, bytes], Sequence[Share]]):
        self.shares_by_enrollment = shares_by_enrollment
        self.store = InMemoryReplayStore()
        self.audit: list[tuple[bytes, Verdict]] = []

    def register(self, record: EnrollmentRecord, shares: Sequence[Share]) -> None:
        self.store.register(record)
        self.shares_by_enrollment[(record.device_pub, record.enrollment_id)] = shares

    def submit(self, raw_bundle: bytes, *, now_ms: int) -> Receipt:
        try:
            bundle = Bundle.from_bytes(raw_bundle)
        except InvalidBundle:
            return Receipt(status="rejected", receipt_id=hashlib.sha256(REJECT_LABEL + raw_bundle).digest())
        key = (bundle.transcript.device_pub, bundle.transcript.enrollment_id)
        shares = self.shares_by_enrollment.get(key)
        if shares is None:
            return Receipt(status="rejected", receipt_id=hashlib.sha256(REJECT_LABEL + raw_bundle).digest())
        verdict = verify_bundle(bundle, shares=shares, store=self.store, now_ms=now_ms)
        bundle_id = bundle.bundle_id()
        self.audit.append((bundle_id, verdict))
        if verdict in (Verdict.NORMAL, Verdict.DURESS):
            # Same receipt bytes for both modes; the verdict is only in audit.
            return Receipt(
                status="accepted",
                receipt_id=hashlib.sha256(RECEIPT_LABEL + bundle_id).digest(),
            )
        if verdict is Verdict.REPLAY:
            return self.store.get_receipt(bundle_id) or Receipt(
                status="rejected",
                receipt_id=hashlib.sha256(REJECT_LABEL + bundle_id).digest(),
            )
        return Receipt(
            status="rejected",
            receipt_id=hashlib.sha256(REJECT_LABEL + bundle_id).digest(),
        )
