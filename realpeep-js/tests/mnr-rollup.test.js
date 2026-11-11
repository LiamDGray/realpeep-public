/**
 * Tests for mnr-rollup.js
 * Run: cd realpeep-js && npx jest tests/mnr-rollup.test.js
 */

import { MNRServer, simulateRollup } from '../../demo/mnr-rollup.js';

describe('MNRServer', () => {
    let server;

    beforeEach(() => {
        server = new MNRServer();
    });

    it('starts empty', () => {
        expect(server.getPayloadCount()).toBe(0);
        expect(server.getReceiptCount()).toBe(0);
        expect(server.getIssuedCertificates().length).toBe(0);
    });

    it('receives payloads', () => {
        server.receivePayload({
            deviceId: 'dev-a',
            ephemeralKey: 'pk-a',
            capturedKeys: ['pk-b'],
        });
        expect(server.getPayloadCount()).toBe(1);
    });

    it('receives receipts', () => {
        server.receiveReceipt({
            deviceId: 'dev-a',
            targetKey: 'pk-b',
            signature: 'sig123',
        });
        expect(server.getReceiptCount()).toBe(1);
    });

    it('attemptRetroactiveRollup fails without payloads', () => {
        const result = server.attemptRetroactiveRollup('pk-a', 'pk-b');
        expect(result.success).toBe(false);
        expect(result.reason).toContain('Missing payloads');
    });

    it('attemptRetroactiveRollup fails without mutual entanglement', () => {
        server.receivePayload({
            deviceId: 'dev-a',
            ephemeralKey: 'pk-a',
            capturedKeys: ['pk-c'], // observed C, not B
        });
        server.receivePayload({
            deviceId: 'dev-b',
            ephemeralKey: 'pk-b',
            capturedKeys: ['pk-a'], // B observed A
        });
        const result = server.attemptRetroactiveRollup('pk-a', 'pk-b');
        expect(result.success).toBe(false);
        expect(result.reason).toContain('No mutual entanglement');
    });

    it('attemptRetroactiveRollup fails without receipts', () => {
        server.receivePayload({
            deviceId: 'dev-a',
            ephemeralKey: 'pk-a',
            capturedKeys: ['pk-b'],
        });
        server.receivePayload({
            deviceId: 'dev-b',
            ephemeralKey: 'pk-b',
            capturedKeys: ['pk-a'],
        });
        const result = server.attemptRetroactiveRollup('pk-a', 'pk-b');
        expect(result.success).toBe(false);
        expect(result.reason).toContain('Missing MNR');
    });

    it('attemptRetroactiveRollup succeeds with all conditions met', () => {
        server.receivePayload({
            deviceId: 'dev-a',
            ephemeralKey: 'pk-a',
            capturedKeys: ['pk-b'],
        });
        server.receivePayload({
            deviceId: 'dev-b',
            ephemeralKey: 'pk-b',
            capturedKeys: ['pk-a'],
        });
        server.receiveReceipt({
            deviceId: 'dev-a',
            targetKey: 'pk-b',
            signature: 'sig-a-b',
        });
        server.receiveReceipt({
            deviceId: 'dev-b',
            targetKey: 'pk-a',
            signature: 'sig-b-a',
        });

        const result = server.attemptRetroactiveRollup('pk-a', 'pk-b');
        expect(result.success).toBe(true);
        expect(result.certificateId).toBeTruthy();
        expect(server.getIssuedCertificates().length).toBe(1);
    });

    it('issues unique certificate IDs', () => {
        // Set up all conditions
        server.receivePayload({ deviceId: 'a', ephemeralKey: 'pk-a', capturedKeys: ['pk-b'] });
        server.receivePayload({ deviceId: 'b', ephemeralKey: 'pk-b', capturedKeys: ['pk-a'] });
        server.receiveReceipt({ deviceId: 'a', targetKey: 'pk-b', signature: 'x' });
        server.receiveReceipt({ deviceId: 'b', targetKey: 'pk-a', signature: 'y' });

        const r1 = server.attemptRetroactiveRollup('pk-a', 'pk-b');

        // Second call with same keys — same certificates stored
        server.receivePayload({ deviceId: 'c', ephemeralKey: 'pk-c', capturedKeys: ['pk-d'] });
        server.receivePayload({ deviceId: 'd', ephemeralKey: 'pk-d', capturedKeys: ['pk-c'] });
        server.receiveReceipt({ deviceId: 'c', targetKey: 'pk-d', signature: 'z' });
        server.receiveReceipt({ deviceId: 'd', targetKey: 'pk-c', signature: 'w' });
        const r2 = server.attemptRetroactiveRollup('pk-c', 'pk-d');

        expect(r1.certificateId).not.toBe(r2.certificateId);
    });
});

describe('simulateRollup', () => {
    it('processes all device pairs', () => {
        const devices = [
            { pk: 'pk-a', nonce: 'n1', observedNonces: ['pk-b'] },
            { pk: 'pk-b', nonce: 'n2', observedNonces: ['pk-a'] },
        ];

        const { server, results, certificates } = simulateRollup(devices);
        expect(server.getPayloadCount()).toBe(2);
        expect(server.getReceiptCount()).toBe(2);
        // 2 devices × 1 other = 2 rollup attempts
        expect(results.length).toBe(2);
        expect(certificates.length).toBe(2);
    });

    it('succeeds when all mutual', () => {
        const devices = [
            { pk: 'pk-a', nonce: 'n1', observedNonces: ['pk-b'] },
            { pk: 'pk-b', nonce: 'n2', observedNonces: ['pk-a'] },
        ];

        const { certificates } = simulateRollup(devices);
        expect(certificates.length).toBe(2);
        for (const c of certificates) {
            expect(c.success).toBe(true);
        }
    });
});
