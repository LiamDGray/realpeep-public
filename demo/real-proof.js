/**
 * real-proof.js — real client-side frame hashing + Groth16 proof.
 *
 * This is deliberately separate from the animated simulation in app.js. It
 * actually:
 *   1. captures ~20 frames from a public-domain clip or the webcam,
 *   2. SHA-256 hashes each frame and builds a binary Merkle root,
 *   3. maps the root to a BN254 field element,
 *   4. signs it with a DEMO EdDSA-Poseidon key (not hardware),
 *   5. generates and verifies a Groth16 proof in the browser.
 *
 * The demo key and the committed dev zkey are not production trust roots.
 */

const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const DEMO_TEE_KEY = 'realpeep-demo-tee-key-not-secret';
const FRAME_COUNT = 20;
const FRAME_INTERVAL_MS = 120;
const FRAME_W = 320;
const FRAME_H = 180;
const CLIP_URL = 'assets/public-domain/nasa-earth-iss-5s.mp4';

const video = document.getElementById('source');
const preview = document.getElementById('frame-preview');
const previewCtx = preview.getContext('2d', { willReadFrequently: true });
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
function bytesToHex(bytes) {
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(hex) {
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return out;
}
async function sha256Hex(data) {
    const digest = await crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(digest));
}
async function hashPair(a, b) {
    const buf = new Uint8Array(a.length + b.length);
    buf.set(a, 0);
    buf.set(b, a.length);
    return new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
}
async function merkleRoot(hexLeaves) {
    let level = hexLeaves.map(hexToBytes);
    while (level.length > 1) {
        const next = [];
        for (let i = 0; i < level.length; i += 2) {
            next.push(await hashPair(level[i], level[i + 1] || level[i]));
        }
        level = next;
    }
    return bytesToHex(level[0]);
}
function fieldFromHex(hex) {
    const value = BigInt('0x' + hex) % FIELD;
    return value === 0n ? 1n : value;
}

async function useClip() {
    if (video.srcObject) {
        video.srcObject.getTracks().forEach((t) => t.stop());
        video.srcObject = null;
    }
    if (video.src !== new URL(CLIP_URL, window.location.href).href) {
        video.src = CLIP_URL;
        video.load();
    }
    video.loop = true;
    video.muted = true;
    await video.play();
}

async function useWebcam() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia is not available in this browser');
    }
    if (video.src) {
        video.removeAttribute('src');
        video.load();
    }
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
    });
    video.srcObject = stream;
    video.loop = false;
    video.muted = true;
    await video.play();
    return stream;
}

async function captureFrames(source) {
    const hashes = [];
    await new Promise((resolve) => setTimeout(resolve, 120));
    for (let i = 0; i < FRAME_COUNT; i++) {
        if (i > 0) await new Promise((resolve) => setTimeout(resolve, FRAME_INTERVAL_MS));
        previewCtx.drawImage(video, 0, 0, FRAME_W, FRAME_H);
        const image = previewCtx.getImageData(0, 0, FRAME_W, FRAME_H);
        hashes.push(await sha256Hex(image.data));
    }
    if (source === 'webcam' && video.srcObject) {
        video.srcObject.getTracks().forEach((track) => track.stop());
    }
    if (source === 'clip') video.pause();
    return hashes;
}

function buildWitness(payloadHash) {
    if (!window.ZkKit) throw new Error('ZK helper bundle failed to load');
    const { derivePublicKey, signMessage, poseidon2 } = window.ZkKit;
    const publicKey = derivePublicKey(DEMO_TEE_KEY);
    const [Ax, Ay] = publicKey;
    const signature = signMessage(DEMO_TEE_KEY, payloadHash);
    const [R8x, R8y] = signature.R8;
    const leaf = poseidon2([Ax, Ay]);
    const path = Array(20).fill(0n);
    const indices = Array(20).fill(0);
    let root = leaf;
    for (let i = 0; i < 20; i++) root = poseidon2([root, path[i]]);
    const ephemeral = fieldFromHex(
        bytesToHex(new TextEncoder().encode('ephemeral:' + payloadHash.toString())),
    );
    return {
        input: {
            payload_hash: payloadHash.toString(),
            ephemeral_pubkey: ephemeral.toString(),
            authorized_merkle_root: root.toString(),
            tee_pubkey_x: Ax.toString(),
            tee_pubkey_y: Ay.toString(),
            tee_sig_Rx: R8x.toString(),
            tee_sig_Ry: R8y.toString(),
            tee_sig_S: signature.S.toString(),
            merkle_path_elements: path.map(String),
            merkle_path_indices: indices,
        },
        demoRoot: root,
        demoPublicKey: [Ax.toString(), Ay.toString()],
    };
}

