/**
 * witness-demo.js — End-to-End Witness Demo orchestration (Node-testable core).
 *
 * Manages the full RealPeep witness pipeline through a state machine:
 *   Setup → Capture → DAG → Verify
 *
 * Handles audio generation, mesh construction, DAG building, Merkle tree
 * construction, and verification. No DOM dependencies — UI layer is separate.
 *
 * Uses:
 *   - chirp-cdma.js   for chirp CDMA audio generation
 *   - audio-cdma.js   for Gold code generation
 *   - spatiotemporal-mesh.js for beacon chains, heard sets, Merkle trees, DAG
 *   - e2e-flow.js     for simulateCapture / verifyFullPipeline
 *   - duress-core.js  for duress nonce handling
 */

import { generateChirpDeviceAudio } from './chirp-cdma.js';
import { generateGoldCode } from './audio-cdma.js';
import {
    BeaconChain, HeardSet, NistBeacon, MerkleTree,
    buildBeacon, buildObservationBundle, reconstructDAG,
    demoTurstHash,
} from './spatiotemporal-mesh.js';
import { simulateCapture, verifyFullPipeline } from './e2e-flow.js';
import { searchDuressNonce, checkDuressPredicate } from './duress-core.js';

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════

export const PHASES = ['setup', 'capture', 'dag', 'verify'];
export const SAMPLE_RATE = 44100;
export const CHIRP_F0 = 18000;
export const CHIRP_F1 = 22000;
export const CHIRP_DURATION = 2.0;

// ═══════════════════════════════════════════════════════════════════════
// Device factory
// ═══════════════════════════════════════════════════════════════════════

let _deviceCounter = 0;

/**
 * Create a device configuration for the witness demo.
 * @param {string} [label] - Optional label (A, B, C, ...)
 * @returns {{ id: string, pk: string, sk: string, nonce: string, label: string }}
 */
export function createDevice(label) {
    const idx = _deviceCounter++;
    const lbl = label || String.fromCharCode(65 + idx);
    const seed = Date.now() + '_' + Math.random() + '_' + idx;
    const h = demoTurstHash(seed);
    return {
        id: `dev-${lbl}`,
        pk: `pk_${lbl}_${h.slice(0, 8)}`,
        sk: `sk_${lbl}_${h.slice(8, 16)}`,
        nonce: h.slice(16, 24),
        label: lbl,
    };
}

/**
 * Reset the device counter (for tests).
 */
export function resetDeviceCounter() {
    _deviceCounter = 0;
}

// ═══════════════════════════════════════════════════════════════════════
// Topology factory
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build a full-mesh topology for the given devices.
 * @param {Array<{pk: string}>} devices
 * @returns {Object} topology map pk → { observedKeys, rssi }
 */
export function buildFullMeshTopology(devices) {
    const topology = {};
    for (const d of devices) {
        const rssi = {};
        const observedKeys = [];
        for (const o of devices) {
            if (o.pk === d.pk) continue;
            observedKeys.push(o.pk);
            rssi[o.pk] = -40 - Math.random() * 30; // -40 to -70 dBm
        }
        topology[d.pk] = { observedKeys, rssi };
    }
    return topology;
}

// ═══════════════════════════════════════════════════════════════════════
// Audio generation via chirp-cdma.js (real chirp CDMA audio)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate chirp CDMA audio buffers for all devices.
 * Returns Float32Array buffers suitable for Web Audio API playback
 * and peak arrays for visualization.
 *
 * @param {Array<{id: string, pk: string}>} devices
 * @param {Object} [opts]
 * @param {number} [opts.chirpDuration=CHIRP_DURATION]
 * @param {number} [opts.sampleRate=SAMPLE_RATE]
 * @param {number} [opts.sf=64] - spreading factor
 * @returns {{
 *   buffers: Object<string, Float32Array>,
 *   goldCodes: Object<string, Int8Array>,
 *   waveformPeaks: Object<string, number[]>,
 *   combinedBuffer: Float32Array
 * }}
 */
