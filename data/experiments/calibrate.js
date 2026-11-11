import { LCG, generateSignals, mixChannel, acquireSyncLocks, extractMatchedFilter } from '../realpeep-js/src/dsp.js';

const devices = 5;
const spreading = 128;
const fec = 5;
const lossPct = 0.0;

const MAX_BANDWIDTH_HZ = 4000;
const KEY_LEN = 10;
const MAX_ASYNC_DELAY = MAX_BANDWIDTH_HZ;
const bitsPerKey = KEY_LEN * 8;

console.log("Calibrating Eb/N0 threshold by sweeping Noise from 0 to 15...");
console.log("Devices: 5 | Spreading: 128 | FEC: 5");

for (let noise = 0; noise <= 15; noise += 0.5) {
    let trials = 5;
    let totalSuccesses = 0;
    
    const interferencePower = (noise * noise) + (devices - 1);
    const eb_n0_linear = (spreading * fec) / interferencePower;
    const eb_n0_dB = 10 * Math.log10(eb_n0_linear);
    
    for (let t = 0; t < trials; t++) {
        const devicesData = [];
        for (let i = 0; i < devices; i++) {
            const prnSeed = 42 + i * 100 + t * 1000;
            const rand = LCG(prnSeed);
            let key = "PK_" + rand().toString(36).substring(2, 9).toUpperCase();
            while (key.length < KEY_LEN) key += "X";
            key = key.substring(0, KEY_LEN);
            
            const prnCode = Array.from({length: spreading}, () => rand() > 0.5 ? 1 : -1);
            devicesData.push({ key, prnCode });
        }
        
        const signalLength = bitsPerKey * fec * spreading;
        const signals = generateSignals(devicesData, spreading, fec, signalLength);
        
        const mixed = mixChannel(signals, devices, signalLength, MAX_ASYNC_DELAY, noise, lossPct);
        const syncLocks = acquireSyncLocks(mixed, devicesData, spreading, MAX_ASYNC_DELAY);
        const extracted = extractMatchedFilter(mixed, devicesData, syncLocks, signalLength, spreading, fec, bitsPerKey);
        
        for (let d = 0; d < devices; d++) {
            if (extracted[d] === devicesData[d].key) {
                totalSuccesses++;
            }
        }
    }
    
    const successRate = totalSuccesses / (devices * trials);
    console.log(`Noise: ${noise.toFixed(1).padStart(4)} | Eb/N0: ${eb_n0_linear.toFixed(2).padStart(6)} (${eb_n0_dB.toFixed(2).padStart(5)} dB) | Success: ${(successRate*100).toFixed(0).padStart(3)}%`);
}
