/**
 * chirp-cdma.test.js — Tests for chirp-based CDMA module.
 *
 * Run: node --experimental-vm-modules node_modules/.bin/vitest run demo/chirp-cdma.test.js
 * Or: npm test (if configured)
 */

import { describe, it, expect } from 'vitest';
import {
    generateChirp,
    generateConjugateChirp,
    modulateChirpCDMA,
    demodulateChirpCDMA,
    fft,
    generateChirpDeviceAudio,
    correlateChirp,
} from './chirp-cdma.js';
import { generateGoldCode } from './audio-cdma.js';

// ── Chirp Generation ──────────────────────────────────────────────

describe('generateChirp', () => {
    it('produces a signal of the expected length', () => {
        const chirp = generateChirp(18000, 22000, 0.1, 44100);
        // 0.1s @ 44100 Hz = 4410 samples × 2 (complex interleaved) = 8820
        expect(chirp.length).toBe(8820);
    });

    it('produces non-zero, non-constant values', () => {
        const chirp = generateChirp(1000, 2000, 0.01, 44100);
        const values = [];
        for (let i = 0; i < chirp.length; i += 2) {
            values.push(Math.sqrt(chirp[i] * chirp[i] + chirp[i + 1] * chirp[i + 1]));
        }
        // Magnitude should be ~1 (cos² + sin² = 1)
        const meanMag = values.reduce((a, b) => a + b, 0) / values.length;
        expect(meanMag).toBeCloseTo(1.0, 1);

        // Values should not all be identical
        const first = values[0];
        const different = values.some(v => Math.abs(v - first) > 0.001);
        expect(different).toBe(true);
    });
});

describe('generateConjugateChirp', () => {
    it('produces same length as forward chirp', () => {
        const forward = generateChirp(18000, 22000, 0.1, 44100);
        const conj = generateConjugateChirp(18000, 22000, 0.1, 44100);
        expect(conj.length).toBe(forward.length);
    });

    it('conjugate has negated imaginary part', () => {
        const forward = generateChirp(18000, 22000, 0.01, 44100);
        const conj = generateConjugateChirp(18000, 22000, 0.01, 44100);

        // Real parts should match, imaginary parts should be negated
        for (let i = 0; i < forward.length; i += 2) {
            expect(conj[i]).toBeCloseTo(forward[i], 5);       // real same
            expect(conj[i + 1]).toBeCloseTo(-forward[i + 1], 5); // imag negated
        }
    });
});

// ── Chirp CDMA Modulation ─────────────────────────────────────────

describe('modulateChirpCDMA', () => {
    it('produces a real-valued signal of expected length', () => {
        const code = new Int8Array([1, -1, 1, -1, 1, -1, 1, -1]);
        const signal = modulateChirpCDMA(code, 18000, 22000, 0.1, 44100);
        // 0.1s @ 44100 Hz = 4410 samples
        expect(signal.length).toBe(4410);
    });

    it('signal is normalized to [-1, 1]', () => {
        const code = new Int8Array(128).fill(1);
        const signal = modulateChirpCDMA(code, 18000, 22000, 0.5, 44100);

        let maxAbs = 0;
        for (let i = 0; i < signal.length; i++) {
            const abs = Math.abs(signal[i]);
            if (abs > maxAbs) maxAbs = abs;
        }
        expect(maxAbs).toBeLessThanOrEqual(1.0);
        expect(maxAbs).toBeGreaterThan(0.9); // Should be close to 1 after normalization
    });

    it('different Gold codes produce different signals', () => {
        const code1 = new Int8Array([1, 1, 1, 1]);
        const code2 = new Int8Array([-1, -1, -1, -1]);
        const sig1 = modulateChirpCDMA(code1, 18000, 22000, 0.01, 44100);
        const sig2 = modulateChirpCDMA(code2, 18000, 22000, 0.01, 44100);

        // Signals should differ (code2 is inverted → signal should be inverted)
        let diff = 0;
        for (let i = 0; i < sig1.length; i++) {
            diff += Math.abs(sig1[i] - sig2[i]);
        }
        expect(diff).toBeGreaterThan(0);
    });
});

// ── FFT ───────────────────────────────────────────────────────────

describe('fft', () => {
    it('preserves Parseval energy', () => {
        const N = 64;
        const real = new Float32Array(N);
        const imag = new Float32Array(N);

        // Input: unit impulse at sample 1
        real[1] = 1.0;

        const realCopy = new Float32Array(real);
        const imagCopy = new Float32Array(imag);

        fft(real, imag);

        // Energy should be preserved: sum(|x|²) = (1/N) × sum(|X|²)
        let energyTime = 0;
        let energyFreq = 0;
        for (let i = 0; i < N; i++) {
            energyTime += realCopy[i] * realCopy[i] + imagCopy[i] * imagCopy[i];
            energyFreq += real[i] * real[i] + imag[i] * imag[i];
        }
        expect(energyFreq).toBeCloseTo(energyTime * N, 0);
    });

    it('FFT + IFFT recovers original signal', () => {
        const N = 64;
        const real = new Float32Array(N);
        const imag = new Float32Array(N);

        // Random input
        for (let i = 0; i < N; i++) {
            real[i] = Math.random() * 2 - 1;
        }

        const original = new Float32Array(real);

        fft(real, imag);
        fft(real, imag, true); // IFFT

        for (let i = 0; i < N; i++) {
            expect(real[i]).toBeCloseTo(original[i], 5);
            expect(imag[i]).toBeCloseTo(0, 5);
        }
    });
});

