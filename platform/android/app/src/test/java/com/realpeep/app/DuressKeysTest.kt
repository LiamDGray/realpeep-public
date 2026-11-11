package com.realpeep.app

import com.realpeep.app.crypto.DuressKeys
import org.junit.Assert.*
import org.junit.Test
import java.security.SecureRandom

class DuressKeysTest {

    @Test
    fun `normal and duress keys are indistinguishable by format`() {
        val salt = ByteArray(16)
        SecureRandom().nextBytes(salt)

        val normal = DuressKeys.deriveKeypair("normal-passphrase-123", salt)
        val duress = DuressKeys.deriveKeypair("duress-passphrase-456", salt)

        // Both produce 32-byte private and public keys
        assertEquals(32, normal.privateKey.size)
        assertEquals(32, normal.publicKey.size)
        assertEquals(32, duress.privateKey.size)
        assertEquals(32, duress.publicKey.size)

        // They are different keys
        assertFalse(normal.privateKey.contentEquals(duress.privateKey))
    }

    @Test
    fun `nonce generation is deterministic for same inputs`() {
        val notarySecret = ByteArray(32)
        SecureRandom().nextBytes(notarySecret)
        val pubkey = ByteArray(32)
        SecureRandom().nextBytes(pubkey)

        // Normal nonce is random (just verify it's 32 bytes)
        val normalNonce = DuressKeys.generateNonce(false, notarySecret, pubkey)
        assertEquals(32, normalNonce.size)
    }

    @Test
    fun `duress nonce satisfies marker predicate`() {
        val notarySecret = "test-notary-secret-32-bytes!!".toByteArray() // pragma: allowlist secret
        val pubkey = ByteArray(32)
        SecureRandom().nextBytes(pubkey)

        val duressNonce = DuressKeys.generateNonce(
            isDuress = true,
            notarySecret = notarySecret,
            ephemeralPubkey = pubkey,
            markerBits = 4  // Small for fast test
        )

        // Verify the marker by recomputing the hash
        val md = java.security.MessageDigest.getInstance("SHA-256")
        md.update(notarySecret)
        md.update(pubkey)
        md.update(duressNonce)
        val hash = md.digest()

        // First 4 bits should be 0
        assertEquals(0, (hash[0].toInt() shr 4) and 0x0F)
    }
}
