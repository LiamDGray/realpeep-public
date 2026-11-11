package com.realpeep.app.mesh

/**
 * A RealPeep BLE presence beacon.
 *
 * All fields are session-ephemeral. No field links to device identity.
 *
 * Wire format (68 bytes):
 *   type       : 1 byte  (0x01 = presence)
 *   pk         : 32 bytes (ephemeral Ed25519 public key)
 *   nonce      : 16 bytes (random per beacon)
 *   mesh_id    : 4 bytes  (truncated SHA-256 of video seed)
 *   signature  : 64 bytes (Ed25519 signature over pk || nonce || mesh_id)
 *   Total      : 117 bytes — fits in a single BLE extended advertisement (≤255 bytes)
 *
 * The actual BLE advertisement also includes a well-known 16-bit Service UUID
 * and the service data containing the beacon bytes above. The random MAC address
 * in the BLE header is handled by the OS (Android 8+ / iOS 7+).
 */
data class Beacon(
    val publicKey: ByteArray,     // 32 bytes
    val nonce: ByteArray,         // 16 bytes
    val meshId: ByteArray,        // 4 bytes
    val signature: ByteArray      // 64 bytes
) {
    companion object {
        const val BEACON_TYPE: Byte = 0x01
        const val TOTAL_BYTES: Int = 117  // 1 + 32 + 16 + 4 + 64

        /**
         * Serialize beacon to byte array for BLE advertisement service data.
         */
        fun serialize(beacon: Beacon): ByteArray {
            val buf = ByteArray(TOTAL_BYTES)
            buf[0] = BEACON_TYPE
            System.arraycopy(beacon.publicKey, 0, buf, 1, 32)
            System.arraycopy(beacon.nonce, 0, buf, 33, 16)
            System.arraycopy(beacon.meshId, 0, buf, 49, 4)
            System.arraycopy(beacon.signature, 0, buf, 53, 64)
            return buf
        }

        /**
         * Deserialize beacon from BLE advertisement service data.
         * Returns null if the data is malformed.
         */
        fun deserialize(data: ByteArray): Beacon? {
            if (data.size < TOTAL_BYTES || data[0] != BEACON_TYPE) return null
            return Beacon(
                publicKey = data.copyOfRange(1, 33),
                nonce = data.copyOfRange(33, 49),
                meshId = data.copyOfRange(49, 53),
                signature = data.copyOfRange(53, 117)
            )
        }
    }
}
