package com.realpeep.app

import com.realpeep.app.mesh.BloomFilter
import org.junit.Assert.*
import org.junit.Test
import java.security.SecureRandom

class BloomFilterTest {

    @Test
    fun `add and contains`() {
        val filter = BloomFilter(capacity = 1000, fpr = 0.01)
        val element = ByteArray(16)
        SecureRandom().nextBytes(element)

        assertFalse(filter.contains(element))
        filter.add(element)
        assertTrue(filter.contains(element))
    }

    @Test
    fun `no false negatives`() {
        val filter = BloomFilter(capacity = 1000, fpr = 0.01)
        val random = SecureRandom()

        val elements = List(100) {
            val e = ByteArray(16)
            random.nextBytes(e)
            e
        }

        elements.forEach { filter.add(it) }
        elements.forEach { assertTrue("Element should be present", filter.contains(it)) }
    }

    @Test
    fun `false positive rate within bounds`() {
        val filter = BloomFilter(capacity = 1000, fpr = 0.05)
        val random = SecureRandom()

        val inserted = List(200) {
            val e = ByteArray(16)
            random.nextBytes(e)
            e
        }
        inserted.forEach { filter.add(it) }

        var falsePositives = 0
        val testCount = 1000
        repeat(testCount) {
            val e = ByteArray(16)
            random.nextBytes(e)
            if (filter.contains(e)) falsePositives++
        }

        val actualFpr = falsePositives.toDouble() / testCount
        // Allow 3x the designed FPR (Bloom filters are probabilistic)
        assertTrue("FPR $actualFpr too high", actualFpr < 0.15)
    }

    @Test
    fun `serialize and deserialize`() {
        val filter = BloomFilter(capacity = 1000, fpr = 0.01)
        val element = ByteArray(16)
        SecureRandom().nextBytes(element)
        filter.add(element)
        assertTrue("Element should be in original filter", filter.contains(element))

        val serialized = filter.serialize()
        assertTrue("Serialized should not be empty", serialized.isNotEmpty())

        val restored = BloomFilter.deserialize(serialized, capacity = 1000, fpr = 0.01)
        assertTrue("Element should be in restored filter (serialized=${serialized.size}B)", restored.contains(element))
    }
}
