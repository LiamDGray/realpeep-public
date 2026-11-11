# Duress v0.1 — First Live-Session Slice

**Status:** red tests only; no implementation yet.  
**Red branch:** `duress/v0.1-red`  
**Run:** `pytest tests/test_duress_v01.py -q`

## Goal

Make the duress signal a **one-time, transcript-bound, negligible-false-positive**
property, and move detection from a single notary secret to a threshold notary, without
changing what a public verifier sees.

## Current defects (from the audit)

- 8-bit marker in Python (`1/256` false positive), 4-bit marker in the browser demo.
- Python duress nonce is deterministic and reused for the same key.
- Tag is not bound to the payload, Merkle root, witness set, or timestamp.
- No notary service, no threshold, no rotation, no indistinguishable responses.
- The demo context value is public; it must never be mistaken for a credential.

## Acceptance criteria

1. `DuressKeyDerivation` defaults to **at least 32 marker bits** (target `2^-32` false
   positives; 64 if the budget allows).
2. Every duress session produces a **fresh** nonce/tag; no reuse across sessions.
3. The tag is computed over a canonical transcript hash including at least:
   `payload_hash`, `ephemeral_pubkey`, `merkle_root`, `timestamp`, and a protocol version.
4. Tampering with any transcript field invalidates the tag.
5. A **2-of-3** notary can detect a valid tag; a single share cannot.
6. Normal and duress sessions have identical public proof structure and notary response
   bytes/latency (within the documented test tolerance).
7. A `10,000`-session simulation reports zero false positives at the chosen tag size, and
   the theoretical rate is documented.
8. Tests cover replay, copied tags across transcripts, key rotation, and notary compromise.

## Suggested shape

- A one-time tag pool provisioned in secure storage, or a constant-time construction that
  does not leak generation timing.
- Canonical transcript hash + HMAC/PRF tag; not a raw hash prefix on a reusable nonce.
- Threshold notary with indistinguishable “accepted” responses; escalation out of band.
- Bind the tag to the proof by a public input, envelope signature, or a separate NIZK.

## Out of scope

- The ZK circuit change (do that after the tag API is stable).
- On-device secure-element integration (stub it and document the assumption).
- A production trusted setup or external audit.
- A workshop paper; the slice must be real first.

## Definition of done

- The four red tests pass.
- New tests for transcript tampering, replay, and threshold notary pass.
- `just ci-local` is green.
- `docs/research/DURESS_NOVELTY_ASSESSMENT.md` is updated from “not publishable” to
  “construction fixed; evaluation next.”
