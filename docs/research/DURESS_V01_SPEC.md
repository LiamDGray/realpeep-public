# Duress v0.1 specification (demo/library slice)

**Status:** implemented reference; not a production protocol. No novelty or
indistinguishability claim.

## Why this replaces the 8-bit marker

The old code searched for an 8-bit marker, reused a deterministic nonce, did not
bind the tag to a transcript, and put the notary secret on the client. v0.1
replaces the search with an **exact, transcript-bound two-label HMAC tag**:

```text
body = magic || version || suite || flags || payload_hash || capture_pub
       || authorized_merkle_root || device_pub || enrollment_id
       || witness_root || notary_set_id || timestamp_ms
       || session_counter || session_nonce
h_T  = SHA-256(body)
tag  = HMAC-SHA-256(k_tag, "RPDR-TAG-v1" || label || h_T)
sig  = Ed25519(sk_dev, "RPDR-BIND-v1" || h_T || tag)
label = 0x00 normal, 0x01 duress (never transmitted)
```

The notary computes both candidate tags and compares. There is no marker search,
no false-positive rate from a rare prefix, no repeated nonce, and no tag that can
be transplanted to another transcript.

## Bundle

Fixed 360-byte bundle: 264-byte body + 32-byte tag + 64-byte signature. All
integers are unsigned big-endian. Unknown magic/version/suite/flags or extra
bytes are rejected.

## Credential and threshold

- The notary set derives a per-device `k_tag` from its master key:
  `HKDF-SHA256(master, salt="RPDR-v01", info="RPDR-HKDF-v1" || "device-tag" ||
  device_pub || enrollment_id || notary_set_id)`.
- `k_tag` is split 2-of-3 using Shamir over GF(256). Any two shares reconstruct
  it; one share is insufficient.
- The device stores `k_tag` and computes tags offline. **This is a client-side
  secret and is not a security boundary.** A captor with the device can read it,
  compute both tags, and forge a duress tag for that device.
- The notary set does not hold the master key at verification time; a quorum
  reconstructs `k_tag`. This is an access structure, not a threshold PRF: the
  quorum transiently holds the key, and two colluding notaries can forge for
  that device.

## Replay and one-time behavior

- `session_nonce` is fresh CSPRNG per proof; `session_counter` strictly increases.
- The notary keeps a high-water counter per enrollment, a bundle-id receipt
  cache, and a seen-tag set.
- Exact retries return the same receipt; counter rollback and tag reuse are
  rejected. The verdict is **not** in the public receipt; it is written to the
  internal audit log.
- Timestamps are advisory: far-future and stale bundles are rejected, but the
  counter is the replay defense.

## False positives

A conforming normal tag matches the normal candidate exactly; it matches the
duress candidate only on a 256-bit HMAC collision. A random tag matches either
candidate with probability ~2^-255. The old 8-bit marker had a 1/256 false
positive rate.

## What remains demo-only

- Client-side `k_tag`; no hardware root.
- No in-circuit tag binding. The envelope signature binds the proof public
  inputs, but `scrubber.circom` has no duress tag input.
- Shamir reconstruction, not a threshold PRF/MPC.
- In-memory replay store in the reference; no production API, rate limiting, or
  timing/cover-traffic analysis.
- No protection against a captor with the unlocked device.
- No novelty claim. Prior art includes duress PINs, panic passwords, hidden
  volumes, designated-verifier proofs, and subliminal channels.
