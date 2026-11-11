/**
 * Systematic DSP extraction test — finds the boundary between success and failure.
 * Run: cd realpeep-js && NODE_OPTIONS=--experimental-vm-modules node tests/dsp-sweep.mjs
 */
import { LCG, generateGaussianNoise, stringToBits, generateSignals, mixChannel, acquireSyncLocks, extractMatchedFilter } from '../src/dsp.js';

function runOne(numDevices, sf, fec, noiseStd, packetLoss, seed) {
    const KEY_LEN = 10;
    const bitsPerKey = KEY_LEN * 8;
    const totalBytes = KEY_LEN + fec;
    const totalBits = totalBytes * 8;
    const signalLength = totalBits * sf;
    const MAX_ASYNC_DELAY = 4000;

    // Generate devices with seeded RNG
    const devicesData = [];
    for (let i = 0; i < numDevices; i++) {
        const keySeed = seed + i * 1000;
        // Deterministic key generation from seed
        let key = '';
        let s = keySeed;
        for (let c = 0; c < KEY_LEN; c++) {
            s = (s * 1664525 + 1013904223) >>> 0;
            key += String.fromCharCode(65 + (s % 26)); // A-Z
        }
        const prnSeed = seed + i * 100;
        const rand = LCG(prnSeed);
        const prnCode = Array.from({ length: sf }, () => rand() > 0.5 ? 1 : -1);
        devicesData.push({ key, prnCode });
    }

    // Generate and mix signals
    const signals = generateSignals(devicesData, sf, fec, signalLength);
    const mixed = mixChannel(signals, numDevices, signalLength, MAX_ASYNC_DELAY, noiseStd, packetLoss);

    // Sync
    const syncLocks = acquireSyncLocks(mixed, devicesData, sf, MAX_ASYNC_DELAY);

    // Extract
    const extractedKeys = extractMatchedFilter(mixed, devicesData, syncLocks, signalLength, sf, fec, bitsPerKey);

    // Count errors
    let errors = 0;
    let charErrors = 0;
    for (let d = 0; d < numDevices; d++) {
        const expected = devicesData[d].key;
        const got = extractedKeys[d] || '';
        if (expected !== got) {
            errors++;
            for (let c = 0; c < Math.min(expected.length, got.length); c++) {
                if (expected[c] !== got[c]) charErrors++;
            }
            charErrors += Math.abs(expected.length - got.length);
        }
    }

    return { errors, charErrors, totalDevices: numDevices, keys: devicesData.map(d => d.key), extracted: extractedKeys };
}

// ── Sweep ──────────────────────────────────────────────────────
const strategies = [
    // Baseline: easy
    { d: 2, sf: 128, fec: 10, noise: 1, loss: 0 },
    // More devices
    { d: 3, sf: 128, fec: 10, noise: 1, loss: 0 },
    { d: 5, sf: 128, fec: 10, noise: 1, loss: 0 },
    // Higher SF
    { d: 5, sf: 256, fec: 10, noise: 1, loss: 0 },
    { d: 5, sf: 512, fec: 10, noise: 1, loss: 0 },
    { d: 5, sf: 1024, fec: 10, noise: 1, loss: 0 },
    // More noise
    { d: 5, sf: 128, fec: 10, noise: 2, loss: 0 },
    { d: 5, sf: 128, fec: 10, noise: 3, loss: 0 },
    { d: 5, sf: 128, fec: 10, noise: 5, loss: 0 },
    // More FEC
    { d: 5, sf: 128, fec: 20, noise: 3, loss: 0 },
    // Packet loss
    { d: 5, sf: 128, fec: 10, noise: 2, loss: 5 },
    { d: 5, sf: 128, fec: 10, noise: 2, loss: 10 },
    // Combined stress
    { d: 5, sf: 256, fec: 20, noise: 3, loss: 5 },
    { d: 5, sf: 512, fec: 20, noise: 3, loss: 5 },
    { d: 5, sf: 1024, fec: 20, noise: 3, loss: 5 },
    // High stress
    { d: 10, sf: 256, fec: 20, noise: 2, loss: 5 },
    { d: 10, sf: 512, fec: 20, noise: 2, loss: 5 },
];

console.log('| Devices | SF | FEC | Noise | Loss% | Result | Errors | Char errs | Notes |');
console.log('|---------|-----|------|-------|-------|--------|--------|-----------|-------|');

let firstFailure = null;

for (const { d, sf, fec, noise, loss } of strategies) {
    // Run 3 trials with different seeds
    let totalErr = 0, totalChar = 0, totalDev = 0;
    for (let trial = 0; trial < 3; trial++) {
        const r = runOne(d, sf, fec, noise, loss, 42 + trial * 10000);
        totalErr += r.errors;
        totalChar += r.charErrors;
        totalDev += r.totalDevices;
    }

    const pct = totalDev > 0 ? ((1 - totalErr / totalDev) * 100).toFixed(0) : '100';
    const result = totalErr === 0 ? '✅ PASS' : '❌ FAIL';
    const note = totalErr > 0 && totalChar > 0
        ? `~${(totalChar/totalErr).toFixed(1)} chars/error`
        : '';

    console.log(`| ${d} | ${sf} | ${fec} | ${noise.toFixed(1)} | ${loss}% | ${result} | ${totalErr}/${totalDev} | ${totalChar} | ${note} |`);

    if (totalErr > 0 && !firstFailure) {
        firstFailure = { d, sf, fec, noise, loss };
    }
}

console.log(`\nFirst failure: d=${firstFailure?.d} sf=${firstFailure?.sf} fec=${firstFailure?.fec} noise=${firstFailure?.noise} loss=${firstFailure?.loss}%`);
