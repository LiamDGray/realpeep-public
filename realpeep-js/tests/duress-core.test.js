/**
 * Tests for duress-core.js
 * Run: cd realpeep-js && npx jest tests/duress-core.test.js
 */

import {
    generateRandomNonce,
    generateNormalNonce,
    searchDuressNonce,
    checkDuressPredicate,
    isDeterministic,
    evaluateConsensus,
    getHeartbeatClass,
    consensusStatusText,
    validatePassphraseFormat,
    arePassphrasesDistinct,
} from '../../demo/duress-core.js';

describe('duress-core', () => {
    describe('generateRandomNonce', () => {
        it('produces 8-char hex string', () => {
            const nonce = generateRandomNonce();
            expect(nonce.length).toBe(8);
            expect(/^[0-9a-f]{8}$/.test(nonce)).toBe(true);
        });

        it('produces different nonces (probabilistic)', () => {
            const a = generateRandomNonce();
            const b = generateRandomNonce();
            // Extremely unlikely to be equal, but seed-dependent
            if (a === b) {
                // Try again to distinguish actual seed collision from bug
                const c = generateRandomNonce();
                expect(a === b && b === c).toBe(false);
            }
        });
    });

    describe('generateNormalNonce', () => {
        it('never returns a nonce that satisfies the duress predicate', () => {
            for (let i = 0; i < 200; i++) {
                const result = generateNormalNonce();
                expect(result.duressDetected).toBe(false);
                expect(checkDuressPredicate(result.nonce).duressDetected).toBe(false);
            }
        });

        it('returns an 8-char hex nonce and a positive attempt count', () => {
            const result = generateNormalNonce();
            expect(/^[0-9a-f]{8}$/.test(result.nonce)).toBe(true);
            expect(result.attempts).toBeGreaterThan(0);
        });
    });

    describe('searchDuressNonce', () => {
        it('finds a nonce with leading zero hash', () => {
            const result = searchDuressNonce(10000);
            expect(result.found).toBe(true);
            expect(/^[0-9a-f]{8}$/.test(result.nonce)).toBe(true);
            expect(result.hashHex.startsWith('0')).toBe(true);
            expect(result.attempts).toBeGreaterThan(0);
        });

        it('is deterministic for checkDuressPredicate', () => {
            const { nonce } = searchDuressNonce(10000);
            const check = checkDuressPredicate(nonce);
            expect(check.duressDetected).toBe(true);
        });
    });

    describe('checkDuressPredicate', () => {
        it('detects duress when hash starts with 0', () => {
            // Find a nonce that works
            const { nonce } = searchDuressNonce(10000);
            const result = checkDuressPredicate(nonce);
            expect(result.duressDetected).toBe(true);
        });

        it('is deterministic', () => {
            expect(isDeterministic()).toBe(true);
        });
    });

    describe('evaluateConsensus', () => {
        it('all valid when both free and heartbeat > 0', () => {
            const result = evaluateConsensus({
                a: { detained: false, heartbeatValue: 5 },
                b: { detained: false, heartbeatValue: 5 },
            });
            expect(result.a).toBe('valid');
            expect(result.b).toBe('valid');
            expect(result.verdict).toContain('AUTHENTIC');
            expect(result.coercedCount).toBe(0);
        });

        it('flagged when detained', () => {
            const result = evaluateConsensus({
                a: { detained: true, heartbeatValue: 0 },
                b: { detained: false, heartbeatValue: 5 },
            });
            expect(result.a).toBe('flagged');
            expect(result.verdict).toContain('CONDITIONAL');
        });

        it('majority coerced', () => {
            const result = evaluateConsensus({
                a: { detained: true, heartbeatValue: 0 },
                b: { detained: true, heartbeatValue: 0 },
            });
            expect(result.verdict).toContain('COERCED');
        });
    });

    describe('getHeartbeatClass', () => {
        it('returns expired for 0 or negative', () => {
            expect(getHeartbeatClass(0, 12, 1)).toBe('expired');
            expect(getHeartbeatClass(-1, 12, 1)).toBe('expired');
        });

        it('returns warning below threshold', () => {
            expect(getHeartbeatClass(0.5, 12, 1)).toBe('warning');
        });

        it('returns ok above threshold', () => {
            expect(getHeartbeatClass(5, 12, 1)).toBe('ok');
        });
    });

    describe('consensusStatusText', () => {
        it('maps statuses to display text', () => {
            expect(consensusStatusText('flagged')).toBe('🔴 FLAGGED');
            expect(consensusStatusText('valid')).toBe('🟢 VALID');
            expect(consensusStatusText('expiring')).toBe('🟡 EXPIRING');
        });
    });

    describe('validatePassphraseFormat', () => {
        it('accepts valid passphrases', () => {
            expect(validatePassphraseFormat('my-cat').isValidFormat).toBe(true);
        });

        it('rejects empty', () => {
            expect(validatePassphraseFormat('').isValidFormat).toBe(false);
        });
    });

    describe('arePassphrasesDistinct', () => {
        it('returns true for different strings', () => {
            expect(arePassphrasesDistinct('foo', 'bar')).toBe(true);
        });

        it('returns false for same strings', () => {
            expect(arePassphrasesDistinct('foo', 'foo')).toBe(false);
        });
    });
});
