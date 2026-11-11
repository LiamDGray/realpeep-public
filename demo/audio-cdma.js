/**
 * audio-cdma.js — Browser-side JS audio CDMA generation and correlation.
 *
 * Pure functions for generating Gold-coded chirps, creating audio buffers with
 * propagation delays and inverse-square attenuation, correlating codes against
 * audio buffers, and encoding WAV files.
 *
 * Node-testable — no DOM, no side effects, ES module exports.
 */

// ── Constants ─────────────────────────────────────────────────────

const SAMPLE_RATE = 44100;
const DURATION_SECONDS = 30;
const SPEED_OF_SOUND = 343.0; // m/s
const DEFAULT_SF = 128;

// Gold code preferred pair polynomials for n=7
// x^7 + x + 1   → mask 0x83 (bits 7, 1, 0)
// x^7 + x^3 + 1 → mask 0x89 (bits 7, 3, 0)
const POLY1 = 0x83;
const POLY2 = 0x89;

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Simple hash function (consistent with other demo modules).
 * @param {string} str
 * @returns {number} 32-bit integer hash (non-negative)
 */
export function demoHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h);
}

/**
 * Galois-configuration LFSR.
 * @param {number} polynomial - Bitmask for the polynomial
 * @param {number} initialState - Non-zero seed
 * @returns {{ next: () => number, degree: number }}
 */
function lfsrCreate(polynomial, initialState) {
    const degree = polynomial.toString(2).length - 1;
    let state = initialState & ((1 << degree) - 1);
    if (state === 0) state = 1;

    return {
        degree,
        next() {
            const bit = state & 1;
            state >>= 1;
            if (bit) {
                state ^= (polynomial >> 1);
            }
            return bit;
        }
    };
}

/**
 * Fast PRNG: returns a function that yields uniform floats in (0,1).
 * Uses 32-bit LCG (same as dsp.js LCG).
 * @param {number} seed
 * @returns {() => number}
 */
function fastRng(seed) {
    let state = seed >>> 0;
    return () => {
        state = ((state * 1664525 + 1013904223) >>> 0);
        return state / 4294967296;
    };
}

/**
 * Fast approximate Gaussian noise using Central Limit Theorem
 * (sum of 6 uniforms, much faster than Box-Muller).
 * @param {() => number} rng
 * @param {number} std
 * @returns {number}
 */
function fastGaussian(rng, std) {
    // Sum of 6 uniforms → approx N(0,1) scaled by std
    let sum = 0;
    for (let j = 0; j < 6; j++) {
        sum += rng();
    }
    return (sum - 3.0) * std; // Mean is 3 (6 * 0.5), std is ~0.707
}

// ── Gold Code Generation ──────────────────────────────────────────

/**
 * Generate a Gold code from an ephemeral key.
 *
 * Uses the known preferred pair x^7+x+1 (0x83) and x^7+x^3+1 (0x89).
 * The key is hashed to produce shift values for the two LFSRs.
 *
 * @param {string} ephemeralKey - The device's ephemeral public key (used as seed).
 * @param {number} [sf=128] - Spreading factor (code length).
 * @returns {Int8Array} Bipolar code array of length sf (values -1 or 1).
 */
export function generateGoldCode(ephemeralKey, sf = DEFAULT_SF) {
    const seed = demoHash(ephemeralKey) % (1 << 31);

    const shiftA = seed % 100;
    const shiftB = Math.floor(seed / 100) % 100;

    const lfsr1 = lfsrCreate(POLY1, seed);
    const lfsr2 = lfsrCreate(POLY2, seed);

    // Advance to desired phase
    for (let i = 0; i < shiftA; i++) lfsr1.next();
    for (let i = 0; i < shiftB; i++) lfsr2.next();

    const code = new Int8Array(sf);
    for (let i = 0; i < sf; i++) {
        code[i] = (lfsr1.next() ^ lfsr2.next()) ? 1 : -1;
    }
    return code;
}

// ── Audio Buffer Generation ───────────────────────────────────────

