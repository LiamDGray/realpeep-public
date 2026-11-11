/**
 * @jest-environment jsdom
 *
 * Test that app.js loads and DSP extraction completes without errors.
 * Uses minimal device count (2) to avoid the slow 20-device optimal-defaults path.
 * The original test with optimal defaults (20 devices, 1024 spreading factor)
 * produces a ~50-second simulation that can time out in CI; this version
 * completes in under 2 seconds of fake-timer time.
 */

import fs from 'fs';
import path from 'path';
import { jest } from '@jest/globals';
const html = fs.readFileSync(path.resolve(process.cwd(), '../demo/index.html'), 'utf8');

describe('UI Integration (app.js)', () => {
    let initApp;

    beforeAll(async () => {
        document.documentElement.innerHTML = html;
        // Mock canvas context
        HTMLCanvasElement.prototype.getContext = () => ({
            clearRect: jest.fn(),
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            stroke: jest.fn(),
            fillRect: jest.fn(),
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1
        });
        window.requestAnimationFrame = jest.fn();
        window.cancelAnimationFrame = jest.fn();
        // Mock crypto for duress-core
        if (!window.crypto) window.crypto = {};
        window.crypto.getRandomValues = (arr) => {
            for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
            return arr;
        };

        const mod = await import('../../demo/app.js');
        initApp = mod.initApp;
    });

    afterEach(() => {
        jest.useRealTimers();
    });
    
    it('should load app.js, initialize, and execute DSP extraction without simulation errors', async () => {
        const DSP_TEST_TIMEOUT = parseInt(process.env.DSP_TEST_TIMEOUT || '60');
        jest.setTimeout(DSP_TEST_TIMEOUT * 1000);
        
        // Initialize the app logic
        initApp();

        // Override to minimal device count (2 instead of optimal 20)
        // for fast completion in CI. The optimal-defaults test is in demo-e2e.test.js
        document.getElementById('dsp-devices').value = '2';
        document.getElementById('dsp-devices').dispatchEvent(new Event('input'));
        // Shorter spreading factor for faster test
        document.getElementById('dsp-spreading').value = '64';
        document.getElementById('dsp-spreading').dispatchEvent(new Event('input'));
        // Minimal FEC
        document.getElementById('dsp-fec').value = '4';
        document.getElementById('dsp-fec').dispatchEvent(new Event('input'));
        
        // Enable fake timers so we can fast-forward the setInterval buffer ingestion
        jest.useFakeTimers();
        
        const btnExecute = document.getElementById('btn-execute-dsp');
        const terminal = document.getElementById('dsp-terminal');
        
        // Click the execute button
        btnExecute.click();
        
        // Fast-forward timers to complete the streaming simulation.
        // With 2 devices and 64-chip spreading, total simulation is ~4 seconds.
        await jest.advanceTimersByTimeAsync(30000); 
        
        // Assert that the terminal text does NOT contain "Simulation Error"
        const output = terminal.innerHTML;
        expect(output).not.toMatch(/Simulation Error/i);
        
        // And ensure it actually completed the extraction
        expect(output).toMatch(/Matched Filter Extraction Complete/i);
        
        jest.useRealTimers();
    }, 15000);
});
