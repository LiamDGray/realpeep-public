package com.realpeep.app.mesh

import java.security.MessageDigest
import java.util.BitSet

/**
 * Bloom filter for tracking observed mesh device nonces.
 *
 * Each device passively collects nonces from BLE advertisements during a
 * recording session. The Bloom filter provides space-efficient set membership
 * with configurable false positive rate.
 *
 * Ported from RealPeep protocol specification.
 */
class BloomFilter(
    private val capacity: Int = 5000,
    private val fpr: Double = 0.02
) {
    private val numHashes: Int
    private val bitSize: Int
    private val bits: BitSet

    init {
        // Optimal parameters: m = -n*ln(p) / (ln(2))^2, k = (m/n)*ln(2)
        bitSize = (-capacity * Math.log(fpr) / (Math.log(2.0) * Math.log(2.0))).toInt()
            .coerceAtLeast(1024)
        numHashes = ((bitSize.toDouble() / capacity) * Math.log(2.0)).toInt()
            .coerceAtLeast(3)
        bits = BitSet(bitSize)
    }

    fun add(element: ByteArray) {
        val hashes = computeHashes(element)
        for (h in hashes) {
            bits.set(h)
        }
    }

    fun contains(element: ByteArray): Boolean {
        val hashes = computeHashes(element)
        return hashes.all { bits.get(it) }
    }

    fun size(): Int = bits.cardinality()

    fun clear() = bits.clear()

    /**
     * Serialize the Bloom filter for offline storage / upload.
     */
    fun serialize(): ByteArray {
        return bits.toByteArray()
    }

    companion object {
        fun deserialize(data: ByteArray, capacity: Int = 5000, fpr: Double = 0.02): BloomFilter {
            val filter = BloomFilter(capacity, fpr)
            // Directly replace the BitSet reference workaround
            val restored = java.util.BitSet.valueOf(data)
            for (i in 0 until filter.bitSize) {
                if (restored.get(i)) filter.bits.set(i)
            }
            return filter
        }
    }

    /**
     * Compute k hash values using double hashing: h(i) = (h1 + i*h2) mod m
     */
    private fun computeHashes(element: ByteArray): IntArray {
        val md = MessageDigest.getInstance("SHA-256")
        val digest = md.digest(element)

        // First 4 bytes → h1, next 4 bytes → h2
        var h1 = 0
        var h2 = 0
        for (i in 0 until 4) {
            h1 = (h1 shl 8) or (digest[i].toInt() and 0xFF)
            h2 = (h2 shl 8) or (digest[i + 4].toInt() and 0xFF)
        }

        // Ensure positive
        h1 = h1 and 0x7FFFFFFF
        h2 = h2 and 0x7FFFFFFF

        return IntArray(numHashes) { i ->
            ((h1 + i.toLong() * h2) % bitSize).toInt()
        }
    }
}
