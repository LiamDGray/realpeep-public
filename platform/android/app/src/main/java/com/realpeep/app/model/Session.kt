package com.realpeep.app.model

import java.util.UUID

/**
 * A recording session. All state is ephemeral — nothing persists across sessions.
 */
data class Session(
    val sessionId: String = UUID.randomUUID().toString(),
    val meshId: ByteArray,              // SHA-256 of video seed, truncated to 4 bytes
    val ephemeralKeyPair: EphemeralKeyPair,
    val startedAt: Long = System.currentTimeMillis(),
    var endedAt: Long? = null,
    var meshDeviceCount: Int = 0,
    var frameCount: Int = 0,
    var isDuress: Boolean = false,
)

/**
 * Ephemeral Ed25519 keypair — generated fresh per session, never linked to device identity.
 */
data class EphemeralKeyPair(
    val privateKey: ByteArray,  // 32 bytes
    val publicKey: ByteArray,   // 32 bytes
)
