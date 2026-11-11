/**
 * spatiotemporal-mesh.js — Spatio-temporal hash-linked mesh for RealPeep provenance.
 *
 * Implements:
 *   - demoTurstHash: fast deterministic hash for demo (synchronous)
 *   - NistBeacon: simulates NIST randomness beacon (60s pulses, truncated to 128 bits)
 *   - BeaconChain: maintains self-chain for one device, computes prev_self
 *   - HeardSet: maintains map of (neighbor_pk → latest_beacon_hash), computes Merkle heard_root
 *   - MerkleTree: builds Merkle tree over heard entries, generates inclusion proofs, verifies proofs
 *   - buildBeacon: builds a SpatioTemporalBeacon
 *   - verifyBeaconChain: verifies chain integrity
 *   - verifyHeardRoot: verifies heard root against proof
 *   - buildObservationBundle: bundles chain + heard set
 *   - reconstructDAG: reconstructs DAG from bundles
 *
 * Node-testable — no DOM, pure JS. Uses ES modules.
 */

// ═══════════════════════════════════════════════════════════════════════
// 1. demoTurstHash — fast deterministic string hash for demo use
// ═══════════════════════════════════════════════════════════════════════

/**
 * Fast, deterministic hash producing 32 hex chars (128 bits).
 * Uses a simple FNV-1a + djb2 hybrid for speed, iterated to produce 128 bits.
 *
 * @param {string} data
 * @returns {string} 32-char hex string
 */
export function demoTurstHash(data) {
    let h1 = 0x811c9dc5;  // FNV offset
    let h2 = 0x15051505;  // second register
    let h3 = 0x9e3779b9;  // third register
    let h4 = 0x6b5ad5a5;  // fourth register

    for (let i = 0; i < data.length; i++) {
        const c = data.charCodeAt(i);
        h1 ^= c;
        h1 = Math.imul(h1, 0x01000193);
        h2 ^= c;
        h2 = ((h2 << 5) - h2) + c;
        h3 = ((h3 << 7) | (h3 >>> 25)) ^ c;
        h4 = Math.imul(h4 ^ c, 0x5bd1e995);
        h4 ^= h4 >>> 15;
    }

    // Combine into 128-bit output
    const parts = [h1, h2, h3, h4].map(h => (h >>> 0).toString(16).padStart(8, '0'));
    return parts.join('');
}

// ═══════════════════════════════════════════════════════════════════════
// 2. NistBeacon — simulated NIST randomness beacon
// ═══════════════════════════════════════════════════════════════════════

/**
 * Simulates a NIST randomness beacon with 60-second pulses.
 * Uses a seeded PRNG to produce deterministic randomness.
 *
 * @property {number} seed - the seed for deterministic pulse generation
 */
export class NistBeacon {
    /**
     * @param {number} seed - integer seed
     */
    constructor(seed) {
        this.seed = seed;
    }

