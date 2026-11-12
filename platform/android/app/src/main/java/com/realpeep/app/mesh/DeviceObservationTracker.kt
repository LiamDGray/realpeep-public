package com.realpeep.app.mesh

/**
 * Counts distinct peers by stable identity, not by rotating nonces.
 *
 * Full beacons use the session public key; short beacons use a 4-byte device
 * tag. The nonce is deliberately not an identity.
 */
class DeviceObservationTracker {
    private val ids = mutableSetOf<String>()

    val count: Int get() = ids.size

    /** Returns true if this is a new device. */
    fun observe(deviceId: String): Boolean = ids.add(deviceId)

    fun clear() {
        ids.clear()
    }
}