/**
 * Generate an audio buffer for one device.
 *
 * The buffer contains:
 *   - The device's OWN chirp at txTime (loud)
 *   - Nearby devices' chirps (faint, delayed by distance / speed_of_sound)
 *   - Ambient Gaussian noise (fast CLT approximation)
 *   - Normalized to [-1, 1]
 *
 * @param {DeviceConfig} deviceConfig - The device whose perspective we're generating.
 * @param {Topology} topology - Dict[deviceId][neighborId] → distanceMeters.
 * @param {DeviceConfig[]} allDevices - All devices in the simulation.
 * @param {number} [sf=128] - Spreading factor.
 * @param {number} [noiseStd=0.02] - Standard deviation of ambient noise.
 * @param {number} [durationSeconds=30] - Duration of audio in seconds (for tests).
 * @returns {Float32Array} Audio buffer of length durationSeconds * SAMPLE_RATE.
 */
export function generateDeviceAudio(
    deviceConfig, topology, allDevices, sf = DEFAULT_SF,
    noiseStd = 0.02, durationSeconds = DURATION_SECONDS
) {
    const nSamples = durationSeconds * SAMPLE_RATE;
    const buffer = new Float32Array(nSamples);

    // Embed OWN chirp (loud)
    const ownCode = generateGoldCode(deviceConfig.ephemeralKey, sf);
    const ownTxSample = Math.floor(deviceConfig.txTime * SAMPLE_RATE);
    const ownEnd = ownTxSample + ownCode.length;
    if (ownEnd <= nSamples) {
        for (let i = 0; i < ownCode.length; i++) {
            buffer[ownTxSample + i] += ownCode[i] * 0.8;
        }
    }

    // Embed NEIGHBORS' chirps (faint, delayed)
    const neighbors = topology[deviceConfig.deviceId] || {};
    for (const [neighborId, distance] of Object.entries(neighbors)) {
        const neighbor = allDevices.find(d => d.deviceId === neighborId);
        if (!neighbor) continue;

        const neighborCode = generateGoldCode(neighbor.ephemeralKey, sf);

        // Delay = distance / speed_of_sound
        const delaySamples = Math.floor((distance / SPEED_OF_SOUND) * SAMPLE_RATE);

        // Attenuation = 1 / distance^2 (inverse square law) with a cap
        const attenuation = Math.min(1.0, 1.0 / (distance * distance)) * 0.3;

        const neighborTxSample = Math.floor(neighbor.txTime * SAMPLE_RATE);
        const arrivalSample = neighborTxSample + delaySamples;
        const arrivalEnd = arrivalSample + neighborCode.length;

        if (arrivalSample >= 0 && arrivalSample < nSamples) {
            const end = Math.min(arrivalEnd, nSamples);
            const length = end - arrivalSample;
            for (let i = 0; i < length; i++) {
                buffer[arrivalSample + i] += neighborCode[i] * attenuation;
            }
        }
    }

    // Add ambient noise using fast PRNG + CLT Gaussian approximation
    const noiseSeed = demoHash(deviceConfig.deviceId + '_noise');
    const rng = fastRng(noiseSeed);
    for (let i = 0; i < nSamples; i++) {
        buffer[i] += fastGaussian(rng, noiseStd);
    }

    // Normalize to [-1, 1]
    let maxAbs = 0;
    for (let i = 0; i < nSamples; i++) {
        const abs = Math.abs(buffer[i]);
        if (abs > maxAbs) maxAbs = abs;
    }
    if (maxAbs > 0) {
        const scale = 1.0 / maxAbs;
        for (let i = 0; i < nSamples; i++) {
            buffer[i] *= scale;
        }
    }

    return buffer;
}

// ── Correlation / Detection ───────────────────────────────────────

/**
 * Cross-correlate a Gold code against an audio buffer.
 * Returns the best correlation peak, its sample offset, and confidence.
 *
 * @param {Float32Array} buffer - Audio buffer to search.
 * @param {Int8Array} code - Gold code to correlate against.
 * @returns {{ peak: number, sampleOffset: number, confidence: number }}
 */
