//! SHA-256 frame hash chain.
//!
//! Each frame hash commits to the previous frame hash and the current frame
//! bytes:
//!
//! ```text
//! H_i = SHA-256(H_{i-1} || frame_bytes_i)
//! H_0 = 32 zero bytes
//! ```
//!
//! The Merkle root is built over the accumulated per-frame hashes, using the
//! same duplicate-last rule as the existing Kotlin and JavaScript Merkle
//! implementations.

use sha2::{Digest, Sha256};

use crate::{merkle::merkle_root, Hash32};

/// A deterministic SHA-256 hash chain over captured frames.
#[derive(Clone, Debug, Default)]
pub struct HashChain {
    head: Hash32,
    frame_hashes: Vec<Hash32>,
}

impl HashChain {
    /// Create a chain at the all-zero genesis state.
    #[must_use]
    pub fn new() -> Self {
        Self {
            head: [0u8; 32],
            frame_hashes: Vec::new(),
        }
    }

    /// Build a chain by appending frames in iteration order.
    #[must_use]
    pub fn from_frames<I, B>(frames: I) -> Self
    where
        I: IntoIterator<Item = B>,
        B: AsRef<[u8]>,
    {
        let mut chain = Self::new();
        for frame in frames {
            chain.append(frame.as_ref());
        }
        chain
    }

    /// Append one frame and return its hash.
    ///
    /// The frame is committed as `SHA-256(previous_head || frame_bytes)`.
    pub fn append(&mut self, frame_bytes: &[u8]) -> Hash32 {
        let mut hasher = Sha256::new();
        hasher.update(self.head);
        hasher.update(frame_bytes);
        let frame_hash: Hash32 = hasher.finalize().into();

        self.frame_hashes.push(frame_hash);
        self.head = frame_hash;
        frame_hash
    }

    /// Return the number of appended frames.
    #[must_use]
    pub fn count(&self) -> usize {
        self.frame_hashes.len()
    }

    /// Return the current chain head.
    #[must_use]
    pub fn head(&self) -> Hash32 {
        self.head
    }

    /// Return all per-frame hashes in append order.
    #[must_use]
    pub fn frame_hashes(&self) -> &[Hash32] {
        &self.frame_hashes
    }

    /// Return the Merkle root over all frame hashes.
    ///
    /// An empty chain hashes to 32 zero bytes. A single-frame chain has the
    /// frame hash as its root. Odd levels duplicate their final node.
    #[must_use]
    pub fn merkle_root(&self) -> Hash32 {
        merkle_root(&self.frame_hashes)
    }

    /// Clear all frames and return to the genesis state.
    pub fn reset(&mut self) {
        self.head = [0u8; 32];
        self.frame_hashes.clear();
    }
}
