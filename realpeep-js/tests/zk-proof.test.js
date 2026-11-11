/**
 * Tests for zk-proof.js
 */
import { demoHash, generateDemoKeypair, generateDemoSignature } from '../../demo/zk-proof.js';

describe('zk-proof — helpers', () => {
    describe('demoHash', () => {
        it('produces consistent output', () => {
            expect(demoHash('hello')).toBe(demoHash('hello'));
        });

        it('produces different output for different inputs', () => {
            expect(demoHash('a')).not.toBe(demoHash('b'));
        });

        it('returns 8-char hex', () => {
            expect(demoHash('test')).toMatch(/^[0-9a-f]{8}$/);
        });
    });

    describe('generateDemoKeypair', () => {
        it('produces valid-looking keys', () => {
            const keys = generateDemoKeypair();
            expect(keys.privateKey).toHaveLength(64);
            expect(keys.publicKey.x).toMatch(/^[0-9a-f]{8}$/);
            expect(keys.publicKey.y).toMatch(/^[0-9a-f]{8}$/);
        });

        it('produces different keys on each call', () => {
            const k1 = generateDemoKeypair();
            const k2 = generateDemoKeypair();
            expect(k1.privateKey).not.toBe(k2.privateKey);
        });
    });

    describe('generateDemoSignature', () => {
        it('is deterministic', () => {
            const keys = generateDemoKeypair();
            const sig1 = generateDemoSignature('msg', keys.privateKey);
            const sig2 = generateDemoSignature('msg', keys.privateKey);
            expect(sig1).toEqual(sig2);
        });

        it('varies with message', () => {
            const keys = generateDemoKeypair();
            const sig1 = generateDemoSignature('a', keys.privateKey);
            const sig2 = generateDemoSignature('b', keys.privateKey);
            expect(sig1.Rx).not.toBe(sig2.Rx);
        });

        it('has all required fields', () => {
            const keys = generateDemoKeypair();
            const sig = generateDemoSignature('test', keys.privateKey);
            expect(sig).toHaveProperty('Rx');
            expect(sig).toHaveProperty('Ry');
            expect(sig).toHaveProperty('S');
        });
    });
});

describe('zk-proof — generateProof (simulated)', () => {
    it('returns valid proof structure', async () => {
        const { generateProof } = await import('../../demo/zk-proof.js');
        const result = await generateProof({
            payloadHash: demoHash('test-payload'),
            ephemeralPubkey: 'epk_demo123',
        });

        expect(result).toHaveProperty('proof');
        expect(result).toHaveProperty('publicSignals');
        expect(result.proof).toHaveProperty('pi_a');
        expect(result.proof).toHaveProperty('pi_b');
        expect(result.proof).toHaveProperty('pi_c');
        expect(result.publicSignals).toHaveLength(3);
    });

    it('different inputs produce different proofs', async () => {
        const { generateProof } = await import('../../demo/zk-proof.js');
        const r1 = await generateProof({ payloadHash: 'a', ephemeralPubkey: 'x' });
        const r2 = await generateProof({ payloadHash: 'b', ephemeralPubkey: 'y' });
        expect(r1.proof.pi_a[0]).not.toBe(r2.proof.pi_a[0]);
    });
});

describe('zk-proof — verifyProof (simulated)', () => {
    it('returns true for any valid proof structure', async () => {
        const { generateProof, verifyProof } = await import('../../demo/zk-proof.js');
        const proof = await generateProof({ payloadHash: 'test', ephemeralPubkey: 'epk' });
        const result = await verifyProof(proof);
        expect(result).toBe(true);
    });
});
