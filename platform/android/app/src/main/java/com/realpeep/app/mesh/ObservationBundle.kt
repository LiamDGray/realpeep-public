package com.realpeep.app.mesh

/**
 * An observation commitment: what device B observed during a recording window.
 *
 * Stored locally; uploaded to the verifier when connectivity returns.
 * The verifier reconstructs the N×N adjacency matrix from N unilateral bundles.
 */
data class ObservationBundle(
    val devicePublicKey: ByteArray,      // 32 bytes — this device's ephemeral pk
    val meshId: ByteArray,               // 4 bytes
    val observed: ByteArray,             // Serialized Bloom filter
    val numObserved: Int,                // Cardinality for verifier calibration
    val timestamp: Long,                 // Device's local clock (ms since epoch)
    val signature: ByteArray             // Ed25519 signature over (observed || timestamp || meshId)
)
