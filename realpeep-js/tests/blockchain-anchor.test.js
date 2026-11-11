/**
 * Tests for blockchain-anchor.js
 * Run: cd realpeep-js && npx jest tests/blockchain-anchor.test.js
 */

import {
    createTimestamp,
    verifyTimestamp,
    stampAndWait,
    proofToHex,
    proofFromHex,
    computeMerkleRoot,
    buildFrameHashChain,
    verifyFrameHashChain,
} from '../../demo/blockchain-anchor.js';

describe('blockchain-anchor', () => {
    describe('createTimestamp', () => {
        it('creates a valid OTS proof for 64-char hex', () => {
            const root = 'a'.repeat(64);
            const proof = createTimestamp(root);
            expect(proof.version).toBe(1);
            expect(typeof proof.otsProof).toBe('string');
            expect(proof.otsProof.length).toBeGreaterThan(0);
            expect(typeof proof.timestamp).toBe('number');
        });

        it('rejects non-64-char input', () => {
            expect(() => createTimestamp('abc')).toThrow(/64 hex chars/);
            expect(() => createTimestamp('x'.repeat(63))).toThrow(/64 hex chars/);
        });

        it('rejects non-hex input', () => {
            expect(() => createTimestamp('g'.repeat(64))).toThrow(/64 hex chars/);
        });
    });

    describe('verifyTimestamp', () => {
        it('verifies a valid proof', () => {
            const root = 'b'.repeat(64);
            const proof = createTimestamp(root);
            const result = verifyTimestamp(proof);
            expect(result.valid).toBe(true);
            expect(result.pending).toBe(true); // simulation always pending
            expect(result.error).toBeNull();
        });

        it('rejects invalid proof object', () => {
            expect(verifyTimestamp(null).valid).toBe(false);
            expect(verifyTimestamp({}).valid).toBe(false);
            expect(verifyTimestamp({ version: 2 }).valid).toBe(false);
        });
    });

    describe('proofToHex / proofFromHex roundtrip', () => {
        it('serializes and deserializes', () => {
            const root = 'c'.repeat(64);
            const proof = createTimestamp(root);
            const hex = proofToHex(proof);
            const restored = proofFromHex(hex);
            expect(restored.otsProof).toBe(proof.otsProof);
            expect(restored.version).toBe(1);
            expect(restored.timestamp).toBe(proof.timestamp);
        });
    });

    describe('stampAndWait', () => {
        it('produces a valid timestamp (simulated)', () => {
            const root = 'd'.repeat(64);
            const proof = stampAndWait(root, 10);
            expect(proof.version).toBe(1);
            expect(verifyTimestamp(proof).valid).toBe(true);
        });
    });

    describe('computeMerkleRoot', () => {
        it('returns zeroes for empty array', () => {
            expect(computeMerkleRoot([])).toBe('0'.repeat(64));
        });

        it('returns the single hash for one frame', () => {
            const root = computeMerkleRoot(['abc123']);
            expect(root).toBe('abc123'.padEnd(64, '0'));
        });

        it('computes for power-of-2 frames', () => {
            const hashes = ['aa', 'bb', 'cc', 'dd'];
            const root = computeMerkleRoot(hashes);
            expect(root.length).toBe(64);
            expect(typeof root).toBe('string');
        });

        it('same inputs produce same root', () => {
            const a = computeMerkleRoot(['a', 'b', 'c']);
            const b = computeMerkleRoot(['a', 'b', 'c']);
            expect(a).toBe(b);
        });

        it('different inputs produce different root', () => {
            const a = computeMerkleRoot(['a', 'b', 'c']);
            const b = computeMerkleRoot(['a', 'b', 'd']);
            expect(a).not.toBe(b);
        });
    });

    describe('buildFrameHashChain', () => {
        it('builds a chain from frame data', () => {
            const { chain, merkleRoot } = buildFrameHashChain(['frame1', 'frame2', 'frame3']);
            expect(chain.length).toBe(3);
            expect(chain[0].index).toBe(0);
            expect(chain[1].index).toBe(1);
            expect(merkleRoot.length).toBe(64);
        });

        it('hashing includes previous hash', () => {
            const { chain } = buildFrameHashChain(['a', 'b']);
            // Frame 0: hash('genesis:0:a')
            // Frame 1: hash(prevHash + ':1:b')
            expect(chain[0].hash).not.toBe(chain[1].hash);
        });
    });

    describe('verifyFrameHashChain', () => {
        it('verifies an intact chain', () => {
            const data = ['frame1', 'frame2', 'frame3'];
            const { chain } = buildFrameHashChain(data);
            const result = verifyFrameHashChain(chain, data);
            expect(result.valid).toBe(true);
            expect(result.error).toBeNull();
        });

        it('detects tampering', () => {
            const data = ['frame1', 'frame2'];
            const { chain } = buildFrameHashChain(data);
            chain[1].hash = 'deadbeef'.padEnd(64, '0');
            const result = verifyFrameHashChain(chain, data);
            expect(result.valid).toBe(false);
        });

        it('detects length mismatch', () => {
            const data = ['frame1'];
            const { chain } = buildFrameHashChain(['frame1', 'frame2']);
            const result = verifyFrameHashChain(chain, data);
            expect(result.valid).toBe(false);
        });
    });
});
