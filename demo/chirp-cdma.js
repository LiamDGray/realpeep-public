/**
 * chirp-cdma.js — Chirp-based CDMA for acoustic mesh consensus.
 *
 * Linear chirps (LoRa-style) with Gold code phase modulation.
 * De-chirping maps time delays to frequency bins, making multipath
 * separation natural. O(N log N) via FFT — faster than time-domain
 * Gold code correlation and more robust in reverberant rooms.
 *
 * Node-testable — no DOM, no side effects, ES module exports.
 *
 * References:
 *   Rou et al., "The Resurrection of Spectrum Spreading for 6G and
 *   Beyond: From Sinusoids to Chirps," arXiv:2605.00249, 2026.
 */

// ── Constants ─────────────────────────────────────────────────────

const SAMPLE_RATE = 44100;
const SPEED_OF_SOUND = 343.0;

// ── Chirp Generation ──────────────────────────────────────────────

/**
 * Generate a linear chirp signal.
 *
 * A linear chirp sweeps frequency from f0 to f1 over duration T.
 * The instantaneous phase is φ(t) = 2π(f0·t + (f1-f0)·t²/(2T)).
 *
 * @param {number} f0 - Start frequency (Hz)
 * @param {number} f1 - End frequency (Hz)
 * @param {number} duration - Duration in seconds
 * @param {number} [sampleRate=44100] - Sample rate
 * @returns {Float32Array} Complex chirp samples (real + imag interleaved)
 */
export function generateChirp(f0, f1, duration, sampleRate = SAMPLE_RATE) {
    const N = Math.floor(duration * sampleRate);
    const chirp = new Float32Array(N * 2); // interleaved complex
    const k = (f1 - f0) / duration; // chirp rate (Hz/s)

    for (let i = 0; i < N; i++) {
        const t = i / sampleRate;
        const phase = 2 * Math.PI * (f0 * t + 0.5 * k * t * t);
        chirp[i * 2] = Math.cos(phase);     // real (I)
        chirp[i * 2 + 1] = Math.sin(phase); // imag (Q)
    }
    return chirp;
}

/**
 * Generate the conjugate (time-reversed frequency sweep) of a chirp.
 * Used for de-chirping: multiplying received signal by conjugate chirp
 * converts time delays to constant-frequency tones.
 *
 * @param {number} f0 - Start frequency of the original chirp
 * @param {number} f1 - End frequency of the original chirp
 * @param {number} duration - Duration in seconds
 * @param {number} [sampleRate=44100]
 * @returns {Float32Array} Conjugate chirp (complex interleaved)
 */
export function generateConjugateChirp(f0, f1, duration, sampleRate = SAMPLE_RATE) {
    const N = Math.floor(duration * sampleRate);
    const chirp = new Float32Array(N * 2);
    const k = (f1 - f0) / duration;

    for (let i = 0; i < N; i++) {
        const t = i / sampleRate;
        const phase = 2 * Math.PI * (f0 * t + 0.5 * k * t * t);
        chirp[i * 2] = Math.cos(phase);      // real (I)
        chirp[i * 2 + 1] = -Math.sin(phase); // imag (-Q) = conjugate
    }
    return chirp;
}

// ── Chirp CDMA Modulation ─────────────────────────────────────────

/**
 * Modulate a Gold code onto a chirp carrier using BPSK.
 *
 * Each Gold code chip (+1 or -1) phase-modulates the chirp:
 *   signal[t] = chip[floor(t/T_chip)] × chirp[t]
 *
 * The resulting signal carries the code in the chirp's phase.
 *
 * @param {Int8Array} goldCode - Bipolar Gold code (+1/-1)
 * @param {number} f0 - Chirp start frequency (Hz)
 * @param {number} f1 - Chirp end frequency (Hz)
 * @param {number} chirpDuration - Duration of one full chirp in seconds
 * @param {number} [sampleRate=44100]
 * @returns {Float32Array} Real-valued audio signal (mono, [-1, 1])
 */
