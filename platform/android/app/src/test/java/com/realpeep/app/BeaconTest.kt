package com.realpeep.app

import com.realpeep.app.mesh.Beacon
import com.realpeep.app.mesh.ShortBeacon
import org.junit.Assert.assertEquals
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
        val beacon = ShortBeacon(nonce = nonce, meshId = meshId)
        val encoded = ShortBeacon.serialize(beacon)
        assertEquals(ShortBeacon.TOTAL_BYTES, encoded.size)
        assertEquals(21, encoded.size)
        // 21 bytes of service data + 2-byte service UUID + 3-byte flags fits 31.
        assertTrue(encoded.size + 2 + 3 <= 31)

        val decoded = ShortBeacon.deserialize(encoded)
        assertNotNull(decoded)
        assertTrue(decoded!!.nonce.contentEquals(nonce))
        assertTrue(decoded.meshId.contentEquals(meshId))
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