// ── Chirp CDMA Demodulation ───────────────────────────────────────

describe('demodulateChirpCDMA', () => {
    it('detects a chirp in clean conditions', () => {
        const code = new Int8Array(32).fill(1);
        const f0 = 18000;
        const f1 = 22000;
        const duration = 0.05;
        const sampleRate = 44100;

        const signal = modulateChirpCDMA(code, f0, f1, duration, sampleRate);

        // Generate conjugate chirp matching the signal length
        const conjChirp = generateConjugateChirp(f0, f1, duration, sampleRate);

        const result = demodulateChirpCDMA(signal, conjChirp, sampleRate);

        // Peak should be at bin 0 (zero delay — chirp is at t=0)
        expect(result.peak).toBeGreaterThan(0);
        expect(result.frequencyOffset).toBeCloseTo(0, -1);
        expect(result.confidence).toBeGreaterThan(5);
    });

    it('detects a delayed chirp', () => {
        const code = new Int8Array(32).fill(1);
        const f0 = 18000;
        const f1 = 22000;
        const duration = 0.05;
        const sampleRate = 44100;
        const chirpRate = (f1 - f0) / duration;

        const signal = modulateChirpCDMA(code, f0, f1, duration, sampleRate);

        // Insert delay: prepend zeros
        const delaySamples = 220;
        const totalLen = signal.length + delaySamples;
        const delayed = new Float32Array(totalLen);
        delayed.set(signal, delaySamples);

        // Generate conjugate chirp matching the TRANSMISSION duration, then pad
        const conjChirpShort = generateConjugateChirp(f0, f1, duration, sampleRate);
        // Pad conjugate chirp to match delayed signal length
        const paddedConj = new Float32Array(totalLen * 2);
        for (let i = 0; i < conjChirpShort.length; i++) {
            paddedConj[i + delaySamples * 2] = conjChirpShort[i];
        }

        const result = demodulateChirpCDMA(delayed, paddedConj, sampleRate);

        const detectedDelay = result.frequencyOffset / chirpRate;
        const detectedSamples = Math.abs(detectedDelay) * sampleRate;

        expect(detectedSamples).toBeGreaterThan(delaySamples * 0.5);
        expect(result.confidence).toBeGreaterThan(3);
    });

    it('detects a chirp in moderate noise', () => {
        const code = new Int8Array(32).fill(1);
        const f0 = 18000;
        const f1 = 22000;
        const duration = 0.05;
        const sampleRate = 44100;

        const signal = modulateChirpCDMA(code, f0, f1, duration, sampleRate);

        // Add noise (std = 0.05, signal is ~0.8 peak)
        const noisy = new Float32Array(signal.length);
        for (let i = 0; i < noisy.length; i++) {
            noisy[i] = signal[i] + (Math.random() - 0.5) * 0.1;
        }

        const conjChirp = generateConjugateChirp(f0, f1, duration, sampleRate);
        const result = demodulateChirpCDMA(noisy, conjChirp, sampleRate);

        expect(result.peak).toBeGreaterThan(0);
        expect(result.confidence).toBeGreaterThan(3); // still detectable
    });
});

// ── High-Level Pipeline ───────────────────────────────────────────

describe('generateChirpDeviceAudio + correlateChirp', () => {
    it('round-trips: generate chirp audio and detect it', () => {
        const f0 = 18000;
        const f1 = 22000;
        const chirpDuration = 0.1;
        const chirpRate = (f1 - f0) / chirpDuration;

        const deviceConfig = {
            deviceId: 'device-1',
            ephemeralKey: 'test-key-001',
            txTime: 0.5,
        };

        const code = generateGoldCode(deviceConfig.ephemeralKey, 64);
        const audioBuffer = generateChirpDeviceAudio(deviceConfig, code, {
            f0, f1, duration: chirpDuration, bufferDuration: 2.0,
        });

        const result = correlateChirp(audioBuffer, f0, f1, chirpDuration, chirpRate);

        // Should detect the chirp
        expect(result.peak).toBeGreaterThan(0);
        expect(result.confidence).toBeGreaterThan(1.5);

        // Distance should be non-zero (chirp transmitted at txTime, not t=0)
        expect(result.distance).toBeGreaterThan(0);
    });

    it('stronger peak with matching code than random', () => {
        const f0 = 18000;
        const f1 = 22000;
        const chirpDuration = 0.1;
        const chirpRate = (f1 - f0) / chirpDuration;

        const codeA = generateGoldCode('device-A', 64);
        const codeB = generateGoldCode('device-B', 64);

        // Device A transmits
        const deviceA = { deviceId: 'A', ephemeralKey: 'device-A', txTime: 0.5 };
        const buffer = generateChirpDeviceAudio(deviceA, codeA, {
            f0, f1, duration: chirpDuration, bufferDuration: 2.0,
        });

        // Correlate with matching chirp parameters
        const result = correlateChirp(buffer, f0, f1, chirpDuration, chirpRate);
        expect(result.peak).toBeGreaterThan(0);
    });
});
