package com.realpeep.app.crypto

/**
 * Thin JNI bridge to the Rust `realpeep-core` library.
 *
 * The library is optional: if it cannot be loaded (for example on an ABI not
 * packaged), HashChain falls back to the Kotlin implementation.
 */
object NativeCore {
    // Do not log here: this object is initialized by plain JVM unit tests too,
    // where android.util.Log is not available.
    val available: Boolean = try {
        System.loadLibrary("realpeep_core")
        true
    } catch (_: UnsatisfiedLinkError) {
        false
    }

    external fun sha256(data: ByteArray): ByteArray
    external fun frameHash(previous: ByteArray, frame: ByteArray): ByteArray
    external fun merkleRoot(leaves: Array<ByteArray>): ByteArray
}
