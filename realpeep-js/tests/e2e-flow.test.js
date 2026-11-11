/**
 * Tests for demo/e2e-flow.js — End-to-End Witness Demo orchestration.
 * Run: cd realpeep-js && NODE_OPTIONS=--experimental-vm-modules npx jest tests/e2e-flow.test.js --no-coverage
 */

import { demoHash } from '../../demo/blockchain-anchor.js';
import { MNRServer } from '../../demo/mnr-rollup.js';
import { checkDuressPredicate, searchDuressNonce } from '../../demo/duress-core.js';

// The module under test — will be created
let simulateCapture, verifyFullPipeline;

beforeAll(async () => {
    const mod = await import('../../demo/e2e-flow.js');
    simulateCapture = mod.simulateCapture;
    verifyFullPipeline = mod.verifyFullPipeline;
});

// ── Helper: create N devices ──────────────────────────────────────
function makeDevices(n) {
    const devices = [];
    for (let i = 0; i < n; i++) {
        const id = `dev-${String.fromCharCode(65 + i)}`;
        const pk = `pk_${id}_${demoHash(id + Date.now() + Math.random())}`;
        devices.push({
            id,
            pk,
            sk: `sk_${id}`,
            nonce: demoHash(`nonce:${id}:${Math.random()}`).slice(0, 8),
        });
    }
    return devices;
}

// ── Helper: make a topology where all devices observe each other ──
function fullMeshTopology(devices) {
    const topology = {};
    for (const d of devices) {
        topology[d.pk] = {
            observedKeys: devices.filter(o => o.pk !== d.pk).map(o => o.pk),
            rssi: {},
        };
        for (const o of devices) {
            if (o.pk !== d.pk) {
                topology[d.pk].rssi[o.pk] = -40 - Math.random() * 20;
            }
        }
    }
    return topology;
}

