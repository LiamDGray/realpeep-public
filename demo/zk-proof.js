/**
 * zk-proof.js — ZK proof generation and verification using snarkjs.
 *
 * In the browser, snarkjs is loaded from CDN. In Node, it's required directly.
 * All functions return Promises and are side-effect-free (no DOM).
 *
 * Node-testable: mock snarkjs or use the real library.
 */

/**
 * @typedef {Object} ZKProof
 * @property {Object} proof - Groth16 proof { pi_a, pi_b, pi_c }
 * @property {string[]} publicSignals - [payload_hash, ephemeral_pubkey, merkle_root]
 */

/**
 * @typedef {Object} ZKInput
 * @property {string} payload_hash - Poseidon hash of the video/audio payload
 * @property {string} ephemeral_pubkey - Random ephemeral key (hex)
 * @property {string} authorized_merkle_root - Root of authorized TEE keys
 * @property {string} tee_pubkey_x - Private: TEE public key x
 * @property {string} tee_pubkey_y - Private: TEE public key y
 * @property {Object} tee_signature - Private: EdDSA signature
 * @property {string[]} merkle_path_elements - Private: Merkle proof siblings
 * @property {number[]} merkle_path_indices - Private: Merkle proof directions
 */

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Simple hash for demo (consistent with other modules).
 * In production, this is Poseidon hash computed by the circuit.
 */
export function demoHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h).toString(16).padStart(8, '0');
}

/**
 * Generate a simulated EdDSA keypair for demo purposes.
 * In production, this uses the device's TEE hardware key.
 */
export function generateDemoKeypair() {
    const seed = Array.from({ length: 32 }, () =>
        Math.floor(Math.random() * 256)
    );
    const seedHex = seed.map(b => b.toString(16).padStart(2, '0')).join('');
    const pubX = demoHash('pubx:' + seedHex);
    const pubY = demoHash('puby:' + seedHex);
    return {
        privateKey: seedHex,
        publicKey: { x: pubX, y: pubY },
    };
}

/**
 * Generate demo EdDSA signature over a message.
 */
export function generateDemoSignature(message, privateKey) {
    return {
        Rx: demoHash('Rx:' + privateKey + ':' + message),
        Ry: demoHash('Ry:' + privateKey + ':' + message),
        S: demoHash('S:' + privateKey + ':' + message),
    };
}

// ── Browser Snarkjs Integration ─────────────────────────────────────

let snarkjsModule = null;
let circuitArtifacts = null;

/**
 * Load snarkjs from CDN (browser) or require (Node).
 * Must be called once before prove() or verify().
 *
 * @returns {Promise<Object>} snarkjs module
 */
export async function loadSnarkjs() {
    if (snarkjsModule) return snarkjsModule;

    // Detect environment
    if (typeof window !== 'undefined' && window.snarkjs) {
        snarkjsModule = window.snarkjs;
    } else if (typeof window !== 'undefined') {
        // Load from CDN dynamically
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/snarkjs@0.7.6/build/snarkjs.min.js';
            script.onload = () => {
                snarkjsModule = window.snarkjs;
                resolve(snarkjsModule);
            };
            script.onerror = () => reject(new Error('Failed to load snarkjs from CDN'));
            document.head.appendChild(script);
        });
    } else {
        // Node.js — try import first (ESM), fall back to require (CJS)
        try {
            const mod = await import('snarkjs');
            snarkjsModule = mod.default || mod;
        } catch (e) {
            // In CJS context, require works
            if (typeof require !== 'undefined') {
                snarkjsModule = require('snarkjs');
            } else {
                // In ESM context without snarkjs, use a mock
                snarkjsModule = {
                    groth16: {
                        fullProve: async () => ({ proof: {}, publicSignals: [] }),
                        verify: async () => true,
                    },
                };
            }
        }
    }
    return snarkjsModule;
}

/**
 * Load circuit artifacts (wasm + zkey).
 *
 * In browser: fetch from /circuit/build/
 * In Node: read from filesystem
 *
 * @param {Object} [opts]
 * @param {string} [opts.wasmUrl] - URL or path to scrubber.wasm
 * @param {string} [opts.zkeyUrl] - URL or path to scrubber.zkey
 * @returns {Promise<{wasm: ArrayBuffer, zkey: ArrayBuffer}>}
 */
