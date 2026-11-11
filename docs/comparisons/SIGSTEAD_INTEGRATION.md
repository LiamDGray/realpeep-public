# Sigstead Integration: Signed Provenance Layer for RealPeep

**Status:** Deferred to Phase 3+
**Decision:** Option A — ephemeral Ed25519 key as signing identity
**Rationale documented:** July 2026

---

## 1. Motivation

RealPeep needs a tamper-evident, chain-linked, offline-verifiable record of every
recording session: frame hashes, audio chunks, BLE mesh observations, and duress
flags. Building this from scratch would mean inventing a custom hash-chain format,
a signing protocol, and a verification tool — precisely the kind of home-grown
cryptography that should be avoided.

Sigstead (`~/src/sigstead`) already solves this problem using vetted, widely
reviewed standards:

| Concern | RealPeep without Sigstead | With Sigstead |
|---------|--------------------------|---------------|
| Record format | Custom JSON + SHA-256 chain | Standard in-toto v1 Statement |
| Signing | Ephemeral Ed25519 (custom) | DSSE envelope (standard) |
| Identity binding | Public key only | OIDC or local key (configurable) |
| Tamper evidence | Custom hash chain | DSSE `prev` hash chain |
| Offline verification | Custom verifier script | `sigstead verify` (existing CLI) |
| Interoperability | None | Compatible with Archivista, Witness |
| Transparency log | None (planned OpenTimestamps) | Rekor inclusion proof (optional) |

Sigstead's design principles mirror RealPeep's:

- **No home-grown cryptography.** Sigstead composes in-toto, sigstore, and DSSE.
- **Verifiable offline, by a third party.** A record's value is that someone who
  doesn't trust you can verify it without calling any service.
- **Ecosystem over platform.** Sigstead produces standard attestations, not
  proprietary records.

---

## 2. Integration Architecture

### 2.1 Where Sigstead fits in the RealPeep pipeline

```
PHONE (capture time)              VERIFIER (after upload)           AUDITOR (offline)
──────────────────                ────────────────────────           ─────────────────
Camera frames → SHA-256 chain     Receives raw bundle               Downloads R2 bundle
Audio chunks → SHA-256 hash       Constructs in-toto Statement      sigstead verify bundle.json
BLE nonces → Bloom filter         Signs with Sigstead               Checks: signature,
Duress flag → marker bit          Stores to R2                       chain integrity,
                                  Publishes Rekor (optional)         identity binding
```

**Key design decision:** Sigstead runs on the verifier, NOT on the phone. The phone
produces raw data and ephemeral signatures (lightweight, battery-friendly). The
verifier constructs the heavyweight Sigstead records (sigstore bundles, Rekor
entries) using server resources.

### 2.2 Record granularity

**Session-level, not per-frame.** Sigstead records include full signing bundles
(~5KB for sigstore keyless). At 30fps, per-frame Sigstead records would generate
~150KB/sec of signing overhead. Instead:

1. RealPeep's phone produces a lightweight per-frame SHA-256 chain + Merkle tree
   (already implemented in `HashChain.kt`).
2. At session end, the verifier constructs a single Sigstead record containing:
   - The Merkle root of the frame hash chain
   - The Merkle root of audio chunk hashes
   - The serialized BLE mesh observation bundle (Bloom filter)
   - The duress flag (present/absent, not the passphrase)
   - Session metadata (start/end timestamps, mesh device count)
3. This single record is signed, chained to previous sessions via `prev`, and
   stored to R2.

### 2.3 Chain linking across sessions

Each Sigstead record includes a `prev` field containing the SHA-256 hash of the
previous session's entire record. If a user records three sessions:

```
Session 1  →  Record { prev: null, merkle_root_1, mesh_bundle_1 }
Session 2  →  Record { prev: SHA256(Record_1), merkle_root_2, mesh_bundle_2 }
Session 3  →  Record { prev: SHA256(Record_2), merkle_root_3, mesh_bundle_3 }
```

Tampering with any record breaks the chain. Reordering or deleting sessions is
detectable. This is the same model as Sigstead's existing agent-decision chain.

---

## 3. Identity Binding: Option A (Ephemeral Ed25519)

### 3.1 The problem

Sigstead's default signing mode uses **sigstore keyless**: an OIDC identity
(email, GitHub handle) is bound to a short-lived X.509 certificate via Fulcio,
and the signature is recorded in the Rekor transparency log. This produces a
strong identity binding — "liam@example.com signed this at 2026-07-01T12:00:00Z."

But RealPeep's core promise is **anonymous provenance** — proving a video came
from real hardware without revealing whose hardware. An OIDC-bound signature
would link the record to an identity, defeating anonymity.

### 3.2 Solution: local key signing with ephemeral Ed25519

Sigstead supports a **local key fallback mode** (documented in its roadmap as a
deferred feature). Instead of sigstore keyless, the signing key is the same
ephemeral Ed25519 keypair that RealPeep already generates per session.

```
Session keypair: (sk_A, pk_A)  — ephemeral Ed25519, used for:
  1. BLE beacon signatures        (proves mesh participation)
  2. Audio chunk signatures       (proves recording integrity)
  3. Sigstead record signature    (proves session provenance)
```

