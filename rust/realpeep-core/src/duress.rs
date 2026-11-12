//! **Design-placeholder** duress tag API for v0.1.
//!
//! # Not a finished duress protocol
//!
//! This module intentionally implements only the small primitive currently
//! agreed for prototyping:
//!
//! ```text
//! tag = HMAC-SHA256(notary_key, transcript_hash)
//! ```
//!
//! It is not a duress detector, not a threshold notary scheme, and not a
//! claim of indistinguishability. The real specification still needs
//! one-time tags, a notary/threshold protocol, key management, proof binding,
//! and a false-positive analysis. See the crate README before using it.
//!
//! The test-only predicate checks whether the first 32 bits of a tag are zero.
//! It is a deterministic hook for tests, not production detection logic.

use hmac::{Hmac, Mac};
use sha2::Sha256;

use crate::Hash32;

/// Length of a duress tag in bytes.
pub const TAG_LEN: usize = 32;

/// Number of leading bits checked by [`tag_satisfies_test_predicate`].
pub const TEST_PREDICATE_BITS: u32 = 32;

/// A 32-byte placeholder duress tag.
pub type DuressTag = [u8; TAG_LEN];

type HmacSha256 = Hmac<Sha256>;

/// Compute the placeholder tag `HMAC-SHA256(key, transcript_hash)`.
#[must_use]
pub fn compute_tag(key: &[u8], transcript_hash: &Hash32) -> DuressTag {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC-SHA256 accepts keys of any length");
    mac.update(transcript_hash);
    mac.finalize().into_bytes().into()
}

/// Test-only predicate: return true when the first 32 tag bits are zero.
///
/// This is not a production duress check and must not be used as one.
#[must_use]
pub fn tag_satisfies_test_predicate(tag: &DuressTag) -> bool {
    tag[..4].iter().all(|byte| *byte == 0)
}
