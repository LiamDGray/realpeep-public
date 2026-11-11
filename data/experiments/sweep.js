import fs from 'fs';
import { LCG, generateGaussianNoise, stringToBits, bitsToString, generateSignals, mixChannel, acquireSyncLocks, extractMatchedFilter } from '../realpeep-js/src/dsp.js';

// Helpers to generate evenly spaced values
function linspaceInt(start, end, num) {
    const arr = [];
    const step = (end - start) / (num - 1);
    for (let i = 0; i < num; i++) {
        arr.push(Math.round(start + (step * i)));
    }
    return arr;
}

function linspaceFloat(start, end, num) {
    const arr = [];
    const step = (end - start) / (num - 1);
    for (let i = 0; i < num; i++) {
        arr.push(start + (step * i));
    }
    return arr;
}

const devices_arr = linspaceInt(1, 20, 10);
const spreading_arr = linspaceInt(16, 1024, 10);
const fec_arr = linspaceInt(1, 15, 10);
const noise_arr = linspaceFloat(0, 15, 10);
const loss_arr = linspaceFloat(0, 50, 10);

const MAX_BANDWIDTH_HZ = 4000;
const KEY_LEN = 10;
const MAX_ASYNC_DELAY = MAX_BANDWIDTH_HZ;
const bitsPerKey = KEY_LEN * 8;

const csvFile = 'results.csv';
fs.writeFileSync(csvFile, 'Devices,SpreadingFactor,FEC,Noise,Loss,SuccessRate\n');

let total = devices_arr.length * spreading_arr.length * fec_arr.length * noise_arr.length * loss_arr.length;
let count = 0;

console.log(`Starting sweep of ${total} combinations...`);

for (let devices of devices_arr) {
    for (let spreading of spreading_arr) {
        for (let fec of fec_arr) {
            for (let noise of noise_arr) {
                for (let loss of loss_arr) {
                    count++;
                    if (count % 100 === 0) {
                        console.log(`Progress: ${count} / ${total} (${(count/total*100).toFixed(1)}%)`);
                    }
                    
                    const lossPct = loss / 100.0;
                    
                    try {
                        const devicesData = [];
                        for (let i = 0; i < devices; i++) {
                            const prnSeed = 42 + i * 100;
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
                        
                        let successes = 0;
                        for (let d = 0; d < devices; d++) {
                            if (extracted[d] === devicesData[d].key) {
                                successes++;
                            }
                        }
                        const successRate = successes / devices;
                        
                        fs.appendFileSync(csvFile, `${devices},${spreading},${fec},${noise.toFixed(2)},${loss.toFixed(2)},${successRate.toFixed(2)}\n`);
                    } catch (e) {
                        console.error(`Error at combination: ${devices}, ${spreading}, ${fec}, ${noise}, ${loss}`, e);
                        fs.appendFileSync(csvFile, `${devices},${spreading},${fec},${noise.toFixed(2)},${loss.toFixed(2)},ERROR\n`);
                    }
                }
            }
        }
    }
}
console.log('Sweep complete!');
