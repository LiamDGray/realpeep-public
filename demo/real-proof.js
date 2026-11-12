/**
 * real-proof.js — DOM orchestration for the standalone real-proof page.
 * The video → hash → sign → prove logic lives in real-proof-core.js; proving
 * runs in real-proof-worker.js.
 */

import { runRealProof, prepareClip, useWebcam } from './real-proof-core.js';

const video = document.getElementById('source');
const preview = document.getElementById('frame-preview');
const statusEl = document.getElementById('status');
const rootLine = document.getElementById('root-line');
const output = document.getElementById('output');
const runClip = document.getElementById('run-clip');
const runWebcam = document.getElementById('run-webcam');
const download = document.getElementById('download');
const stepEls = {
    capture: document.getElementById('t-capture'),
    hash: document.getElementById('t-hash'),
    sign: document.getElementById('t-sign'),
    prove: document.getElementById('t-prove'),
    verify: document.getElementById('t-verify'),
    total: document.getElementById('t-total'),
};

let lastBundle = null;
let busy = false;

function setStatus(text) {
    statusEl.textContent = text;
}
function setBusy(value) {
    busy = value;
    runClip.disabled = value;
    runWebcam.disabled = value;
}
function fmt(ms) {
    return `${Math.round(ms)} ms`;
}

function onProgress(event) {
    if (!event || !event.stage) return;
    switch (event.stage) {
        case 'capture-start':
            setStatus('Capturing frames…');
            break;
        case 'capture':
            setStatus(`Capturing frames… ${event.index}/${event.total}`);
            break;
        case 'hash':
            setStatus('Hashing frames and building the Merkle root…');
            break;
        case 'sign':
            setStatus('Signing the frame commitment with the demo TEE key…');
            break;
        case 'prove':
            setStatus(event.message ? `Proving in worker… ${event.message}` : 'Proving in worker…');
            break;
        case 'verify':
            setStatus('Verifying…');
            break;
        default:
            break;
    }
}

async function prove(source) {
    if (busy) return;
    setBusy(true);
    lastBundle = null;
    download.disabled = true;
    output.textContent = 'Working…';
    rootLine.textContent = 'Frame root: —';
    Object.values(stepEls).forEach((el) => { el.textContent = '—'; });

    try {
        setStatus(source === 'webcam' ? 'Waiting for camera permission…' : 'Loading clip…');
        if (source === 'webcam') await useWebcam(video);
        else await prepareClip(video);

        const result = await runRealProof({
            video,
            canvas: preview,
            source,
            onProgress,
            onLog: (message) => {
                if (/witness|proving|proof/i.test(message)) {
                    setStatus(`Prover: ${message}`);
                }
            },
        });
        lastBundle = result;

        stepEls.capture.textContent = `${fmt(result.timings_ms.capture)} · ${result.frameCount} frames`;
        stepEls.hash.textContent = fmt(result.timings_ms.hash_and_merkle);
        stepEls.sign.textContent = fmt(result.timings_ms.sign_and_witness);
        stepEls.prove.textContent = `${fmt(result.timings_ms.prove)} (worker)`;
        stepEls.verify.textContent = `${fmt(result.timings_ms.verify)} · ${result.verified ? 'valid' : 'INVALID'}`;
        stepEls.total.textContent = fmt(result.timings_ms.total);
        rootLine.textContent = `Frame root: ${result.frameRoot.slice(0, 24)}… · payload ${result.payloadHash.slice(0, 18)}…`;
        output.textContent = JSON.stringify(
            {
                verified: result.verified,
                publicSignals: result.publicSignals,
                timings_ms: result.timings_ms,
            },
            null,
            2,
        );
        download.disabled = false;
        setStatus(result.verified ? 'Proof verified in this tab. Download the bundle to inspect it.' : 'Proof did not verify.');
    } catch (error) {
        setStatus(`Failed: ${error.message}`);
        output.textContent = String(error.stack || error);
        if (video.srcObject) {
            video.srcObject.getTracks().forEach((track) => track.stop());
        }
    } finally {
        setBusy(false);
    }
}

runClip.addEventListener('click', () => prove('clip'));
runWebcam.addEventListener('click', () => prove('webcam'));
download.addEventListener('click', () => {
    if (!lastBundle) return;
    const blob = new Blob([JSON.stringify(lastBundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'realpeep-real-proof.json';
    anchor.click();
    URL.revokeObjectURL(url);
});
