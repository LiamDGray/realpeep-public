package com.realpeep.app.crypto

import com.realpeep.app.model.EphemeralKeyPair
import java.security.MessageDigest
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/**
 * Phase 3a: Duress Key Derivation.
 *
 * Both normal and duress passphrases derive indistinguishable Ed25519 keypairs
 * via PBKDF2-HMAC-SHA256 with 100k iterations.
 *
 * The duress nonce satisfies a notary-known predicate (first k bits of
 * SHA-256(notarySecret || ephemeralPubkey || nonce) == 0), enabling silent
 * detection without visible flagging.
 */
object DuressKeys {

    private const val ITERATIONS = 100_000
    private const val KEY_LENGTH = 256 // bits
    private const val DEFAULT_MARKER_BITS = 8

    /**
     * Derive an Ed25519 keypair from a passphrase via PBKDF2-HMAC-SHA256.
     */
    fun deriveKeypair(
        passphrase: String,
        salt: ByteArray,
        iterations: Int = ITERATIONS
    ): EphemeralKeyPair {
        val spec = PBEKeySpec(passphrase.toCharArray(), salt, iterations, KEY_LENGTH)
        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        val seed = factory.generateSecret(spec).encoded
        return EphemeralKey.fromSeed(seed)
    }

    /**
     * Generate a nonce. For duress mode, searches for a nonce satisfying the notary's
     * predicate. Expected trials: 2^markerBits (256 for markerBits=8).
     */
    fun generateNonce(
        isDuress: Boolean,
        notarySecret: ByteArray,
        ephemeralPubkey: ByteArray,
        markerBits: Int = DEFAULT_MARKER_BITS
    ): ByteArray {
        if (!isDuress) {
            return ByteArray(32).also { java.security.SecureRandom().nextBytes(it) }
        }

        val md = MessageDigest.getInstance("SHA-256")
        val nonce = ByteArray(32)
        val random = java.security.SecureRandom()
        var attempts = 0

        while (attempts < 1_000_000) {
            random.nextBytes(nonce)
            md.reset()
            md.update(notarySecret)
            md.update(ephemeralPubkey)
            md.update(nonce)
            val hash = md.digest()

            if (checkMarkerBits(hash, markerBits)) {
                return nonce
            }
            attempts++
        }
        throw IllegalStateException("Failed to find duress nonce after $attempts attempts")
    }

    /**
     * Check if the first k bits of the hash are all zero (the duress marker).
     */
    private fun checkMarkerBits(hash: ByteArray, bits: Int): Boolean {
        var remaining = bits
        for (byte in hash) {
            if (remaining >= 8) {
                if (byte.toInt() != 0) return false
                remaining -= 8
            } else {
                val mask = (0xFF shl (8 - remaining)) and 0xFF
                return (byte.toInt() and mask) == 0
            }
        }
        return true
    }
}
