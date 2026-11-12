package com.realpeep.app.mesh

/**
 * A short, legacy-advertisement-safe presence beacon.
 *
 * The full [Beacon] is 117 bytes and requires BLE extended advertising. Some
 * controllers (notably older Android 10 devices) do not support extended
 * advertising, and the legacy API limit is 31 bytes. This 21-byte fallback
 * carries only the nonce and mesh id:
 *
 *   type       : 1 byte  (0x02 = short presence)
 *   nonce      : 14 bytes
 *   mesh_id    : 4 bytes
 *   device_tag : 4 bytes (truncated SHA-256 of the session public key)
 *   total      : 23 bytes
 *
 * It intentionally has no public key or signature. The scanner signs its own
 * observation bundle; this short beacon is only a presence trigger and must not
 * be treated as a signed attestation. The full signed beacon is used whenever
 * extended advertising is available.
 */
data class ShortBeacon(
    val nonce: ByteArray,
    val meshId: ByteArray,
    val deviceTag: ByteArray,
) {
    companion object {
        const val BEACON_TYPE: Byte = 0x02
        const val TOTAL_BYTES: Int = 23

        /** Stable 4-byte device identifier; the nonce rotates, this does not. */
        fun tagFor(publicKey: ByteArray): ByteArray =
            java.security.MessageDigest.getInstance("SHA-256")
                .digest(publicKey)
                .copyOfRange(0, 4)

        fun serialize(beacon: ShortBeacon): ByteArray {
            require(beacon.nonce.size == 14) { "nonce must be 14 bytes" }
            require(beacon.meshId.size == 4) { "meshId must be 4 bytes" }
            require(beacon.deviceTag.size == 4) { "deviceTag must be 4 bytes" }
            val buf = ByteArray(TOTAL_BYTES)
            buf[0] = BEACON_TYPE
            System.arraycopy(beacon.nonce, 0, buf, 1, 14)
            System.arraycopy(beacon.meshId, 0, buf, 15, 4)
            System.arraycopy(beacon.deviceTag, 0, buf, 19, 4)
            return buf
        }

        fun deserialize(data: ByteArray): ShortBeacon? {
            if (data.size < TOTAL_BYTES || data[0] != BEACON_TYPE) return null
            return ShortBeacon(
                nonce = data.copyOfRange(1, 15),
                meshId = data.copyOfRange(15, 19),
                deviceTag = data.copyOfRange(19, 23),
            )
        }
    }
}
