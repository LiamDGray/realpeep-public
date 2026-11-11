import fs from 'fs';
import { LCG, generateSignals, mixChannel, acquireSyncLocks, extractMatchedFilter } from '../realpeep-js/src/dsp.js';

const KEY_LEN = 10;
const MAX_BANDWIDTH_HZ = 4000;
const MAX_ASYNC_DELAY = MAX_BANDWIDTH_HZ;
const bitsPerKey = KEY_LEN * 8;

const csvFile = 'results.csv';
fs.writeFileSync(csvFile, 'Devices,SpreadingFactor,FEC,Noise,LossPct,EbN0_Linear,SuccessRate\n');

// Random param generator matching UI ranges
function randomParam() {
    const devices = Math.floor(Math.random() * 20) + 1; // 1 to 20
    const spreading = Math.floor(Math.random() * 64) * 16 + 16; // 16 to 1024
    const fec = Math.floor(Math.random() * 15) + 1; // 1 to 15
    const noise = Math.random() * 15; // 0 to 15
    const lossPct = Math.random() * 0.5; // 0 to 50%
    return { devices, spreading, fec, noise, lossPct };
}

let targetPoints = 150; // Points mapped directly around the Eb/N0 cliff
let combos = [];

while (combos.length < targetPoints) {
    const p = randomParam();
    const interference = (p.noise * p.noise) + (p.devices - 1);
    const eb_n0 = (p.spreading * p.fec) / interference;
    
    // We target the boundary zone found in calibration [2.0 to 40.0]
    if (eb_n0 >= 2.0 && eb_n0 <= 40.0) {
        combos.push({ ...p, eb_n0 });
    }
}

// Add a few extreme points to verify safe/fail zones
for (let i = 0; i < 20; i++) {
    const pFail = randomParam();
    pFail.eb_n0 = (pFail.spreading * pFail.fec) / ((pFail.noise * pFail.noise) + (pFail.devices - 1));
    if (pFail.eb_n0 < 1.0) combos.push(pFail);
    
    const pSafe = randomParam();
    pSafe.eb_n0 = (pSafe.spreading * pSafe.fec) / ((pSafe.noise * pSafe.noise) + (pSafe.devices - 1));
    if (pSafe.eb_n0 > 100.0) combos.push(pSafe);
}

// Sort by Eb/N0 so the CSV clearly shows the cliff curve
combos.sort((a, b) => a.eb_n0 - b.eb_n0);

console.log(`Running smart sweep of ${combos.length} points mapping the theoretical boundary...`);

for (let c of combos) {
    let successes = 0;
    
    try {
        const devicesData = [];
        for (let i = 0; i < c.devices; i++) {
            const prnSeed = 42 + i * 100;
            const rand = LCG(prnSeed);
            let key = "PK_" + rand().toString(36).substring(2, 9).toUpperCase();
            while (key.length < KEY_LEN) key += "X";
            key = key.substring(0, KEY_LEN);
            
            const prnCode = Array.from({length: c.spreading}, () => rand() > 0.5 ? 1 : -1);
            devicesData.push({ key, prnCode });
        }
        
        const signalLength = bitsPerKey * c.fec * c.spreading;
        const signals = generateSignals(devicesData, c.spreading, c.fec, signalLength);
        
        const mixed = mixChannel(signals, c.devices, signalLength, MAX_ASYNC_DELAY, c.noise, c.lossPct);
        const syncLocks = acquireSyncLocks(mixed, devicesData, c.spreading, MAX_ASYNC_DELAY);
        const extracted = extractMatchedFilter(mixed, devicesData, syncLocks, signalLength, c.spreading, c.fec, bitsPerKey);
        
        for (let d = 0; d < c.devices; d++) {
            if (extracted[d] === devicesData[d].key) successes++;
        }
        const successRate = successes / c.devices;
        
        fs.appendFileSync(csvFile, `${c.devices},${c.spreading},${c.fec},${c.noise.toFixed(2)},${(c.lossPct*100).toFixed(0)},${c.eb_n0.toFixed(2)},${successRate.toFixed(2)}\n`);
    } catch (e) {
        fs.appendFileSync(csvFile, `${c.devices},${c.spreading},${c.fec},${c.noise.toFixed(2)},${(c.lossPct*100).toFixed(0)},${c.eb_n0.toFixed(2)},ERROR\n`);
    }
}

console.log("Smart sweep complete! Results written to results.csv");
