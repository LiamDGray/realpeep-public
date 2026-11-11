package com.realpeep.app

import com.realpeep.app.crypto.HashChain
import org.junit.Assert.*
import org.junit.Test
import java.security.MessageDigest

class HashChainTest {

    @Test
    fun `appending frame produces non-zero hash`() {
        val chain = HashChain()
        val frameData = ByteArray(1024)
        java.security.SecureRandom().nextBytes(frameData)

        val hash = chain.append(frameData)
        assertEquals(32, hash.size)
        // Should not be all zeros
        assertFalse(hash.all { it == 0.toByte() })
    }

    @Test
    fun `sequential frames produce different hashes`() {
        val chain = HashChain()
        val frame1 = "frame1".toByteArray()
        val frame2 = "frame2".toByteArray()

        val hash1 = chain.append(frame1)
        val hash2 = chain.append(frame2)

        assertFalse(hash1.contentEquals(hash2))
    }

    @Test
    fun `same frame data in different positions produces different hashes`() {
        val chain = HashChain()
        val frameData = "same-data".toByteArray()

        val hash1 = chain.append(frameData)
        val hash2 = chain.append(frameData)

        // Different because previous hash differs
        assertFalse(hash1.contentEquals(hash2))
    }

    @Test
    fun `frame count increments correctly`() {
        val chain = HashChain()
        assertEquals(0, chain.frameCount)

        chain.append(ByteArray(64))
        assertEquals(1, chain.frameCount)

        chain.append(ByteArray(64))
        chain.append(ByteArray(64))
        assertEquals(3, chain.frameCount)
    }

    @Test
    fun `hash chain is deterministic for same inputs`() {
        val chain1 = HashChain()
        val chain2 = HashChain()
        val data = "deterministic-test".toByteArray()

        val h1 = chain1.append(data)
        val h2 = chain2.append(data)

        assertArrayEquals(h1, h2)
    }

    @Test
    fun `merkle root of empty chain is all zeros`() {
        val chain = HashChain()
        val root = chain.buildMerkleRoot()
        assertEquals(32, root.size)
        assertArrayEquals(ByteArray(32), root)
    }

    @Test
    fun `merkle root of single frame equals that frame hash`() {
        val chain = HashChain()
        val data = ByteArray(256)
        java.security.SecureRandom().nextBytes(data)

        val frameHash = chain.append(data)
        val root = chain.buildMerkleRoot()

        assertArrayEquals(frameHash, root)
    }

    @Test
    fun `merkle root computed deterministically from multiple frames`() {
        val data = listOf(
            "frame-a".toByteArray(),
            "frame-b".toByteArray(),
            "frame-c".toByteArray(),
            "frame-d".toByteArray()
        )

        val chain1 = HashChain()
        data.forEach { chain1.append(it) }
        val root1 = chain1.buildMerkleRoot()

        val chain2 = HashChain()
        data.forEach { chain2.append(it) }
        val root2 = chain2.buildMerkleRoot()

        assertArrayEquals(root1, root2)
    }

    @Test
    fun `reset clears all state`() {
        val chain = HashChain()
        chain.append("data".toByteArray())
        chain.append("more".toByteArray())
        assertEquals(2, chain.frameCount)

        chain.reset()
        assertEquals(0, chain.frameCount)

        val root = chain.buildMerkleRoot()
        assertArrayEquals(ByteArray(32), root)

        // New frame after reset should start fresh
        val newHash = chain.append("new-data".toByteArray())
        val expectedChain = HashChain()
        val expectedHash = expectedChain.append("new-data".toByteArray())
        assertArrayEquals(expectedHash, newHash)
    }

    @Test
    fun `append verifies chain integrity via previous hash`() {
        val chain = HashChain()
        val md = MessageDigest.getInstance("SHA-256")

        val frame1 = "integrity-1".toByteArray()
        val hash1 = chain.append(frame1)

        // Manually compute what hash2 should be
        md.reset()
        md.update(hash1)
        md.update("integrity-2".toByteArray())
        val expectedHash2 = md.digest()

        val hash2 = chain.append("integrity-2".toByteArray())
        assertArrayEquals(expectedHash2, hash2)
    }
}
