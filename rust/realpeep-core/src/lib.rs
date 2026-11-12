#![forbid(unsafe_code)]
//! Deterministic, dependency-light primitives for RealPeep capture provenance.
//!
//! This crate is intentionally not a prover and does not replace the Circom
//! circuit or snarkjs. It covers the byte-level building blocks that must agree
//! across implementations: the SHA-256 frame chain, a binary Merkle root, a
//! canonical capture transcript, and a **placeholder** duress tag API.
//!
//! Nothing in this crate is wired into Android or WASM yet.

pub mod duress;
pub mod hash_chain;
pub mod merkle;
pub mod transcript;

/// Length of a SHA-256 digest in bytes.
pub const HASH_LEN: usize = 32;

/// A 32-byte SHA-256 digest.
pub type Hash32 = [u8; HASH_LEN];

pub use duress::{compute_tag, tag_satisfies_test_predicate, DuressTag, TAG_LEN};
pub use hash_chain::HashChain;
pub use merkle::merkle_root;
pub use transcript::CaptureTranscript;

/// Compute a SHA-256 digest.
#[must_use]
pub fn sha256(data: &[u8]) -> Hash32 {
    use sha2::{Digest, Sha256};

    Sha256::digest(data).into()
}