export function modulateChirpCDMA(goldCode, f0, f1, chirpDuration, sampleRate = SAMPLE_RATE) {
    const N = Math.floor(chirpDuration * sampleRate);
    const chipsPerChirp = goldCode.length;
    const samplesPerChip = Math.floor(N / chipsPerChirp);

    const signal = new Float32Array(N);
    const k = (f1 - f0) / chirpDuration;

    for (let i = 0; i < N; i++) {
        const t = i / sampleRate;
        const chipIdx = Math.min(Math.floor(i / samplesPerChip), chipsPerChirp - 1);
        const chip = goldCode[chipIdx];
        const phase = 2 * Math.PI * (f0 * t + 0.5 * k * t * t);
        signal[i] = chip * Math.cos(phase);
    }

    // Normalize
    let maxAbs = 0;
    for (let i = 0; i < N; i++) {
        const abs = Math.abs(signal[i]);
        if (abs > maxAbs) maxAbs = abs;
    }
    if (maxAbs > 0) {
        const scale = 1.0 / maxAbs;
        for (let i = 0; i < N; i++) signal[i] *= scale;
    }

    return signal;
}

// ── Chirp CDMA Demodulation (De-chirping) ─────────────────────────

/**
 * FFT implementation (radix-2 Cooley-Tukey, in-place).
 *
 * Used internally for chirp demodulation. For production use,
 * consider a WASM FFT or the Web Audio API AnalyserNode.
 *
 * @param {Float32Array} real - Real part (modified in place)
 * @param {Float32Array} imag - Imaginary part (modified in place)
 * @param {boolean} [inverse=false] - If true, perform IFFT
 */
export function fft(real, imag, inverse = false) {
    const N = real.length;
    if (N <= 1) return;

    // Bit-reversal permutation
    let j = 0;
    for (let i = 0; i < N; i++) {
        if (i < j) {
            [real[i], real[j]] = [real[j], real[i]];
            [imag[i], imag[j]] = [imag[j], imag[i]];
        }
        let m = N >> 1;
        while (m >= 1 && j >= m) {
            j -= m;
            m >>= 1;
        }
        j += m;
    }

    // Butterfly
    const sign = inverse ? 1 : -1;
    for (let step = 1; step < N; step <<= 1) {
        const angleStep = Math.PI / step;
        for (let group = 0; group < N; group += 2 * step) {
            for (let pair = 0; pair < step; pair++) {
                const angle = sign * angleStep * pair;
                const wr = Math.cos(angle);
                const wi = Math.sin(angle);

                const i1 = group + pair;
                const i2 = i1 + step;

                const tr = real[i2] * wr - imag[i2] * wi;
                const ti = real[i2] * wi + imag[i2] * wr;

                real[i2] = real[i1] - tr;
                imag[i2] = imag[i1] - ti;
                real[i1] += tr;
                imag[i1] += ti;
            }
        }
    }

    // Scale for IFFT
    if (inverse) {
        for (let i = 0; i < N; i++) {
            real[i] /= N;
            imag[i] /= N;
        }
    }
}

/**
 * Next power of 2 (for FFT zero-padding).
 * @param {number} n
 * @returns {number}
 */
function nextPow2(n) {
    let p = 1;
    while (p < n) p <<= 1;
    return p;
}

/**
 * Demodulate a chirp-CDMA signal via de-chirping + FFT.
 *
 * Algorithm:
 *   1. Multiply received signal by conjugate chirp (de-chirping)
 *   2. FFT of the de-chirped signal
 *   3. Find the peak in the frequency domain
 *   4. Peak frequency → time delay → distance
 *
 * De-chirping converts time delays to frequency offsets:
 *   delay Δt → frequency shift Δf = k × Δt (where k is chirp rate)
 *
 * @param {Float32Array} receivedSignal - Real-valued audio signal
 * @param {Float32Array} conjugateChirp - Conjugate chirp (complex interleaved)
 * @param {number} [sampleRate=44100]
 * @returns {{ peak: number, sampleOffset: number, distance: number, confidence: number }}
 */
