/**
 * Tests for demo/audio-cdma.js — Browser-side JS audio CDMA generation and correlation.
 * Run: cd realpeep-js && NODE_OPTIONS=--experimental-vm-modules npx jest tests/audio-cdma.test.js --no-coverage --verbose
 */

import {
    generateGoldCode,
    generateDeviceAudio,
    correlateAll,
    encodeWav,
} from '../../demo/audio-cdma.js';

// Speed of sound constant (must match module)
const SPEED_OF_SOUND = 343.0;
const SAMPLE_RATE = 44100;

describe('audio-cdma', () => {
    // ── Gold Code Generation ─────────────────────────────────────
    describe('generateGoldCode', () => {
        it('generates a bipolar code of the correct length', () => {
            const code = generateGoldCode('test_key_1', 128);
            expect(code).toBeInstanceOf(Int8Array);
            expect(code.length).toBe(128);
        });

        it('generates only -1 and 1 values', () => {
            const code = generateGoldCode('test_key_2', 64);
            for (let i = 0; i < code.length; i++) {
                expect([-1, 1]).toContain(code[i]);
            }
        });

        it('is deterministic for the same key', () => {
            const code1 = generateGoldCode('deterministic_key', 128);
            const code2 = generateGoldCode('deterministic_key', 128);
            expect(code1).toEqual(code2);
        });

        it('different keys produce different codes', () => {
            const code1 = generateGoldCode('key_alpha', 128);
            const code2 = generateGoldCode('key_beta', 128);
            // High probability they differ; check at least some positions
            let diffCount = 0;
            for (let i = 0; i < code1.length; i++) {
                if (code1[i] !== code2[i]) diffCount++;
            }
            // Should differ at roughly half the positions (very unlikely to be identical)
            expect(diffCount).toBeGreaterThan(10);
        });

        it('supports different spreading factors', () => {
            const code32 = generateGoldCode('sf_test', 32);
            const code256 = generateGoldCode('sf_test', 256);
            expect(code32.length).toBe(32);
            expect(code256.length).toBe(256);
            // First 32 chips should match since same key
            for (let i = 0; i < 32; i++) {
                expect(code32[i]).toBe(code256[i]);
            }
        });

        it('has balanced output (roughly equal -1 and 1)', () => {
            const code = generateGoldCode('balance_test', 1024);
            let ones = 0;
            for (let i = 0; i < code.length; i++) {
                if (code[i] === 1) ones++;
            }
            // Gold codes are roughly balanced
            expect(ones).toBeGreaterThan(400);
            expect(ones).toBeLessThan(624);
        });
    });

    // ── Audio Generation ─────────────────────────────────────────
    describe('generateDeviceAudio', () => {
        const sf = 128;
        // Use very short duration for fast tests (0.05 seconds = 2205 samples)
        const DUR = 0.05;

        const deviceConfig = {
            deviceId: 'device_a',
            ephemeralKey: 'pk_test_AAAA0001',
            txTime: 0.01, // seconds
        };
        const topology = {
            device_a: { device_b: 4.0 },
        };
        const allDevices = [
            deviceConfig,
            { deviceId: 'device_b', ephemeralKey: 'pk_test_BBBB0002', txTime: 0.02 },
        ];

        it('generates a Float32Array audio buffer', () => {
            const buffer = generateDeviceAudio(deviceConfig, topology, allDevices, sf, 0.02, DUR);
            expect(buffer).toBeInstanceOf(Float32Array);
            expect(buffer.length).toBeGreaterThan(0);
        });

        it('buffer length matches duration * sample rate', () => {
            const buffer = generateDeviceAudio(deviceConfig, topology, allDevices, sf, 0.02, DUR);
            expect(buffer.length).toBe(Math.floor(DUR * SAMPLE_RATE));
        });

        it('own chirp is present at txTime position', () => {
            const buffer = generateDeviceAudio(deviceConfig, topology, allDevices, sf, 0.02, DUR);
            const ownTxSample = Math.floor(deviceConfig.txTime * SAMPLE_RATE);
            // Check that the signal at own chirp position has significant energy
            let energy = 0;
            for (let i = ownTxSample; i < ownTxSample + sf && i < buffer.length; i++) {
                energy += Math.abs(buffer[i]);
            }
            // Own chirp should contribute significant energy
            expect(energy).toBeGreaterThan(0);
        });

        it('own chirp amplitude is larger than noise floor', () => {
            const buffer = generateDeviceAudio(deviceConfig, topology, allDevices, sf, 0.02, DUR);
            const ownTxSample = Math.floor(deviceConfig.txTime * SAMPLE_RATE);

            // Energy at own chirp region
            let signalEnergy = 0;
            for (let i = ownTxSample; i < ownTxSample + sf && i < buffer.length; i++) {
                signalEnergy += Math.abs(buffer[i]);
            }
            signalEnergy /= sf;

            // Energy in quiet region (before any chirps)
            let noiseEnergy = 0;
            const quietEnd = Math.floor(0.005 * SAMPLE_RATE);
            for (let i = 0; i < quietEnd && i < buffer.length; i++) {
                noiseEnergy += Math.abs(buffer[i]);
            }
            noiseEnergy /= Math.max(1, quietEnd);

            // Signal energy should be notably higher than noise
            expect(signalEnergy).toBeGreaterThan(noiseEnergy * 2);
        });

        it('neighbor chirp is attenuated (fainter than own)', () => {
            // Device B's perspective: own chirp loud, device_a's chirp attenuated
            const deviceBConfig = { deviceId: 'device_b', ephemeralKey: 'pk_test_BBBB0002', txTime: 0.02 };
            const topoB = { device_b: { device_a: 4.0 } };
            const allDev = [
                { deviceId: 'device_a', ephemeralKey: 'pk_test_AAAA0001', txTime: 0.01 },
                deviceBConfig,
            ];
            // Use 0.1s duration so both chirps + propagation delay fit
            const dur = 0.1;
            const buffer = generateDeviceAudio(deviceBConfig, topoB, allDev, sf, 0.02, dur);

            // Own chirp energy
            const ownTxSample = Math.floor(deviceBConfig.txTime * SAMPLE_RATE);
            let ownEnergy = 0;
            for (let i = ownTxSample; i < ownTxSample + sf && i < buffer.length; i++) {
                ownEnergy += Math.abs(buffer[i]);
            }
            ownEnergy /= sf;

            // Neighbor (device_a's) chirp energy
            const distance = 4.0;
            const delaySamples = Math.floor((distance / SPEED_OF_SOUND) * SAMPLE_RATE);
            const neighborTxSample = Math.floor(allDev[0].txTime * SAMPLE_RATE);
            const arrivalSample = neighborTxSample + delaySamples;
            let neighborEnergy = 0;
            for (let i = arrivalSample; i < arrivalSample + sf && i < buffer.length; i++) {
                neighborEnergy += Math.abs(buffer[i]);
            }
            neighborEnergy /= sf;

            // Own chirp should be louder than the attenuated neighbor chirp
            expect(ownEnergy).toBeGreaterThan(neighborEnergy * 1.5);
        });

        it('returns buffer normalized to [-1, 1] range', () => {
            const buffer = generateDeviceAudio(deviceConfig, topology, allDevices, sf, 0.02, DUR);
            for (let i = 0; i < buffer.length; i++) {
                expect(buffer[i]).toBeGreaterThanOrEqual(-1.0);
                expect(buffer[i]).toBeLessThanOrEqual(1.0);
            }
        });

        it('different keys produce different buffers', () => {
            const config1 = { deviceId: 'd1', ephemeralKey: 'key_alpha', txTime: 0.01 };
            const config2 = { deviceId: 'd1', ephemeralKey: 'key_beta', txTime: 0.01 };
            const topo = { d1: {} };
            const buf1 = generateDeviceAudio(config1, topo, [config1], sf, 0.02, DUR);
            const buf2 = generateDeviceAudio(config2, topo, [config2], sf, 0.02, DUR);
            // Should differ in at least some positions
            let diffCount = 0;
            for (let i = 0; i < buf1.length; i++) {
                if (buf1[i] !== buf2[i]) diffCount++;
            }
            expect(diffCount).toBeGreaterThan(0);
        });
    });

    // ── Correlation ──────────────────────────────────────────────
    describe('correlateAll', () => {
        const sf = 128;
        const DUR = 0.1; // Short duration for fast tests

        const devA = { deviceId: 'device_a', ephemeralKey: 'pk_AAAA0001', txTime: 0.01 };
        const devB = { deviceId: 'device_b', ephemeralKey: 'pk_BBBB0002', txTime: 0.04 };
        const devC = { deviceId: 'device_c', ephemeralKey: 'pk_CCCC0003', txTime: 0.07 };
        const allDevices = [devA, devB, devC];
        const topology = {
            device_a: { device_b: 4.0, device_c: 8.0 },
            device_b: { device_a: 4.0, device_c: 4.0 },
            device_c: {},
        };

        it('returns results for all device-to-code pairs', () => {
            const audioBuffers = {
                device_a: generateDeviceAudio(devA, topology, allDevices, sf, 0.02, DUR),
                device_b: generateDeviceAudio(devB, topology, allDevices, sf, 0.02, DUR),
            };
            const goldCodes = {
                device_a: generateGoldCode(devA.ephemeralKey, sf),
                device_b: generateGoldCode(devB.ephemeralKey, sf),
            };
            const results = correlateAll(audioBuffers, goldCodes);
            // Should have results for each code against each buffer
            expect(results.length).toBeGreaterThanOrEqual(4); // 2 buffers × 2 codes
        });

        it('each result has required fields', () => {
            const audioBuffers = {
                device_a: generateDeviceAudio(devA, topology, allDevices, sf, 0.02, DUR),
            };
            const goldCodes = {
                device_a: generateGoldCode(devA.ephemeralKey, sf),
            };
            const results = correlateAll(audioBuffers, goldCodes);
            expect(results.length).toBeGreaterThan(0);
            const r = results[0];
            expect(r).toHaveProperty('codeDeviceId');
            expect(r).toHaveProperty('bufferDeviceId');
            expect(r).toHaveProperty('peak');
            expect(r).toHaveProperty('sampleOffset');
            expect(r).toHaveProperty('confidence');
            expect(typeof r.peak).toBe('number');
            expect(typeof r.sampleOffset).toBe('number');
            expect(typeof r.confidence).toBe('number');
        });

        it('detects own chirp with high peak correlation', () => {
            const audioBuffers = {
                device_a: generateDeviceAudio(devA, topology, allDevices, sf, 0.02, DUR),
            };
            const goldCodes = {
                device_a: generateGoldCode(devA.ephemeralKey, sf),
            };
            const results = correlateAll(audioBuffers, goldCodes);
            const ownResult = results.find(
                r => r.codeDeviceId === 'device_a' && r.bufferDeviceId === 'device_a'
            );
            expect(ownResult).toBeDefined();
            // Own chirp should have a clear peak
            expect(ownResult.peak).toBeGreaterThan(0);
            expect(ownResult.confidence).toBeGreaterThan(1.0);
        });

        it('detection sample offset is near txTime', () => {
            const audioBuffers = {
                device_a: generateDeviceAudio(devA, topology, allDevices, sf, 0.02, DUR),
            };
            const goldCodes = {
                device_a: generateGoldCode(devA.ephemeralKey, sf),
            };
            const results = correlateAll(audioBuffers, goldCodes);
            const ownResult = results.find(
                r => r.codeDeviceId === 'device_a' && r.bufferDeviceId === 'device_a'
            );
            const expectedSample = Math.floor(devA.txTime * SAMPLE_RATE);
            // Should be within ~sf samples of expected position
            expect(Math.abs(ownResult.sampleOffset - expectedSample)).toBeLessThanOrEqual(sf * 2);
        });

        it('neighbor chirp detected (own and neighbor both found)', () => {
            const audioBuffers = {
                device_b: generateDeviceAudio(devB, topology, allDevices, sf, 0.02, DUR),
            };
            const goldCodes = {
                device_a: generateGoldCode(devA.ephemeralKey, sf),
                device_b: generateGoldCode(devB.ephemeralKey, sf),
            };
            const results = correlateAll(audioBuffers, goldCodes);
            const ownResult = results.find(
                r => r.codeDeviceId === 'device_b' && r.bufferDeviceId === 'device_b'
            );
            const neighborResult = results.find(
                r => r.codeDeviceId === 'device_a' && r.bufferDeviceId === 'device_b'
            );
            expect(ownResult).toBeDefined();
            expect(neighborResult).toBeDefined();
            // Both should have non-trivial peaks
            expect(ownResult.peak).toBeGreaterThan(0);
            expect(neighborResult.peak).toBeGreaterThan(0);
        });
    });

    // ── WAV Encoding ─────────────────────────────────────────────
    describe('encodeWav', () => {
        const SAMPLE_RATE = 44100;

        it('returns an ArrayBuffer', () => {
            const samples = new Float32Array(1000);
            const wav = encodeWav(samples, SAMPLE_RATE);
            expect(wav).toBeInstanceOf(ArrayBuffer);
        });

        it('produces a valid RIFF/WAVE header', () => {
            const samples = new Float32Array(100);
            const wavBytes = encodeWav(samples, SAMPLE_RATE);
            const header = new Uint8Array(wavBytes, 0, 44);

            // RIFF header
            const riff = String.fromCharCode(...header.slice(0, 4));
            expect(riff).toBe('RIFF');

            // WAVE format
            const wave = String.fromCharCode(...header.slice(8, 12));
            expect(wave).toBe('WAVE');

            // fmt chunk
            const fmt = String.fromCharCode(...header.slice(12, 16));
            expect(fmt).toBe('fmt ');
        });

        it('correctly encodes WAV chunk sizes', () => {
            const numSamples = 1000;
            const samples = new Float32Array(numSamples);
            const wavBytes = encodeWav(samples, SAMPLE_RATE);
            const view = new DataView(wavBytes);

            // File size = 36 + dataSize (where dataSize = numSamples * 2 for 16-bit mono)
            const expectedDataSize = numSamples * 2;
            const expectedFileSize = 36 + expectedDataSize;
            expect(view.getUint32(4, true)).toBe(expectedFileSize);

            // Data subchunk size
            expect(view.getUint32(40, true)).toBe(expectedDataSize);
        });

        it('has correct WAV format parameters', () => {
            const samples = new Float32Array(500);
            const wavBytes = encodeWav(samples, SAMPLE_RATE);
            const view = new DataView(wavBytes);

            // AudioFormat = 1 (PCM)
            expect(view.getUint16(20, true)).toBe(1);

            // NumChannels = 1 (mono)
            expect(view.getUint16(22, true)).toBe(1);

            // SampleRate
            expect(view.getUint32(24, true)).toBe(SAMPLE_RATE);

            // BitsPerSample = 16
            expect(view.getUint16(34, true)).toBe(16);
        });

        it('encodes samples correctly within int16 range', () => {
            const samples = new Float32Array([0.0, 0.5, -0.5, 1.0, -1.0]);
            const wavBytes = encodeWav(samples, SAMPLE_RATE);
            const view = new DataView(wavBytes);

            // PCM data starts at byte 44
            expect(view.getInt16(44, true)).toBe(0);        // 0.0 → 0
            expect(view.getInt16(46, true)).toBe(16384);     // 0.5 → ~16384
            expect(Math.abs(view.getInt16(48, true) + 16384)).toBeLessThanOrEqual(1);    // -0.5 → ~-16384
            // Allow small rounding tolerance
            expect(Math.abs(view.getInt16(50, true) - 32767)).toBeLessThanOrEqual(1);  // 1.0 → 32767
            expect(Math.abs(view.getInt16(52, true) + 32767)).toBeLessThanOrEqual(1);  // -1.0 → -32767
        });

        it('total file size matches header + data', () => {
            const numSamples = 4410; // 0.1 second at 44100
            const samples = new Float32Array(numSamples);
            const wavBytes = encodeWav(samples, SAMPLE_RATE);
            // 44-byte header + numSamples * 2 bytes of int16 data
            expect(wavBytes.byteLength).toBe(44 + numSamples * 2);
        });
    });
});
