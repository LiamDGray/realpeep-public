/**
 * demo-integration.test.js — End-to-end DOM integration tests for the duress demo.
 * Uses jsdom to simulate browser events without a real browser.
 *
 * Run: node tests/demo-integration.test.js
 */

import { strict as assert } from 'node:assert';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = join(__dirname, '..', 'demo');

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
    }
}

// Load the HTML template
const htmlContent = readFileSync(join(DEMO_DIR, 'index.html'), 'utf-8');

// ================================================================
// Suite: HTML Structure
// ================================================================
console.log('\n📋 Suite: HTML Structure');

test('ZK Pipeline card has passphrase selection buttons', () => {
    const dom = new JSDOM(htmlContent);
    const doc = dom.window.document;
    const normalBtn = doc.getElementById('passphrase-normal-btn');
    const duressBtn = doc.getElementById('passphrase-duress-btn');
    assert.ok(normalBtn, 'Normal passphrase button must exist');
    assert.ok(duressBtn, 'Duress passphrase button must exist');
    assert.ok(normalBtn.textContent.includes('my-cat-is-named-mittens'));
    assert.ok(duressBtn.textContent.includes('my-cat-is-named-socks'));
});

test('ZK Pipeline card has view toggle buttons', () => {
    const dom = new JSDOM(htmlContent);
    const doc = dom.window.document;
    const captorBtn = doc.getElementById('view-captor-btn');
    const notaryBtn = doc.getElementById('view-notary-btn');
    assert.ok(captorBtn, 'Captor view button must exist');
    assert.ok(notaryBtn, 'Notary view button must exist');
    assert.ok(captorBtn.textContent.includes('Captor'));
    assert.ok(notaryBtn.textContent.includes('Notary'));
});

test('ZK Pipeline has notary detection panel (hidden by default)', () => {
    const dom = new JSDOM(htmlContent);
    const doc = dom.window.document;
    const panel = doc.getElementById('notary-detection-panel');
    assert.ok(panel, 'Notary detection panel must exist');
    assert.equal(panel.style.display, 'none', 'Notary panel should be hidden by default');
});

test('ZK Pipeline has duress alert and miss panels (hidden by default)', () => {
    const dom = new JSDOM(htmlContent);
    const doc = dom.window.document;
    const alert = doc.getElementById('duress-alert');
    const miss = doc.getElementById('duress-miss');
    assert.ok(alert, 'Duress alert panel must exist');
    assert.ok(miss, 'Duress miss panel must exist');
    assert.equal(alert.style.display, 'none', 'Duress alert should be hidden by default');
    assert.equal(miss.style.display, 'none', 'Duress miss should be hidden by default');
});

test('ZK Pipeline has captor dilemma panel (hidden by default)', () => {
    const dom = new JSDOM(htmlContent);
    const doc = dom.window.document;
    const dilemma = doc.getElementById('captor-dilemma');
    assert.ok(dilemma, 'Captor dilemma panel must exist');
    assert.equal(dilemma.style.display, 'none', 'Captor dilemma should be hidden by default');
});

test('Mesh Witness card has scenario selector buttons', () => {
    const dom = new JSDOM(htmlContent);
    const doc = dom.window.document;
    const normalBtn = doc.getElementById('mesh-scenario-normal');
    const coercedBtn = doc.getElementById('mesh-scenario-coerced');
    assert.ok(normalBtn, 'Normal scenario button must exist');
    assert.ok(coercedBtn, 'Coerced scenario button must exist');
});

test('Mesh Witness card has detain controls (hidden by default)', () => {
    const dom = new JSDOM(htmlContent);
    const doc = dom.window.document;
    const controls = doc.getElementById('detain-controls');
    assert.ok(controls, 'Detain controls must exist');
    assert.equal(controls.style.display, 'none', 'Detain controls should be hidden by default');
});

test('Mesh Witness card has consensus grid (hidden by default)', () => {
    const dom = new JSDOM(htmlContent);
    const doc = dom.window.document;
    const grid = doc.getElementById('consensus-grid');
    assert.ok(grid, 'Consensus grid must exist');
    assert.equal(grid.style.display, 'none', 'Consensus grid should be hidden by default');
});