export function generateWitnessAudio(devices, opts = {}) {
    const {
        chirpDuration = CHIRP_DURATION,
        sampleRate = SAMPLE_RATE,
        sf = 64,
    } = opts;

    const TX_SPACING = 0.03;
    const lastTxTime = 0.01 + (devices.length - 1) * TX_SPACING;
    const bufferDuration = lastTxTime + chirpDuration + 0.05;

    const goldCodes = {};
    const buffers = {};
    const waveformPeaks = {};

    for (const dev of devices) {
        goldCodes[dev.id] = generateGoldCode(dev.pk, sf);
    }

    for (let i = 0; i < devices.length; i++) {
        const dev = devices[i];
        const txTime = 0.01 + i * TX_SPACING;
        const deviceConfig = {
            deviceId: dev.id,
            ephemeralKey: dev.pk,
            txTime,
        };
        const buffer = generateChirpDeviceAudio(deviceConfig, goldCodes[dev.id], {
            f0: CHIRP_F0,
            f1: CHIRP_F1,
            duration: chirpDuration,
            bufferDuration,
            sampleRate,
        });
        buffers[dev.id] = buffer;

        // Downsample for waveform visualization (every ~43 samples at 44100 → ~1000 points)
        const downsample = Math.max(1, Math.floor(buffer.length / 1000));
        const peaks = [];
        for (let j = 0; j < buffer.length; j += downsample) {
            peaks.push(buffer[j]);
        }
        waveformPeaks[dev.id] = peaks;
    }

    // Combined buffer (all devices mixed)
    const nSamples = Math.floor(bufferDuration * sampleRate);
    const combined = new Float32Array(nSamples);
    for (const buf of Object.values(buffers)) {
        for (let i = 0; i < Math.min(buf.length, nSamples); i++) {
            combined[i] += buf[i];
        }
    }
    // Normalize
    let maxAbs = 0;
    for (let i = 0; i < nSamples; i++) {
        const abs = Math.abs(combined[i]);
        if (abs > maxAbs) maxAbs = abs;
    }
    if (maxAbs > 0) {
        for (let i = 0; i < nSamples; i++) combined[i] /= maxAbs;
    }

    return { buffers, goldCodes, waveformPeaks, combinedBuffer: combined, bufferDuration };
}

// ═══════════════════════════════════════════════════════════════════════
// Spatio-temporal mesh construction
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build a spatio-temporal mesh from devices.
 * Creates beacon chains, heard sets, and produces observation bundles.
 *
 * @param {Array<{pk: string, label: string}>} devices
 * @param {number} numRounds - number of beacon rounds
 * @param {Object} [opts]
 * @param {number} [opts.seed=42] - NIST beacon seed
 * @returns {{
 *   devices: Array,
 *   allBeacons: Array<Array>,
 *   bundles: Array,
 *   dag: Object,
 *   nistBeacon: NistBeacon
 * }}
 */
export function buildSpatioTemporalMesh(devices, numRounds, opts = {}) {
    const { seed = 42 } = opts;
    const nist = new NistBeacon(seed);

    const meshDevices = devices.map(d => ({
        ...d,
        chain: new BeaconChain(d.pk),
        heard: new HeardSet(),
        keyPair: {
            sign: (data) => {
                let h = 0;
                for (let j = 0; j < data.length; j++) {
                    h = ((h << 5) - h) + data.charCodeAt(j); h |= 0;
                }
                return (Math.abs(h)).toString(16).padStart(8, '0').repeat(4);
            },
        },
    }));

    const allBeacons = [];
    for (let round = 0; round < numRounds; round++) {
        const nistPulse = nist.getPulse(round);
        const roundBeacons = [];

        for (const dev of meshDevices) {
            const beacon = buildBeacon(dev.chain, dev.heard, nistPulse, dev.keyPair);
            roundBeacons.push(beacon);
        }
        allBeacons.push(roundBeacons);

        // Simulate cross-hearing
        for (let i = 0; i < meshDevices.length; i++) {
            for (let j = 0; j < meshDevices.length; j++) {
                if (i === j) continue;
                const rssi = -40 - Math.random() * 40;
                if (meshDevices[i].heard.acceptBeacon(rssi, meshDevices[i].heard.size())) {
                    const heardBeacon = roundBeacons[j];
                    meshDevices[i].heard.addOrUpdate(
                        meshDevices[j].pk,
                        heardBeacon.prev_self,
                        rssi
                    );
                }
            }
        }
    }

    const bundles = meshDevices.map(dev =>
        buildObservationBundle(dev.chain, dev.heard, dev.keyPair)
    );
    const dag = reconstructDAG(bundles);

    return { devices: meshDevices, allBeacons, bundles, dag, nistBeacon: nist };
}

// ═══════════════════════════════════════════════════════════════════════
// Merkle tree data for visualization
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build Merkle tree data from heard sets for visualization.
 * Returns leaf hashes, intermediate nodes, and root.
 *
 * @param {Array} meshDevices - devices from buildSpatioTemporalMesh
 * @returns {Object<string, { root: string, leaves: Array<{pk: string, hash: string}>, levels: Array<Array<{hash: string}>> }>}
 */
export function buildMerkleTreeData(meshDevices) {
    const trees = {};
    for (const dev of meshDevices) {
        const entries = dev.heard.getEntries();
        if (entries.length === 0) {
            trees[dev.pk] = { root: '0'.repeat(32), leaves: [], levels: [] };
            continue;
        }
        const tree = new MerkleTree(entries);
        trees[dev.pk] = {
            root: tree.root,
            leaves: entries.map(e => ({ pk: e.pk, hash: tree._leafMap.get(e.pk)?.hash || demoTurstHash(e.pk + e.hash) })),
            levels: tree._levels || [],
        };
    }
    return trees;
}

