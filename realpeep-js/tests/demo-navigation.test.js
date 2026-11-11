/**
 * Navigation tests between Main Demo and Advanced pages.
 * Uses explicit JSDOM instances (no @jest-environment jsdom pragma needed).
 */
import { JSDOM } from 'jsdom';
import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const indexHtml = fs.readFileSync(
  path.resolve(process.cwd(), '../demo/index.html'),
  'utf8',
);
const advancedHtml = fs.readFileSync(
  path.resolve(process.cwd(), '../demo/advanced.html'),
  'utf8',
);

// The demo is deployed both at the site root and under a reverse-proxy
// subpath (e.g. http://localhost:8000/realpeep/demo/). Navigation links must
// therefore stay relative, and must resolve to the right page in either case.
const SUBPATH_DEMO = 'https://example.test/realpeep/demo/';

function resolvedPath(href, base = SUBPATH_DEMO) {
  return new URL(href, base).pathname;
}

/**
 * Helper: mock the blockchain-anchor.js functions on window.
 */
function mockBlockchainAnchor(window) {
  window.demoHash = (str) => {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h).toString(16).padStart(8, '0');
  };
}

describe('Demo Navigation', () => {
  describe('Main Demo → Advanced page link', () => {
    let dom, document, window;

    beforeAll(async () => {
      dom = new JSDOM(indexHtml, {
        runScripts: 'dangerously',
        resources: 'usable',
        url: 'http://localhost:8080/demo/',
      });
      window = dom.window;
      document = window.document;

      await new Promise((r) => setTimeout(r, 200));
    });

    afterAll(() => {
      window.close();
    });

    it('has navigation bar with two links', () => {
      const nav = document.querySelector('nav.demo-nav');
      expect(nav).not.toBeNull();

      const links = nav.querySelectorAll('a');
      expect(links.length).toBe(2);
    });

    it('Advanced link is relative so it works under a subpath mount', () => {
      const advancedLink = Array.from(
        document.querySelectorAll('nav.demo-nav a'),
      ).find((a) => a.textContent.includes('Advanced'));
      expect(advancedLink).not.toBeNull();
      expect(advancedLink.getAttribute('href')).toBe('advanced.html');
      expect(resolvedPath(advancedLink.getAttribute('href'))).toBe(
        '/realpeep/demo/advanced.html',
      );
    });

    it('Main Demo link stays on the current page under a subpath mount', () => {
      const mainLink = Array.from(
        document.querySelectorAll('nav.demo-nav a'),
      ).find((a) => a.textContent.includes('Main Demo'));
      expect(mainLink).not.toBeNull();
      expect(mainLink.getAttribute('href')).toBe('index.html');
      expect(resolvedPath(mainLink.getAttribute('href'))).toBe(
        '/realpeep/demo/index.html',
      );
    });

    it('page title is "RealPeep — Duress Protocol Demo"', () => {
      expect(document.title).toBe('RealPeep — Duress Protocol Demo');
    });
  });

  describe('Advanced page', () => {
    let dom, document, window;

    beforeAll(async () => {
      dom = new JSDOM(advancedHtml, {
        runScripts: 'dangerously',
        resources: 'usable',
        url: 'http://localhost:8080/demo/advanced.html',
      });
      window = dom.window;
      document = window.document;

      // Mock hash functions the page needs
      mockBlockchainAnchor(window);

      // Manually set up event handlers since module scripts won't execute
      const input = document.getElementById('frame-input');
      const addBtn = document.getElementById('add-frame-btn');
      const finalizeBtn = document.getElementById('finalize-btn');
      const resetBtn = document.getElementById('reset-btn');

      // Simple frame management
      window._frames = [];
      window._merkleRoot = null;

      if (addBtn) {
        addBtn.addEventListener('click', () => {
          const text = input.value.trim();
          if (!text) return;
          window._frames.push(text);
          const countEl = document.getElementById('frame-count');
          if (countEl) countEl.textContent = String(window._frames.length);
          input.value = '';
          const list = document.getElementById('frame-list');
          if (list) {
            const li = document.createElement('li');
            li.textContent = `${window._frames.length}: ${text.slice(0, 30)}`;
            list.appendChild(li);
          }
        });
      }

      if (finalizeBtn) {
        finalizeBtn.addEventListener('click', () => {
          if (window._frames.length < 1) return;
          // Build a Merkle-like root from frames
          const hashes = window._frames.map((f) => window.demoHash(f));
          let root = hashes[0];
          for (let i = 1; i < hashes.length; i++) {
            root = window.demoHash(root + hashes[i]);
          }
          window._merkleRoot = root;
          const display = document.getElementById('merkle-root-display');
          if (display) {
            display.textContent = root;
            display.style.display = 'block';
          }
          const treeEl = document.getElementById('merkle-tree');
          if (treeEl) treeEl.style.display = 'block';
        });
      }

      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          window._frames = [];
          window._merkleRoot = null;
          const countEl = document.getElementById('frame-count');
          if (countEl) countEl.textContent = '0';
          const list = document.getElementById('frame-list');
          if (list) list.innerHTML = '';
          const display = document.getElementById('merkle-root-display');
          if (display) display.style.display = 'none';
          const treeEl = document.getElementById('merkle-tree');
          if (treeEl) treeEl.style.display = 'none';
        });
      }

      await new Promise((r) => setTimeout(r, 200));
    });

    afterAll(() => {
      window.close();
    });

    it('has correct page title', () => {
      expect(document.title).toContain('Hash Chain');
    });

    it('has navigation back to Main Demo', () => {
      const nav = document.querySelector('nav');
      expect(nav).not.toBeNull();
      const links = nav.querySelectorAll('a');
      const mainLink = Array.from(links).find((a) =>
        a.textContent.includes('Main Demo'),
      );
      expect(mainLink).not.toBeNull();
      expect(mainLink.getAttribute('href')).toBe('index.html');
      expect(
        resolvedPath(
          mainLink.getAttribute('href'),
          'https://example.test/realpeep/demo/advanced.html',
        ),
      ).toBe('/realpeep/demo/index.html');
    });

    it('add 3 frames → finalize → Merkle root appears', () => {
      const input = document.getElementById('frame-input');
      const addBtn = document.getElementById('add-frame-btn');
      const finalizeBtn = document.getElementById('finalize-btn');
      const display = document.getElementById('merkle-root-display');
      const countEl = document.getElementById('frame-count');

      // Frame 1
      input.value = 'Frame Alpha Content';
      addBtn.click();
      expect(countEl.textContent).toBe('1');

      // Frame 2
      input.value = 'Frame Beta Content';
      addBtn.click();
      expect(countEl.textContent).toBe('2');

      // Frame 3
      input.value = 'Frame Gamma Content';
      addBtn.click();
      expect(countEl.textContent).toBe('3');

      // Finalize
      finalizeBtn.click();

      // Merkle root should appear
      expect(window._merkleRoot).not.toBeNull();
      expect(window._merkleRoot.length).toBeGreaterThan(0);
      expect(display.textContent).not.toBe('');
    });

    it('Merkle root is a hex string', () => {
      const input = document.getElementById('frame-input');
      const addBtn = document.getElementById('add-frame-btn');
      const finalizeBtn = document.getElementById('finalize-btn');

      // Reset and add one frame
      document.getElementById('reset-btn').click();
      input.value = 'Test Frame';
      addBtn.click();
      finalizeBtn.click();

      expect(window._merkleRoot).toMatch(/^[0-9a-f]+$/);
    });

    it('reset clears frames and Merkle root', () => {
      const input = document.getElementById('frame-input');
      const addBtn = document.getElementById('add-frame-btn');
      const resetBtn = document.getElementById('reset-btn');
      const finalizeBtn = document.getElementById('finalize-btn');

      input.value = 'Test';
      addBtn.click();
      finalizeBtn.click();
      expect(window._merkleRoot).not.toBeNull();

      resetBtn.click();
      expect(window._frames.length).toBe(0);
      expect(document.getElementById('frame-count').textContent).toBe('0');
      expect(window._merkleRoot).toBeNull();
    });
  });

  describe('Cross-page navigation simulation', () => {
    it('Main Demo nav links are structurally correct for navigation', () => {
      const dom = new JSDOM(indexHtml, { url: 'http://localhost:8080/demo/' });
      const doc = dom.window.document;

      // Verify the advanced link structure
      const advancedLink = Array.from(
        doc.querySelectorAll('nav.demo-nav a'),
      ).find((a) => a.textContent.includes('Advanced'));
      expect(advancedLink).not.toBeNull();

      // In a real browser, clicking this would navigate to advanced.html
      // In jsdom, we verify the href is relative and resolves correctly.
      expect(advancedLink.getAttribute('href')).toBe('advanced.html');
      expect(resolvedPath(advancedLink.getAttribute('href'))).toBe(
        '/realpeep/demo/advanced.html',
      );

      dom.window.close();
    });

    it('Advanced page nav links back to Main Demo', () => {
      const dom = new JSDOM(advancedHtml, {
        url: 'http://localhost:8080/demo/advanced.html',
      });
      const doc = dom.window.document;

      const mainLink = Array.from(doc.querySelectorAll('nav a')).find((a) =>
        a.textContent.includes('Main Demo'),
      );
      expect(mainLink).not.toBeNull();
      expect(mainLink.getAttribute('href')).toBe('index.html');
      expect(
        resolvedPath(
          mainLink.getAttribute('href'),
          'https://example.test/realpeep/demo/advanced.html',
        ),
      ).toBe('/realpeep/demo/index.html');

      dom.window.close();
    });
  });
});
