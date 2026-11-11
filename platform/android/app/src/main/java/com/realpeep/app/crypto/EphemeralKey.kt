package com.realpeep.app.crypto

import com.realpeep.app.model.EphemeralKeyPair
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer
import java.security.SecureRandom

/**
 * Generates ephemeral Ed25519 keypairs using BouncyCastle.
 * Compatible with Android 10+ (API 29+).
 */
object EphemeralKey {

    private val secureRandom = SecureRandom()

    fun generate(): EphemeralKeyPair {
        val seed = ByteArray(32)
        secureRandom.nextBytes(seed)

        val privateKeyParams = Ed25519PrivateKeyParameters(seed, 0)
        val publicKeyParams = privateKeyParams.generatePublicKey()

        return EphemeralKeyPair(
            privateKey = privateKeyParams.encoded,
            publicKey = publicKeyParams.encoded
        )
    }

    /**
     * Deterministically derive keypair from seed (for duress/normal passphrase derivation).
     */
    fun fromSeed(seed: ByteArray): EphemeralKeyPair {
        require(seed.size == 32) { "Seed must be 32 bytes" }
        val privateKeyParams = Ed25519PrivateKeyParameters(seed, 0)
        val publicKeyParams = privateKeyParams.generatePublicKey()
        return EphemeralKeyPair(
            privateKey = privateKeyParams.encoded,
            publicKey = publicKeyParams.encoded
        )
    }

    fun sign(privateKey: ByteArray, message: ByteArray): ByteArray {
        val params = Ed25519PrivateKeyParameters(privateKey, 0)
        val signer = Ed25519Signer()
        signer.init(true, params)
        signer.update(message, 0, message.size)
        return signer.generateSignature()
    }

    fun verify(publicKey: ByteArray, message: ByteArray, signature: ByteArray): Boolean {
        val params = Ed25519PublicKeyParameters(publicKey, 0)
        val signer = Ed25519Signer()
        signer.init(false, params)
        signer.update(message, 0, message.size)
        return signer.verifySignature(signature)
    }
}
