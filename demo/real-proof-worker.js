/* global snarkjs */
/* eslint-disable no-restricted-globals */
// Groth16 proving in a worker so the page can paint progress.
// snarkjs is GPL-3.0 and is loaded from a pinned CDN, not vendored.
importScripts('https://cdn.jsdelivr.net/npm/snarkjs@0.7.6/build/snarkjs.min.js');

self.onmessage = async (event) => {
    const { id, input, vk, wasm, zkey } = event.data || {};
    const post = (type, payload = {}) => self.postMessage({ id, type, ...payload });

    try {
        if (typeof snarkjs === 'undefined') {
            throw new Error('snarkjs failed to load in the worker');
        }
        post('progress', { stage: 'prove', message: 'loading prover artifacts' });
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
        post('proof', { proof, publicSignals });

        post('progress', { stage: 'verify', message: 'verifying proof' });
        const ok = await snarkjs.groth16.verify(vk, publicSignals, proof);
        post('done', { ok });
    } catch (error) {
        post('error', { error: error && error.message ? error.message : String(error) });
    }
};
