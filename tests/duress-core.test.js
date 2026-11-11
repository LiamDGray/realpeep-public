/**
 * duress-core.test.js — TDD tests for the Duress Protocol demo logic.
 *
 * Run: node tests/duress-core.test.js
 * Expected: All tests pass. If any fail, the implementation is broken.
 */

import { strict as assert } from 'node:assert';
import {
    checkDuressPredicate,
    isDeterministic,
    evaluateConsensus,
    getHeartbeatClass,
    consensusStatusText,
    validatePassphraseFormat,
    arePassphrasesDistinct
} from '../demo/duress-core.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✓ ${name}`);
    } catch (e) {
        failed++;
        console.log(`  ✗ ${name}`);
        console.log(`      ${e.message}`);
        if (e.expected !== undefined) {
            console.log(`      expected: ${JSON.stringify(e.expected)}`);
            console.log(`      actual:   ${JSON.stringify(e.actual)}`);
        }
    }
}

// ================================================================
// Suite 1: Duress Predicate Check
// ================================================================
console.log('\n📋 Suite 1: Duress Predicate Detection');

test('duress passphrase produces a matching hash (starts with 0)', () => {
    const { duressDetected } = checkDuressPredicate('f4fa6d32', 'duress');
    assert.equal(duressDetected, true, 'Duress passphrase should produce duressDetected=true');
});

test('normal passphrase does NOT produce duress detection', () => {
    const { duressDetected } = checkDuressPredicate('f4fa6d32', 'normal');
    assert.equal(duressDetected, false, 'Normal passphrase should produce duressDetected=false');
});

test('predicate is deterministic — same inputs, same output', () => {
    const r1 = checkDuressPredicate('abc', 'duress');
    const r2 = checkDuressPredicate('abc', 'duress');
    assert.equal(r1.duressDetected, r2.duressDetected);
    assert.equal(r1.hashHex, r2.hashHex);
});

test('different nonces produce different hashes', () => {
    const r1 = checkDuressPredicate('aaaaaaaa', 'duress');
    const r2 = checkDuressPredicate('bbbbbbbb', 'duress');
    assert.notEqual(r1.hashHex, r2.hashHex, 'Different nonces should produce different hashes');
});

test('hash is always an 8-char hex string', () => {
    const inputs = ['abc', '1234', 'deadbeef', '00000000', 'ffffffff'];
    for (const nonce of inputs) {
        const { hashHex } = checkDuressPredicate(nonce, 'normal');
        assert.match(hashHex, /^[0-9a-f]{8}$/, `Hash should be 8 hex chars, got ${hashHex} for nonce ${nonce}`);
    }
});

test('isDeterministic returns true', () => {
    assert.equal(isDeterministic(), true);
});

// ================================================================
// Suite 2: Passphrase Validation
// ================================================================
console.log('\n📋 Suite 2: Passphrase Validation');

test('normal passphrase has valid format', () => {
    const result = validatePassphraseFormat('my-cat-is-named-mittens');
    assert.equal(result.isValidFormat, true);
    assert.equal(result.length, 23);
});

test('duress passphrase has valid format', () => {
    const result = validatePassphraseFormat('my-cat-is-named-socks');
    assert.equal(result.isValidFormat, true);
    assert.equal(result.length, 21);
});

test('empty passphrase is invalid', () => {
    const result = validatePassphraseFormat('');
    assert.equal(result.isValidFormat, false);
});

test('passphrases are distinct from each other', () => {
    assert.equal(
        arePassphrasesDistinct('my-cat-is-named-mittens', 'my-cat-is-named-socks'),
        true,
        'Normal and duress passphrases must be different strings'
    );
});

test('a passphrase cannot equal itself (edge case)', () => {
    assert.equal(
        arePassphrasesDistinct('same', 'same'),
        false,
        'A passphrase cannot be distinct from itself'
    );
});

// ================================================================
// Suite 3: Consensus Evaluation
// ================================================================
console.log('\n📋 Suite 3: Mesh Consensus Evaluation');

test('both devices free and alive → AUTHENTIC', () => {
    const result = evaluateConsensus({
        a: { detained: false, heartbeatValue: 12.0 },
        b: { detained: false, heartbeatValue: 12.0 }
    });
    assert.equal(result.verdict, 'AUTHENTIC — All witnesses valid');
    assert.equal(result.a, 'valid');
    assert.equal(result.b, 'valid');
    assert.equal(result.coercedCount, 0);
});

test('device A detained → Device A flagged, B valid, CONDITIONAL', () => {
    const result = evaluateConsensus({
        a: { detained: true, heartbeatValue: 0 },
        b: { detained: false, heartbeatValue: 12.0 }
    });
    assert.equal(result.a, 'flagged');
    assert.equal(result.b, 'valid');
    assert.equal(result.verdict.startsWith('CONDITIONAL'), true);
    assert.equal(result.coercedCount, 1);
});

test('both devices detained → COERCED verdict', () => {
    const result = evaluateConsensus({
        a: { detained: true, heartbeatValue: 0 },
        b: { detained: true, heartbeatValue: 0 }
    });
    assert.equal(result.a, 'flagged');
    assert.equal(result.b, 'flagged');
    assert.equal(result.verdict.startsWith('COERCED'), true);
    assert.equal(result.coercedCount, 2);
});

test('heartbeat expired (value=0) without detained flag → still flagged', () => {
    const result = evaluateConsensus({
        a: { detained: false, heartbeatValue: 0 },
        b: { detained: false, heartbeatValue: 12.0 }
    });
    assert.equal(result.a, 'flagged');
    assert.equal(result.b, 'valid');
    assert.equal(result.verdict.startsWith('CONDITIONAL'), true);
});

test('heartbeat very low but above zero → expiring, not flagged', () => {
    const result = evaluateConsensus({
        a: { detained: false, heartbeatValue: 0.5 },
        b: { detained: false, heartbeatValue: 12.0 }
    }, 1.0); // expiryThreshold=1.0 means values under 1.0 but above 0 are "expiring"
    assert.equal(result.a, 'expiring');
    assert.equal(result.b, 'valid');
});

// ================================================================
// Suite 4: Heartbeat Bar Styling
// ================================================================
console.log('\n📋 Suite 4: Heartbeat Bar Classes');

test('full heartbeat → ok class', () => {
    assert.equal(getHeartbeatClass(12.0, 12.0, 1.0), 'ok');
});

test('low heartbeat → warning class', () => {
    assert.equal(getHeartbeatClass(0.5, 12.0, 1.0), 'warning');
});

test('zero heartbeat → expired class', () => {
    assert.equal(getHeartbeatClass(0, 12.0, 1.0), 'expired');
});

test('negative heartbeat → expired class', () => {
    assert.equal(getHeartbeatClass(-1, 12.0, 1.0), 'expired');
});

// ================================================================
// Suite 5: Consensus Status Display Text
// ================================================================
console.log('\n📋 Suite 5: Status Display Text');

test('flagged status displays red flag emoji', () => {
    assert.equal(consensusStatusText('flagged'), '🔴 FLAGGED');
});

test('valid status displays green checkmark', () => {
    assert.equal(consensusStatusText('valid'), '🟢 VALID');
});

test('expiring status displays yellow warning', () => {
    assert.equal(consensusStatusText('expiring'), '🟡 EXPIRING');
});

test('unknown status displays grey default', () => {
    assert.equal(consensusStatusText('unknown'), '⚫ UNKNOWN');
});

// ================================================================
// Summary
// ================================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
