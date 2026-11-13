# Mock OpenTimestamps integration

**Status:** mock/demo only. It is **not** a Bitcoin anchor and is not `.ots`-compatible.

## What the real OTS API does

The OpenTimestamps client submits a 32-byte digest to a calendar:

```http
POST {calendar}/digest
Accept: application/vnd.opentimestamps.v1
<32 raw bytes>
```

The calendar returns a serialized `Timestamp`. Clients can poll:

```http
GET {calendar}/timestamp/<hex commitment>
Accept: application/vnd.opentimestamps.v1
```

Real calendars aggregate many digests into a Bitcoin transaction and the final
proof contains a Bitcoin attestation. The default calendar whitelist is in
`python-opentimestamps`:

- `https://*.calendar.opentimestamps.org`
- `https://*.calendar.eternitywall.com`
- `https://*.calendar.catallaxy.com`

Sources: [OpenTimestamps](https://opentimestamps.org/),
[python-opentimestamps](https://github.com/opentimestamps/python-opentimestamps),
[opentimestamps-server](https://github.com/opentimestamps/opentimestamps-server).

## What this repo implements

`mock_ots/` implements the same **HTTP shape** with a JSON token:

- `POST /digest` — exactly 32 raw bytes; returns a signed mock token.
- `GET /timestamp/<hex>` — returns the stored token or 404.
- `GET /health` — liveness.

The token is:

```json
{
  "version": 1,
  "calendar": "mock-ots",
  "digest": "<32-byte hex>",
  "commitment": "<sha256('RP-OTS-MOCK-v1' || digest) hex>",
  "height": 800000,
  "txid": "<sha256('RP-OTS-TX-v1' || commitment || height) hex>",
  "timestamp": 1760000000,
  "signature": "<base64 Ed25519 signature>"
}
```

The signature covers:

```text
"RP-OTS-MOCK-v1" || digest || commitment || u32(height) || txid || u64(timestamp)
```

The mock calendar key is deterministic for the demo:

```text
seed: 000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f
pub:  03a107bff3ce10be1d70dd18e74bc09967e4d6309ba50d5f1ddc8664125531b8
```

**This key is public demo material.** Anyone can mint tokens; the signature only
checks the mock calendar's integrity, not a real-world timestamp. Do not present
it as OpenTimestamps or Bitcoin.

## Run it

```bash
python3 -m mock_ots.server --port 8098
# Moto over USB:
adb reverse tcp:8098 tcp:8098
adb shell am start -n com.realpeep.app/.MainActivity \
  --es ots_url http://127.0.0.1:8098
# Emulator:
# default in the app is http://10.0.2.2:8098
```

The app uses `OpenTimestampsClient` after a session stops. It hashes
`frameMerkleRoot || audioMerkleRoot || sessionId`, submits the digest, verifies
the mock Ed25519 token, and stores it encrypted through
`OfflineBundle.storeOts`.

Cleartext HTTP is enabled in the manifest for this demo; production must use
HTTPS and a real calendar whitelist.

## Verified

Moto G7 Power, Android 10:

```text
RealPeep.Main: Mock OTS anchored session 8ac0... height=800000
```

Instrumented test `OpenTimestampsClientTest` verifies a fixed token and rejects
a tampered digest.

## What remains real work

- Actual `.ots` serialization/deserialization and Bitcoin attestation
  verification.
- Calendar whitelist, aggregation polling (`/timestamp` retries), upgrade path,
  and a real calendar service.
- HTTPS pinning/network policy; the mock uses cleartext.
- Anchoring the proof/transcript, not only the session roots; the current mock
  is a separate envelope signal.
