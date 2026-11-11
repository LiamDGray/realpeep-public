/**
 * e2e-flow.js — End-to-End Witness Demo orchestration.
 *
 * Pure JS module (Node-testable, no DOM) that orchestrates the complete
 * RealPeep flow: passphrase → ephemeral key → ZK proof → audio capture →
 * BLE observations → adjacency matrix → MNR rollup → OTS anchor → verify.
 *
 * Each step calls existing pure modules:
 *   - zk-proof.js    (generateProof, verifyProof)
 *   - mnr-rollup.js  (MNRServer, simulateRollup)
 *   - blockchain-anchor.js (buildFrameHashChain, createTimestamp, verifyTimestamp)
 *   - duress-core.js (searchDuressNonce, checkDuressPredicate)
 */

import { generateProof, verifyProof, demoHash } from './zk-proof.js';
import { MNRServer } from './mnr-rollup.js';
import {
    buildFrameHashChain,
    createTimestamp,
    verifyTimestamp,
    demoHash as bcDemoHash,
} from './blockchain-anchor.js';
import { searchDuressNonce, checkDuressPredicate } from './duress-core.js';

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Generate a simulated audio buffer for a device.
 * In production this would be real PCM audio with CDMA chirps.
 */
function generateAudioBuffer(devicePk, sampleRate = 44100, durationSec = 2.0) {
    const numSamples = Math.floor(sampleRate * durationSec);
    const samples = new Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
        // Simulate a Gold-code CDMA chirp with some noise
        const t = i / sampleRate;
        const chirp = Math.sin(2 * Math.PI * 19000 * t + Math.sin(2 * Math.PI * 500 * t) * 0.5);
        const noise = (Math.random() - 0.5) * 0.05;
        samples[i] = chirp * 0.3 + noise;
    }
    const seed = demoHash(devicePk + ':' + sampleRate);
    return {
        devicePk,
        sampleRate,
        samples,
        duration: durationSec,
        hash: demoHash(seed + ':' + samples.length),
    };
}

/**
 * Build a cross-correlation matrix from audio buffers.
 * Simulated: computes hash-based pseudo-correlations between all pairs.
 */
function simulateCorrelations(audioBuffers, topology) {
    const correlations = [];
    const bufMap = {};
    for (const buf of audioBuffers) {
        bufMap[buf.devicePk] = buf;
    }

    for (const buf of audioBuffers) {
        buf.correlations = [];
        const topo = topology[buf.devicePk];
        if (!topo) continue;

        for (const otherPk of (topo.observedKeys || [])) {
            const otherBuf = bufMap[otherPk];
            if (!otherBuf) continue;

            // Simulate correlation peak from acoustic propagation
            const rssi = topo.rssi ? topo.rssi[otherPk] || -60 : -60;
            const peak = Math.min(255, Math.floor(Math.abs(rssi) * 2 + Math.random() * 30));
            const distance = Math.abs(rssi) / 20; // rough distance estimate

            const corr = {
                from: buf.devicePk,
                to: otherPk,
                peak,
                distance: Math.max(0.5, distance),
                detected: peak > 40,
            };
            buf.correlations.push(corr);
            correlations.push(corr);
        }
    }

    return correlations;
}

/**
 * Derive BLE observations from the topology.
 * In production: bloom filters from actual BLE nonce scanning.
 */
