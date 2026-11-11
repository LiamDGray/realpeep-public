package com.realpeep.app.cdma

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.sqrt

/**
 * Cross-correlation matched filter for CDMA code detection.
 *
 * Used by the offline verifier to detect Gold codes in raw audio/frame data.
 * On-device, this is NOT used at capture time (battery constraint) — only
 * by the verifier after upload.
 */
object MatchedFilter {

    data class CorrelationResult(
        val peak: Double,
        val offset: Int,        // Sample offset of the peak
        val confidence: Double  // Peak / (mean_noise + std_noise)
    )

    /**
     * Cross-correlate a signal against a known code.
     *
     * @param signal The received signal (raw audio samples or luminance series)
     * @param code The known Gold code sequence (+1/-1)
     * @return CorrelationResult with peak, offset, and confidence
     */
    fun correlate(signal: DoubleArray, code: IntArray): CorrelationResult {
        val n = signal.size
        val m = code.size
        require(n >= m) { "Signal length ($n) must be >= code length ($m)" }

        val correlation = DoubleArray(n - m + 1)
        var maxPeak = 0.0
        var maxOffset = 0

        for (i in 0 until n - m + 1) {
            var sum = 0.0
            for (j in 0 until m) {
                sum += signal[i + j] * code[j]
            }
            correlation[i] = abs(sum)
            if (abs(sum) > maxPeak) {
                maxPeak = abs(sum)
                maxOffset = i
            }
        }

        // Compute noise statistics for confidence
        val mean = correlation.average()
        val variance = correlation.map { (it - mean) * (it - mean) }.average()
        val stdDev = sqrt(max(variance, 1e-10))
        val confidence = if (stdDev > 0) maxPeak / (mean + stdDev) else maxPeak

        return CorrelationResult(
            peak = maxPeak,
            offset = maxOffset,
            confidence = confidence
        )
    }

    /**
     * Simple threshold-based detection.
     */
    fun isDetected(result: CorrelationResult, threshold: Double = 50.0): Boolean {
        return result.peak > threshold && result.confidence > 3.0
    }
}
