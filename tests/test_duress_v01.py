"""Tests for Duress v0.1 — a demo/library slice, not a production protocol."""

from __future__ import annotations

import pytest
from nacl.signing import SigningKey

from realpeep.duress import (
    BIND_LABEL,
    BODY_LEN,
    BUNDLE_LEN,
    TAG_LEN,
    Bundle,
    EnrollmentRecord,
    InMemoryNotary,
    Mode,
    Receipt,
    Share,
    ThresholdError,
    Transcript,
    Verdict,
    classify_tag,
    combine_shares,
    derive_device_credential,
    enroll,
    make_bundle,
    verify_bundle,
)

NOW = 1_760_000_000_000
MASTER = bytes(range(32))
ENROLLMENT_ID = b"\x77" * 16
NOTARY_SET = b"\x55" * 32


def make_transcript(counter: int = 1, nonce: bytes | None = None) -> Transcript:
    return Transcript(
        payload_hash=b"\x11" * 32,
        capture_pub=b"\x22" * 32,
        authorized_merkle_root=b"\x33" * 32,
        device_pub=bytes(SigningKey(bytes(range(32))).verify_key),
        enrollment_id=ENROLLMENT_ID,
        witness_root=b"\x44" * 32,
        notary_set_id=NOTARY_SET,
        timestamp_ms=NOW,
        session_counter=counter,
        session_nonce=nonce or (counter.to_bytes(32, "big")),
    )


def make_enrollment(threshold: int = 2):
    signing_key = SigningKey(bytes(range(32)))
    credential, shares, record = enroll(
        MASTER,
        device_pub=bytes(signing_key.verify_key),
        enrollment_id=ENROLLMENT_ID,
        notary_set_id=NOTARY_SET,
        threshold=threshold,
        rng=lambda n: bytes([0xA0 + n]) * n,
    )
    notary = InMemoryNotary({})
    notary.register(record, shares)
    return signing_key, credential, shares, record, notary


def submit_bundle(notary: InMemoryNotary, bundle: Bundle, now: int = NOW) -> Receipt:
    return notary.submit(bundle.to_bytes(), now_ms=now)


def test_body_and_bundle_lengths():
    transcript = make_transcript()
    assert len(transcript.body()) == BODY_LEN == 264
    bundle = make_bundle(SigningKey(bytes(range(32))), make_enrollment()[1], transcript, Mode.NORMAL)
    assert len(bundle.to_bytes()) == BUNDLE_LEN == 360


def test_credential_derivation_is_deterministic_and_redacted():
    sk = SigningKey(bytes(range(32)))
    first = derive_device_credential(
        MASTER, device_pub=bytes(sk.verify_key), enrollment_id=ENROLLMENT_ID, notary_set_id=NOTARY_SET
    )
    second = derive_device_credential(
        MASTER, device_pub=bytes(sk.verify_key), enrollment_id=ENROLLMENT_ID, notary_set_id=NOTARY_SET
    )
    assert first == second
    credential, _, _ = enroll(
        MASTER,
        device_pub=bytes(sk.verify_key),
        enrollment_id=ENROLLMENT_ID,
        notary_set_id=NOTARY_SET,
    )
    assert "redacted" in repr(credential)
    assert first.hex() not in repr(credential)


def test_normal_and_duress_tags_differ_and_classify():
    signing_key, credential, _, _, _ = make_enrollment()
    transcript = make_transcript()
    normal = make_bundle(signing_key, credential, transcript, Mode.NORMAL)
    duress = make_bundle(signing_key, credential, transcript, Mode.DURESS)
    assert normal.tag != duress.tag
    assert classify_tag(credential.k_tag, transcript.digest(), normal.tag) == "normal"
    assert classify_tag(credential.k_tag, transcript.digest(), duress.tag) == "duress"


def test_normal_bundle_is_not_flagged():
    signing_key, credential, _, _, notary = make_enrollment()
    bundle = make_bundle(signing_key, credential, make_transcript(), Mode.NORMAL)
    receipt = submit_bundle(notary, bundle)
    assert receipt.status == "accepted"
    assert notary.audit[-1][1] is Verdict.NORMAL