describe('e2e-flow — simulateCapture', () => {
    it('returns audioBuffers, bleObservations, zkProofs for each device (2 devices)', async () => {
        const devices = makeDevices(2);
        const topology = fullMeshTopology(devices);

        const result = await simulateCapture(devices, topology);

        expect(result).toHaveProperty('audioBuffers');
        expect(result).toHaveProperty('bleObservations');
        expect(result).toHaveProperty('zkProofs');

        // All arrays have entries for each device
        expect(result.zkProofs).toHaveLength(2);
        expect(result.bleObservations).toHaveLength(2);
        expect(result.audioBuffers).toHaveLength(2);

        // Each ZK proof is well-formed
        for (const proof of result.zkProofs) {
            expect(proof).toHaveProperty('proof');
            expect(proof).toHaveProperty('publicSignals');
            expect(proof.proof).toHaveProperty('pi_a');
            expect(proof.proof).toHaveProperty('pi_b');
            expect(proof.proof).toHaveProperty('pi_c');
            expect(proof.publicSignals).toHaveLength(3);
            expect(proof).toHaveProperty('devicePk');
        }

        // Each BLE observation records observed nonces
        for (const obs of result.bleObservations) {
            expect(obs).toHaveProperty('devicePk');
            expect(obs).toHaveProperty('observedNonces');
            expect(Array.isArray(obs.observedNonces)).toBe(true);
        }

        // Each audio buffer is a non-empty array
        for (const buf of result.audioBuffers) {
            expect(buf).toHaveProperty('devicePk');
            expect(buf).toHaveProperty('sampleRate');
            expect(buf).toHaveProperty('samples');
            expect(Array.isArray(buf.samples)).toBe(true);
            expect(buf.samples.length).toBeGreaterThan(0);
        }
    });

    it('full 2-device capture: both devices generate proofs + audio + BLE observations', async () => {
        const devices = makeDevices(2);
        const topology = fullMeshTopology(devices);

        const result = await simulateCapture(devices, topology);

        // Both devices should see each other
        const obs0 = result.bleObservations.find(o => o.devicePk === devices[0].pk);
        const obs1 = result.bleObservations.find(o => o.devicePk === devices[1].pk);
        expect(obs0.observedNonces).toContain(devices[1].nonce);
        expect(obs1.observedNonces).toContain(devices[0].nonce);

        // Both proofs look valid
        expect(result.zkProofs.length).toBe(2);
        for (const proof of result.zkProofs) {
            expect(proof.publicSignals).toHaveLength(3);
        }

        // Audio buffers correspond to devices
        expect(result.audioBuffers.length).toBe(2);
        expect(result.audioBuffers[0].devicePk).toBe(devices[0].pk);
        expect(result.audioBuffers[1].devicePk).toBe(devices[1].pk);
    });

    it('full 3-device capture: cross-correlation verifies mutual detection', async () => {
        const devices = makeDevices(3);
        const topology = fullMeshTopology(devices);

        const result = await simulateCapture(devices, topology);

        expect(result.zkProofs).toHaveLength(3);
        expect(result.bleObservations).toHaveLength(3);
        expect(result.audioBuffers).toHaveLength(3);

        // All 3 devices observe each other (6 directional pairs)
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                if (i === j) continue;
                const obs = result.bleObservations.find(o => o.devicePk === devices[i].pk);
                expect(obs.observedNonces).toContain(devices[j].nonce);
            }
        }

        // Audio buffers have the correlation data
        for (const buf of result.audioBuffers) {
            expect(buf.samples.length).toBeGreaterThan(0);
            expect(buf).toHaveProperty('correlations');
            expect(Array.isArray(buf.correlations)).toBe(true);
        }
    });

    it('duress flow: duress passphrase detected by notary', async () => {
        const devices = makeDevices(2);
        const topology = fullMeshTopology(devices);

        const result = await simulateCapture(devices, topology, { passphrase: 'duress' });

        // The capture result should include duress information
        expect(result).toHaveProperty('duressInfo');
        expect(result.duressInfo).toHaveProperty('passphrase');
        expect(result.duressInfo.passphrase).toBe('duress');
        expect(result.duressInfo).toHaveProperty('nonce');
        expect(result.duressInfo).toHaveProperty('duressDetected');

        // The duress nonce should be detectable by the notary
        const check = checkDuressPredicate(result.duressInfo.nonce);
        expect(check.duressDetected).toBe(true);
    });

    it('normal passphrase does not trigger duress', async () => {
        const devices = makeDevices(2);
        const topology = fullMeshTopology(devices);

        const result = await simulateCapture(devices, topology, { passphrase: 'normal' });

        expect(result.duressInfo.passphrase).toBe('normal');
        expect(result.duressInfo.duressDetected).toBe(false);
    });

    it('handles sparsely-connected topology (some devices isolated)', async () => {
        const devices = makeDevices(3);
        // Only dev-A observes dev-B; no mutual, dev-C isolated
        const topology = {};
        topology[devices[0].pk] = {
            observedKeys: [devices[1].pk],
            rssi: { [devices[1].pk]: -45 },
        };
        topology[devices[1].pk] = {
            observedKeys: [],
            rssi: {},
        };
        topology[devices[2].pk] = {
            observedKeys: [],
            rssi: {},
        };

        const result = await simulateCapture(devices, topology);

        expect(result.zkProofs).toHaveLength(3);
        // Device 0 observes device 1
        const obs0 = result.bleObservations.find(o => o.devicePk === devices[0].pk);
        expect(obs0.observedNonces).toContain(devices[1].nonce);

        // Device 1 observes nothing
        const obs1 = result.bleObservations.find(o => o.devicePk === devices[1].pk);
        expect(obs1.observedNonces).toHaveLength(0);
    });
});

