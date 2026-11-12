package com.realpeep.app

import com.realpeep.app.crypto.EphemeralKey
import com.realpeep.app.mesh.Beacon
import com.realpeep.app.mesh.ShortBeacon
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BeaconTest {

    private val nonce = ByteArray(16) { it.toByte() }
    private val meshId = byteArrayOf(1, 2, 3, 4)

    @Test
    fun `full beacon is 117 bytes and round-trips`() {
        val beacon = Beacon(
            publicKey = ByteArray(32) { it.toByte() },
            nonce = nonce,
            meshId = meshId,
            signature = ByteArray(64) { (it + 7).toByte() },
        )
        val encoded = Beacon.serialize(beacon)
        assertEquals(Beacon.TOTAL_BYTES, encoded.size)
        assertEquals(117, encoded.size)

        val decoded = Beacon.deserialize(encoded)
        assertNotNull(decoded)
        assertTrue(decoded!!.nonce.contentEquals(nonce))
        assertTrue(decoded.meshId.contentEquals(meshId))
    }

    @Test
    fun `short beacon is small enough for a legacy advertisement and round-trips`() {
        val tag = ShortBeacon.tagFor(ByteArray(32) { (it + 1).toByte() })
        val shortNonce = nonce.copyOfRange(0, 14)
        val beacon = ShortBeacon(nonce = shortNonce, meshId = meshId, deviceTag = tag)
        val encoded = ShortBeacon.serialize(beacon)
        assertEquals(ShortBeacon.TOTAL_BYTES, encoded.size)
        assertEquals(23, encoded.size)
        // 23 payload + 4 service-data AD + 4 UUID-list AD = 31 bytes.
        assertEquals(31, encoded.size + 4 + 4)

        val decoded = ShortBeacon.deserialize(encoded)
        assertNotNull(decoded)
        assertTrue(decoded!!.nonce.contentEquals(shortNonce))
        assertTrue(decoded.meshId.contentEquals(meshId))
        assertTrue(decoded.deviceTag.contentEquals(tag))
    }

    @Test
    fun `full beacon signature binds key nonce and mesh id`() {
        val keyPair = EphemeralKey.generate()
        val message = keyPair.publicKey + nonce + meshId
        val signature = EphemeralKey.sign(keyPair.privateKey, message)
        assertTrue(EphemeralKey.verify(keyPair.publicKey, message, signature))
        val tampered = message.copyOf().also { it[it.size - 1] = (it[it.size - 1] + 1).toByte() }
        assertFalse(EphemeralKey.verify(keyPair.publicKey, tampered, signature))
    }

    @Test
    fun `short beacon device tag is stable and key-dependent`() {
        val keyA = ByteArray(32) { it.toByte() }
        val keyB = ByteArray(32) { (it + 1).toByte() }
        assertEquals(4, ShortBeacon.tagFor(keyA).size)
        assertTrue(ShortBeacon.tagFor(keyA).contentEquals(ShortBeacon.tagFor(keyA)))
        assertFalse(ShortBeacon.tagFor(keyA).contentEquals(ShortBeacon.tagFor(keyB)))
    }

    @Test
    fun `short beacon rejects full beacon bytes`() {
        val full = Beacon(
            publicKey = ByteArray(32),
            nonce = nonce,
            meshId = meshId,
            signature = ByteArray(64),
        )
        assertNull(ShortBeacon.deserialize(Beacon.serialize(full)))
    }
}