/**
 * Build audio chunk Merkle tree.
 * Splits audio buffers into chunks, hashes each chunk, then builds a tree.
 *
 * @param {Object<string, Float32Array>} audioBuffers
 * @param {number} [chunkSize=1024]
 * @returns {{ root: string, leaves: string[], chunkCount: number }}
 */
export function buildAudioChunkMerkleTree(audioBuffers, chunkSize = 1024) {
    const allChunks = [];
    for (const buf of Object.values(audioBuffers)) {
        for (let i = 0; i < buf.length; i += chunkSize) {
            const chunk = buf.slice(i, i + chunkSize);
            let acc = 0;
            for (let j = 0; j < chunk.length; j++) acc += chunk[j] * 1000;
            allChunks.push(demoTurstHash(`chunk:${i}:${acc.toFixed(2)}`));
        }
    }
    // Build simple tree
    if (allChunks.length === 0) return { root: '0'.repeat(32), leaves: [], chunkCount: 0 };
    const leaves = allChunks.map(h => ({ pk: `chunk_${allChunks.indexOf(h)}`, hash: h }));

    // Build tree
    let level = leaves.map(l => l.hash);
    while (level.length > 1) {
        const next = [];
        for (let i = 0; i < level.length; i += 2) {
            const left = level[i];
            const right = i + 1 < level.length ? level[i + 1] : level[i];
            next.push(demoTurstHash(left + right));
        }
        level = next;
    }
    return { root: level[0] || '0'.repeat(32), leaves: allChunks, chunkCount: allChunks.length };
}

// ═══════════════════════════════════════════════════════════════════════
// State machine
// ═══════════════════════════════════════════════════════════════════════

/**
 * Witness demo state machine.
 *
 * States: setup → capture → dag → verify → done
 *
 * @property {string} phase - current phase
 * @property {string} pin - 4-digit PIN (set during setup)
 * @property {boolean} isDuress - whether duress mode is active
 * @property {Array} devices - device configs
 * @property {Object} topology - device topology
 * @property {Object} audioData - generated audio
 * @property {Object} meshData - spatio-temporal mesh
 * @property {Object} merkleData - Merkle tree data
 * @property {Object} audioMerkle - audio chunk Merkle tree
 * @property {Object} captureResult - from e2e-flow simulateCapture
 * @property {Object} verdict - from e2e-flow verifyFullPipeline
 * @property {Object} certificate - MNR certificate content
 * @property {Array<string>} log - event log
 * @property {Array<Function>} listeners - phase change listeners
 */
export class WitnessDemo {
    constructor() {
        this.phase = 'setup';
        this.pin = '';
        this.isDuress = false;
        this.devices = [];
        this.topology = {};
        this.audioData = null;
        this.meshData = null;
        this.merkleData = null;
        this.audioMerkle = null;
        this.captureResult = null;
        this.verdict = null;
        this.certificate = null;
        this.log = [];
        this.listeners = [];
    }

    /**
     * Register a phase change listener.
     * @param {(phase: string, data: WitnessDemo) => void} fn
     */
    onPhaseChange(fn) {
        this.listeners.push(fn);
    }

    /** @private */
    _emit(phase) {
        this.phase = phase;
        this.log.push(`[${new Date().toISOString()}] Phase: ${phase}`);
        for (const fn of this.listeners) {
            try { fn(phase, this); } catch (e) { /* ignore listener errors */ }
        }
    }

    /** @private */
    _addLog(msg) {
        this.log.push(`[${new Date().toISOString()}] ${msg}`);
    }

    /**
     * Enter PIN for setup phase.
     * @param {string} digit - '0'-'9'
     * @returns {boolean} true if PIN is now complete (4 digits)
     */
    enterPin(digit) {
        if (this.phase !== 'setup') return false;
        if (this.pin.length >= 4) return false;
        this.pin += digit;
        this._addLog(`PIN digit entered: ${digit} (${this.pin.length}/4)`);
        return this.pin.length === 4;
    }

    /** Clear PIN. */
    clearPin() {
        this.pin = '';
        this._addLog('PIN cleared');
    }

    /**
     * Toggle duress mode.
     * @param {boolean} on
     */
    setDuress(on) {
        this.isDuress = on;
        this._addLog(`Duress mode: ${on ? 'ON' : 'OFF'}`);
    }