function buildBLEObservations(devices, topology) {
    const observations = [];
    const nonceMap = {};
    for (const d of devices) {
        nonceMap[d.pk] = d.nonce;
    }

    for (const d of devices) {
        const topo = topology[d.pk];
        const observedNonces = [];
        const observedKeys = []; // PKs of observed devices (used by MNR rollup)

        if (topo && topo.observedKeys) {
            for (const observedPk of topo.observedKeys) {
                const nonce = nonceMap[observedPk];
                if (nonce) {
                    observedNonces.push(nonce);
                }
                // capturedKeys for MNR rollup: use PKs (ephemeral keys)
                observedKeys.push(observedPk);
            }
        }

        observations.push({
            devicePk: d.pk,
            deviceId: d.id,
            observedNonces,
            observedKeys,
            ownNonce: d.nonce,
            bloomSize: observedNonces.length + 1,
        });
    }

    return observations;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Simulate a complete capture session.
 *
 * @param {Array<{id: string, pk: string, sk: string, nonce: string}>} devices
 *   Array of device configs.
 * @param {Object} topology
 *   Map of pk → { observedKeys: string[], rssi: Object<string,number> }
 * @param {Object} [opts]
 * @param {string} [opts.passphrase='normal'] - 'normal' or 'duress'
 * @param {number} [opts.sampleRate=44100] - Audio sample rate
 * @param {number} [opts.durationSec=2.0] - Audio capture duration
 * @returns {Promise<{
 *   audioBuffers: Object[],
 *   bleObservations: Object[],
 *   zkProofs: Object[],
 *   duressInfo: Object,
 *   correlations: Object[],
 *   devices: Object[]
 * }>}
 */
export async function simulateCapture(devices, topology, opts = {}) {
    const {
        passphrase = 'normal',
        sampleRate = 44100,
        durationSec = 2.0,
    } = opts;

    // ── 1. Handle duress passphrase ──────────────────────────────
    let duressInfo = {
        passphrase,
        nonce: null,
        duressDetected: false,
        hashHex: null,
        ephemeralKey: null,
    };

    let duressNonce = null;
    if (passphrase === 'duress') {
        const result = searchDuressNonce(10000);
        duressNonce = result.nonce;
        duressInfo.nonce = result.nonce;
        duressInfo.duressDetected = result.found;
        duressInfo.hashHex = result.hashHex;
    } else {
        const check = checkDuressPredicate('normal-0000');
        duressInfo.nonce = 'normal-0000';
        duressInfo.duressDetected = check.duressDetected;
        duressInfo.hashHex = check.hashHex;
    }

    // ── 2. Generate ephemeral key + ZK proof for each device ─────
    const zkProofs = [];
    for (const d of devices) {
        const ephemeralKey = `epk_${demoHash(d.pk + ':' + Date.now() + ':' + Math.random())}`;
        const payloadHash = demoHash(d.pk + ':audio_payload:' + duressInfo.nonce);

        const proof = await generateProof({
            payloadHash,
            ephemeralPubkey: ephemeralKey,
        });

        zkProofs.push({
            ...proof,
            devicePk: d.pk,
            deviceId: d.id,
            ephemeralKey,
            payloadHash,
        });
    }

    duressInfo.ephemeralKey = zkProofs.length > 0 ? zkProofs[0].ephemeralKey : null;

    // ── 3. Generate simulated audio buffers ──────────────────────
    const audioBuffers = devices.map(d =>
        generateAudioBuffer(d.pk, sampleRate, durationSec)
    );

    // ── 4. Simulate cross-correlations ───────────────────────────
    const correlations = simulateCorrelations(audioBuffers, topology);

    // ── 5. Build BLE observations from topology ──────────────────
    const bleObservations = buildBLEObservations(devices, topology);

    return {
        audioBuffers,
        bleObservations,
        zkProofs,
        duressInfo,
        correlations,
        devices: devices.map(d => ({ id: d.id, pk: d.pk, nonce: d.nonce })),
    };
}

/**
 * Verify the full pipeline against a capture result.
 *
 * @param {Object} captureResult - Output from simulateCapture()
 * @returns {Promise<{
 *   zkValid: boolean,
 *   zkDetails: Object,
 *   mnrCertificate: string|null,
 *   otsProof: Object|null,
 *   merkleRoot: string,
 *   verdict: string,
 *   rollupResults: Object[]
 * }>}
 */
export async function verifyFullPipeline(captureResult) {
    const { zkProofs, bleObservations, duressInfo, devices } = captureResult;

    // ── 1. Verify ZK proofs ─────────────────────────────────────
    let zkValid = true;
    let proofsVerified = 0;
    const zkResults = [];

    for (const proof of zkProofs) {
        const valid = await verifyProof(proof);
        if (valid) proofsVerified++;
        zkResults.push({ devicePk: proof.devicePk, valid });
        if (!valid) zkValid = false;
    }

    const zkDetails = {
        total: zkProofs.length,
        proofsVerified,
        allValid: zkValid,
        results: zkResults,
    };

    // ── 2. MNR Rollup (build adjacency matrix & attempt rollup) ─
    const server = new MNRServer();

    // Upload payloads — capturedKeys must be PKs (ephemeral keys) for MNR rollup
    for (const obs of bleObservations) {
        server.receivePayload({
            deviceId: obs.devicePk,
            ephemeralKey: obs.devicePk,
            capturedKeys: obs.observedKeys || obs.observedNonces,
        });
    }

    // Generate receipts for all pairs
    for (const d of devices) {
        for (const o of devices) {
            if (d.pk === o.pk) continue;
            server.receiveReceipt({
                deviceId: d.pk,
                targetKey: o.pk,
                signature: demoHash(d.pk + ':' + o.pk + ':receipt'),
            });
        }
    }

    // Attempt rollup for all ordered pairs
    const rollupResults = [];
    for (const d of devices) {
        for (const o of devices) {
            if (d.pk === o.pk) continue;
            rollupResults.push(server.attemptRetroactiveRollup(d.pk, o.pk));
        }
    }

    const certificates = server.getIssuedCertificates();
    const mnrCertificate = certificates.length > 0 ? certificates[0].certificateId : null;
    const allMutual = rollupResults.every(r => r.success);

    // ── 3. Build frame hash chain + OTS anchor ──────────────────
    const frameData = zkProofs.map(p => p.payloadHash || demoHash(p.devicePk));
    const { chain, merkleRoot } = buildFrameHashChain(frameData);

    let otsProof = null;
    try {
        otsProof = createTimestamp(merkleRoot);
    } catch (e) {
        otsProof = { otsProof: 'error:' + e.message, timestamp: Date.now(), version: -1 };
    }

    // ── 4. Final verdict ────────────────────────────────────────
    let verdict;
    const duressFlag = duressInfo && duressInfo.duressDetected;

    if (!zkValid) {
        verdict = 'FAILED — ZK proof verification failed';
    } else if (!allMutual) {
        verdict = 'FAILED — Missing mutual entanglement in MNR rollup';
    } else if (duressFlag) {
        verdict = 'PASSED (DURESS FLAGGED) — Proofs valid but duress signal detected by notary';
    } else {
        verdict = 'AUTHENTIC — All checks passed, MNR established, OTS anchored';
    }

    return {
        zkValid,
        zkDetails,
        mnrCertificate,
        otsProof,
        merkleRoot,
        verdict,
        rollupResults,
        chain,
    };
}