function correlateOne(buffer, code) {
    const corrLen = buffer.length - code.length + 1;
    if (corrLen <= 0) {
        return { peak: 0, sampleOffset: 0, confidence: 0 };
    }

    let bestPeak = 0;
    let bestOffset = 0;
    let sum = 0;

    // Coarse search with stride (8 instead of 4 for speed)
    const stride = 8;
    let count = 0;
    for (let offset = 0; offset < corrLen; offset += stride) {
        let dot = 0;
        for (let i = 0; i < code.length; i++) {
            dot += buffer[offset + i] * code[i];
        }
        const absDot = Math.abs(dot);
        sum += absDot;
        count++;
        if (absDot > bestPeak) {
            bestPeak = absDot;
            bestOffset = offset;
        }
    }

    // Refine around best offset (search ±stride at full resolution)
    const refineStart = Math.max(0, bestOffset - stride);
    const refineEnd = Math.min(corrLen, bestOffset + stride + 1);
    for (let offset = refineStart; offset < refineEnd; offset++) {
        let dot = 0;
        for (let i = 0; i < code.length; i++) {
            dot += buffer[offset + i] * code[i];
        }
        const absDot = Math.abs(dot);
        if (absDot > bestPeak) {
            bestPeak = absDot;
            bestOffset = offset;
        }
    }

    // Noise floor estimate
    const noiseFloor = count > 0 ? sum / count : 0;
    const confidence = noiseFloor > 0 ? bestPeak / noiseFloor : 0;

    return { peak: bestPeak, sampleOffset: bestOffset, confidence };
}

/**
 * Run cross-correlation of all Gold codes against all audio buffers.
 *
 * @param {{ [deviceId: string]: Float32Array }} audioBuffers - Map of deviceId to audio buffer.
 * @param {{ [deviceId: string]: Int8Array }} goldCodes - Map of deviceId to Gold code.
 * @returns {{ codeDeviceId: string, bufferDeviceId: string, peak: number, sampleOffset: number, confidence: number }[]}
 */
export function correlateAll(audioBuffers, goldCodes) {
    const results = [];

    for (const [codeDeviceId, code] of Object.entries(goldCodes)) {
        for (const [bufferDeviceId, buffer] of Object.entries(audioBuffers)) {
            const { peak, sampleOffset, confidence } = correlateOne(buffer, code);
            results.push({
                codeDeviceId,
                bufferDeviceId,
                peak,
                sampleOffset,
                confidence,
            });
        }
    }

    return results;
}

// ── WAV Encoding ──────────────────────────────────────────────────

/**
 * Encode a Float32 audio buffer as a 16-bit mono WAV file.
 *
 * @param {Float32Array} samples - Float32 audio samples in [-1, 1].
 * @param {number} [sampleRate=44100] - Sample rate in Hz.
 * @returns {ArrayBuffer} WAV file bytes.
 */
export function encodeWav(samples, sampleRate = 44100) {
    const numSamples = samples.length;
    const dataSize = numSamples * 2; // 16-bit = 2 bytes per sample
    const fileSize = 36 + dataSize;

    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, fileSize, true);
    writeString(view, 8, 'WAVE');

    // fmt  subchunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);      // Subchunk1Size (PCM)
    view.setUint16(20, 1, true);       // AudioFormat (1 = PCM)
    view.setUint16(22, 1, true);       // NumChannels (mono)
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, sampleRate * 2, true); // ByteRate
    view.setUint16(32, 2, true);       // BlockAlign
    view.setUint16(34, 16, true);      // BitsPerSample

    // data subchunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Write PCM samples (float [-1,1] → int16 [-32768, 32767])
    for (let i = 0; i < numSamples; i++) {
        const sample = Math.max(-1.0, Math.min(1.0, samples[i]));
        const intVal = Math.round(sample * 32767);
        view.setInt16(44 + i * 2, intVal, true);
    }

    return buffer;
}

/**
 * Write a string to a DataView at the given offset.
 * @param {DataView} view
 * @param {number} offset
 * @param {string} str
 */
function writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}

// ── Type helpers (JSDoc-only, ES module exports) ──────────────────

/**
 * @typedef {Object} DeviceConfig
 * @property {string} deviceId - Unique device identifier.
 * @property {string} ephemeralKey - Ephemeral public key (determines Gold code).
 * @property {number} txTime - Seconds into the recording when this device chirps.
 */

/**
 * @typedef {Object.<string, Object.<string, number>>} Topology
 * Map of deviceId → { neighborId → distanceMeters }.
 */