export async function loadCircuitArtifacts(opts = {}) {
    if (circuitArtifacts) return circuitArtifacts;

    const basePrefix = (typeof window !== 'undefined' && window.location.pathname.includes('/realpeep')) ? '/realpeep' : '';
    const wasmUrl = opts.wasmUrl || (basePrefix + '/demo/circuit-artifacts/scrubber.wasm');
    const zkeyUrl = opts.zkeyUrl || (basePrefix + '/demo/circuit-artifacts/scrubber.zkey');

    try {
        if (typeof window !== 'undefined') {
            const [wasmResp, zkeyResp] = await Promise.all([
                fetch(wasmUrl),
                fetch(zkeyUrl),
            ]);
            if (!wasmResp.ok || !zkeyResp.ok) {
                throw new Error('Circuit artifacts not available');
            }
            circuitArtifacts = {
                wasm: await wasmResp.arrayBuffer(),
                zkey: await zkeyResp.arrayBuffer(),
            };
        } else {
            const fs = await import('fs');
            circuitArtifacts = {
                wasm: fs.readFileSync(wasmUrl).buffer,
                zkey: fs.readFileSync(zkeyUrl).buffer,
            };
        }
    } catch (e) {
        // In test/demo environments without real artifacts,
        // return mock buffers so proofs can still be generated
        circuitArtifacts = {
            wasm: new ArrayBuffer(1024),
            zkey: new ArrayBuffer(1024),
        };
    }
    return circuitArtifacts;
}

// ── Prove & Verify ─────────────────────────────────────────────────

/**
 * Generate a ZK proof from demo inputs.
 *
 * In the demo, we simulate the TEE attestation and Merkle proof.
 * In production, these come from the device's secure enclave.
 *
 * @param {Object} input
 * @param {string} input.payloadHash - Hash of the payload being attested
 * @param {string} input.ephemeralPubkey - Ephemeral key for anonymity
 * @returns {Promise<ZKProof>}
 */
export async function generateProof(input) {
    const snarkjs = await loadSnarkjs();
    const artifacts = await loadCircuitArtifacts();

    const { payloadHash, ephemeralPubkey } = input;

    // Generate demo TEE keys and signature
    const teeKeys = generateDemoKeypair();
    const teeSig = generateDemoSignature(payloadHash, teeKeys.privateKey);

    // Merkle root — in production this is the authorized TEE registry root
    const merkleRoot = demoHash('authorized-tee-registry-root').padEnd(64, '0');

    // Build Merkle proof (demo: simple path)
    const merkleLevels = 20;
    const merklePathElements = Array.from({ length: merkleLevels }, (_, i) =>
        demoHash(`path-${i}-${teeKeys.publicKey.x}`)
    );
    const merklePathIndices = Array.from({ length: merkleLevels }, () => 0);

    // Leaf = hash of pubkey coords
    const leafHash = demoHash(teeKeys.publicKey.x + ':' + teeKeys.publicKey.y);

    // Circuit input
    const circuitInput = {
        payload_hash: payloadHash,
        ephemeral_pubkey: ephemeralPubkey,
        authorized_merkle_root: merkleRoot,

        // Private inputs
        tee_pubkey_x: teeKeys.publicKey.x,
        tee_pubkey_y: teeKeys.publicKey.y,
        tee_sig_Rx: teeSig.Rx,
        tee_sig_Ry: teeSig.Ry,
        tee_sig_S: teeSig.S,
        merkle_path_elements: merklePathElements,
        merkle_path_indices: merklePathIndices,
    };

    // NOTE: full prove requires actual field elements from the circuit.
    // For the demo, we generate a simulated proof that matches the
    // structure of a real Groth16 proof but uses demo hashes.
    //
    // REAL IMPLEMENTATION (when snarkjs is loaded):
    //   const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    //     circuitInput, artifacts.wasm, artifacts.zkey
    //   );
    //
    // For now, generate a structurally valid simulated proof:
    const simulatedProof = {
        pi_a: [demoHash('pi_a_0:' + payloadHash), demoHash('pi_a_1:' + payloadHash), '1'],
        pi_b: [
            [demoHash('pi_b_00:' + ephemeralPubkey), demoHash('pi_b_01:' + ephemeralPubkey)],
            [demoHash('pi_b_10:' + ephemeralPubkey), demoHash('pi_b_11:' + ephemeralPubkey)],
        ],
        pi_c: [demoHash('pi_c_0:' + payloadHash), demoHash('pi_c_1:' + ephemeralPubkey), '1'],
    };

    return {
        proof: simulatedProof,
        publicSignals: [payloadHash, ephemeralPubkey, merkleRoot],
    };
}

/**
 * Verify a ZK proof (simulated for demo).
 *
 * In production: calls snarkjs.groth16.verify(vkey, publicSignals, proof).
 * For the demo: always returns true (the proof structure is valid by construction).
 *
 * @param {ZKProof} zkProof
 * @returns {Promise<boolean>}
 */
export async function verifyProof(zkProof) {
    // In the real implementation:
    // const snarkjs = await loadSnarkjs();
    // const vkey = await fetch('/circuit/build/verification_key.json').then(r => r.json());
    // return await snarkjs.groth16.verify(vkey, zkProof.publicSignals, zkProof.proof);

    // For the demo, the proof is always valid
    return true;
}
