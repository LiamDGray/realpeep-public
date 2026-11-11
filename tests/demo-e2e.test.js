import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { createServer } from 'net';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Bind to an ephemeral port instead of hard-coding a common one (8080 is
// often taken by a local dev proxy, and parallel CI jobs can collide too).
function getFreePort() {
    return new Promise((resolve, reject) => {
        const probe = createServer();
        probe.once('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const { port } = probe.address();
            probe.close(() => resolve(port));
        });
    });
}

const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const serverProcess = spawn(
    'python3',
    ['-m', 'http.server', String(port), '--bind', '127.0.0.1'],
    { cwd: rootDir },
);

async function waitForServer(url, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(url);
            if (response.ok) return;
        } catch {
            // Server not accepting connections yet.
        }
        await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`Timed out waiting for demo server at ${url}`);
}

await waitForServer(`${baseUrl}/demo/`);

async function runTest() {
    let browser;
    let errors = [];
    try {
        browser = await puppeteer.launch({ 
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1400, height: 900 });
        
        page.on('console', msg => {
            const url = msg.location().url || '';
            if (msg.type() === 'error' && !url.includes('favicon.ico')) {
                errors.push(`Console error: ${msg.text()} at ${url}`);
            }
        });
        
        page.on('pageerror', err => {
            errors.push(`Page error: ${err.message}`);
        });

        page.on('response', resp => {
            if (resp.status() === 404 && !resp.url().includes('favicon.ico')) {
                errors.push(`404 Not Found: ${resp.url()}`);
            }
        });
        
        page.on('requestfailed', req => {
            if (!req.url().includes('favicon.ico')) {
                errors.push(`Request failed: ${req.url()} - ${req.failure().errorText}`);
            }
        });

        await page.goto(`${baseUrl}/demo/`, { waitUntil: 'networkidle0' });

        // ── Step 1: Page loads without errors, PIN pad is visible ──
        const pinInstruction = await page.$('#pin-instruction');
        if (!pinInstruction) errors.push('FAIL: #pin-instruction not found');

        const badge1 = await page.$('#badge-1');
        if (!badge1) errors.push('FAIL: #badge-1 (step 1 guidance) not found');
        
        const recordBtn = await page.$('#record-btn');
        const recordDisabled = await page.evaluate(el => el.disabled, recordBtn);
        if (!recordDisabled) errors.push('FAIL: Record button should be disabled before PIN entry');

        // ── Step 2: Enter 4-digit PIN, record button should unlock ──
        try {
            await page.click('button[data-key="1"]');
            await page.click('button[data-key="2"]');
            await page.click('button[data-key="3"]');
            await page.click('button[data-key="4"]');
            await new Promise(r => setTimeout(r, 300));

            const recordEnabledAfterPin = await page.evaluate(() =>
                !document.querySelector('#record-btn').disabled
            );
            if (!recordEnabledAfterPin) errors.push('FAIL: Record button should be enabled after 4-digit PIN');

            // Badge 2 should now be visible
            const badge2Visible = await page.evaluate(() => {
                const b = document.querySelector('#badge-2');
                return b && b.style.display !== 'none';
            });
            if (!badge2Visible) errors.push('FAIL: Badge 2 should appear after PIN entry');

            // ── Step 3: Start recording ──
            await page.click('#record-btn');
            await new Promise(r => setTimeout(r, 1000));

            // Stop button should appear
            const stopVisible = await page.evaluate(() => {
                const s = document.querySelector('#stop-btn');
                return s && s.style.display !== 'none';
            });
            if (!stopVisible) errors.push('FAIL: Stop button should be visible during recording');

            // Badge 3 (stop) should appear
            const badge3Visible = await page.evaluate(() => {
                const b = document.querySelector('#badge-3');
                return b && b.style.display !== 'none';
            });
            if (!badge3Visible) errors.push('FAIL: Badge 3 should appear when recording');

            // ── Step 4: Stop recording, trigger full pipeline ──
            await page.click('#stop-btn');

            // Pipeline completes — certificate auto-shown
            await page.waitForSelector('.cert-card', { timeout: 20000 });

            // ── Assert: Certificate tab is active ──
            const certTabActive = await page.evaluate(() =>
                document.querySelector('[data-tab="cert"]')?.classList.contains('active')
            );
            if (!certTabActive) errors.push('FAIL: Certificate tab should be auto-activated after verification');

            // ── Assert: Certificate content is meaningful ──
            const certText = await page.evaluate(() =>
                document.querySelector('.cert-card')?.textContent || ''
            );
            if (!certText.includes('GroupMNR')) errors.push('FAIL: Certificate card should contain GroupMNR text');

            // ── Assert: DAG tab was visited — check by navigating to it ──
            await page.click('[data-tab="dag"]');
            await new Promise(r => setTimeout(r, 300));

            const dagLegendText = await page.evaluate(() =>
                document.querySelector('#dag-legend')?.textContent || ''
            );
            if (!dagLegendText.includes('Nodes')) errors.push('FAIL: DAG legend should show node/edge counts');

            // DAG should have edges > 0 (from our reconstructDAG fix)
            const dagEdges = await page.evaluate(() => {
                const legend = document.querySelector('#dag-legend')?.textContent || '';
                const m = legend.match(/Edges:\s*(\d+)/);
                return m ? parseInt(m[1]) : -1;
            });
            if (dagEdges <= 0) errors.push(`FAIL: DAG should have >0 edges, got ${dagEdges}`);

            // ── Assert: Merkle Tree shows device selectors ──
            await page.click('[data-tab="merkle"]');
            await new Promise(r => setTimeout(r, 300));

            const merkleSelector = await page.$('#merkle-device-selector');
            const merkleBtnCount = await page.evaluate(() =>
                document.querySelectorAll('#merkle-device-selector button').length
            );
            if (merkleBtnCount < 2) errors.push(`FAIL: Merkle device selector should have ≥2 devices, got ${merkleBtnCount}`);

            // SVG should have actual tree nodes
            const merkleSvgHasContent = await page.evaluate(() => {
                const svg = document.querySelector('#merkle-svg');
                return svg && svg.innerHTML.includes('<circle');
            });
            if (!merkleSvgHasContent) errors.push('FAIL: Merkle SVG should render circles (tree nodes)');

            // ── Assert: Phase bar shows "Verify" as active ──
            const verifyPhaseActive = await page.evaluate(() =>
                document.querySelector('[data-phase="verify"]')?.classList.contains('viz-phase-active') ||
                document.querySelector('[data-phase="verify"]')?.classList.contains('viz-phase-done')
            );
            if (!verifyPhaseActive) errors.push('FAIL: Verify phase should be marked active/done');

        } catch (e) {
            console.error("UI flow failed:", e.message);
            await page.screenshot({ path: 'tests/error_screenshot.png' });
            errors.push("UI Flow failed: " + e.message);
        }
        
        if (errors.length > 0) {
            console.error('Test failed. Caught the following errors:');
            errors.forEach(e => console.error(e));
            process.exitCode = 1;
        } else {
            console.log('Test passed. Full happy path verified.');
            process.exitCode = 0;
        }
    } catch (e) {
        console.error('Test execution failed:', e);
        process.exitCode = 1;
    } finally {
        if (browser) await browser.close();
        serverProcess.kill();
    }
}

runTest();
