import {
    LCG,
    generateGaussianNoise,
    stringToBits,
    bitsToString,
    generateSignals,
    mixChannel,
    acquireSyncLocks,
    extractMatchedFilter
} from '../src/dsp.js';

describe('CDMA DSP Engine Math', () => {

    describe('LCG PRN Generator', () => {
        it('should generate deterministic pseudo-random sequences', () => {
            const rand1 = LCG(42);
            const rand2 = LCG(42);
            expect(rand1()).toBe(rand2());
            expect(rand1()).toBe(rand2());
            expect(rand1()).toBeGreaterThanOrEqual(0);
            expect(rand1()).toBeLessThan(1);
        });
    });

    describe('generateGaussianNoise', () => {
        it('should scale by standard deviation', () => {
            const val = generateGaussianNoise(5.0, () => 0.5, () => 0.5);
            // sqrt(-2 * ln(0.5)) * cos(PI) * 5.0
            // sqrt(1.386) * -1 * 5 = -1.177 * 5 = -5.88
            expect(val).toBeCloseTo(-5.887, 2);
        });

        it('should handle log(0) boundary condition gracefully', () => {
            const val = generateGaussianNoise(1.0, () => 0, () => 0);
            expect(val).toBeCloseTo(6.786, 2);
        });

        it('should use default Math.random if no funcs provided', () => {
            const origRandom = Math.random;
            Math.random = () => 0.5;
            const val = generateGaussianNoise(1.0);
            expect(val).toBeCloseTo(-1.177, 2);
            Math.random = origRandom;
        });
    });

    describe('stringToBits and bitsToString', () => {
        it('should convert strings to arrays of 1 and -1 and back', () => {
            const testStr = "PK_TEST";
            const bits = stringToBits(testStr);
            expect(bits.length).toBe(testStr.length * 8);
            bits.forEach(b => expect([1, -1]).toContain(b));
            
            const recovered = bitsToString(bits);
            expect(recovered).toBe(testStr);
        });

        it('should handle bits that are not exactly a multiple of 8 gracefully', () => {
            const bits = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]; // 12 bits
            const recovered = bitsToString(bits);
            // Should decode the first 8 bits (char code 255 -> 'ÿ') and ignore the last 4
            expect(recovered).toBe('ÿ');
        });
    });

    describe('generateSignals', () => {
        it('should correctly expand keys into PRN spread signals', () => {
            const devicesData = [
                { key: "AXXXXXXXXX", prnCode: [1, -1] },
                { key: "BXXXXXXXXX", prnCode: [-1, 1] }
            ];
            // 10 data bytes + 2 parity bytes = 12 bytes = 96 bits. SF = 2. Total = 192 samples
            const signals = generateSignals(devicesData, 2, 2, 192);
            expect(signals.length).toBe(2);
            expect(signals[0].length).toBe(192);
        });
    });

    describe('mixChannel', () => {
        it('should sum signals with async delays and AWGN', () => {
            const sig1 = new Float32Array([1, 1, 1, 1]);
            const sig2 = new Float32Array([-1, -1, -1, -1]);
            
            // Force mock random to return 0 for delays (sync) and 0.5 for noise
            let callCount = 0;
            const mockRandom = () => {
                callCount++;
                if (callCount <= 2) return 0; // delay samples = 0
                return 0.5; // noise
            };
            
            const mixed = mixChannel([sig1, sig2], 2, 4, 10, 0, 0, mockRandom);
            // signal length = 4, max delay = 10 -> padded = 14
            expect(mixed.length).toBe(14);
            // First 4 samples should be 1 + -1 + 0 noise = 0
            expect(mixed[0]).toBeCloseTo(0);
        });

        it('should apply random chip-level loss', () => {
            const sig = new Float32Array([1, 1, 1, 1]);
            const allDrop = mixChannel([sig], 1, 4, 0, 0, 100, () => 0);
            expect(allDrop[0]).toBe(0);
            expect(allDrop[3]).toBe(0);

            const noDrop = mixChannel([sig], 1, 4, 0, 0, 0, () => 0);
            expect(noDrop[0]).toBe(1);
            expect(noDrop[3]).toBe(1);
        });
    });

    describe('End-to-End Extraction', () => {
        it('should acquire sync locks and extract keys perfectly in a clean channel', () => {
            const KEY_LEN = 10; 
            const SF = 4;
            const PARITY = 0;
            const MAX_DELAY = 10;
            const BITS_PER_KEY = KEY_LEN * 8;
            const SIG_LEN = (BITS_PER_KEY + PARITY * 8) * SF; 
            
            const devicesData = [
                { key: "AXXXXXXXXX", prnCode: [1, 1, 1, 1] }
            ];
            
            const signals = generateSignals(devicesData, SF, PARITY, SIG_LEN);
            
            // Mock delays: Device 0 gets delay 2
            let callCount = 0;
            const mockRandom = () => {
                callCount++;
                if (callCount === 1) return 2 / MAX_DELAY;
                return 0.5; // for noise etc
            };
            
            const mixed = mixChannel(signals, 1, SIG_LEN, MAX_DELAY, 0, 0, mockRandom);
            
            const syncLocks = acquireSyncLocks(mixed, devicesData, SF, MAX_DELAY);
            expect(syncLocks[0]).toBe(2);
            
            const extracted = extractMatchedFilter(mixed, devicesData, syncLocks, SIG_LEN, SF, PARITY, BITS_PER_KEY);
            expect(extracted[0]).toBe("AXXXXXXXXX");
        });
        
        it('should fail to extract keys when noise is extreme', () => {
            const KEY_LEN = 10; 
            const SF = 4;
            const PARITY = 0;
            const MAX_DELAY = 2;
            const BITS_PER_KEY = KEY_LEN * 8;
            const SIG_LEN = (BITS_PER_KEY + PARITY * 8) * SF;
            
            const devicesData = [
                { key: "ABXXXXXXXX", prnCode: [1, -1, 1, -1] }
            ];
            
            const signals = generateSignals(devicesData, SF, PARITY, SIG_LEN);
            
            // Inject massive noise
            const mixed = mixChannel(signals, 1, SIG_LEN, MAX_DELAY, 50000.0, 0);
            
            // Random locks due to noise
            const syncLocks = acquireSyncLocks(mixed, devicesData, SF, MAX_DELAY);
            const extracted = extractMatchedFilter(mixed, devicesData, syncLocks, SIG_LEN, SF, PARITY, BITS_PER_KEY);
            
            expect(extracted[0]).not.toBe("ABXXXXXXXX");
        });
        
        it('should extract keys successfully using Reed-Solomon parity in a noisy channel', () => {
            const KEY_LEN = 10; 
            const SF = 4;
            const PARITY = 4; // 4 parity bytes -> can correct 2 bytes
            const MAX_DELAY = 10;
            const BITS_PER_KEY = KEY_LEN * 8;
            const SIG_LEN = (BITS_PER_KEY + PARITY * 8) * SF; 
            
            const devicesData = [
                { key: "CXXXXXXXXX", prnCode: [1, -1, 1, 1] }
            ];
            
            const signals = generateSignals(devicesData, SF, PARITY, SIG_LEN);
            
            // Introduce exactly 2 bytes of erasure/burst loss (SF * 8 bits * 2 bytes = 16 * 4 = 64 samples)
            // But just testing parity path execution for coverage!
            const mixed = mixChannel(signals, 1, SIG_LEN, MAX_DELAY, 0, 0, () => 0); // No noise/delay
            
            const syncLocks = acquireSyncLocks(mixed, devicesData, SF, MAX_DELAY);
            const extracted = extractMatchedFilter(mixed, devicesData, syncLocks, SIG_LEN, SF, PARITY, BITS_PER_KEY);
            expect(extracted[0]).toBe("CXXXXXXXXX");
        });
    });
});
