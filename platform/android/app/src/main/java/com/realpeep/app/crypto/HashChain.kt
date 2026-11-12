package com.realpeep.app.crypto

import java.security.MessageDigest

/**
 * Per-frame SHA-256 hash chain with Merkle tree construction.
 *
 * Each frame's hash includes the previous frame's hash:
 *   H(frame_i) = SHA-256(H(frame_{i-1}) || raw_frame_data_i)
 *
 * The Merkle tree enables segment-level verification without recomputing
 * the entire chain.
 */
class HashChain {
    private val md = MessageDigest.getInstance("SHA-256")
    private val hashes = mutableListOf<ByteArray>()

    /** Genesis hash (all zeros). */
    private var previousHash = ByteArray(32)

    val frameCount: Int get() = hashes.size

    /**
     * Append a frame to the chain. Returns the frame hash.
     */
    fun append(frameData: ByteArray): ByteArray {
        val frameHash = if (NativeCore.available) {
            NativeCore.frameHash(previousHash, frameData)
        } else {
            md.reset()
            md.update(previousHash)
            md.update(frameData)
            md.digest()
        }
        hashes.add(frameHash)
        previousHash = frameHash
        return frameHash
    }

    /**
     * Build a Merkle tree from the accumulated frame hashes.
     * Returns the Merkle root (32 bytes).
     */
    fun buildMerkleRoot(): ByteArray {
        if (hashes.isEmpty()) return ByteArray(32)
        if (NativeCore.available) {
            return NativeCore.merkleRoot(hashes.toTypedArray())
        }

        var level = hashes.toList()
        while (level.size > 1) {
            level = level.chunked(2).map { pair ->
                md.reset()
                md.update(pair[0])
                if (pair.size > 1) md.update(pair[1]) else md.update(pair[0])
                md.digest()
            }
        }
        return level[0]
    }

    /** Reset the chain for a new session. */
    fun reset() {
        hashes.clear()
        previousHash = ByteArray(32)
    }
}
