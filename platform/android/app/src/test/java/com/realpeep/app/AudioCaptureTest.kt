package com.realpeep.app

import com.realpeep.app.audio.AudioRecorder
import com.realpeep.app.crypto.HashChain
import org.junit.Assert.*
import org.junit.Test
import java.security.MessageDigest

/**
 * Tests for AudioRecorder hashing logic.
 *
 * Audio is captured at 44.1kHz, mono, 16-bit PCM.
 * Chunks are hashed via HashChain (same chain as frames).
 * The hashing logic is unit-testable without AudioRecord.
 */
class AudioCaptureTest {

    @Test
    fun `audio chunk hash uses SHA-256`() {
        val chunk = ByteArray(44100 * 2)  // 1 second of 16-bit mono PCM
        java.security.SecureRandom().nextBytes(chunk)

        val md = MessageDigest.getInstance("SHA-256")
        val hash = md.digest(chunk)

        assertEquals(32, hash.size)
    }

    @Test
    fun `audio chunks chained in HashChain produce valid chain`() {
        val chain = HashChain()
        val chunkSize = 4410  // 100ms of 44.1kHz 16-bit mono

        repeat(10) { i ->
            val chunk = ByteArray(chunkSize)
            chunk[0] = (i and 0xFF).toByte()
            chain.append(chunk)
        }

        assertEquals(10, chain.frameCount)
        val root = chain.buildMerkleRoot()
        assertEquals(32, root.size)
    }

    @Test
    fun `audio chain and video chain are independent`() {
        val audioChain = HashChain()
        val videoChain = HashChain()

        val audioChunk = ByteArray(4410)
        java.security.SecureRandom().nextBytes(audioChunk)
        val videoFrame = ByteArray(1920 * 1080 * 3)
        java.security.SecureRandom().nextBytes(videoFrame)

        val audioHash = audioChain.append(audioChunk)
        val videoHash = videoChain.append(videoFrame)

        assertFalse(audioHash.contentEquals(videoHash))
    }

    @Test
    fun `AudioRecorder chunk constant is 100ms of 44kHz mono 16-bit`() {
        // Regression: integer division (100 / 1000) previously produced 0 bytes,
        // so AudioRecord.read(buffer, 0, 0) never advanced the audio hash chain.
        assertEquals(8820, AudioRecorder.CHUNK_SIZE_BYTES)
    }

    @Test
    fun `44kHz mono 16-bit chunk size is correct`() {
        // 100ms at 44.1kHz, mono, 16-bit
        val sampleRate = 44100
        val durationMs = 100
        val bytesPerSample = 2  // 16-bit
        val channels = 1

        val expectedSize = sampleRate * durationMs / 1000 * bytesPerSample * channels
        assertEquals(8820, expectedSize)
    }

    @Test
    fun `multiple audio chunks generate merkle root`() {
        val chain = HashChain()

        // Simulate 10 seconds of audio in 100ms chunks
        repeat(100) {
            val chunk = ByteArray(8820)  // 100ms 44.1kHz mono 16-bit
            java.security.SecureRandom().nextBytes(chunk)
            chain.append(chunk)
        }

        assertEquals(100, chain.frameCount)

        val merkleRoot = chain.buildMerkleRoot()
        assertEquals(32, merkleRoot.size)
        assertFalse(merkleRoot.all { it == 0.toByte() })
    }

    @Test
    fun `silent audio chunk produces valid hash`() {
        val chain = HashChain()
        val silentChunk = ByteArray(8820)  // All zeros = silence
        val hash = chain.append(silentChunk)

        assertEquals(32, hash.size)
        assertFalse(hash.all { it == 0.toByte() })

        // A second silent chunk should have a different hash
        val hash2 = chain.append(silentChunk)
        assertFalse(hash.contentEquals(hash2))
    }
}
