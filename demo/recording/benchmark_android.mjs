// Benchmark the real-proof page in an Android Chrome tab over adb.
//
// Prerequisites:
//   adb reverse tcp:8099 tcp:8099
//   python3 -m http.server 8099 --bind 127.0.0.1
//   adb shell am start -a android.intent.action.VIEW \
//     -d http://localhost:8099/demo/real-proof.html
//   adb forward tcp:9222 localabstract:chrome_devtools_remote
//
// Usage:
//   node benchmark_android.mjs [--webcam] [--runs 2]
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const useWebcam = args.includes('--webcam');
const runsIndex = args.indexOf('--runs');
const runs = runsIndex >= 0 ? Number(args[runsIndex + 1] || 2) : 2;

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0];
const pages = context.pages();
const page = pages.find((p) => p.url().includes('/demo/real-proof.html')) || pages[0];
if (!page) throw new Error('no Chrome page found');
page.on('crash', () => console.log('PAGE CRASHED'));

if (useWebcam) {
    try {
        await context.grantPermissions(['camera'], { origin: 'http://localhost:8099' });
    } catch (error) {
        console.log('camera grant failed:', error.message);
    }
}

await page.bringToFront();
await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector(useWebcam ? '#run-webcam' : '#run-clip', { timeout: 60000 });

for (let i = 0; i < runs; i++) {
    await page.click(useWebcam ? '#run-webcam' : '#run-clip');
    await page.waitForFunction(
        () => {
            const s = document.querySelector('#status')?.textContent || '';
            return s.includes('verified') || s.startsWith('Failed');
        },
        null,
        { timeout: 180000 },
    );
    console.log(
        JSON.stringify({
            run: i + 1,
            mode: useWebcam ? 'webcam' : 'clip',
            status: await page.locator('#status').textContent(),
            prove: await page.locator('#t-prove').textContent(),
            total: await page.locator('#t-total').textContent(),
            verify: await page.locator('#t-verify').textContent(),
        }),
    );
}

await browser.close();
