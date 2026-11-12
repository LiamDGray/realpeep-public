# realpeep-core

Deterministic RealPeep primitives in an isolated Rust library crate.

This crate is deliberately small and has no CLI. It exists to pin down the
byte-level rules that Python, JavaScript, Kotlin, Rust, and eventually WASM must
agree on: the SHA-256 frame chain, a binary Merkle root, a canonical capture
transcript, and a placeholder duress tag.

**Status: prototype primitives, not a security boundary.** The Circom circuit
and its snarkjs prover remain the source of truth for RealPeep proofs. This
crate is not yet wired into Android or WASM.

## Scope

| Module | What it does |
| --- | --- |
| `sha256` | `SHA-256(bytes)` as a 32-byte digest. |
| `merkle` | Root over 32-byte leaves, `SHA-256(left || right)`, duplicate-last on odd levels, zero root for an empty input. |
| `hash_chain` | Per-frame `H_i = SHA-256(H_{i-1} || frame_i)`, all-zero genesis, append/count/head/reset, and a Merkle root over frame hashes. |
| `transcript` | Canonical, domain-separated, length-prefixed v1 transcript encoding and `SHA-256` transcript hash. |
| `duress` | **Placeholder only:** 32-byte `HMAC-SHA256(key, transcript_hash)` tag plus a test-only leading-32-zero-bits predicate. |

The crate has `#![forbid(unsafe_code)]`, edition 2021, and only `sha2` and
`hmac` as runtime dependencies (`hex` is dev-only). It serializes bytes itself;
there is no JSON, serde, or hidden nondeterminism.

## Canonical transcript format

The encoding is fixed-order and big-endian:

```text
domain             19 bytes   b"REALPEEP-TRANSCRIPT"
encoding_version   u16        currently 1
field*                        fixed order, each:
  name_len:u32 || name || value_len:u32 || value
```

Fields, in order:

1. `payload_hash` (32 bytes)
2. `ephemeral_pubkey` (32 bytes)
3. `merkle_root` (32 bytes)
4. `timestamp` (8 bytes, Unix seconds)
5. `protocol_version` (2 bytes; v0.1 is `1`)

The transcript hash is `SHA-256(canonical_encoding)`. The domain and encoding
version are inside the hashed bytes, so unrelated SHA-256 inputs and future
formats are domain-separated. Length prefixes prevent field-boundary ambiguity
without relying on JSON.

There is intentionally no decoder/parser in this version. Callers that add one
must reject unknown versions and non-canonical lengths rather than silently
accepting them.

## Duress placeholder: no indistinguishability claim

`duress::compute_tag` is exactly:

```text
tag = HMAC-SHA256(notary_key, transcript_hash)
```

`tag_satisfies_test_predicate` returns true only when the first 32 bits of a tag
are zero. That predicate exists to make the placeholder testable. It is **not**
a duress detection protocol and must not be used as one.

This module does **not** implement one-time tags, notary/threshold detection,
key lifecycle, proof binding, false-positive analysis, or constant-time
responses. It makes **no indistinguishability claim**, including under repeated
sessions. Treat it as a named placeholder until the duress specification is
finalized.

## Known test vectors

SHA-256:

```text
SHA-256("")    = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
SHA-256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
```

Frame chain, zero genesis, then appending in order:

```text
append("")      = 66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925
append("frame-1") = 2ae18d945d9be3a2c8f38a796739b3febdc1a51ec3e34dce0a240d57930f5ba4
append("frame-2") = 175adccfc65130327a53828058860b415f315ed6e7da67fdb4b7533bf4ed5eb7
```

Merkle roots for leaves `[0x01; 32]`, `[0x02; 32]`, ...:

```text
1 leaf  -> 0101010101010101010101010101010101010101010101010101010101010101
2 leaves -> f818afd37a6dc3bc92fb44731011277006db4efa6e9023cd7468c02335d22a4d
3 leaves -> 831e18b32b5392c031f24c715086821d7532fcb6cac0bb815a1a647990cff261
4 leaves -> 2c0c4083be2badf7c9f9046d8730d21e034c1ce50f519c166d7605848b17b0d5
5 leaves -> f632ed650b4b2c467228719df716e74232b7293f997e481489bd172e73473a77
```

Transcript with `payload_hash=[0x11;32]`, `ephemeral_pubkey=[0x22;32]`,
`merkle_root=[0x33;32]`, `timestamp=1700000000`, `protocol_version=1`:

```text
transcript_hash = 9e42f156cca24d79c8ed58c73ec2c399d15fcd665add3553bbdbcce41a8f49e9
```

The exact serialization is asserted in
`tests/primitives.rs::transcript_exact_serialization_vector`.

Placeholder tag with key `b"notary-test-key"` and transcript hash
`[0x42;32]`:

```text
tag = 346cd88e88183a34a123206a8daff3e6876552e32fdbe1e3e0c12e1c0809f730
```

## Compatibility notes

- The Merkle duplicate-last rule matches the existing Kotlin `HashChain` and
  JavaScript `FrameHashChain` behavior.
- The chain genesis here is the requested 32 zero bytes, matching the Kotlin
  implementation. The JavaScript demo currently seeds its chain with the ASCII
  string `init` and finalizes segments differently; that JS variant is not
  reproduced by this crate.
- No cross-language conformance harness is included yet.

## Non-goals

- Proving, witness generation, zkeys, or Groth16 verification. Circom/snarkjs
  remains authoritative.
- Android JNI/UniFFI bindings or wasm-bindgen bindings.
- A finished duress protocol or any security/indistinguishability claim.
- Parsing/validation of untrusted transcript bytes.
- A CLI, networking, storage, or frame capture.

## Tests

```sh
cargo test
cargo fmt -- --check
cargo clippy --all-targets -- -D warnings
```

The suite has 20 tests covering NIST SHA-256 vectors, chain genesis and order,
known chain vectors, Merkle duplicate-last behavior, transcript domain
separation/tamper detection and exact serialization, and the placeholder duress
tag/predicate.

## License

Apache-2.0, matching the repository license.
