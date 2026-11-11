/**
 * blockchain-anchor.js — OpenTimestamps anchoring for RealPeep.
 *
 * Pure functions for creating, verifying, and serializing timestamp proofs.
 * Simulates the OTS calendar interaction for the browser demo; the real
 * Python implementation (realpeep/blockchain_anchor.py) talks to actual
 * Bitcoin calendar servers.
 *
 * Node-testable — no DOM, no side effects.
 */

/**
 * Simple hash function (same as used in mesh-protocol.js and demo).
 * @param {string} str
 * @returns {string} 8-char hex string
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
 * Create a pending OTS timestamp for a Merkle root.
 *
 * In the real system this calls the OpenTimestamps calendar server.
 * Here we simulate it with a deterministic structure.
 *
 * @param {string} merkleRootHex - 64-character hex string (32 bytes)
 * @returns {{ otsProof: string, timestamp: number, version: number }}
 * @throws {Error} If merkleRootHex is not 64 hex chars
 */
export function createTimestamp(merkleRootHex) {
    if (!/^[0-9a-fA-F]{64}$/.test(merkleRootHex)) {
        throw new Error(
            `Merkle root must be 64 hex chars, got ${merkleRootHex.length}`
        );
    }

    const ts = Date.now();
    const otsProof = demoHash('ots:v1:' + merkleRootHex + ':' + ts);

    return {
        otsProof,
        timestamp: ts,
        version: 1,
    };
}

/**
 * Verify an OTS proof structurally.
 *
 * @param {object} proof - Output from createTimestamp()
 * @returns {{ valid: boolean, hash: string, pending: boolean, error: string|null }}
 */
export function verifyTimestamp(proof) {
    if (!proof || typeof proof !== 'object') {
        return { valid: false, hash: '', pending: true, error: 'Invalid proof structure' };
    }
    if (!proof.otsProof || proof.version !== 1) {
        return { valid: false, hash: '', pending: true, error: 'Unknown proof version or missing proof' };
    }
    // In the real system, we'd check for a Bitcoin block attestation.
    // Here we always report as pending (no real blockchain).
    return {
        valid: true,
        hash: proof.otsProof,
        pending: true,
        error: null,
    };
}

/**
 * Simulate stamping a Merkle root and waiting for a calendar upgrade.
 *
 * In the real Python implementation this submits to a RemoteCalendar and
 * polls until a Bitcoin attestation appears or timeout expires.
 *
 * @param {string} merkleRootHex - 64-character hex string
 * @param {number} [timeout=30] - Max seconds to wait (ignored in simulation)
 * @returns {object} Timestamp proof object
 */
export function stampAndWait(merkleRootHex, timeout = 30) {
    // In simulation, we just create a pending timestamp immediately
    return createTimestamp(merkleRootHex);
}

/**
 * Serialize an OTS proof to a hex string for storage.
 *
 * @param {object} proof - Output from createTimestamp()
 * @returns {string} Hex string
 */
export function proofToHex(proof) {
    const json = JSON.stringify(proof);
    let hex = '';
    for (let i = 0; i < json.length; i++) {
        hex += json.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return hex;
}

/**
 * Deserialize a hex string back to an OTS proof object.
 *
 * @param {string} hexStr
 * @returns {object} Proof object
 */
export function proofFromHex(hexStr) {
    let json = '';
    for (let i = 0; i < hexStr.length; i += 2) {
        json += String.fromCharCode(parseInt(hexStr.substring(i, i + 2), 16));
    }
    return JSON.parse(json);
}

/**
 * Compute a Merkle root from an array of frame hashes.
 *
 * Uses a simple pairwise hash tree. For odd-length arrays, the last
 * element is duplicated.
 *
 * @param {string[]} frameHashes - Array of hex hash strings
 * @returns {string} Merkle root as 64-char hex string
 */
export function computeMerkleRoot(frameHashes) {
    if (frameHashes.length === 0) return '0'.repeat(64);
    if (frameHashes.length === 1) return frameHashes[0].padEnd(64, '0');

    let level = frameHashes.slice();
    while (level.length > 1) {
        const next = [];
        for (let i = 0; i < level.length; i += 2) {
            const left = level[i];
            const right = i + 1 < level.length ? level[i + 1] : level[i];
            next.push(demoHash(left + ':' + right).padEnd(64, '0'));
        }
        level = next;
    }
    return level[0];
}

/**
 * Create a frame hash chain — each frame's hash depends on the previous.
 *
 * This prevents removal, insertion, reordering, and truncation attacks.
 *
 * @param {string[]} frameData - Array of frame payloads
 * @returns {{ chain: {index: number, hash: string}[], merkleRoot: string }}
 */
export function buildFrameHashChain(frameData) {
    const chain = [];
    for (let i = 0; i < frameData.length; i++) {
        const prevHash = i > 0 ? chain[i - 1].hash : 'genesis';
        const hash = demoHash(prevHash + ':' + i + ':' + frameData[i]).padEnd(64, '0');
        chain.push({ index: i, hash });
    }

    const merkleRoot = computeMerkleRoot(chain.map(f => f.hash));
    return { chain, merkleRoot };
}

/**
 * Verify a frame hash chain is intact.
 *
 * @param {{ index: number, hash: string }[]} chain
 * @param {string[]} frameData - Original frame data to verify
 * @returns {{ valid: boolean, error: string|null }}
 */
export function verifyFrameHashChain(chain, frameData) {
    if (chain.length !== frameData.length) {
        return { valid: false, error: 'Chain/frame length mismatch' };
    }

    for (let i = 0; i < chain.length; i++) {
        const prevHash = i > 0 ? chain[i - 1].hash : 'genesis';
        const expected = demoHash(prevHash + ':' + i + ':' + frameData[i]).padEnd(64, '0');
        if (chain[i].hash !== expected) {
            return { valid: false, error: `Frame ${i} hash mismatch` };
        }
    }

    return { valid: true, error: null };
}