def test_duress_bundle_is_flagged():
    signing_key, credential, _, _, notary = make_enrollment()
    bundle = make_bundle(signing_key, credential, make_transcript(), Mode.DURESS)
    receipt = submit_bundle(notary, bundle)
    assert receipt.status == "accepted"
    assert notary.audit[-1][1] is Verdict.DURESS


def test_one_share_is_insufficient():
    signing_key, credential, shares, _, notary = make_enrollment()
    bundle = make_bundle(signing_key, credential, make_transcript(), Mode.NORMAL)
    with pytest.raises(ThresholdError):
        combine_shares(shares[:1])
    # The notary rejects rather than silently classifying.
    result = verify_bundle(
        bundle, shares=shares[:1], store=notary.store, now_ms=NOW
    )
    assert result is Verdict.INVALID


def test_any_two_of_three_reconstructs():
    _, credential, shares, _, _ = make_enrollment()
    for pair in ((0, 1), (0, 2), (1, 2)):
        assert combine_shares([shares[pair[0]], shares[pair[1]]]) == credential.k_tag


def test_share_commitment_is_checked():
    _, _, shares, _, _ = make_enrollment()
    bad = Share(index=shares[0].index, value=shares[0].value, commitment=b"\x00" * 32)
    with pytest.raises(ThresholdError):
        combine_shares([bad, shares[1]])


def test_mixed_device_shares_are_invalid():
    signing_key, credential, _, _, notary = make_enrollment()
    other_key = SigningKey(bytes([9]) * 32)
    _, other_shares, other_record = enroll(
        MASTER,
        device_pub=bytes(other_key.verify_key),
        enrollment_id=b"\x88" * 16,
        notary_set_id=NOTARY_SET,
        rng=lambda n: b"\x11" * n,
    )
    bundle = make_bundle(signing_key, credential, make_transcript(), Mode.DURESS)
    mixed = [other_shares[0], other_shares[1]]
    assert verify_bundle(bundle, shares=mixed, store=notary.store, now_ms=NOW) is Verdict.INVALID


def test_tamper_body_or_tag_or_signature_invalid():
    signing_key, credential, shares, record, notary = make_enrollment()
    bundle = make_bundle(signing_key, credential, make_transcript(), Mode.NORMAL)
    raw = bytearray(bundle.to_bytes())
    for offset in (8, 40, 200, BODY_LEN + 4, BODY_LEN + TAG_LEN + 4):
        mutated = bytearray(raw)
        mutated[offset] ^= 0x01
        try:
            parsed = Bundle.from_bytes(bytes(mutated))
        except Exception:
            continue
        assert verify_bundle(parsed, shares=shares, store=notary.store, now_ms=NOW) is Verdict.INVALID


def test_transplanted_tag_is_invalid():
    signing_key, credential, shares, _, notary = make_enrollment()
    a = make_bundle(signing_key, credential, make_transcript(1), Mode.NORMAL)
    b_transcript = make_transcript(2)
    b = Bundle(transcript=b_transcript, tag=a.tag, sig=bundle_signature(signing_key, b_transcript, a.tag))
    assert verify_bundle(b, shares=shares, store=notary.store, now_ms=NOW) is Verdict.INVALID


def bundle_signature(signing_key: SigningKey, transcript: Transcript, tag: bytes) -> bytes:
    return signing_key.sign(BIND_LABEL + transcript.digest() + tag).signature


def test_exact_replay_returns_same_receipt():
    signing_key, credential, _, _, notary = make_enrollment()
    bundle = make_bundle(signing_key, credential, make_transcript(), Mode.NORMAL)
    first = submit_bundle(notary, bundle)
    second = submit_bundle(notary, bundle)
    assert first == second
    assert notary.audit[-1][1] is Verdict.REPLAY


