package com.realpeep.app

import com.realpeep.app.cdma.GoldCodeGenerator
import org.junit.Assert.*
import org.junit.Test
import kotlin.math.abs

class GoldCodeGeneratorTest {

    @Test
    fun `generates valid code length`() {
        val gen = GoldCodeGenerator()
        val code = gen.generate(codeIdx = 1, spreadingFactor = 128)
        assertEquals(128, code.size)
    }

    @Test
    fun `chips are +1 or -1`() {
        val gen = GoldCodeGenerator()
        val code = gen.generate(codeIdx = 5, spreadingFactor = 256)
        code.forEach { chip ->
            assertTrue("Chip should be +1 or -1, got $chip", chip == 1 || chip == -1)
        }
    }

    @Test
    fun `different codes are different`() {
        val gen = GoldCodeGenerator()
        val code1 = gen.generate(codeIdx = 1, spreadingFactor = 128)
        val code2 = gen.generate(codeIdx = 2, spreadingFactor = 128)
        assertFalse(code1.contentEquals(code2))
    }

    @Test
    fun `auto-correlation peak exceeds cross-correlation`() {
        val gen = GoldCodeGenerator()
        val sf = 128
        val code1 = gen.generate(codeIdx = 10, spreadingFactor = sf)
        val code2 = gen.generate(codeIdx = 20, spreadingFactor = sf)

        // Auto-correlation at lag 0
        var autoCorr = 0
        for (i in 0 until sf) {
            autoCorr += code1[i] * code1[i]
        }
        assertEquals(sf.toDouble(), autoCorr.toDouble(), 0.0)

        // Cross-correlation at lag 0
        var crossCorr = 0
        for (i in 0 until sf) {
            crossCorr += code1[i] * code2[i]
        }
        // Cross-correlation should be bounded
        assertTrue("Cross-correlation ${abs(crossCorr)} should be bounded",
            abs(crossCorr) < sf)
    }

    @Test
    fun `code index from seed is deterministic`() {
        val gen = GoldCodeGenerator()
        val idx1 = gen.codeIndexFromSeed(0x12345678)
        val idx2 = gen.codeIndexFromSeed(0x12345678)
        assertEquals(idx1, idx2)
    }
}
