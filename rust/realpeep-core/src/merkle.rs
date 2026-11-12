//! Binary Merkle tree over 32-byte leaves.
//!
//! Pair hashing is `SHA-256(left || right)`. At every odd level the final node
//! is duplicated before hashing, matching the Kotlin and JavaScript
//! implementations. An empty tree returns 32 zero bytes and a single leaf is
//! returned unchanged.

use crate::{sha256, Hash32};

/// Compute the binary Merkle root of `leaves`.
///
/// The input order is preserved. Odd levels duplicate the last node.
#[must_use]
pub fn merkle_root(leaves: &[Hash32]) -> Hash32 {
    if leaves.is_empty() {
        return [0u8; 32];
    }

    let mut level = leaves.to_vec();
    while level.len() > 1 {
        if !level.len().is_multiple_of(2) {
            let last = *level.last().expect("level is non-empty");
            level.push(last);
        }

        let mut next = Vec::with_capacity(level.len() / 2);
        for pair in level.as_chunks::<2>().0 {
            next.push(hash_pair(&pair[0], &pair[1]));
        }
        level = next;
    }

    level[0]
}

fn hash_pair(left: &Hash32, right: &Hash32) -> Hash32 {
    let mut input = [0u8; 64];
    input[..32].copy_from_slice(left);
    input[32..].copy_from_slice(right);
    sha256(&input)
}