def test_counter_rollback_is_replay():
    signing_key, credential, shares, _, notary = make_enrollment()
    first = make_bundle(signing_key, credential, make_transcript(1), Mode.NORMAL)
    assert submit_bundle(notary, first).status == "accepted"
    replay = make_bundle(signing_key, credential, make_transcript(1, b"\x99" * 32), Mode.NORMAL)
    assert verify_bundle(replay, shares=shares, store=notary.store, now_ms=NOW) is Verdict.REPLAY


def test_reusing_a_tag_with_a_new_counter_is_replay():
    signing_key, credential, shares, _, notary = make_enrollment()
    first = make_bundle(signing_key, credential, make_transcript(1), Mode.NORMAL)
    assert submit_bundle(notary, first).status == "accepted"
    transcript2 = make_transcript(2)
    reused = Bundle(transcript=transcript2, tag=first.tag, sig=bundle_signature(signing_key, transcript2, first.tag))
    assert verify_bundle(reused, shares=shares, store=notary.store, now_ms=NOW) is Verdict.REPLAY


def test_random_tag_is_invalid():
    signing_key, credential, shares, _, notary = make_enrollment()
    transcript = make_transcript()
    random_tag = b"\x42" * 32
    bundle = Bundle(transcript=transcript, tag=random_tag, sig=bundle_signature(signing_key, transcript, random_tag))
    assert verify_bundle(bundle, shares=shares, store=notary.store, now_ms=NOW) is Verdict.INVALID


def test_future_and_stale_timestamps_rejected():
    signing_key, credential, shares, _, notary = make_enrollment()
    future = make_bundle(signing_key, credential, make_transcript(), Mode.NORMAL)
    assert verify_bundle(future, shares=shares, store=notary.store, now_ms=NOW - 10_000_000) is Verdict.INVALID
    stale = make_bundle(signing_key, credential, make_transcript(), Mode.NORMAL)
    assert verify_bundle(
        stale, shares=shares, store=notary.store, now_ms=NOW + 31 * 24 * 3600 * 1000
    ) is Verdict.INVALID


def test_revoked_enrollment_rejected():
    signing_key, credential, shares, record, notary = make_enrollment()
    revoked = EnrollmentRecord(
        device_pub=record.device_pub,
        enrollment_id=record.enrollment_id,
        notary_set_id=record.notary_set_id,
        revoked=True,
    )
    notary.store.register(revoked)
    bundle = make_bundle(signing_key, credential, make_transcript(), Mode.NORMAL)
    assert verify_bundle(bundle, shares=shares, store=notary.store, now_ms=NOW) is Verdict.INVALID


def test_receipt_does_not_expose_mode():
    signing_key, credential, _, _, notary = make_enrollment()
    normal = submit_bundle(notary, make_bundle(signing_key, credential, make_transcript(1), Mode.NORMAL))
    duress = submit_bundle(notary, make_bundle(signing_key, credential, make_transcript(2), Mode.DURESS))
    assert normal.status == duress.status == "accepted"
    assert set(normal.__dataclass_fields__) == {"status", "receipt_id"}
    assert not hasattr(normal, "verdict") and not hasattr(duress, "verdict")


def test_many_normal_and_duress_sessions():
    signing_key, credential, _, _, notary = make_enrollment()
    for i in range(200):
        submit_bundle(notary, make_bundle(signing_key, credential, make_transcript(2 * i + 1), Mode.NORMAL))
        submit_bundle(notary, make_bundle(signing_key, credential, make_transcript(2 * i + 2), Mode.DURESS))
    verdicts = [verdict for _, verdict in notary.audit]
    assert verdicts.count(Verdict.NORMAL) == 200
    assert verdicts.count(Verdict.DURESS) == 200


def test_gf256_known_values():
    from realpeep.duress.v01 import _gf_inv, _gf_mul

    assert _gf_mul(0x57, 0x83) == 0xC1
    assert _gf_mul(0x00, 0x42) == 0
    for value in (1, 2, 3, 0x57, 0xFF):
        assert _gf_mul(value, _gf_inv(value)) == 1


def test_short_share_indices_rejected():
    _, _, shares, _, _ = make_enrollment()
    with pytest.raises(ValueError):
        Share(index=0, value=shares[0].value, commitment=shares[0].commitment)
