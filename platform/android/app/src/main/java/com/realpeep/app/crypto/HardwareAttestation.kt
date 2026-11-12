package com.realpeep.app.crypto

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import android.util.Base64
import android.util.Log
import java.security.KeyFactory
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.cert.CertificateFactory
import java.security.spec.ECGenParameterSpec
import java.io.ByteArrayInputStream

/**
 * A real Android Keystore attestation slice.
 *
 * This signs a canonical session payload with an EC P-256 key, preferring
 * StrongBox when available and falling back to TEE-backed/secure hardware.
 * It is a separate hardware signal; it does not replace the Ed25519 proof key
 * and is not bound in-circuit. The 4-digit PIN and demo TEE key remain demo
 * material.
 */
data class Attestation(
    val payload: ByteArray,
    val signature: ByteArray,
    val certificateChain: List<ByteArray>,
    val hardwareBacked: Boolean,
    val strongBox: Boolean,
) {
    fun certificateBase64(): String =
        if (certificateChain.isEmpty()) "" else Base64.encodeToString(certificateChain[0], Base64.NO_WRAP)

    fun signatureBase64(): String = Base64.encodeToString(signature, Base64.NO_WRAP)
}

class HardwareAttestationManager(
    private val alias: String = "realpeep_attestation_key",
) {
    companion object {
        private const val TAG = "RealPeep.Attestation"
        private const val LABEL = "RP-HW-ATTEST-v1"
    }

    private val keyStore: KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    @Synchronized
    fun attest(sessionId: String, ephemeralPublicKey: ByteArray, timestampMs: Long = System.currentTimeMillis()): Attestation {
        val keyPair = getOrCreateKeyPair()
        val payload = payloadFor(sessionId, ephemeralPublicKey, timestampMs)
        val signature = Signature.getInstance("SHA256withECDSA").run {
            initSign(keyPair.private)
            update(payload)
            sign()
        }
        val chain = keyStore.getCertificateChain(alias)?.map { it.encoded } ?: emptyList()
        val info = keyInfo(keyPair.private)
        return Attestation(
            payload = payload,
            signature = signature,
            certificateChain = chain,
            hardwareBacked = info?.isInsideSecureHardware == true,
            strongBox = isStrongBox(info),
        )
    }

    fun verify(attestation: Attestation): Boolean {
        val leaf = attestation.certificateChain.firstOrNull() ?: return false
        return try {
            val certificate = CertificateFactory.getInstance("X.509")
                .generateCertificate(ByteArrayInputStream(leaf))
            Signature.getInstance("SHA256withECDSA").run {
                initVerify(certificate.publicKey)
                update(attestation.payload)
                verify(attestation.signature)
            }
        } catch (error: Exception) {
            Log.w(TAG, "attestation verify failed: ${error.message}")
            false
        }
    }

    fun deleteKey() {
        if (keyStore.containsAlias(alias)) keyStore.deleteEntry(alias)
    }

    private fun getOrCreateKeyPair(): KeyPair {
        val existing = keyStore.getKey(alias, null) as? PrivateKey
        if (existing != null) {
            val certificate = keyStore.getCertificate(alias) ?: error("attestation certificate missing")
            return KeyPair(certificate.publicKey, existing)
        }

        val strongBox = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                generate(strongBox = true)
                true
            } catch (_: StrongBoxUnavailableException) {
                Log.i(TAG, "StrongBox unavailable; falling back to TEE/secure hardware")
                false
            } catch (_: Exception) {
                Log.i(TAG, "StrongBox key generation failed; falling back")
                false
            }
        } else {
            false
        }

        if (strongBox) {
            val key = keyStore.getKey(alias, null) as PrivateKey
            val certificate = keyStore.getCertificate(alias) ?: error("attestation certificate missing")
            return KeyPair(certificate.publicKey, key)
        }
        generate(strongBox = false)
        val key = keyStore.getKey(alias, null) as PrivateKey
        val certificate = keyStore.getCertificate(alias) ?: error("attestation certificate missing")
        return KeyPair(certificate.publicKey, key)
    }

    private fun generate(strongBox: Boolean) {
        val builder = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
            .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
            .setUserAuthenticationRequired(false)
        if (strongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            builder.setIsStrongBoxBacked(true)
        }
        val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
        generator.initialize(builder.build())
        generator.generateKeyPair()
    }

    private fun keyInfo(privateKey: PrivateKey): KeyInfo? =
        try {
            KeyFactory.getInstance(privateKey.algorithm, "AndroidKeyStore")
                .getKeySpec(privateKey, KeyInfo::class.java)
        } catch (_: Exception) {
            null
        }

    private fun isStrongBox(info: KeyInfo?): Boolean {
        if (info == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return false
        return info.securityLevel == KeyProperties.SECURITY_LEVEL_STRONGBOX
    }

    private fun payloadFor(sessionId: String, publicKey: ByteArray, timestampMs: Long): ByteArray {
        val digest = java.security.MessageDigest.getInstance("SHA-256")
        digest.update(LABEL.toByteArray())
        digest.update(sessionId.toByteArray())
        digest.update(byteArrayOf(0))
        digest.update(publicKey)
        digest.update(byteArrayOf(0))
        digest.update(timestampMs.toString().toByteArray())
        return digest.digest()
    }
}