export function demodulateChirpCDMA(receivedSignal, conjugateChirp, sampleRate = SAMPLE_RATE) {
    const N = receivedSignal.length;
    const fftSize = nextPow2(N);

    // Allocate FFT buffers (zero-padded to next power of 2)
    const real = new Float32Array(fftSize);
    const imag = new Float32Array(fftSize);

    // De-chirp: multiply received signal by conjugate chirp
    // This converts time delays → frequency tones
    for (let i = 0; i < N; i++) {
        const conjReal = conjugateChirp[i * 2];
        const conjImag = conjugateChirp[i * 2 + 1];
        // Complex multiply: (sig + 0j) × (cr + j·ci)
        real[i] = receivedSignal[i] * conjReal;
        imag[i] = receivedSignal[i] * conjImag;
    }
    // Rest is zero-padded

    // FFT
    fft(real, imag);

    // Find peak magnitude → frequency bin → time delay
    let maxMag = 0;
    let maxBin = 0;
    let sum = 0;

    // Search first half of spectrum (positive frequencies)
    const searchLen = Math.floor(fftSize / 2);
    for (let i = 0; i < searchLen; i++) {
        const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
        sum += mag;
        if (mag > maxMag) {
            maxMag = mag;
            maxBin = i;
        }
    }

    // Noise floor estimate
    const noiseFloor = sum / searchLen;
    const confidence = noiseFloor > 0 ? maxMag / noiseFloor : 0;

    // Bin → frequency → time delay → distance
    const freqResolution = sampleRate / fftSize;
    const freqOffset = maxBin * freqResolution;

    // Chirp rate: k = (f1 - f0) / duration
    // We need to know the chirp parameters. The caller must provide the chirp rate.
    // For now, return the frequency offset and let the caller convert.
    return {
        peak: maxMag,
        frequencyOffset: freqOffset,  // Hz — caller maps to delay/distance
        sampleOffset: 0,              // Not directly meaningful for chirp demod
        distance: 0,                  // Caller computes: delay = freqOffset / chirpRate
        confidence,
    };
}

// ── High-Level Chirp CDMA Pipeline ────────────────────────────────

/**
 * Generate chirp-CDMA audio for a device.
 *
 * Produces the same output shape as generateDeviceAudio but uses
 * chirp-CDMA modulation instead of sinusoidal Gold code modulation.
 *
 * @param {Object} deviceConfig - { deviceId, ephemeralKey, txTime }
 * @param {Int8Array} goldCode - The device's Gold code (used as spreading sequence)
 * @param {Object} options
 * @param {number} [options.f0=18000] - Chirp start frequency (Hz)
 * @param {number} [options.f1=22000] - Chirp end frequency (Hz)
 * @param {number} [options.duration=2.0] - Chirp duration (seconds)
 * @param {number} [options.bufferDuration=30] - Total buffer duration (seconds)
 * @param {number} [options.sampleRate=44100]
 * @returns {Float32Array} Audio buffer
 */
export function generateChirpDeviceAudio(deviceConfig, goldCode, options = {}) {
    const {
        f0 = 18000,
        f1 = 22000,
        duration = 2.0,
        bufferDuration = 30,
        sampleRate = SAMPLE_RATE,
    } = options;

    const nSamples = Math.floor(bufferDuration * sampleRate);
    const buffer = new Float32Array(nSamples);

    // Generate chirp-CDMA signal
    const chirpSignal = modulateChirpCDMA(goldCode, f0, f1, duration, sampleRate);

    // Place at txTime
    const txSample = Math.floor(deviceConfig.txTime * sampleRate);
    const end = Math.min(txSample + chirpSignal.length, nSamples);
    for (let i = txSample; i < end; i++) {
        buffer[i] += chirpSignal[i - txSample] * 0.8;
    }

    // Add ambient noise (simple uniform — replaces CLT Gaussian for speed)
    for (let i = 0; i < nSamples; i++) {
        buffer[i] += (Math.random() - 0.5) * 0.02;
    }

    // Normalize
    let maxAbs = 0;
    for (let i = 0; i < nSamples; i++) {
        const abs = Math.abs(buffer[i]);
        if (abs > maxAbs) maxAbs = abs;
    }
    if (maxAbs > 0) {
        const scale = 1.0 / maxAbs;
        for (let i = 0; i < nSamples; i++) buffer[i] *= scale;
    }

    return buffer;
}

/**
 * Correlate chirp-CDMA signals: generate the conjugate chirp from
 * parameters, then demodulate to find the peak.
 *
 * @param {Float32Array} audioBuffer - Received audio buffer
 * @param {number} f0 - Chirp start frequency
 * @param {number} f1 - Chirp end frequency
 * @param {number} chirpDuration - Chirp duration in seconds
 * @param {number} chirpRate - Chirp rate k = (f1-f0)/duration (Hz/s)
 * @param {number} [sampleRate=44100]
 * @returns {{ peak: number, distance: number, confidence: number }}
 */
