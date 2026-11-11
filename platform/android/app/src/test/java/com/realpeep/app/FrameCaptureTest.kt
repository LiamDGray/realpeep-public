package com.realpeep.app

import com.realpeep.app.crypto.HashChain
import org.junit.Assert.*
import org.junit.Test
import java.security.MessageDigest

/**
 * Tests for FrameCaptureService — the non-Android-dependent logic:
 * frame data hashing via HashChain.
 *
 * The CameraX integration (PreviewView, ImageAnalysis) requires
 * Android instrumentation tests; the hashing logic is unit-testable.
 */
class FrameCaptureTest {

    @Test
    fun `frame hash is SHA-256 of previous hash concatenated with frame data`() {
        val chain = HashChain()
        val md = MessageDigest.getInstance("SHA-256")

        val frameData = ByteArray(1920 * 1080 * 3)  // Uncompressed RGB frame
        java.security.SecureRandom().nextBytes(frameData)

        val hash = chain.append(frameData)

        assertEquals(32, hash.size)
        assertFalse(hash.all { it == 0.toByte() })

        // Verify the hash matches manual computation
        val genesisHash = ByteArray(32)
        md.reset()
        md.update(genesisHash)
        md.update(frameData)
        val expected = md.digest()
        assertArrayEquals(expected, hash)
    }

    @Test
    fun `chain of 100 frames builds valid merkle root`() {
        val chain = HashChain()
        val frameData = ByteArray(640 * 480 * 3)  // VGA frame

        repeat(100) { i ->
            val data = frameData.copyOf()
            data[0] = (i and 0xFF).toByte()  // Make each frame slightly different
            chain.append(data)
        }

        assertEquals(100, chain.frameCount)

        val root = chain.buildMerkleRoot()
        assertEquals(32, root.size)
        assertFalse(root.all { it == 0.toByte() })
    }

    @Test
    fun `frame hash chain is tamper-evident`() {
        val chain = HashChain()
        val frameData = "original-frame".toByteArray()

        val originalHash = chain.append(frameData)

        // Tampered data
        val tamperedData = "tampered-frame".toByteArray()
        val tamperedChain = HashChain()
        val tamperedHash = tamperedChain.append(tamperedData)

        assertFalse(originalHash.contentEquals(tamperedHash))
    }

    @Test
    fun `empty frame data produces valid hash`() {
        val chain = HashChain()
        val hash = chain.append(ByteArray(0))

        assertEquals(32, hash.size)
        assertFalse(hash.all { it == 0.toByte() })
    }

    @Test
    fun `merkle root changes when any frame changes`() {
        val frames = listOf(
            "a".toByteArray(), "b".toByteArray(), "c".toByteArray()
        )

        val chain1 = HashChain()
        frames.forEach { chain1.append(it) }
        val root1 = chain1.buildMerkleRoot()

        // Change middle frame
        val chain2 = HashChain()
        chain2.append("a".toByteArray())
        chain2.append("x".toByteArray())  // changed
        chain2.append("c".toByteArray())
        val root2 = chain2.buildMerkleRoot()

        assertFalse(root1.contentEquals(root2))
    }
}
