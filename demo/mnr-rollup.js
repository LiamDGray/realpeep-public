/**
 * mnr-rollup.js — MNR (Mutual Non-Repudiation) rollup protocol.
 *
 * Pure functions for the retroactive rollup server: receives ZK payloads
 * from devices when they hit internet, verifies mutual acoustic entanglement
 * and digital consent (receipts), then issues MNR certificates.
 *
 * Node-testable — no DOM, no side effects.
 */

import { demoHash } from './blockchain-anchor.js';

/**
 * @typedef {Object} ZKPayload
 * @property {string} deviceId
 * @property {string} ephemeralKey
 * @property {string[]} capturedKeys - Keys of devices acoustically observed
 */

/**
 * @typedef {Object} MNRReceipt
 * @property {string} deviceId
 * @property {string} targetKey
 * @property {string} signature
 */

/**
 * @typedef {Object} RollupResult
 * @property {boolean} success
 * @property {string} reason
 * @property {string|null} certificateId
 */

/**
 * MNR Server — receives payloads and receipts, issues certificates.
 */
export class MNRServer {
    constructor() {
        /** @type {Map<string, ZKPayload>} */
        this.payloads = new Map();
        /** @type {Map<string, MNRReceipt>} */
        this.receipts = new Map();
        /** @type {RollupResult[]} */
        this.issuedCertificates = [];
    }

    /**
     * Receive a ZK payload from a device.
     * @param {ZKPayload} payload
     */
    receivePayload(payload) {
        this.payloads.set(payload.ephemeralKey, payload);
    }

    /**
     * Receive a cryptographic receipt from a device.
     * @param {MNRReceipt} receipt
     */
    receiveReceipt(receipt) {
        const key = `${receipt.deviceId}_${receipt.targetKey}`;
        this.receipts.set(key, receipt);
    }

    /**
     * Attempt retroactive rollup between two ephemeral keys.
     *
     * Requires:
     *   1. Both payloads exist on the server
     *   2. Both devices observed each other acoustically (mutual entanglement)
     *   3. Both devices signed receipts consenting to the entanglement
     *
     * @param {string} keyA
     * @param {string} keyB
     * @returns {RollupResult}
     */
    attemptRetroactiveRollup(keyA, keyB) {
        if (!this.payloads.has(keyA) || !this.payloads.has(keyB)) {
            return { success: false, reason: 'Missing payloads on server.', certificateId: null };
        }

        const payloadA = this.payloads.get(keyA);
        const payloadB = this.payloads.get(keyB);

        // 1. Verify physical acoustic entanglement
        if (!payloadA.capturedKeys.includes(keyB) || !payloadB.capturedKeys.includes(keyA)) {
            return {
                success: false,
                reason: 'No mutual entanglement found in the offline side-chain payloads.',
                certificateId: null,
            };
        }

        // 2. Verify digital consent
        const receiptAKey = `${payloadA.deviceId}_${keyB}`;
        const receiptBKey = `${payloadB.deviceId}_${keyA}`;

        if (!this.receipts.has(receiptAKey) || !this.receipts.has(receiptBKey)) {
            return {
                success: false,
                reason: 'Missing MNR cryptographic receipts from one or both parties.',
                certificateId: null,
            };
        }

        // 3. Issue certificate
        const certId = demoHash(`${keyA}:${keyB}:${Date.now()}`);
        const result = {
            success: true,
            reason: 'Mutual Non-Repudiation Established. Certificate issued.',
            certificateId: certId,
        };

        this.issuedCertificates.push(result);
        return result;
    }

    /**
     * Get all issued certificates.
     * @returns {RollupResult[]}
     */
    getIssuedCertificates() {
        return [...this.issuedCertificates];
    }

    /**
     * Check how many payloads are stored.
     * @returns {number}
     */
    getPayloadCount() {
        return this.payloads.size;
    }

    /**
     * Check how many receipts are stored.
     * @returns {number}
     */
    getReceiptCount() {
        return this.receipts.size;
    }
}

/**
 * Simulate a complete MNR rollup flow for the demo.
 *
 * @param {Array<{pk: string, nonce: string, observedNonces: string[]}>} devices
 * @returns {{ server: MNRServer, results: RollupResult[], certificates: RollupResult[] }}
 */
export function simulateRollup(devices) {
    const server = new MNRServer();

    // Each device uploads its payload when connectivity returns
    for (const device of devices) {
        const payload = {
            deviceId: device.pk,
            ephemeralKey: device.pk,
            capturedKeys: device.observedNonces || [],
        };
        server.receivePayload(payload);
    }

    // Add all receipts first (avoids race: receipt must exist before rollup)
    for (const device of devices) {
        for (const other of devices) {
            if (device.pk === other.pk) continue;
            const receipt = {
                deviceId: device.pk,
                targetKey: other.pk,
                signature: demoHash(device.pk + ':' + other.pk + ':receipt'),
            };
            server.receiveReceipt(receipt);
        }
    }

    // Now attempt rollup for every ordered pair
    const results = [];
    for (const device of devices) {
        for (const other of devices) {
            if (device.pk === other.pk) continue;
            const result = server.attemptRetroactiveRollup(device.pk, other.pk);
            results.push(result);
        }
    }

    return {
        server,
        results,
        certificates: server.getIssuedCertificates(),
    };
}
