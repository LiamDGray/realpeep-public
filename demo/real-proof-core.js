/**
 * real-proof-core.js — shared client-side video → proof pipeline.
 *
 * Used by the standalone real-proof page and the main demo. The heavy Groth16
 * proving runs in real-proof-worker.js so the page can paint progress.
 *
 * The demo TEE key and the committed dev zkey are not production trust roots.
 */

export const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const DEMO_TEE_KEY = 'realpeep-demo-tee-key-not-secret';
export const FRAME_COUNT = 20;
export const FRAME_INTERVAL_MS = 120;
export const FRAME_W = 320;
export const FRAME_H = 180;
export const CLIP_URL = 'assets/public-domain/nasa-earth-iss-5s.mp4';

export function bytesToHex(bytes) {
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex) {
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return out;
}

export async function sha256Hex(data) {
    const digest = await crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(digest));
}

async function hashPair(a, b) {
    const buf = new Uint8Array(a.length + b.length);
    buf.set(a, 0);
    buf.set(b, a.length);
    return new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
}

export async function merkleRoot(hexLeaves) {
    if (!hexLeaves.length) throw new Error('no frames captured');
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

export function fieldFromHex(hex) {
    const value = BigInt('0x' + hex) % FIELD;
    return value === 0n ? 1n : value;
}

export async function prepareClip(video, src = CLIP_URL) {
    if (video.srcObject) {
        video.srcObject.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
    }
    const absolute = new URL(src, document.baseURI).href;
    if (video.src !== absolute) {
        video.src = absolute;
        video.load();
    }
    video.loop = true;
    video.muted = true;
    await video.play();
}

export async function useWebcam(video) {
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

export async function captureFrames(video, canvas, { count = FRAME_COUNT, interval = FRAME_INTERVAL_MS, source = 'clip', onProgress } = {}) {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const hashes = [];
    await new Promise((resolve) => setTimeout(resolve, 120));
    for (let i = 0; i < count; i++) {
        if (i > 0) await new Promise((resolve) => setTimeout(resolve, interval));
        context.drawImage(video, 0, 0, FRAME_W, FRAME_H);
        const image = context.getImageData(0, 0, FRAME_W, FRAME_H);
        hashes.push(await sha256Hex(image.data));
        onProgress?.({ stage: 'capture', index: i + 1, total: count });
    }
    if (source === 'webcam' && video.srcObject) {
        video.srcObject.getTracks().forEach((track) => track.stop());
    }
    if (source === 'clip') video.pause();
    return hashes;
}

export function buildWitness(payloadHash) {
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

// One long-lived worker per page. Creating a new worker per proof reloads
// snarkjs and re-parses the artifacts, which made the first worker benchmark
// look much slower than the warm main-thread baseline.
let proverWorker = null;
let proverSeq = 0;
const proverPending = new Map();

function getProverWorker(workerUrl) {
    if (proverWorker) return proverWorker;
    proverWorker = new Worker(
        workerUrl || new URL('./real-proof-worker.js', import.meta.url),
    );
    proverWorker.onmessage = (event) => {
        const message = event.data || {};
        const request = proverPending.get(message.id);
        if (!request) return;
        if (message.type === 'log') {
            request.onLog?.(message.message);
            return;
        }
        if (message.type === 'progress') {
            request.onProgress?.(message);
            return;
        }
        if (message.type === 'proof') {
            request.proof = message.proof;
            request.publicSignals = message.publicSignals;
            request.proofAt = performance.now();
            return;
        }
        if (message.type === 'done') {
            proverPending.delete(message.id);
            const verifiedAt = performance.now();
            request.resolve({
                proof: request.proof,
                publicSignals: request.publicSignals,
                ok: message.ok,
                timings: {
                    prove: request.proofAt ? Math.round(request.proofAt - request.started) : 0,
                    verify: request.proofAt ? Math.round(verifiedAt - request.proofAt) : 0,
                },
            });
            return;
        }
        if (message.type === 'error') {
            proverPending.delete(message.id);
            request.reject(new Error(message.error || 'prover worker failed'));
        }
    };
    proverWorker.onerror = (event) => {
        const error = new Error(event.message || 'prover worker error');
        for (const request of proverPending.values()) request.reject(error);
        proverPending.clear();
        proverWorker?.terminate();
        proverWorker = null;
    };
    return proverWorker;
}

export function proveInWorker({ input, vk, workerUrl, onProgress, onLog }) {
    const worker = getProverWorker(workerUrl);
    const id = ++proverSeq;
    return new Promise((resolve, reject) => {
        proverPending.set(id, {
            started: performance.now(),
            proof: null,
            publicSignals: null,
            proofAt: null,
            resolve,
            reject,
            onProgress,
            onLog,
        });
        const wasm = new URL('circuit-artifacts/scrubber.wasm', document.baseURI).href;
        const zkey = new URL('circuit-artifacts/scrubber.zkey', document.baseURI).href;
        worker.postMessage({ id, input, vk, wasm, zkey });
    });
}

export function disposeProverWorker() {
    proverWorker?.terminate();
    proverWorker = null;
    for (const request of proverPending.values()) {
        request.reject(new Error('prover disposed'));
    }
    proverPending.clear();
}

export async function runRealProof({ video, canvas, source = 'clip', onProgress, onLog, workerUrl } = {}) {
    if (!video || !canvas) throw new Error('video and canvas are required');
    if (!window.ZkKit) throw new Error('ZK helper bundle failed to load');

    const t0 = performance.now();
    onProgress?.({ stage: 'capture-start' });
    const hashes = await captureFrames(video, canvas, { source, onProgress });
    const t1 = performance.now();

    onProgress?.({ stage: 'hash' });
    const frameRoot = await merkleRoot(hashes);
    const payloadHash = fieldFromHex(frameRoot);
    const t2 = performance.now();

    onProgress?.({ stage: 'sign' });
    const witness = buildWitness(payloadHash);
    const t3 = performance.now();

    onProgress?.({ stage: 'prove' });
    const vk = await (await fetch(new URL('circuit-artifacts/verification_key.json', document.baseURI))).json();
    const result = await proveInWorker({ input: witness.input, vk, workerUrl, onProgress, onLog });
    const t4 = performance.now();

    return {
        version: 'real-proof-worker-v1',
        source,
        frameCount: hashes.length,
        frameHashes: hashes,
        frameRoot,
        payloadHash: payloadHash.toString(),
        demoPublicKey: witness.demoPublicKey,
        authorizedMerkleRoot: witness.demoRoot.toString(),
        proof: result.proof,
        publicSignals: result.publicSignals,
        verified: result.ok,
        timings_ms: {
            capture: Math.round(t1 - t0),
            hash_and_merkle: Math.round(t2 - t1),
            sign_and_witness: Math.round(t3 - t2),
            prove: result.timings?.prove || 0,
            verify: result.timings?.verify || 0,
            total: Math.round(t4 - t0),
        },
        note: 'Demo TEE key in JS; dev trusted setup; NOT hardware-attested; mesh and OTS not included.',
    };
}