    /**
     * Derive a duress key from the PIN.
     * @returns {{ nonce: string, duressDetected: boolean, hashHex: string }}
     */
    deriveDuressKey() {
        if (this.isDuress) {
            const result = searchDuressNonce(10000);
            this._addLog(`Duress nonce found: ${result.found}`);
            return result;
        } else {
            const check = checkDuressPredicate(`normal-${this.pin}`);
            return { nonce: `normal-${this.pin}`, duressDetected: false, hashHex: check.hashHex };
        }
    }

    /**
     * Initialize capture: create devices, topology, audio.
     * @param {number} numDevices - 2-5
     * @returns {Promise<void>}
     */
    async initCapture(numDevices) {
        if (this.phase !== 'setup') return;
        this._addLog(`Initializing capture with ${numDevices} devices`);

        // Create devices
        resetDeviceCounter();
        const labels = ['A', 'B', 'C', 'D', 'E'].slice(0, numDevices);
        this.devices = labels.map(l => createDevice(l));

        // Build topology
        this.topology = buildFullMeshTopology(this.devices);

        // Generate audio
        this._addLog('Generating chirp CDMA audio...');
        this.audioData = generateWitnessAudio(this.devices, {
            chirpDuration: CHIRP_DURATION,
            sampleRate: SAMPLE_RATE,
            sf: 64,
        });

        this._addLog(`Audio generated: ${Object.keys(this.audioData.buffers).length} buffers, ${this.audioData.bufferDuration.toFixed(2)}s`);
    }

    /**
     * Transition to capture phase.
     */
    startCapture() {
        if (this.phase !== 'setup') return;
        this._emit('capture');
    }

    /**
     * Complete capture and transition to DAG phase.
     * Runs e2e-flow pipeline and builds spatio-temporal mesh.
     * @returns {Promise<void>}
     */
    async completeCapture() {
        if (this.phase !== 'capture') return;

        this._addLog('Running simulateCapture...');
        this.captureResult = await simulateCapture(this.devices, this.topology, {
            passphrase: this.isDuress ? 'duress' : 'normal',
            sampleRate: SAMPLE_RATE,
            durationSec: CHIRP_DURATION,
        });

        this._addLog('Building spatio-temporal mesh...');
        this.meshData = buildSpatioTemporalMesh(this.devices, 5);

        this._addLog('Building Merkle trees...');
        this.merkleData = buildMerkleTreeData(this.meshData.devices);
        this.audioMerkle = buildAudioChunkMerkleTree(this.audioData.buffers);

        this._emit('dag');
    }

    /**
     * Transition to verify phase.
     * Runs verification pipeline.
     * @returns {Promise<void>}
     */
    async startVerification() {
        if (this.phase !== 'dag') return;

        this._addLog('Running verifyFullPipeline...');
        this.verdict = await verifyFullPipeline(this.captureResult);

        // Build certificate
        this.certificate = {
            devices: this.devices.map(d => ({ label: d.label, pk: d.pk.slice(0, 12) })),
            zkValid: this.verdict.zkValid,
            zkCount: this.verdict.zkDetails?.total || 0,
            mnrCertificate: this.verdict.mnrCertificate,
            merkleRoot: this.verdict.merkleRoot,
            otsProof: this.verdict.otsProof?.otsProof?.slice(0, 12) || '—',
            verdict: this.verdict.verdict,
            dagNodes: this.meshData?.dag?.nodes?.length || 0,
            dagEdges: this.meshData?.dag?.edges?.length || 0,
            audioChunks: this.audioMerkle?.chunkCount || 0,
            audioRoot: this.audioMerkle?.root?.slice(0, 16) || '—',
            duressDetected: this.captureResult?.duressInfo?.duressDetected || false,
            deviceCount: this.devices.length,
        };

        this._emit('verify');
    }

    /**
     * Reset to initial state.
     */
    reset() {
        this.phase = 'setup';
        this.pin = '';
        this.isDuress = false;
        this.devices = [];
        this.topology = {};
        this.audioData = null;
        this.meshData = null;
        this.merkleData = null;
        this.audioMerkle = null;
        this.captureResult = null;
        this.verdict = null;
        this.certificate = null;
        this.log = [];
        this._emit('setup');
    }

    /**
     * Get current status for the left pane.
     * @returns {{ bleCount: number, audioStatus: string, frameCount: number, phase: string, pin: string, isDuress: boolean }}
     */
    getStatus() {
        return {
            phase: this.phase,
            pin: this.pin,
            isDuress: this.isDuress,
            bleCount: this.captureResult?.bleObservations?.length || 0,
            audioStatus: this.phase === 'capture' ? 'recording' : (this.audioData ? 'captured' : 'idle'),
            frameCount: this.audioData ? Math.floor(this.audioData.bufferDuration * 30) : 0, // ~30 fps worth
            deviceCount: this.devices.length,
        };
    }
}