async function prove(source) {
    if (busy) return;
    if (!window.snarkjs) {
        setStatus('snarkjs failed to load from the CDN. Check the network and reload.');
        return;
    }
    setBusy(true);
    lastBundle = null;
    download.disabled = true;
    output.textContent = 'Working…';
    rootLine.textContent = 'Frame root: —';
    Object.values(stepEls).forEach((el) => { el.textContent = '—'; });

    try {
        setStatus(source === 'webcam' ? 'Waiting for camera permission…' : 'Loading clip…');
        let stream = null;
        if (source === 'webcam') stream = await useWebcam();
        else await useClip();

        setStatus('Capturing frames…');
        const t0 = performance.now();
        const hashes = await captureFrames(source);
        const t1 = performance.now();
        stepEls.capture.textContent = `${fmt(t1 - t0)} · ${hashes.length} frames`;

        setStatus('Hashing frames and building the Merkle root…');
        const frameRoot = await merkleRoot(hashes);
        const payloadHash = fieldFromHex(frameRoot);
        const t2 = performance.now();
        stepEls.hash.textContent = fmt(t2 - t1);
        rootLine.textContent = `Frame root: ${frameRoot.slice(0, 24)}… · payload ${payloadHash.toString().slice(0, 18)}…`;

        setStatus('Signing the frame commitment with the demo TEE key…');
        const witness = buildWitness(payloadHash);
        const t3 = performance.now();
        stepEls.sign.textContent = fmt(t3 - t2);

        setStatus('Generating Groth16 proof (WASM, CPU)…');
        await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 30)));
        const t4 = performance.now();
        const { proof, publicSignals } = await window.snarkjs.groth16.fullProve(
            witness.input,
            'circuit-artifacts/scrubber.wasm',
            'circuit-artifacts/scrubber.zkey',
        );
        const t5 = performance.now();
        stepEls.prove.textContent = fmt(t5 - t4);

        setStatus('Verifying…');
        const vk = await (await fetch('circuit-artifacts/verification_key.json')).json();
        const ok = await window.snarkjs.groth16.verify(vk, publicSignals, proof);
        const t6 = performance.now();
        stepEls.verify.textContent = `${fmt(t6 - t5)} · ${ok ? 'valid' : 'INVALID'}`;
        stepEls.total.textContent = fmt(t6 - t0);

        lastBundle = {
            version: 'real-proof-demo-v1',
            source,
            frameCount: hashes.length,
            frameHashes: hashes,
            frameRoot,
            payloadHash: payloadHash.toString(),
            demoPublicKey: witness.demoPublicKey,
            authorizedMerkleRoot: witness.demoRoot.toString(),
            proof,
            publicSignals,
            verified: ok,
            timings_ms: {
                capture: Math.round(t1 - t0),
                hash_and_merkle: Math.round(t2 - t1),
                sign_and_witness: Math.round(t3 - t2),
                prove: Math.round(t5 - t4),
                verify: Math.round(t6 - t5),
                total: Math.round(t6 - t0),
            },
            note: 'Demo TEE key in JS; dev trusted setup; NOT hardware-attested; mesh and OTS not included.',
        };
        output.textContent = JSON.stringify(
            { verified: ok, publicSignals, timings_ms: lastBundle.timings_ms },
            null,
            2,
        );
        download.disabled = false;
        setStatus(ok ? 'Proof verified in this tab. Download the bundle to inspect it.' : 'Proof did not verify.');
        if (stream) stream.getTracks().forEach((track) => track.stop());
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
