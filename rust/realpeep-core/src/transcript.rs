//! Canonical, versioned serialization of a capture transcript.
//!
//! The wire format is deliberately not JSON. It is a fixed field order with
//! deterministic, big-endian length prefixes:
//!
//! ```text
//! domain                19 bytes  b"REALPEEP-TRANSCRIPT"
//! encoding_version      u16      big-endian, currently 1
//! repeated fields       field*
//!
//! field = name_len:u32 || name || value_len:u32 || value
//! ```
//!
//! Fields are, in order:
//!
//! 1. `payload_hash` (32 bytes)
//! 2. `ephemeral_pubkey` (32 bytes)
//! 3. `merkle_root` (32 bytes)
//! 4. `timestamp` (8-byte big-endian Unix seconds)
//! 5. `protocol_version` (2-byte big-endian)
//!
//! The transcript hash is `SHA-256(encode())`. Encoding the domain and schema
//! version inside the bytes gives domain separation from unrelated SHA-256
//! uses and makes future format changes explicit.

use crate::{sha256, Hash32};

/// Domain separator for capture transcript v1.
pub const TRANSCRIPT_DOMAIN: &[u8] = b"REALPEEP-TRANSCRIPT";

/// Version of the byte encoding implemented by this module.
pub const TRANSCRIPT_ENCODING_VERSION: u16 = 1;

/// Protocol version for the current v0.1 capture transcript.
pub const PROTOCOL_VERSION_V0_1: u16 = 1;

const FIELD_PAYLOAD_HASH: &[u8] = b"payload_hash";
const FIELD_EPHEMERAL_PUBKEY: &[u8] = b"ephemeral_pubkey";
const FIELD_MERKLE_ROOT: &[u8] = b"merkle_root";
const FIELD_TIMESTAMP: &[u8] = b"timestamp";
const FIELD_PROTOCOL_VERSION: &[u8] = b"protocol_version";

/// The fields committed to by a capture transcript.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CaptureTranscript {
    /// Hash/root of the captured payload.
    pub payload_hash: Hash32,
    /// Ephemeral capture public key.
    pub ephemeral_pubkey: Hash32,
    /// Merkle root over captured frame hashes.
    pub merkle_root: Hash32,
    /// Unix timestamp in seconds.
    pub timestamp: u64,
    /// Protocol version. See [`PROTOCOL_VERSION_V0_1`].
    pub protocol_version: u16,
}

impl CaptureTranscript {
    /// Construct a transcript.
    #[must_use]
    pub fn new(
        payload_hash: Hash32,
        ephemeral_pubkey: Hash32,
        merkle_root: Hash32,
        timestamp: u64,
        protocol_version: u16,
    ) -> Self {
        Self {
            payload_hash,
            ephemeral_pubkey,
            merkle_root,
            timestamp,
            protocol_version,
        }
    }

    /// Serialize the transcript in the canonical v1 format.
    #[must_use]
    pub fn encode(&self) -> Vec<u8> {
        let mut out = Vec::with_capacity(231);
        out.extend_from_slice(TRANSCRIPT_DOMAIN);
        out.extend_from_slice(&TRANSCRIPT_ENCODING_VERSION.to_be_bytes());

        push_field(&mut out, FIELD_PAYLOAD_HASH, &self.payload_hash);
        push_field(&mut out, FIELD_EPHEMERAL_PUBKEY, &self.ephemeral_pubkey);
        push_field(&mut out, FIELD_MERKLE_ROOT, &self.merkle_root);
        push_field(&mut out, FIELD_TIMESTAMP, &self.timestamp.to_be_bytes());
        push_field(
            &mut out,
            FIELD_PROTOCOL_VERSION,
            &self.protocol_version.to_be_bytes(),
        );

        out
    }

    /// Return `SHA-256(canonical encoding)`.
    #[must_use]
    pub fn hash(&self) -> Hash32 {
        sha256(&self.encode())
    }
}

fn push_field(out: &mut Vec<u8>, name: &[u8], value: &[u8]) {
    let name_len = u32::try_from(name.len()).expect("field name length fits in u32");
    let value_len = u32::try_from(value.len()).expect("field value length fits in u32");

    out.extend_from_slice(&name_len.to_be_bytes());
    out.extend_from_slice(name);
    out.extend_from_slice(&value_len.to_be_bytes());
    out.extend_from_slice(value);
}