export function correlateChirp(audioBuffer, f0, f1, chirpDuration, chirpRate, sampleRate = SAMPLE_RATE) {
    // Generate short conjugate chirp matching the transmission duration
    const conjChirpShort = generateConjugateChirp(f0, f1, chirpDuration, sampleRate);

    // Pad to match audio buffer length (conjugate chirp starts at t=0,
    // same time reference as the transmitter)
    const bufferLen = audioBuffer.length;
    const paddedConj = new Float32Array(bufferLen * 2);
    for (let i = 0; i < Math.min(conjChirpShort.length, paddedConj.length); i++) {
        paddedConj[i] = conjChirpShort[i];
    }

    const result = demodulateChirpCDMA(audioBuffer, paddedConj, sampleRate);

    const delay = result.frequencyOffset / chirpRate;
    const distance = delay * SPEED_OF_SOUND;

    return {
        peak: result.peak,
        distance: Math.abs(distance),
        confidence: result.confidence,
    };
}

// ── Multi-Device Chirp CDMA ───────────────────────────────────────

/**
 * Correlate all chirp-CDMA signals against all audio buffers.
 *
 * Uses chirp de-chirping + FFT for carrier detection (multipath-robust),
 * then Gold code phase correlation for device identification (CDMA).
 *
 * @param {{ [deviceId: string]: Float32Array }} audioBuffers
 * @param {{ [deviceId: string]: Int8Array }} goldCodes
 * @param {Object} [options]
 * @param {number} [options.f0=18000]
 * @param {number} [options.f1=22000]
 * @param {number} [options.duration=2.0]
 * @param {number} [options.sampleRate=44100]
 * @returns {{ codeDeviceId: string, bufferDeviceId: string, peak: number, sampleOffset: number, confidence: number }[]}
 */
export function correlateAllChirp(audioBuffers, goldCodes, options = {}) {
    const {
        f0 = 18000,
        f1 = 22000,
        duration = 2.0,
        sampleRate = SAMPLE_RATE,
    } = options;

    const chirpRate = (f1 - f0) / duration;
    const results = [];

    for (const [bufferDeviceId, audioBuffer] of Object.entries(audioBuffers)) {
        // Step 1: De-chirp to find chirp presence + delay
        // Use short conjugate chirp matching transmission duration, zero-padded
        const conjChirpShort = generateConjugateChirp(f0, f1, duration, sampleRate);
        const bufferLen = audioBuffer.length;
        const paddedConj = new Float32Array(bufferLen * 2);
        for (let i = 0; i < Math.min(conjChirpShort.length, paddedConj.length); i++) {
            paddedConj[i] = conjChirpShort[i];
        }

        // Zero-pad audio to match conj chirp length
        const paddedAudio = new Float32Array(paddedConj.length / 2);
        paddedAudio.set(audioBuffer.subarray(0, Math.min(audioBuffer.length, paddedAudio.length)));

        const { frequencyOffset, peak: carrierPeak } = demodulateChirpCDMA(paddedAudio, paddedConj, sampleRate);

        // Step 2: For each Gold code, correlate against the signal
        // at the detected delay (phase demodulation)
        for (const [codeDeviceId, goldCode] of Object.entries(goldCodes)) {
            // Reconstruct expected chirp-CDMA signal with this Gold code
            const expected = modulateChirpCDMA(goldCode, f0, f1, duration, sampleRate);

            // Cross-correlate expected signal against audio buffer at detected position
            const delay = frequencyOffset / chirpRate;
            const delaySamples = Math.floor(Math.abs(delay) * sampleRate);

            let peak = 0;
            let sampleOffset = delaySamples;

            if (delaySamples + expected.length < audioBuffer.length) {
                // Time-domain correlation of the Gold-code-modulated chirp
                // against the received audio at the detected delay
                let dot = 0;
                for (let i = 0; i < expected.length; i++) {
                    dot += audioBuffer[delaySamples + i] * expected[i];
                }
                peak = Math.abs(dot);
            }

            results.push({
                codeDeviceId,
                bufferDeviceId,
                peak,
                sampleOffset,
                confidence: carrierPeak > 0 ? peak / carrierPeak : 0,
            });
        }
    }

    return results;
}
