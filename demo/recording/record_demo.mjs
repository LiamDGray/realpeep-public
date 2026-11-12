/**
 * Record the 90-second RealPeep demo with Playwright.
 *
 * Prereqs:
 *   cd demo/recording && npm ci
 *   npx playwright install chromium
 *   ../make_narration.py  (or the wrapper script)
 *
 * Usage:
 *   node record_demo.mjs [outDir]
 *
 * The script reads outDir/timeline.json (written by make_narration.py), starts
 * a local static server on an ephemeral loopback port, drives the demo with a
 * visible cursor/click ripple and lower-thirds, and writes outDir/raw.webm.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');
const outDir = path.resolve(process.argv[2] || path.join(__dirname, 'out'));
const timelinePath = path.join(outDir, 'timeline.json');

if (!fs.existsSync(timelinePath)) {
    console.error(`missing ${timelinePath}; run make_narration.py first`);
    process.exit(1);
}
const timeline = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
const total = Number(timeline.total_seconds);
fs.mkdirSync(path.join(outDir, 'video'), { recursive: true });

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

async function waitForServer(url, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(url);
            if (response.ok) return;
        } catch {
            // not ready
        }
        await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`timed out waiting for ${url}`);
}

const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
    cwd: rootDir,
    stdio: 'ignore',
});
await waitForServer(`${baseUrl}/demo/`);

const fakeCamera = process.env.FAKE_CAMERA_FILE;
const browserArgs = ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'];
if (fakeCamera) {
    // Deterministic camera fixture for the recorded cut. The demo still labels
    // it as a browser-camera preview, not hardware attestation.
    browserArgs.push(
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-video-capture=${fakeCamera}`,
    );
}
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN || chromium.executablePath(),
    args: browserArgs,
});
const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
    recordVideo: { dir: path.join(outDir, 'video'), size: { width: 1600, height: 900 } },
});
const page = await context.newPage();

// A visible cursor, click ripple, and lower-third that survive navigation.
await page.addInitScript(() => {
    const install = () => {
        if (document.getElementById('__cursor')) return;
        const style = document.createElement('style');
        style.textContent = `
          #__cursor { position:fixed; left:0; top:0; width:16px; height:16px; border-radius:50%;
            background:rgba(0,210,255,.35); border:2px solid #fff; box-shadow:0 0 0 2px rgba(0,0,0,.45),0 0 18px rgba(0,210,255,.65);
            transform:translate(-50%,-50%); pointer-events:none; z-index:2147483647;
            transition:left .14s ease-out, top .14s ease-out; }
          .__ripple { position:fixed; width:30px; height:30px; border:2px solid #00d2ff; border-radius:50%;
            transform:translate(-50%,-50%) scale(.35); opacity:.95; pointer-events:none; z-index:2147483646;
            animation:__rip .55s ease-out forwards; }
          @keyframes __rip { to { transform:translate(-50%,-50%) scale(2.3); opacity:0; } }
          #__lower_third { position:fixed; left:50%; bottom:34px; transform:translateX(-50%);
            width:min(1120px, 88vw); padding:18px 26px; border-radius:14px;
            background:rgba(5,8,15,.90); border:1px solid rgba(0,210,255,.35);
            box-shadow:0 24px 70px rgba(0,0,0,.45); backdrop-filter:blur(12px);
            color:#eaf2ff; font-family:Inter,"DejaVu Sans",system-ui,sans-serif;
            opacity:0; transition:opacity .25s ease; pointer-events:none; z-index:2147483645; }
          #__lower_third.on { opacity:1; }
          #__lower_third .t { font-size:26px; font-weight:750; letter-spacing:-.02em; line-height:1.15; }
          #__lower_third .s { margin-top:5px; font-size:17px; color:#8fa3c0; line-height:1.35; }
        `;
        document.head.appendChild(style);
        const cursor = document.createElement('div');
        cursor.id = '__cursor';
        document.documentElement.appendChild(cursor);
        const lower = document.createElement('div');
        lower.id = '__lower_third';
        lower.innerHTML = '<div class="t"></div><div class="s"></div>';
        document.documentElement.appendChild(lower);
        let x = window.innerWidth / 2;
        let y = window.innerHeight / 2;
        const move = () => {
            cursor.style.left = `${x}px`;
            cursor.style.top = `${y}px`;
        };
        move();
        window.addEventListener('mousemove', (event) => {
            x = event.clientX;
            y = event.clientY;
            move();
        });
        window.addEventListener('mousedown', () => {
            const ripple = document.createElement('div');
            ripple.className = '__ripple';
            ripple.style.left = `${x}px`;
            ripple.style.top = `${y}px`;
            document.documentElement.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
        });
    };
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', install, { once: true });
    } else {
        install();
    }
});

const started = Date.now();
async function at(seconds) {
    const delay = started + seconds * 1000 - Date.now();
    if (delay > 0) await page.waitForTimeout(delay);
}
async function safe(label, fn) {
    try {
        await fn();
    } catch (error) {
        console.error(`[${label}] ${error.message}`);
    }
}
async function setLowerThird(title, subtitle) {
    await page.evaluate(({ title, subtitle }) => {
        const el = document.getElementById('__lower_third');
        if (!el) return;
        el.querySelector('.t').textContent = title;
        el.querySelector('.s').textContent = subtitle;
        el.classList.add('on');
    }, { title, subtitle });
}
async function hideLowerThird() {
    await page.evaluate(() => document.getElementById('__lower_third')?.classList.remove('on'));
}
async function moveTo(selector, steps = 1) {
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: 'visible', timeout: 4000 });
    let box = await locator.boundingBox();
    if (!box || box.y < 0 || box.y + box.height > 900) {
        await locator.scrollIntoViewIfNeeded({ timeout: 4000 });
        box = await locator.boundingBox();
    }
    if (!box) return;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps });
}
async function clickSelector(selector) {
    await moveTo(selector);
    await page.waitForTimeout(90);
    await page.mouse.down();
    await page.waitForTimeout(70);
    await page.mouse.up();
    await page.waitForTimeout(150);
}
async function scrollTo(selector) {
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: 'attached', timeout: 4000 });
    await locator.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await page.waitForTimeout(650);
}

await page.goto(`${baseUrl}/demo/?camera=${fakeCamera ? 'auto' : 'off'}`, { waitUntil: 'load', timeout: 30000 });
await page.waitForSelector('#pin-instruction', { timeout: 15000 });
await page.emulateMedia({ reducedMotion: 'no-preference' });

// 0:00–0:10 — title / frame
await at(0.2);
await setLowerThird('RealPeep', 'anonymous proof of capture · research prototype');
await page.mouse.move(800, 450, { steps: 12 });
await at(1.0);
await setLowerThird('RealPeep', 'anonymous proof of capture · research prototype');

// 0:10–0:20 — the surface
await at(11.8);
await hideLowerThird();
await at(12.8);
await setLowerThird('The surface', 'browser-only demo · no upload · no server');
await safe('nav', async () => {
    await page.locator('nav.demo-nav').waitFor({ state: 'visible', timeout: 4000 });
    await moveTo('nav.demo-nav a >> nth=1');
});
await at(16.2);
await safe('scroll-pin', () => scrollTo('#pin-instruction'));

// 0:20–0:35 — capture
await at(21.0);
await setLowerThird('Capture', 'real frame hash chain · simulated mesh witness');
for (const key of ['1', '2', '3', '4']) {
    await safe(`pin-${key}`, () => clickSelector(`button[data-key="${key}"]`));
    await page.waitForTimeout(80);
}
await at(23.6);
await safe('record', () => clickSelector('#record-btn'));
await at(25.8);
await safe('stop', () => clickSelector('#stop-btn'));
await at(27.0);
await safe('wait-cert', () => page.waitForSelector('.cert-card', { timeout: 5000 }));
await safe('scroll-cert', () => scrollTo('.cert-card'));
await at(31.0);
await safe('move-cert', () => moveTo('.cert-card'));

// 0:35–0:50 — normal proof
await at(33.4);
await hideLowerThird();
await at(34.3);
await setLowerThird('Normal proof', 'public verifier: valid · notary: clear');
await safe('scroll-zk', () => scrollTo('#zk-test-btn'));
await at(36.0);
await safe('normal-pass', () => clickSelector('#passphrase-normal-btn'));
await at(37.0);
await safe('normal-run', () => clickSelector('#zk-test-btn'));
await at(42.4);
await safe('normal-notary', () => clickSelector('#view-notary-btn'));

// 0:50–1:05 — duress proof
await at(43.3);
await hideLowerThird();
await at(43.9);
await setLowerThird('Duress proof', 'captor: verified · notary: duress');
await at(45.0);
await safe('duress-pass', () => clickSelector('#passphrase-duress-btn'));
await at(46.0);
await safe('duress-run', () => clickSelector('#zk-test-btn'));
await at(50.8);
await safe('captor-view', () => clickSelector('#view-captor-btn'));
await at(52.5);
await safe('duress-notary', () => clickSelector('#view-notary-btn'));

// 1:05–1:20 — the honest gap
await at(53.3);
await hideLowerThird();
await at(53.8);
await setLowerThird('Known gap', '4-bit demo marker · nonce reuse · no transcript binding');
await at(56.0);
await safe('alert', () => moveTo('#duress-alert'));
await at(59.0);
await safe('scroll-alert', () => scrollTo('#duress-alert'));

// 1:20–1:30 — evidence
await at(67.0);
await hideLowerThird();
await at(67.7);
await page.goto(`${baseUrl}/demo/recording/evidence.html`, { waitUntil: 'load', timeout: 15000 });
await page.waitForTimeout(250);
await hideLowerThird();
await safe('stats', () => moveTo('.stats'));
await at(73.5);
await safe('terminal', () => moveTo('.terminal'));
await at(77.5);
await safe('next', () => moveTo('.next'));

// 1:30 — close
await at(80.9);
await hideLowerThird();
await at(81.3);
await setLowerThird('Public mirror', 'github.com/LiamDGray/realpeep-public · issue #1');
await page.mouse.move(1520, 860, { steps: 1 });
await at(89.6);
await page.waitForTimeout(600);

const video = page.video();
await context.close();
const rawPath = await video.path();
fs.copyFileSync(rawPath, path.join(outDir, 'raw.webm'));
await browser.close();
server.kill('SIGTERM');

const duration = total;
fs.writeFileSync(path.join(outDir, 'record.json'), JSON.stringify({ duration, raw: 'raw.webm' }, null, 2) + '\n');
console.log(`recorded ${rawPath} (${duration.toFixed(1)}s timeline) -> ${outDir}/raw.webm`);
