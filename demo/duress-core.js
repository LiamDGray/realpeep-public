/**
 * duress-core.js — Pure functions for the duress protocol demo.
 * No DOM, no side effects — fully testable in Node.
 */

// Public demo domain-separation label. A real notary secret must never
// ship in client code; this value is intentionally not a credential.
const DEMO_NOTARY_CONTEXT = 'realpeep-duress-demo-v1';

/**
 * Simple hash function (reusable, consistent with other demo modules).
 * @param {string} str
 * @returns {string}
 */
function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h).toString(16).padStart(8, '0');
}

/**
 * Generate a random hex nonce (8 chars).
 * @returns {string}
 */
export function generateRandomNonce() {
    return Array.from({ length: 8 }, () =>
        Math.floor(Math.random() * 16).toString(16)
    ).join('');
}

/**
 * Generate a nonce that does NOT satisfy the duress predicate.
 *
 * Normal mode must not accidentally trip the notary's duress check. With the
 * demo's 4-bit marker a naive random nonce false-positives about 1 time in 16,
 * which makes the UI and e2e tests flaky. Rejection sampling keeps normal
 * sessions clean; the production protocol instead needs a negligible
 * false-positive budget (see docs/research/DURESS_NOVELTY_ASSESSMENT.md).
 *
 * @param {number} [maxAttempts=10000]
 * @returns {{ nonce: string, hashHex: string, attempts: number, found: boolean, duressDetected: false }}
 */
export function generateNormalNonce(maxAttempts = 10000) {
    for (let counter = 0; counter < maxAttempts; counter++) {
        const nonce = generateRandomNonce();
        const check = checkDuressPredicate(nonce);
        if (!check.duressDetected) {
            return {
                nonce,
                hashHex: check.hashHex,
                attempts: counter + 1,
                found: true,
                duressDetected: false,
            };
        }
    }
    throw new Error(`Failed to find a non-duress nonce after ${maxAttempts} attempts`);
}

/**
 * Search for a nonce that satisfies the duress predicate.
 *
 * The duress marker requires SHA256(notary_secret || nonce) to start
 * with a '0' hex digit. This function searches until it finds one
 * or exceeds maxAttempts.
 *
 * @param {number} [maxAttempts=10000]
 * @returns {{ nonce: string, hashHex: string, attempts: number, found: boolean }}
 */
export function searchDuressNonce(maxAttempts = 10000) {
    for (let counter = 0; counter < maxAttempts; counter++) {
        const nonce = generateRandomNonce();
        const hashHex = hash(DEMO_NOTARY_CONTEXT + nonce);
        if (hashHex.startsWith('0')) {
            return { nonce, hashHex, attempts: counter + 1, found: true };
        }
    }
    // Fallback: return last attempt
    const fallbackNonce = generateRandomNonce();
    return {
        nonce: fallbackNonce,
        hashHex: hash(DEMO_NOTARY_CONTEXT + fallbackNonce),
        attempts: maxAttempts,
        found: false,
    };
}

/**
 * Check if a specific nonce carries the duress marker.
 *
 * @param {string} proofNonce - hex string
 * @returns {{ duressDetected: boolean, hashHex: string }}
 */
export function checkDuressPredicate(proofNonce) {
    const hashHex = hash(DEMO_NOTARY_CONTEXT + proofNonce);
    return { duressDetected: hashHex.startsWith('0'), hashHex };
}

/**
 * Check if a specific nonce+passphrase combination produces a duress signal.
 * Used to verify that the algorithm is deterministic (same inputs = same result).
 */
export function isDeterministic() {
    const r1 = checkDuressPredicate('abc123');
    const r2 = checkDuressPredicate('abc123');
    return r1.duressDetected === r2.duressDetected && r1.hashHex === r2.hashHex;
}

/**
 * Evaluate witness consensus based on heartbeat status.
 *
 * @param {{ a: { detained: boolean, heartbeatValue: number }, b: { detained: boolean, heartbeatValue: number } }} witnesses
 * @param {number} expiryThreshold - heartbeat value below which a free device is "expiring"
 * @returns {{ a: 'valid'|'flagged'|'expiring', b: 'valid'|'flagged'|'expiring', verdict: string, coercedCount: number, totalCount: number }}
 */
export function evaluateConsensus(witnesses, expiryThreshold = 0) {
    const devices = ['a', 'b'];
    const statuses = {};

    for (const dev of devices) {
        const w = witnesses[dev];
        if (w.detained || w.heartbeatValue <= 0) {
            statuses[dev] = 'flagged';
        } else if (w.heartbeatValue < expiryThreshold) {
            statuses[dev] = 'expiring';
        } else {
            statuses[dev] = 'valid';
        }
    }

    const coercedCount = [statuses.a, statuses.b].filter(s => s === 'flagged').length;
    const totalCount = 2;
    const majorityCoerced = coercedCount > totalCount / 2;

    let verdict;
    if (majorityCoerced) {
        verdict = 'COERCED — Majority of witnesses flagged';
    } else if (coercedCount > 0) {
        verdict = 'CONDITIONAL — Some witnesses flagged, review required';
    } else {
        verdict = 'AUTHENTIC — All witnesses valid';
    }

    return { ...statuses, verdict, coercedCount, totalCount };
}

/**
 * Determine the CSS class for a heartbeat bar based on its value.
 *
 * @param {number} value - current heartbeat seconds remaining
 * @param {number} max - max heartbeat seconds
 * @param {number} expiryThreshold - threshold for warning state
 * @returns {'ok'|'warning'|'expired'}
 */
export function getHeartbeatClass(value, max, expiryThreshold) {
    if (value <= 0) return 'expired';
    if (value < expiryThreshold) return 'warning';
    return 'ok';
}

/**
 * Get the display text for a consensus status.
 */
export function consensusStatusText(status) {
    switch (status) {
        case 'flagged': return '🔴 FLAGGED';
        case 'valid': return '🟢 VALID';
        case 'expiring': return '🟡 EXPIRING';
        default: return '⚫ UNKNOWN';
    }
}

/**
 * Validate that both passphrases produce valid-looking keys
 * (same key format, indistinguishable by inspection).
 *
 * @param {string} passphrase
 * @returns {{ isValidFormat: boolean, length: number }}
 */
export function validatePassphraseFormat(passphrase) {
    // Both passphrases must be non-empty strings of printable characters
    const isValidFormat = typeof passphrase === 'string'
        && passphrase.length > 0
        && /^[\x20-\x7E]+$/.test(passphrase);
    return { isValidFormat, length: passphrase.length };
}

/**
 * Verify that two different passphrases are not identical
 * (normal and duress must be different strings).
 */
export function arePassphrasesDistinct(normal, duress) {
    return normal !== duress;
}
