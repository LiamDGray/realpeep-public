// --- JS Port of CDMA DSP Engine ---

// Seeded PRN Generator (Linear Congruential Generator)
export function LCG(seed) {
    let state = seed;
    return function() {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
    }
}

// Box-Muller Transform for AWGN
export function generateGaussianNoise(std, randomFunc1 = Math.random, randomFunc2 = Math.random) {
    let u1 = randomFunc1(), u2 = randomFunc2();
    // Guard against log(0)
    if (u1 <= 0) u1 = 1e-10;
    let z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return z0 * std;
}

export function stringToBits(str) {
    let bits = [];
    for (let i = 0; i < str.length; i++) {
        let binary = str.charCodeAt(i).toString(2).padStart(8, '0');
        for (let j = 0; j < 8; j++) {
            bits.push(binary[j] === '1' ? 1 : -1);
        }
    }
    return bits;
}

export function bitsToString(bits) {
    let str = "";
    for (let i = 0; i < bits.length; i += 8) {
        let chunk = bits.slice(i, i + 8);
        if (chunk.length === 8) {
            let binary = chunk.map(b => b > 0 ? '1' : '0').join('');
            str += String.fromCharCode(parseInt(binary, 2));
        }
    }
    return str;
}

import { ReedSolomonES } from './ReedSolomon.js';

// ... (other imports or code)
// Keep stringToBits and bitsToString, but add interleaver

export function generateSignals(devicesData, spreadingFactor, parityBytes, signalLength) {
    const signals = [];
    const errorCorrectionRatio = parityBytes / 20; // 10 data bytes * 2 = 20
    const presetName = 'ByteAs8bit';
    
    for (let d of devicesData) {
        // Convert 10-char key to Uint8Array
        const dataBytes = new Uint8Array(10);
        for (let i = 0; i < 10; i++) {
            dataBytes[i] = d.key.charCodeAt(i);
        }
        
        // Reed-Solomon Encode
        let rsBytes = dataBytes;
        if (parityBytes > 0) {
            rsBytes = ReedSolomonES.encode(dataBytes, presetName, errorCorrectionRatio);
        }
        
        // Convert to bits
        const rsBits = [];
        for (let i = 0; i < rsBytes.length; i++) {
            let binary = rsBytes[i].toString(2).padStart(8, '0');
            for (let b = 0; b < 8; b++) {
                rsBits.push(binary[b] === '1' ? 1 : -1);
            }
        }
        
        let signal = new Float32Array(signalLength);
        let idx = 0;
        for (let i = 0; i < rsBits.length; i++) {
            for (let j = 0; j < spreadingFactor; j++) {
                if (idx < signalLength) {
                    signal[idx++] = rsBits[i] * d.prnCode[j];
                }
            }
        }

        signals.push(signal);
    }
    return signals;
}

export function mixChannel(signals, numDevices, signalLength, MAX_ASYNC_DELAY, noiseStd, packetLoss, randomFunc = Math.random) {
    const paddedSignalLength = signalLength + MAX_ASYNC_DELAY;
    let mixed = new Float32Array(paddedSignalLength);
    
    // Mix with delays
    for (let d = 0; d < numDevices; d++) {
        const delaySamples = Math.floor(randomFunc() * MAX_ASYNC_DELAY);
        for (let i = 0; i < signalLength; i++) {
            mixed[delaySamples + i] += signals[d][i];
        }
    }
    
    // Add AWGN
    for (let i = 0; i < paddedSignalLength; i++) {
        let noise = generateGaussianNoise(noiseStd, randomFunc, randomFunc);
        mixed[i] += noise;
    }
    
    // Random chip-level loss (more realistic than contiguous burst)
    if (packetLoss > 0) {
        const lossProbability = packetLoss / 100;
        for (let i = 0; i < paddedSignalLength; i++) {
            if (randomFunc() < lossProbability) {
                mixed[i] = 0;
            }
        }
    }
    
    return mixed;
}

export function acquireSyncLocks(mixed, devicesData, spreadingFactor, MAX_ASYNC_DELAY) {
    const syncLocks = [];
    for (let d = 0; d < devicesData.length; d++) {
        let maxCorr = -1;
        let bestOffset = 0;
        const prn = devicesData[d].prnCode;
        
        // Use the first 16 bits of the key as an acquisition preamble
        const bits = stringToBits(devicesData[d].key);
        const syncBits = bits.slice(0, 16);
        
        for (let offset = 0; offset < MAX_ASYNC_DELAY; offset++) {
            let dot = 0;
            for (let b = 0; b < syncBits.length; b++) {
                for (let j = 0; j < spreadingFactor; j++) {
                    dot += mixed[offset + b * spreadingFactor + j] * (syncBits[b] * prn[j]);
                }
            }
            const absDot = Math.abs(dot);
            if (absDot > maxCorr) {
                maxCorr = absDot;
                bestOffset = offset;
            }
        }
        syncLocks.push(bestOffset);
    }
    return syncLocks;
}

export function extractMatchedFilter(mixed, devicesData, syncLocks, signalLength, spreadingFactor, parityBytes, bitsPerKey) {
    const numDevices = devicesData.length;
    const totalBytes = 10 + parityBytes;
    const totalBits = totalBytes * 8;
    const errorCorrectionRatio = parityBytes / 20;
    const presetName = 'ByteAs8bit';
    
    const accumulators = Array(numDevices).fill(0).map(() => new Float32Array(totalBits));
    const paddedSignalLength = mixed.length;
    
    // Process all samples
    for (let i = 0; i < paddedSignalLength; i++) {
        for (let d = 0; d < numDevices; d++) {
            if (i >= syncLocks[d] && i < syncLocks[d] + signalLength) {
                const shiftedI = i - syncLocks[d];
                const bitIdx = Math.floor(shiftedI / spreadingFactor);
                if (bitIdx < totalBits) {
                    const chipIdx = shiftedI % spreadingFactor;
                    accumulators[d][bitIdx] += mixed[i] * devicesData[d].prnCode[chipIdx];
                }
            }
        }
    }
    
    const extractedKeys = [];
    for (let d = 0; d < numDevices; d++) {
        // Hard decision on accumulated bits
        let hardBits = new Float32Array(totalBits);
        for (let i = 0; i < totalBits; i++) {
            hardBits[i] = accumulators[d][i] > 0 ? 1 : -1;
        }
        
        // Convert to bytes
        const receivedBytes = new Uint8Array(totalBytes);
        for (let i = 0; i < totalBytes; i++) {
            let byteStr = '';
            for (let b = 0; b < 8; b++) {
                byteStr += hardBits[i * 8 + b] > 0 ? '1' : '0';
            }
            receivedBytes[i] = parseInt(byteStr, 2);
        }
        
        // Reed-Solomon Decode
        let decodedStr = '';
        if (parityBytes > 0) {
            try {
                // Best effort decode, if uncorrectable it just returns the corrupted array
                const decodedBytes = ReedSolomonES.decode(receivedBytes, presetName, errorCorrectionRatio);
                for (let i = 0; i < 10; i++) {
                    decodedStr += String.fromCharCode(decodedBytes[i]);
                }
            } catch (e) {
                // If decoding throws (strict mode or unrecoverable error), just use raw bytes
                for (let i = 0; i < 10; i++) {
                    decodedStr += String.fromCharCode(receivedBytes[i]);
                }
            }
        } else {
            for (let i = 0; i < 10; i++) {
                decodedStr += String.fromCharCode(receivedBytes[i]);
            }
        }
        
        extractedKeys.push(decodedStr);
    }
    
    return extractedKeys;
}

// End of DSP Engine
