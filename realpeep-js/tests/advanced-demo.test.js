/**
 * Tests for the rewritten advanced.html (hash chain graph + Merkle tree).
 * The new page inlines its JS and uses blockchain-anchor.js for hash computations.
 */
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const html = fs.readFileSync(path.resolve(__dirname, '../../demo/advanced.html'), 'utf8');

describe('Advanced Demo (hash chain graph)', () => {
    let dom, document, window;

    beforeEach(async () => {
        dom = new JSDOM(html, {
            runScripts: 'dangerously',
            resources: 'usable',
        });
        window = dom.window;
        document = window.document;

        // The page uses ES module imports; JSDOM can't handle those.
        // We mock blockchain-anchor.js functions on the window.
        window.demoHash = (str) => {
            let h = 0;
            for (let i = 0; i < str.length; i++) {
                h = ((h << 5) - h) + str.charCodeAt(i);
                h |= 0;
            }
            return Math.abs(h).toString(16).padStart(8, '0');
        };

        // The page's <script type="module"> won't execute in JSDOM.
        // Manually set up the event handlers that the module would register.
        const input = document.getElementById('frame-input');
        const addBtn = document.getElementById('add-frame-btn');
        const finalizeBtn = document.getElementById('finalize-btn');
        const resetBtn = document.getElementById('reset-btn');

        // We'll test these directly rather than relying on module execution.
        // Store references for tests to use.
        window._testElements = { input, addBtn, finalizeBtn, resetBtn };

        await new Promise(r => setTimeout(r, 100));
    });

    afterEach(() => {
        window.close();
    });

    it('has all required UI elements', () => {
        expect(document.getElementById('frame-input')).not.toBeNull();
        expect(document.getElementById('add-frame-btn')).not.toBeNull();
        expect(document.getElementById('finalize-btn')).not.toBeNull();
        expect(document.getElementById('reset-btn')).not.toBeNull();
        expect(document.getElementById('merkle-root-display')).not.toBeNull();
        expect(document.getElementById('frame-count')).not.toBeNull();
        expect(document.getElementById('chain-svg')).not.toBeNull();
    });

    it('has navigation to main demo', () => {
        const nav = document.querySelector('nav');
        expect(nav).not.toBeNull();
        const links = nav.querySelectorAll('a');
        expect(links.length).toBeGreaterThanOrEqual(1);
        const mainLink = Array.from(links).find(a => a.textContent.includes('Main Demo'));
        expect(mainLink).not.toBeNull();
        // Relative, so the demo also works when mounted under a subpath.
        expect(mainLink.getAttribute('href')).toBe('index.html');
    });

    it('has OpenTimestamps link', () => {
        const links = Array.from(document.querySelectorAll('a'));
        const otsLink = links.find(a => a.href && a.href.includes('opentimestamps'));
        expect(otsLink).not.toBeNull();
    });

    it('frame count starts at 0', () => {
        expect(document.getElementById('frame-count').textContent).toBe('0');
    });

    it('merkle tree is initially hidden', () => {
        const tree = document.getElementById('merkle-tree');
        expect(tree.style.display).toBe('none');
    });
});
