package com.realpeep.app.cdma

/**
 * Galois-configuration Linear Feedback Shift Register.
 *
 * Generates a pseudo-random bit sequence defined by a primitive polynomial.
 * Ported from realpeep/cdma_mesh.py.
 */
class Lfsr(
    private val polynomial: Int,
    initialSeed: Int = 1
) {
    val degree: Int = polynomial.countLeadingZeroBits().let { 32 - it } - 1

    private var state: Int

    init {
        require(initialSeed != 0) { "LFSR initial state must be non-zero" }
        state = initialSeed and ((1 shl degree) - 1)
    }

    /** Return the next output bit (0 or 1). */
    fun next(): Int {
        val bit = state and 1
        state = state shr 1
        if (bit != 0) {
            state = state xor (polynomial shr 1)
        }
        return bit
    }
}
