package com.realpeep.app.cdma

/**
 * Generates Gold codes from two maximal-length LFSRs with preferred-pair polynomials.
 *
 * Default polynomials (n=7):
 *   poly1 = 0x83  (x^7 + x + 1)
 *   poly2 = 0x89  (x^7 + x^3 + 1)
 *
 * Produces 2^n + 1 = 129 codes in the n=7 Gold family.
 */
class GoldCodeGenerator(
    private val poly1: Int = DEFAULT_POLY1,
    private val poly2: Int = DEFAULT_POLY2
) {
    companion object {
        const val DEFAULT_POLY1 = 0x83
        const val DEFAULT_POLY2 = 0x89
        const val MAX_CODES_N7 = (1 shl 7) + 1  // 129
    }

    private val degree = 32 - poly1.countLeadingZeroBits() - 1

    /**
     * Generate a single Gold code.
     *
     * @param codeIdx Index into the Gold family (0..2^n)
     * @param chipDelay Phase offset for the second LFSR
     * @param spreadingFactor Number of chips per bit
     * @return Array of 1 and -1 values representing the spreading code
     */
    fun generate(codeIdx: Int, chipDelay: Int = 0, spreadingFactor: Int): IntArray {
        require(spreadingFactor > 0) { "Spreading factor must be positive" }

        // Seed LFSR1 at fixed position
        val lfsr1 = Lfsr(poly1, 1)
        // Seed LFSR2 at codeIdx position
        val lfsr2 = Lfsr(poly2, codeIdx.coerceIn(1, (1 shl degree) - 1))

        // Apply chip delay
        repeat(chipDelay) {
            lfsr1.next()
            lfsr2.next()
        }

        return IntArray(spreadingFactor) {
            val chip = lfsr1.next() xor lfsr2.next()
            if (chip == 0) 1 else -1  // Map {0,1} → {+1,-1}
        }
    }

    /**
     * Generate a code sequence for multiple bits.
     */
    fun generateSequence(codeIdx: Int, bits: Int, spreadingFactor: Int): IntArray {
        val code = generate(codeIdx, 0, spreadingFactor)
        val sequence = IntArray(bits * spreadingFactor)
        for (i in 0 until bits) {
            System.arraycopy(code, 0, sequence, i * spreadingFactor, spreadingFactor)
        }
        return sequence
    }

    /**
     * Deterministic code index from a seed (e.g., from public key hash).
     */
    fun codeIndexFromSeed(seed: Int): Int {
        return (seed and 0x7FFFFFFF) % MAX_CODES_N7 + 1  // 1..129
    }
}