test('Mesh Witness card has heartbeat containers (hidden by default)', () => {
    const dom = new JSDOM(htmlContent);
    const doc = dom.window.document;
    const hbA = doc.getElementById('device-a-heartbeat');
    const hbB = doc.getElementById('device-b-heartbeat');
    assert.ok(hbA, 'Device A heartbeat must exist');
    assert.ok(hbB, 'Device B heartbeat must exist');
    assert.equal(hbA.style.display, 'none', 'Device A heartbeat hidden by default');
    assert.equal(hbB.style.display, 'none', 'Device B heartbeat hidden by default');
});

// Check the description text explains duress concept
test('ZK description mentions detention and duress', () => {
    const dom = new JSDOM(htmlContent);
    const doc = dom.window.document;
    const card = doc.getElementById('zk-module');
    const desc = card.querySelector('.description');
    assert.ok(desc.textContent.includes('detains'), 'Description should explain arrest scenario');
    assert.ok(desc.textContent.includes('signaling for help'), 'Description should mention duress signal');
});

test('Mesh description mentions detainment and auto-expiry', () => {
    const dom = new JSDOM(htmlContent);
    const doc = dom.window.document;
    const card = doc.getElementById('mesh-module');
    const desc = card.querySelector('.description');
    assert.ok(desc.textContent.includes('detained'), 'Description should mention detainment');
    assert.ok(desc.textContent.includes('auto-expires'), 'Description should mention auto-expiry');
});

// Verify passphrase section structure
test('Passphrase section has header, hint, and two buttons', () => {
    const dom = new JSDOM(htmlContent);
    const doc = dom.window.document;
    const section = doc.getElementById('passphrase-section');
    assert.ok(section, 'Passphrase section must exist');

    const headers = section.querySelectorAll('h3');
    assert.ok(headers.length > 0, 'Passphrase section must have a heading');

    const hint = section.querySelector('.passphrase-hint');
    assert.ok(hint, 'Passphrase section must have a hint text');

    const btns = section.querySelectorAll('.passphrase-btn');
    assert.equal(btns.length, 2, 'Must have exactly 2 passphrase buttons');
});

// Verify view toggle structure
test('View toggle sections are present', () => {
    const dom = new JSDOM(htmlContent);
    const doc = dom.window.document;
    const toggles = doc.querySelectorAll('.view-toggle-btn');
    assert.equal(toggles.length, 2, 'Must have exactly 2 view toggle buttons');
    const captorToggle = doc.querySelector('[data-view="captor"]');
    const notaryToggle = doc.querySelector('[data-view="notary"]');
    assert.ok(captorToggle, 'Captor view toggle must have data-view="captor"');
    assert.ok(notaryToggle, 'Notary view toggle must have data-view="notary"');
});

// Verify notary panel structure
test('Notary detection panel has console, badge, and explanation', () => {
    const dom = new JSDOM(htmlContent);
    const doc = dom.window.document;
    const panel = doc.getElementById('notary-detection-panel');
    const console = doc.getElementById('notary-console');
    const badge = doc.getElementById('notary-badge');
    const explanation = doc.getElementById('notary-explanation');
    assert.ok(console, 'Notary panel must have a console element');
    assert.ok(badge, 'Notary panel must have a badge element');
    assert.ok(explanation, 'Notary panel must have an explanation element');
});

// Verify detain controls
test('Detain controls have Free and Detained buttons for both devices', () => {
    const dom = new JSDOM(htmlContent);
    const doc = dom.window.document;
    const detainAFree = doc.getElementById('detain-a-free');
    const detainADetained = doc.getElementById('detain-a-detained');
    const detainBFree = doc.getElementById('detain-b-free');
    const detainBDetained = doc.getElementById('detain-b-detained');
    assert.ok(detainAFree, 'Device A free button');
    assert.ok(detainADetained, 'Device A detained button');
    assert.ok(detainBFree, 'Device B free button');
    assert.ok(detainBDetained, 'Device B detained button');
});

// Passphrase informational text
test('Passphrase info element shows guidance text', () => {
    const dom = new JSDOM(htmlContent);
    const doc = dom.window.document;
    const info = doc.getElementById('passphrase-info');
    assert.ok(info, 'Passphrase info bar must exist');
    const label = doc.getElementById('passphrase-active-label');
    assert.ok(label, 'Passphrase active label must exist');
});

// Summary
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