    /**
     * Get the NIST beacon pulse for a given round.
     * Each pulse is 128 bits (32 hex chars).
     *
     * @param {number} round - pulse round number (0-indexed)
     * @returns {string} 32-char hex string
     */
    getPulse(round) {
        // Use a simple seeded PRNG: multiply seed by round + 1, then feed through hash
        const seedData = `nist:${this.seed}:${round}`;
        const h1 = demoTurstHash(seedData);
        const h2 = demoTurstHash(h1 + ':suffix');
        // Combine two 128-bit hashes into one 128-bit output (interleave)
        let result = '';
        for (let i = 0; i < 32; i++) {
            result += (i % 2 === 0) ? h1[i] : h2[i];
        }
        return result;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 3. BeaconChain — self-chain for one device
// ═══════════════════════════════════════════════════════════════════════

/**
 * Maintains a hash-linked chain for a single device.
 * Each entry = demoTurstHash(prev_entry_hash + nist_pulse + heard_root)
 *
 * @property {string} pk - public key of this device
 * @property {Array<{hash: string, nist: string, heard_root: string}>} entries
 */
export class BeaconChain {
    constructor(pk) {
        this.pk = pk;
        this.entries = [];
    }

    /**
     * Get the hash of the latest entry, or the genesis sentinel.
     * @returns {string} 32-char hex string
     */
    getPrevSelf() {
        if (this.entries.length === 0) {
            return '00000000000000000000000000000000';
        }
        return this.entries[this.entries.length - 1].hash;
    }

    /**
     * Append a new entry to the chain.
     * @param {string} nistPulse - NIST beacon pulse (32 hex chars)
     * @param {string} heardRoot - Merkle root of heard set (32 hex chars)
     * @returns {string} hash of the new entry
     */
    append(nistPulse, heardRoot) {
        const prev = this.getPrevSelf();
        const hash = demoTurstHash(prev + nistPulse + heardRoot);
        this.entries.push({
            hash,
            nist: nistPulse,
            heard_root: heardRoot,
        });
        return hash;
    }

    /**
     * Get a specific chain entry by index.
     * @param {number} index
     * @returns {{hash: string, nist: string, heard_root: string}|undefined}
     */
    getEntry(index) {
        return this.entries[index];
    }

    /**
     * Number of entries in the chain.
     * @returns {number}
     */
    get length() {
        return this.entries.length;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 4. HeardSet — observed neighbor beacons with Merkle root
// ═══════════════════════════════════════════════════════════════════════

/**
 * Maintains a map of (neighbor_pk → {hash: latest_beacon_hash, rssi: dBm}).
 * Can compute a Merkle root over all entries for inclusion in a beacon.
 *
 * @property {Map<string, {hash: string, rssi: number}>} entries
 */
export class HeardSet {
    constructor() {
        this._map = new Map();
    }

    /**
     * Number of heard entries.
     * @returns {number}
     */
    size() {
        return this._map.size;
    }

    /**
     * Add or update an entry for a neighbor.
     * @param {string} pk - neighbor's public key
     * @param {string} hash - latest beacon hash received from neighbor
     * @param {number} rssi - RSSI in dBm
     */
    addOrUpdate(pk, hash, rssi) {
        this._map.set(pk, { hash, rssi });
    }

    /**
     * Get a specific entry.
     * @param {string} pk
     * @returns {{hash: string, rssi: number}|undefined}
     */
    get(pk) {
        return this._map.get(pk);
    }

    /**
     * Whether a beacon should be accepted based on RSSI rule:
     * - Save all received if count < maxCount, OR if RSSI > threshold
     * - This implements "high RSSI all the time, all beacons some of the time"
     *
     * @param {number} rssi - observed RSSI in dBm
     * @param {number} currentCount - current number of heard entries
     * @param {number} threshold - RSSI threshold in dBm (default -70)
     * @param {number} maxCount - count threshold (default 50)
     * @returns {boolean}
     */
    acceptBeacon(rssi, currentCount, threshold = -70, maxCount = 50) {
        if (currentCount < maxCount) return true;
        return rssi > threshold;
    }

    /**
     * Compute the Merkle root over all entries, sorted by pk.
     * @returns {string} 32-char hex string, or '0'*32 if empty
     */
    computeRoot() {
        const entries = this.getEntries();
        if (entries.length === 0) {
            return '00000000000000000000000000000000';
        }
        const tree = new MerkleTree(entries);
        return tree.root;
    }

    /**
     * Get all entries sorted by pk.
     * @returns {Array<{pk: string, hash: string, rssi: number}>}
     */
    getEntries() {
        const result = [];
        for (const [pk, entry] of this._map) {
            result.push({ pk, hash: entry.hash, rssi: entry.rssi });
        }
        result.sort((a, b) => a.pk.localeCompare(b.pk));
        return result;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 5. MerkleTree — builds Merkle tree over heard entries
// ═══════════════════════════════════════════════════════════════════════

/**
 * Builds a Merkle tree over (pk, hash) pairs.
 * Leaf hash = demoTurstHash(pk + hash)
 * Internal node = demoTurstHash(left_hash + right_hash)
 *
 * Supports generating inclusion proofs and verifying them.
 */
export class MerkleTree {
    /**
     * @param {Array<{pk: string, hash: string, rssi?: number}>} entries - sorted entries
     */
    constructor(entries) {
        this.entries = entries;
        this._leafMap = new Map();
        this._levels = [];
        this.root = this._build(entries);
    }

    /**
     * Build the Merkle tree and return the root.
     * @param {Array<{pk: string, hash: string}>} entries
     * @returns {string} 32-char hex root hash
     */
    _build(entries) {
        if (entries.length === 0) {
            return '00000000000000000000000000000000';
        }

        // Build leaf hashes
        let level = [];
        for (const entry of entries) {
            const leafHash = demoTurstHash(entry.pk + entry.hash);
            level.push({
                hash: leafHash,
                pk: entry.pk,
                originalHash: entry.hash,
            });
            this._leafMap.set(entry.pk, { ...level[level.length - 1], index: level.length - 1 });
        }
        this._levels.push(level);

        // Build tree up to root
        while (level.length > 1) {
            const next = [];
            for (let i = 0; i < level.length; i += 2) {
                const left = level[i];
                const right = (i + 1 < level.length) ? level[i + 1] : level[i]; // duplicate last if odd
                const nodeHash = demoTurstHash(left.hash + right.hash);
                next.push({
                    hash: nodeHash,
                    left: left,
                    right: right,
                });
            }
            this._levels.push(next);
            level = next;
        }

        return level[0].hash;
    }

    /**
     * Generate a Merkle inclusion proof for a specific pk.
     * @param {string} pk
     * @returns {{pk: string, leafHash: string, siblings: string[], _positions: string[]}|null}
     */
    getProof(pk) {
        const leafInfo = this._leafMap.get(pk);
        if (!leafInfo) return null;

        const siblings = [];
        const positions = []; // 'left' or 'right' — position of sibling relative to current
        let idx = leafInfo.index;
        let levelIdx = 0;

        while (levelIdx < this._levels.length - 1) {
            const level = this._levels[levelIdx];
            const isLeftChild = (idx % 2 === 0);
            const siblingIdx = isLeftChild ? idx + 1 : idx - 1;

            if (siblingIdx >= 0 && siblingIdx < level.length) {
                siblings.push(level[siblingIdx].hash);
                positions.push(isLeftChild ? 'right' : 'left');
            } else {
                // If sibling is past end, duplicate current node (odd-leaf case)
                siblings.push(level[idx].hash);
                positions.push(isLeftChild ? 'right' : 'left');
            }

            idx = Math.floor(idx / 2);
            levelIdx++;
        }

        return {
            pk,
            leafHash: leafInfo.hash,
            siblings,
            _positions: positions,
        };
    }

    /**
     * Verify a Merkle inclusion proof against a root.
     * @param {{pk: string, leafHash: string, siblings: string[], _positions?: string[]}} proof
     * @param {string} root - expected Merkle root
     * @returns {boolean}
     */
    static verifyProof(proof, root) {
        if (!proof || !root) return false;

        let current = proof.leafHash;
        const siblings = proof.siblings;
        const positions = proof._positions || [];

        for (let i = 0; i < siblings.length; i++) {
            const sibling = siblings[i];
            const pos = positions[i] || 'right'; // default: sibling is on right, current is left
            if (pos === 'right') {
                current = demoTurstHash(current + sibling);
            } else {
                current = demoTurstHash(sibling + current);
            }
        }

        return current === root;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 6. buildBeacon — construct a SpatioTemporalBeacon
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build a spatio-temporal beacon.
 *
 * SpatioTemporalBeacon data structure:
 *   { pk, nist, prev_self, heard_root, sig, seq_num, rssi }
 *
 * @param {BeaconChain} chain - device's beacon chain
 * @param {HeardSet} heardSet - device's heard set
 * @param {string} nistPulse - NIST beacon pulse (32 hex chars)
 * @param {{sign: (data: string) => string}} keyPair - signing function
 * @param {number} [rssi] - RSSI of this beacon (for simulation, typically undefined)
 * @returns {object} SpatioTemporalBeacon
 */
export function buildBeacon(chain, heardSet, nistPulse, keyPair, rssi) {
    const prevSelf = chain.getPrevSelf();
    const heardRoot = heardSet.computeRoot();
    const seqNum = chain.length;

    // Append to chain first
    chain.append(nistPulse, heardRoot);

    // Build signature over {pk, nist, prev_self, heard_root, seq_num}
    const sigPayload = JSON.stringify({
        pk: chain.pk,
        nist: nistPulse,
        prev_self: prevSelf,
        heard_root: heardRoot,
        seq_num: seqNum,
    });
    const sig = keyPair.sign(sigPayload);

    return {
        pk: chain.pk,
        nist: nistPulse,
        prev_self: prevSelf,
        heard_root: heardRoot,
        sig,
        seq_num: seqNum,
        rssi: rssi !== undefined ? rssi : 0,
    };
}

// ═══════════════════════════════════════════════════════════════════════
// 7. verifyBeaconChain — verify chain integrity
// ═══════════════════════════════════════════════════════════════════════

/**
 * Verify a sequence of beacons forms a valid hash-linked chain.
 * Checks:
 *   - Sequence numbers are consecutive
 *   - Each prev_self matches the hash of the previous entry
 *   - Each beacon's nist + heard_root + prev_self hash matches what chain would compute
 *
 * This is a self-contained verification that doesn't need the original chain object.
 *
 * @param {object[]} beacons - array of SpatioTemporalBeacon objects, in order
 * @returns {{valid: boolean, errors: string[]}}
 */
export function verifyBeaconChain(beacons) {
    const errors = [];

    if (beacons.length === 0) {
        return { valid: true, errors: [] };
    }

    // Check sequence numbers
    for (let i = 0; i < beacons.length; i++) {
        if (beacons[i].seq_num !== i) {
            errors.push(`Beacon ${i}: expected seq_num ${i}, got ${beacons[i].seq_num}`);
        }
    }

    // Check hash chain
    for (let i = 0; i < beacons.length; i++) {
        const b = beacons[i];
        const prevHash = i === 0
            ? '00000000000000000000000000000000'
            : demoTurstHash(beacons[i - 1].prev_self + beacons[i - 1].nist + beacons[i - 1].heard_root);

        // Check prev_self
        if (b.prev_self !== prevHash) {
            errors.push(`Beacon ${i}: prev_self mismatch. Expected ${prevHash.slice(0, 8)}..., got ${b.prev_self.slice(0, 8)}...`);
        }

        // Verify the hash of this entry would match what prev beacon's hash should be
        // (this is a forward check — the next beacon's prev_self should equal H(this beacon))
        // We already checked prev_self against previous, so chain is linked.
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

// ═══════════════════════════════════════════════════════════════════════
// 8. verifyHeardRoot — verify heard root against Merkle proof
// ═══════════════════════════════════════════════════════════════════════

/**
 * Verify that a beacon's heard_root matches a given Merkle proof.
 *
 * @param {object} beacon - { heard_root: string }
 * @param {{pk: string, leafHash: string, siblings: string[]}} proof
 * @param {string[]} [allBeaconPks] - optional, for future multi-proof verification
 * @returns {{valid: boolean, errors: string[]}}
 */
export function verifyHeardRoot(beacon, proof) {
    if (!proof) {
        return { valid: false, errors: ['No proof provided'] };
    }
    const valid = MerkleTree.verifyProof(proof, beacon.heard_root);
    return {
        valid,
        errors: valid ? [] : ['Merkle proof does not match heard_root'],
    };
}

// ═══════════════════════════════════════════════════════════════════════
// 9. buildObservationBundle — package chain + heard set
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build an ObservationBundle containing the full chain, heard set, and beacons.
 *
 * @param {BeaconChain} chain
 * @param {HeardSet} heardSet
 * @param {{sign: (data: string) => string}} keyPair
 * @returns {{pk: string, chain: object[], heardRoot: string, beacons: object[], heardEntries: object[]}}
 */
export function buildObservationBundle(chain, heardSet, keyPair) {
    const heardEntries = heardSet.getEntries();
    const heardRoot = heardSet.computeRoot();
    const beacons = chain.entries.map((entry, i) => ({
        pk: chain.pk,
        nist: entry.nist,
        prev_self: i === 0 ? '00000000000000000000000000000000' : chain.entries[i - 1].hash,
        heard_root: entry.heard_root,
        sig: keyPair.sign(JSON.stringify({
            pk: chain.pk,
            nist: entry.nist,
            prev_self: i === 0 ? '00000000000000000000000000000000' : chain.entries[i - 1].hash,
            heard_root: entry.heard_root,
            seq_num: i,
        })),
        seq_num: i,
        rssi: 0,
    }));

    return {
        pk: chain.pk,
        chain: chain.entries,
        heardRoot,
        beacons,
        heardEntries,
    };
}

// ═══════════════════════════════════════════════════════════════════════
// 10. reconstructDAG — reconstruct DAG from bundles
// ═══════════════════════════════════════════════════════════════════════

/**
 * Reconstruct a verifiable DAG from observation bundles.
 *
 * Each bundle contains a device's beacon chain and heard set.
 * Nodes = beacons from all chains. Edges = cross-chain observations
 * (when device A's beacon at time t includes device B's hash in its heard_root).
 *
 * @param {object[]} bundles - array of ObservationBundle objects
 * @returns {{nodes: {id: string, beacon: object, bundlePk: string}[], edges: {from: string, to: string, heardPk: string}[]}}
 */
export function reconstructDAG(bundles) {
    const nodes = [];
    const edges = [];

    // First pass: create all nodes
    for (const bundle of bundles) {
        for (const beacon of bundle.beacons) {
            const nodeId = `${beacon.pk}:${beacon.seq_num}`;
            nodes.push({
                id: nodeId,
                beacon,
                bundlePk: bundle.pk,
            });
        }
    }

    // Build a lookup for beacon hashes → node IDs (for cross-referencing)
    // A heard B at time t means: A's beacon at seq_num t+1 has B's beacon at seq_num t in heard_root.
    // For simplicity, we build edges based on the heard entries in each bundle.

    for (const bundle of bundles) {
        // For each beacon in this bundle, check if the heard entries match
        // For each heard entry, find the corresponding beacon from that device at the same time
        for (let i = 0; i < bundle.beacons.length; i++) {
            const srcNodeId = `${bundle.pk}:${i}`;

            // Check heard entries at this sequence number. Since heard set accumulates,
            // we look for entries where the hash matches a beacon from another device.
            // The heard root at time i includes all heard beacons up to time i.
            // We can check by looking at which device hashes appear in this bundle's heard entries.
            if (bundle.heardEntries) {
                for (const entry of bundle.heardEntries) {
                    // Find the matching beacon from the heard device
                    // The entry.hash should match some beacon's hash
                    for (const otherBundle of bundles) {
                        if (otherBundle.pk !== entry.pk) continue; // Only check the bundle of the heard device
                        for (const otherBeacon of otherBundle.beacons) {
                            // The heard hash is typically the prev_self or some beacon hash
                            // Check if the heard hash matches the hash in the chain
                            const otherEntryHash = demoTurstHash(otherBeacon.prev_self + otherBeacon.nist + otherBeacon.heard_root);
                            if (entry.hash === otherBeacon.prev_self || entry.hash === otherEntryHash) {
                                const dstNodeId = `${otherBeacon.pk}:${otherBeacon.seq_num}`;
                                // Only add edge if not already added
                                const edgeExists = edges.some(e => e.from === srcNodeId && e.to === dstNodeId);
                                if (!edgeExists) {
                                    edges.push({
                                        from: srcNodeId,
                                        to: dstNodeId,
                                        heardPk: entry.pk,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    return { nodes, edges };
}