The Sigstead record is wrapped in a DSSE envelope signed with `sk_A`. The
verification includes checking that the signing key `pk_A` matches the key
embedded in the BLE mesh beacons — proving that the device which signed the
Sigstead record is the same device that was physically present in the mesh.

**Identity model:**

| Property | Proved by |
|----------|-----------|
| "This record was signed by device X" | Ed25519 signature over DSSE envelope |
| "Device X was in the room with devices Y and Z" | BLE mesh attestations (pk_X in bloom filters) |
| "Device X is real hardware, not a deepfake" | ZK proof (Phase 3+) |
| "Device X is Liam's phone" | NOT proved — anonymity preserved |

### 3.3 Upgrade path to sigstore (Option B)

For scenarios where strong identity binding IS desired (e.g., a journalist who
wants their byline cryptographically bound to footage), the verifier can use
sigstore keyless instead of the ephemeral key. The record format doesn't change —
only the signing mode. This is a configuration option, not an architecture change.

**Recommendation:** Ship with Option A (ephemeral Ed25519) as the default.
Add Option B (sigstore OIDC) as a configuration toggle for users who want
attributed provenance.

---

## 4. Record Format

### 4.1 In-toto Statement (session-level)

```json
{
  "_type": "https://in-toto.io/Statement/v1",
  "subject": [
    {
      "name": "frame-merkle-root",
      "digest": { "sha256": "abc123..." }
    },
    {
      "name": "audio-merkle-root",
      "digest": { "sha256": "def456..." }
    },
    {
      "name": "ble-mesh-bundle",
      "digest": { "sha256": "ghi789..." }
    }
  ],
  "predicateType": "https://realpeep.dev/session-record/v0",
  "predicate": {
    "sessionId": "uuid",
    "meshId": "base64...",
    "startedAt": "2026-07-01T12:00:00Z",
    "endedAt": "2026-07-01T12:05:00Z",
    "meshDeviceCount": 12,
    "duressDetected": false,
    "prev": "sha256:previous-record-hash..."
  }
}
```

### 4.2 DSSE Envelope

The Statement is wrapped in a DSSE envelope and signed with the ephemeral
Ed25519 key (Option A) or sigstore (Option B):

```json
{
  "payloadType": "application/vnd.in-toto+json",
  "payload": "<base64-encoded Statement>",
  "signatures": [
    {
      "keyid": "",
      "sig": "<base64 Ed25519 signature>"
    }
  ]
}
```

---

## 5. Verification Flow

### 5.1 Auditor downloads from R2

```bash
# Download session bundle
curl -o session.json https://r2.realpeep.dev/bundles/<sessionId>
```

### 5.2 Verify with sigstead CLI

```bash
# Verify the record (checks signature, chain integrity, format)
sigstead verify session.json --expected-key pk_A_base64

# Alternatively: verify the Merkle root against raw video
realpeep-verify --video protest.mp4 --session session.json
```

### 5.3 What verification proves

- ✅ The record hasn't been altered since signing (DSSE signature)
- ✅ The signing key matches the BLE mesh key (pk_A in the beacon)
- ✅ The frame Merkle root matches the video (separate RealPeep verifier check)
- ✅ The session is correctly chained to previous sessions (prev hash)
- ❌ The signer's real-world identity (anonymous by design)

---

## 6. Implementation Plan (Deferred)

### Phase 3a: Verifier-side Sigstead integration

- [ ] Add `sigstead` as a Python dependency to the verifier (server-side)
- [ ] Implement in-toto Statement construction from RealPeep bundle data
- [ ] Implement DSSE signing with the session's ephemeral Ed25519 key
- [ ] Implement `prev` hash chaining across sessions
- [ ] Store signed records to R2 via Cloudflare Worker
- [ ] Test: round-trip sign → store → verify with `sigstead verify`

### Phase 3b: Optional sigstore mode

- [ ] Add sigstore keyless signing as an alternative signing mode
- [ ] Configuration toggle: anonymous (ephemeral key) vs. attributed (sigstore OIDC)
- [ ] Test: Rekor inclusion proof verification

### Not in scope

- Per-frame Sigstead records (too heavy; keep lightweight hash chain on phone)
- Real-time Rekor submission (deferred to batch; OpenTimestamps is sufficient)
- Sigstead on Android (Python dependency; server-side only)

---

## 7. Relationship to Other RealPeep Components

| Component | Signed by | Record type |
|-----------|-----------|-------------|
| Frame hash chain | Ephemeral Ed25519 (phone) | Raw SHA-256 chain (not Sigstead) |
| Audio chunk hashes | Ephemeral Ed25519 (phone) | Raw SHA-256 hashes (not Sigstead) |
| BLE mesh bundle | Ephemeral Ed25519 (phone) | Raw observation bundle (not Sigstead) |
| **Session record** | Sigstead (verifier) | In-toto Statement + DSSE (Sigstead) |
| **Cross-session chain** | Sigstead (verifier) | `prev` hash chain (Sigstead) |
| ZK identity proof | ZK circuit (phone or verifier) | Groth16 proof (not Sigstead) |