describe('e2e-flow — verifyFullPipeline', () => {
    it('all checks pass for honest devices', async () => {
        const devices = makeDevices(2);
        const topology = fullMeshTopology(devices);
        const captureResult = await simulateCapture(devices, topology);

        const verdict = await verifyFullPipeline(captureResult);

        expect(verdict).toHaveProperty('zkValid');
        expect(verdict).toHaveProperty('mnrCertificate');
        expect(verdict).toHaveProperty('otsProof');
        expect(verdict).toHaveProperty('verdict');

        // Full mesh with honest devices should pass
        expect(verdict.zkValid).toBe(true);
        expect(verdict.mnrCertificate).toBeTruthy();
        expect(verdict.otsProof).toBeTruthy();
        expect(verdict.verdict).toMatch(/AUTHENTIC|PASSED/);
    });

    it('detects missing mutual entanglement', async () => {
        const devices = makeDevices(2);
        // One-way only: A sees B, B does NOT see A
        const topology = {};
        topology[devices[0].pk] = {
            observedKeys: [devices[1].pk],
            rssi: { [devices[1].pk]: -45 },
        };
        topology[devices[1].pk] = {
            observedKeys: [],
            rssi: {},
        };

        const captureResult = await simulateCapture(devices, topology);
        const verdict = await verifyFullPipeline(captureResult);

        // ZK proofs are still valid individually
        expect(verdict.zkValid).toBe(true);
        // But MNR certificate should fail due to missing mutual entanglement
        expect(verdict.mnrCertificate).toBeNull();
        expect(verdict.verdict).toMatch(/FAILED|INCOMPLETE|MISSING/);
    });

    it('verifies ZK proofs for all devices', async () => {
        const devices = makeDevices(3);
        const topology = fullMeshTopology(devices);
        const captureResult = await simulateCapture(devices, topology);

        const verdict = await verifyFullPipeline(captureResult);

        expect(verdict.zkValid).toBe(true);
        expect(verdict.zkDetails).toBeDefined();
        expect(verdict.zkDetails.proofsVerified).toBe(3);
    });

    it('produces a valid OTS proof anchored to frame hash chain', async () => {
        const devices = makeDevices(2);
        const topology = fullMeshTopology(devices);
        const captureResult = await simulateCapture(devices, topology);

        const verdict = await verifyFullPipeline(captureResult);

        // Has OTS proof
        expect(verdict.otsProof).toBeTruthy();
        expect(verdict.otsProof).toHaveProperty('otsProof');
        expect(verdict.otsProof).toHaveProperty('timestamp');

        // Has a Merkle root from the frame hash chain
        expect(verdict).toHaveProperty('merkleRoot');
        expect(verdict.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
    });

    it('handles duress in the pipeline gracefully', async () => {
        const devices = makeDevices(2);
        const topology = fullMeshTopology(devices);
        const captureResult = await simulateCapture(devices, topology, { passphrase: 'duress' });

        const verdict = await verifyFullPipeline(captureResult);

        // Pipeline still verifies (proofs are valid even with duress flag)
        expect(verdict.zkValid).toBe(true);
        // Verdict should mention duress
        expect(verdict.verdict).toMatch(/DURESS|duress/i);
    });
});

describe('e2e-flow — integration with MNR Server', () => {
    it('passes MNR rollup when all mutual pairs exist', async () => {
        const devices = makeDevices(3);
        const topology = fullMeshTopology(devices);
        const captureResult = await simulateCapture(devices, topology);

        // Feed observations into MNR Server directly
        const server = new MNRServer();
        for (const obs of captureResult.bleObservations) {
            server.receivePayload({
                deviceId: obs.devicePk,
                ephemeralKey: obs.devicePk,
                // capturedKeys for MNR must be PKs (ephemeral keys), not nonces
                capturedKeys: obs.observedKeys,
            });
        }
        // Receipts for all pairs
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

        // Try rollup for all ordered pairs
        const results = [];
        for (const d of devices) {
            for (const o of devices) {
                if (d.pk === o.pk) continue;
                results.push(server.attemptRetroactiveRollup(d.pk, o.pk));
            }
        }

        // All 6 directed pairs should succeed (3 devices × 2 others)
        expect(results.filter(r => r.success).length).toBe(6);
        expect(server.getIssuedCertificates().length).toBe(6);
    });
});
