/**
 * spatiotemporal-mesh.test.js — Strict TDD tests for spatio-temporal hash-linked mesh.
 *
 * Run: node --experimental-vm-modules node_modules/.bin/vitest run demo/spatiotemporal-mesh.test.js
 * Or: npx vitest run demo/spatiotemporal-mesh.test.js
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    demoTurstHash,
    NistBeacon,
    BeaconChain,
    HeardSet,
    MerkleTree,
    buildBeacon,
    verifyBeaconChain,
    verifyHeardRoot,
    buildObservationBundle,
    reconstructDAG,
} from './spatiotemporal-mesh.js';

// ── demoTurstHash ───────────────────────────────────────────────────

describe('demoTurstHash', () => {
    it('returns a 32-character hex string', () => {
        const h = demoTurstHash('hello');
        expect(h).toMatch(/^[0-9a-f]{32}$/);
    });

    it('is deterministic', () => {
        const a = demoTurstHash('hello');
        const b = demoTurstHash('hello');
        expect(a).toBe(b);
    });

    it('produces different hashes for different inputs', () => {
        const a = demoTurstHash('hello');
        const b = demoTurstHash('world');
        expect(a).not.toBe(b);
    });

    it('handles empty string', () => {
        const h = demoTurstHash('');
        expect(h).toMatch(/^[0-9a-f]{32}$/);
    });
});

// ── NistBeacon ───────────────────────────────────────────────────────

describe('NistBeacon', () => {
    it('creates a beacon with a seed', () => {
        const beacon = new NistBeacon(42);
        expect(beacon).toBeDefined();
    });

    it('produces deterministic pulse values for a given round', () => {
        const b1 = new NistBeacon(42);
        const b2 = new NistBeacon(42);
        const pulse1 = b1.getPulse(0);
        const pulse2 = b2.getPulse(0);
        expect(pulse1).toBe(pulse2);
    });

    it('produces different pulses for different rounds', () => {
        const beacon = new NistBeacon(42);
        const p0 = beacon.getPulse(0);
        const p1 = beacon.getPulse(1);
        expect(p0).not.toBe(p1);
    });

    it('pulse is 128-bit (32 hex chars)', () => {
        const beacon = new NistBeacon(99);
        const pulse = beacon.getPulse(5);
        expect(pulse).toMatch(/^[0-9a-f]{32}$/);
    });

    it('different seeds produce different pulse sequences', () => {
        const b1 = new NistBeacon(42);
        const b2 = new NistBeacon(99);
        expect(b1.getPulse(0)).not.toBe(b2.getPulse(0));
    });
});

// ── BeaconChain ──────────────────────────────────────────────────────

describe('BeaconChain', () => {
    let chain;

    beforeEach(() => {
        chain = new BeaconChain('pk_mydevice');
    });

    it('starts with an empty chain', () => {
        expect(chain.entries).toEqual([]);
        expect(chain.pk).toBe('pk_mydevice');
    });

    it('returns genesis as prev_self for first entry', () => {
        expect(chain.getPrevSelf()).toBe('00000000000000000000000000000000');
    });

    it('append returns a hash based on prev_self + pulse + heard_root', () => {
        const hash = chain.append('nist_pulse_aaaa...', 'heard_root_bbbb...');
        expect(hash).toMatch(/^[0-9a-f]{32}$/);
    });

    it('chain length grows with each append', () => {
        expect(chain.entries.length).toBe(0);
        chain.append('p1', 'hr1');
        expect(chain.entries.length).toBe(1);
        chain.append('p2', 'hr2');
        expect(chain.entries.length).toBe(2);
    });

    it('getPrevSelf returns previous entry hash after append', () => {
        const h1 = chain.append('p1', 'hr1');
        expect(chain.getPrevSelf()).toBe(h1);
        const h2 = chain.append('p2', 'hr2');
        expect(chain.getPrevSelf()).toBe(h2);
    });

    it('chain hashes are linked (each entry depends on previous)', () => {
        const h1 = chain.append('p1', 'hr1');
        const h2 = chain.append('p2', 'hr2');

        // h1 = H('000...' + 'p1' + 'hr1')
        // h2 = H(h1 + 'p2' + 'hr2')
        const expected1 = demoTurstHash('00000000000000000000000000000000p1hr1');
        const expected2 = demoTurstHash(expected1 + 'p2hr2');

        expect(h1).toBe(expected1);
        expect(h2).toBe(expected2);
    });

    it('getEntry returns the entry at given index', () => {
        chain.append('p1', 'hr1');
        chain.append('p2', 'hr2');
        const e = chain.getEntry(0);
        expect(e).toBeDefined();
        expect(e.nist).toBe('p1');
        expect(e.heard_root).toBe('hr1');
    });

    it('getEntry returns undefined for out-of-range', () => {
        expect(chain.getEntry(0)).toBeUndefined();
        chain.append('p1', 'hr1');
        expect(chain.getEntry(1)).toBeUndefined();
    });
});

// ── HeardSet ─────────────────────────────────────────────────────────

describe('HeardSet', () => {
    let heard;

    beforeEach(() => {
        heard = new HeardSet();
    });

    it('starts empty', () => {
        expect(heard.size()).toBe(0);
    });

    it('addOrUpdate inserts a new entry', () => {
        heard.addOrUpdate('pk_alice', 'hash_aaaa', -55);
        expect(heard.size()).toBe(1);
        expect(heard.get('pk_alice')).toEqual({ hash: 'hash_aaaa', rssi: -55 });
    });

    it('addOrUpdate overwrites existing entry', () => {
        heard.addOrUpdate('pk_alice', 'hash_old', -60);
        heard.addOrUpdate('pk_alice', 'hash_new', -50);
        expect(heard.get('pk_alice')).toEqual({ hash: 'hash_new', rssi: -50 });
    });

    it('computes heard_root via Merkle tree over sorted entries', () => {
        heard.addOrUpdate('pk_c', 'hc', -55);
        heard.addOrUpdate('pk_a', 'ha', -60);
        heard.addOrUpdate('pk_b', 'hb', -70);

        const root = heard.computeRoot();
        expect(root).toMatch(/^[0-9a-f]{32}$/);
    });

    it('same entries produce same root (deterministic)', () => {
        heard.addOrUpdate('pk_alice', 'ha', -30);
        heard.addOrUpdate('pk_bob', 'hb', -40);

        const h2 = new HeardSet();
        h2.addOrUpdate('pk_alice', 'ha', -30);
        h2.addOrUpdate('pk_bob', 'hb', -40);

        expect(heard.computeRoot()).toBe(h2.computeRoot());
    });

    it('root changes when an entry changes', () => {
        heard.addOrUpdate('pk_1', 'h1', -50);
        const r1 = heard.computeRoot();

        heard.addOrUpdate('pk_1', 'h2', -50);
        const r2 = heard.computeRoot();

        expect(r1).not.toBe(r2);
    });

    it('root for empty set is null or special value', () => {
        const root = heard.computeRoot();
        expect(root).toBe('00000000000000000000000000000000');
    });

    it('getEntries returns sorted array', () => {
        heard.addOrUpdate('pk_c', 'hc', -70);
        heard.addOrUpdate('pk_a', 'ha', -50);
        heard.addOrUpdate('pk_b', 'hb', -60);

        const entries = heard.getEntries();
        expect(entries[0].pk).toBe('pk_a');
        expect(entries[1].pk).toBe('pk_b');
        expect(entries[2].pk).toBe('pk_c');
    });

    it('applies RSSI threshold rule: all received if count < 50', () => {
        // When total received beacons count is low (< 50), save all regardless of RSSI
        // threshold is -70 dBm, but we save everything when count < 50
        // In practice, this means HeardSet.addOrUpdate is called whenever a beacon is observed
        // The caller decides whether to call it based on RSSI rule.
        // HeardSet itself just stores what it's told.
        // We test that HeardSet has an acceptBeacon helper that implements the rule.
        // acceptBeacon(rssi, currentCount, threshold, maxCount) → boolean

        // count=0, rssi=-80 (below -70) → should accept because count < 50
        expect(heard.acceptBeacon(-80, 0, -70, 50)).toBe(true);

        // count=50, rssi=-55 (above -70) → should accept because RSSI good
        expect(heard.acceptBeacon(-55, 50, -70, 50)).toBe(true);

        // count=50, rssi=-80 (below -70) → should reject (count >= 50 and RSSI below)
        expect(heard.acceptBeacon(-80, 50, -70, 50)).toBe(false);

        // count=49, rssi=-80 → accept (count < 50)
        expect(heard.acceptBeacon(-80, 49, -70, 50)).toBe(true);
    });
});

// ── MerkleTree ───────────────────────────────────────────────────────

describe('MerkleTree', () => {
    let tree;

    it('builds a tree from key-value pairs', () => {
        const entries = [
            { pk: 'pk_a', hash: 'ha', rssi: -50 },
            { pk: 'pk_b', hash: 'hb', rssi: -60 },
        ];
        tree = new MerkleTree(entries);
        expect(tree.root).toMatch(/^[0-9a-f]{32}$/);
    });

    it('tree with 0 entries returns null root', () => {
        tree = new MerkleTree([]);
        expect(tree.root).toBe('00000000000000000000000000000000');
    });

    it('tree with 1 entry has hash of that entry as root', () => {
        const entries = [{ pk: 'pk_a', hash: 'ha', rssi: -50 }];
        tree = new MerkleTree(entries);
        const expected = demoTurstHash('pk_aha');
        expect(tree.root).toBe(expected);
    });

    it('generates inclusion proof for a leaf', () => {
        const entries = [
            { pk: 'pk_a', hash: 'ha', rssi: -50 },
            { pk: 'pk_b', hash: 'hb', rssi: -60 },
            { pk: 'pk_c', hash: 'hc', rssi: -70 },
        ];
        tree = new MerkleTree(entries);
        const proof = tree.getProof('pk_a');
        expect(proof).toBeDefined();
        expect(proof.pk).toBe('pk_a');
        expect(proof.siblings).toBeDefined();
        expect(Array.isArray(proof.siblings)).toBe(true);
    });

    it('verifies a valid inclusion proof', () => {
        const entries = [
            { pk: 'pk_a', hash: 'ha', rssi: -50 },
            { pk: 'pk_b', hash: 'hb', rssi: -60 },
            { pk: 'pk_c', hash: 'hc', rssi: -70 },
            { pk: 'pk_d', hash: 'hd', rssi: -80 },
        ];
        tree = new MerkleTree(entries);
        const proof = tree.getProof('pk_b');
        const valid = MerkleTree.verifyProof(proof, tree.root);
        expect(valid).toBe(true);
    });

    it('rejects a tampered proof (wrong hash)', () => {
        const entries = [
            { pk: 'pk_a', hash: 'ha', rssi: -50 },
            { pk: 'pk_b', hash: 'hb', rssi: -60 },
        ];
        tree = new MerkleTree(entries);
        const proof = tree.getProof('pk_a');
        // Tamper with the leaf hash
        proof.leafHash = 'tampered_data_here';
        const valid = MerkleTree.verifyProof(proof, tree.root);
        expect(valid).toBe(false);
    });

    it('rejects proof for wrong root', () => {
        const entries = [
            { pk: 'pk_a', hash: 'ha', rssi: -50 },
        ];
        tree = new MerkleTree(entries);
        const proof = tree.getProof('pk_a');
        const valid = MerkleTree.verifyProof(proof, 'ffffffffffffffffffffffffffffffff');
        expect(valid).toBe(false);
    });

    it('getProof returns null for unknown pk', () => {
        const entries = [{ pk: 'pk_a', hash: 'ha', rssi: -50 }];
        tree = new MerkleTree(entries);
        expect(tree.getProof('pk_nonexistent')).toBeNull();
    });
});

// ── buildBeacon ──────────────────────────────────────────────────────

describe('buildBeacon', () => {
    it('builds a SpatioTemporalBeacon with all fields', () => {
        const chain = new BeaconChain('pk_test');
        const heard = new HeardSet();
        heard.addOrUpdate('pk_alice', 'hash_aaaa', -55);
        const nistBeacon = new NistBeacon(42);

        const beacon = buildBeacon(chain, heard, nistBeacon.getPulse(0), {
            sign: (data) => demoTurstHash('sk_test' + data),
        });

        expect(beacon.pk).toBe('pk_test');
        expect(beacon.nist).toMatch(/^[0-9a-f]{32}$/);
        expect(beacon.prev_self).toBe('00000000000000000000000000000000');
        expect(beacon.heard_root).toMatch(/^[0-9a-f]{32}$/);
        expect(beacon.sig).toBeDefined();
        expect(beacon.seq_num).toBe(0);
    });

    it('increments seq_num and updates prev_self after first beacon', () => {
        const chain = new BeaconChain('pk_test');
        const heard = new HeardSet();
        const nistBeacon = new NistBeacon(42);
        const keyPair = { sign: (data) => demoTurstHash('sk' + data) };

        // First beacon
        const b0 = buildBeacon(chain, heard, nistBeacon.getPulse(0), keyPair);
        expect(b0.seq_num).toBe(0);
        expect(b0.prev_self).toBe('00000000000000000000000000000000');

        // Second beacon
        const b1 = buildBeacon(chain, heard, nistBeacon.getPulse(1), keyPair);
        expect(b1.seq_num).toBe(1);
        expect(b1.prev_self).toBe(chain.getEntry(0).hash);
    });

    it('serialized beacon is ~176 bytes', () => {
        const chain = new BeaconChain('pk_test');
        const heard = new HeardSet();
        const nistBeacon = new NistBeacon(42);

        const beacon = buildBeacon(chain, heard, nistBeacon.getPulse(0), {
            sign: (data) => demoTurstHash('sk' + data),
        });

        const serialized = JSON.stringify(beacon);
        // Each field approximates: pk(30) + nist(32) + prev_self(32) + heard_root(32) + sig(32) + seq_num(4) + rssi(4) + overhead ≈ 176
        expect(serialized.length).toBeLessThan(300); // generous bound
        expect(serialized.length).toBeGreaterThan(100);
    });
});

// ── verifyBeaconChain ────────────────────────────────────────────────

describe('verifyBeaconChain', () => {
    it('returns valid:true for a correct chain', () => {
        const chain = new BeaconChain('pk_test');
        const heard = new HeardSet();
        const nist = new NistBeacon(42);
        const keyPair = { sign: (data) => demoTurstHash('sk' + data) };

        const beacons = [];
        for (let i = 0; i < 3; i++) {
            beacons.push(buildBeacon(chain, heard, nist.getPulse(i), keyPair));
        }

        const result = verifyBeaconChain(beacons);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });

    it('detects missing beacon (sequence number gap)', () => {
        const chain = new BeaconChain('pk_test');
        const heard = new HeardSet();
        const nist = new NistBeacon(42);
        const keyPair = { sign: (data) => demoTurstHash('sk' + data) };

        const b0 = buildBeacon(chain, heard, nist.getPulse(0), keyPair);
        const b1 = buildBeacon(chain, heard, nist.getPulse(1), keyPair);
        const b2 = buildBeacon(chain, heard, nist.getPulse(2), keyPair);

        // Remove b1 (seq gap: 0 → 2)
        const result = verifyBeaconChain([b0, b2]);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });

    it('detects altered hash in chain', () => {
        const chain = new BeaconChain('pk_test');
        const heard = new HeardSet();
        const nist = new NistBeacon(42);
        const keyPair = { sign: (data) => demoTurstHash('sk' + data) };

        const b0 = buildBeacon(chain, heard, nist.getPulse(0), keyPair);
        const b1 = buildBeacon(chain, heard, nist.getPulse(1), keyPair);

        // Tamper with b1's prev_self
        const tampered = { ...b1, prev_self: 'ffffffffffffffffffffffffffffffff' };

        const result = verifyBeaconChain([b0, tampered]);
        expect(result.valid).toBe(false);
    });

    it('detects wrong NIST pulse', () => {
        const chain = new BeaconChain('pk_test');
        const heard = new HeardSet();
        const nist = new NistBeacon(42);
        const keyPair = { sign: (data) => demoTurstHash('sk' + data) };

        const b0 = buildBeacon(chain, heard, nist.getPulse(0), keyPair);
        const b1 = buildBeacon(chain, heard, nist.getPulse(1), keyPair);
        const b2 = buildBeacon(chain, heard, nist.getPulse(2), keyPair);

        // Replace NIST pulse in b1 with different value — this breaks b2's prev_self
        const tampered = { ...b1, nist: '00001111222233334444555566667777' };

        const result = verifyBeaconChain([b0, tampered, b2]);
        expect(result.valid).toBe(false);
    });

    it('handles empty beacon array', () => {
        const result = verifyBeaconChain([]);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });
});

// ── verifyHeardRoot ──────────────────────────────────────────────────

describe('verifyHeardRoot', () => {
    it('verifies heard_root matches when proof is correct', () => {
        const entries = [
            { pk: 'pk_a', hash: 'ha', rssi: -50 },
            { pk: 'pk_b', hash: 'hb', rssi: -60 },
        ];
        const tree = new MerkleTree(entries);
        const proof = tree.getProof('pk_a');

        const beacon = { heard_root: tree.root };
        const result = verifyHeardRoot(beacon, proof);
        expect(result.valid).toBe(true);
    });

    it('fails when heard_root does not match proof', () => {
        const entries = [{ pk: 'pk_a', hash: 'ha', rssi: -50 }];
        const tree = new MerkleTree(entries);
        const proof = tree.getProof('pk_a');

        const beacon = { heard_root: 'bad_root_value_here__' };
        const result = verifyHeardRoot(beacon, proof);
        expect(result.valid).toBe(false);
    });

    it('fails with no proof provided', () => {
        const result = verifyHeardRoot({ heard_root: 'aa' }, null);
        expect(result.valid).toBe(false);
    });
});

// ── buildObservationBundle ───────────────────────────────────────────

describe('buildObservationBundle', () => {
    it('builds a bundle containing chain entries and heard set', () => {
        const chain = new BeaconChain('pk_test');
        const heard = new HeardSet();
        const nist = new NistBeacon(42);
        const keyPair = { sign: (data) => demoTurstHash('sk' + data) };

        // Build several beacons
        heard.addOrUpdate('pk_alice', 'ha', -55);
        const b0 = buildBeacon(chain, heard, nist.getPulse(0), keyPair);

        heard.addOrUpdate('pk_bob', 'hb', -60);
        const b1 = buildBeacon(chain, heard, nist.getPulse(1), keyPair);

        const bundle = buildObservationBundle(chain, heard, keyPair);
        expect(bundle.pk).toBe('pk_test');
        expect(bundle.chain.length).toBe(2);
        expect(bundle.heardRoot).toMatch(/^[0-9a-f]{32}$/);
        expect(bundle.beacons.length).toBe(2);
    });
});

// ── reconstructDAG ───────────────────────────────────────────────────

describe('reconstructDAG', () => {
    it('reconstructs a DAG from bundles of 2+ devices', () => {
        const nist = new NistBeacon(42);

        function makeDevice(pk) {
            const chain = new BeaconChain(pk);
            const heard = new HeardSet();
            const keyPair = { sign: (data) => demoTurstHash('sk_' + pk + data) };
            return { chain, heard, keyPair, nist };
        }

        const devA = makeDevice('pk_A');
        const devB = makeDevice('pk_B');
        const devC = makeDevice('pk_C');

        // Round 0: each device builds a beacon
        const round0 = [
            buildBeacon(devA.chain, devA.heard, nist.getPulse(0), devA.keyPair),
            buildBeacon(devB.chain, devB.heard, nist.getPulse(0), devB.keyPair),
            buildBeacon(devC.chain, devC.heard, nist.getPulse(0), devC.keyPair),
        ];

        // Devices hear each other — update heard sets with beacons they received
        devA.heard.addOrUpdate('pk_B', round0[1].prev_self, -55);
        devA.heard.addOrUpdate('pk_C', round0[2].prev_self, -60);
        devB.heard.addOrUpdate('pk_A', round0[0].prev_self, -50);
        devB.heard.addOrUpdate('pk_C', round0[2].prev_self, -65);
        devC.heard.addOrUpdate('pk_A', round0[0].prev_self, -58);
        devC.heard.addOrUpdate('pk_B', round0[1].prev_self, -62);

        // Round 1
        const round1 = [
            buildBeacon(devA.chain, devA.heard, nist.getPulse(1), devA.keyPair),
            buildBeacon(devB.chain, devB.heard, nist.getPulse(1), devB.keyPair),
            buildBeacon(devC.chain, devC.heard, nist.getPulse(1), devC.keyPair),
        ];

        // Build bundles
        const bundleA = buildObservationBundle(devA.chain, devA.heard, devA.keyPair);
        const bundleB = buildObservationBundle(devB.chain, devB.heard, devB.keyPair);
        const bundleC = buildObservationBundle(devC.chain, devC.heard, devC.keyPair);

        const dag = reconstructDAG([bundleA, bundleB, bundleC]);
        expect(dag).toBeDefined();
        expect(dag.nodes).toBeDefined();
        expect(dag.nodes.length).toBeGreaterThanOrEqual(3); // at least 3 beacons across 3 chains
        expect(dag.edges).toBeDefined();
        // Edges represent: A heard B, B heard C, etc.
        expect(dag.edges.length).toBeGreaterThan(0);
    });

    it('includes cross-chain edges when devices hear each other', () => {
        const nist = new NistBeacon(42);

        const devA = { chain: new BeaconChain('pk_A'), heard: new HeardSet(), keyPair: { sign: (d) => demoTurstHash('sk_A' + d) } };
        const devB = { chain: new BeaconChain('pk_B'), heard: new HeardSet(), keyPair: { sign: (d) => demoTurstHash('sk_B' + d) } };

        // Round 0
        const bA0 = buildBeacon(devA.chain, devA.heard, nist.getPulse(0), devA.keyPair);
        const bB0 = buildBeacon(devB.chain, devB.heard, nist.getPulse(0), devB.keyPair);

        // They hear each other
        devA.heard.addOrUpdate('pk_B', bB0.prev_self, -55);
        devB.heard.addOrUpdate('pk_A', bA0.prev_self, -55);

        // Round 1
        buildBeacon(devA.chain, devA.heard, nist.getPulse(1), devA.keyPair);
        buildBeacon(devB.chain, devB.heard, nist.getPulse(1), devB.keyPair);

        const bundles = [
            buildObservationBundle(devA.chain, devA.heard, devA.keyPair),
            buildObservationBundle(devB.chain, devB.heard, devB.keyPair),
        ];

        const dag = reconstructDAG(bundles);
        expect(dag.nodes.length).toBe(4); // 2 devices × 2 rounds
        // Heard entries accumulate: each of 2 devices hears the other across 2 rounds,
        // and each beacon references all accumulated entries → multiple edges
        expect(dag.edges.length).toBeGreaterThanOrEqual(2);
    });

    it('handles single device bundle', () => {
        const nist = new NistBeacon(42);
        const chain = new BeaconChain('pk_solo');
        const heard = new HeardSet();
        const keyPair = { sign: (d) => demoTurstHash('sk_solo' + d) };

        buildBeacon(chain, heard, nist.getPulse(0), keyPair);
        const bundle = buildObservationBundle(chain, heard, keyPair);

        const dag = reconstructDAG([bundle]);
        expect(dag.nodes.length).toBe(1);
        expect(dag.edges.length).toBe(0);
    });

    it('verifiability: DAG nodes can be validated via chain verification', () => {
        const nist = new NistBeacon(42);
        const chain = new BeaconChain('pk_test');
        const heard = new HeardSet();
        const keyPair = { sign: (d) => demoTurstHash('sk_test' + d) };

        for (let i = 0; i < 3; i++) {
            buildBeacon(chain, heard, nist.getPulse(i), keyPair);
        }
        const bundle = buildObservationBundle(chain, heard, keyPair);

        const dag = reconstructDAG([bundle]);
        // Verify the chain from DAG nodes
        const chainResult = verifyBeaconChain(dag.nodes.map(n => n.beacon));
        expect(chainResult.valid).toBe(true);
    });
});

// ── Integration: Cross-chain verification ────────────────────────────

describe('cross-chain verification', () => {
    it('A heard B at time t — verifiable via Merkle proof', () => {
        const nist = new NistBeacon(42);

        const devA = { chain: new BeaconChain('pk_A'), heard: new HeardSet(), keyPair: { sign: (d) => demoTurstHash('sk_A' + d) } };
        const devB = { chain: new BeaconChain('pk_B'), heard: new HeardSet(), keyPair: { sign: (d) => demoTurstHash('sk_B' + d) } };

        // Round 0
        const bA0 = buildBeacon(devA.chain, devA.heard, nist.getPulse(0), devA.keyPair);
        const bB0 = buildBeacon(devB.chain, devB.heard, nist.getPulse(0), devB.keyPair);

        // A heard B at round 0
        devA.heard.addOrUpdate('pk_B', bB0.prev_self, -55);

        // Round 1: A now includes B's beacon hash in heard_root
        const bA1 = buildBeacon(devA.chain, devA.heard, nist.getPulse(1), devA.keyPair);

        // Now verify that A's heard_root contains B
        const entries = devA.heard.getEntries();
        const tree = new MerkleTree(entries);
        const proofB = tree.getProof('pk_B');

        expect(proofB).not.toBeNull(); // B should be in A's heard set
        const valid = MerkleTree.verifyProof(proofB, bA1.heard_root);
        expect(valid).toBe(true);
    });
});

// ── Tamper Detection ─────────────────────────────────────────────────

describe('tamper detection', () => {
    it('detects missing beacon in chain', () => {
        const chain = new BeaconChain('pk_t');
        const heard = new HeardSet();
        const nist = new NistBeacon(42);
        const kp = { sign: (d) => demoTurstHash('sk' + d) };

        const b0 = buildBeacon(chain, heard, nist.getPulse(0), kp);
        const b1 = buildBeacon(chain, heard, nist.getPulse(1), kp);
        const b2 = buildBeacon(chain, heard, nist.getPulse(2), kp);

        // Missing b1
        const result = verifyBeaconChain([b0, b2]);
        expect(result.valid).toBe(false);
    });

    it('detects altered hash in a beacon', () => {
        const chain = new BeaconChain('pk_t');
        const heard = new HeardSet();
        const nist = new NistBeacon(42);
        const kp = { sign: (d) => demoTurstHash('sk' + d) };

        const b0 = buildBeacon(chain, heard, nist.getPulse(0), kp);
        const b1 = buildBeacon(chain, heard, nist.getPulse(1), kp);

        const tampered = { ...b1, prev_self: b0.prev_self }; // Wrong prev_self
        const result = verifyBeaconChain([b0, tampered]);
        expect(result.valid).toBe(false);
    });

    it('detects wrong NIST pulse', () => {
        const chain = new BeaconChain('pk_t');
        const heard = new HeardSet();
        const nist = new NistBeacon(42);
        const kp = { sign: (d) => demoTurstHash('sk' + d) };

        const b0 = buildBeacon(chain, heard, nist.getPulse(0), kp);
        const b1 = buildBeacon(chain, heard, nist.getPulse(1), kp);
        const b2 = buildBeacon(chain, heard, nist.getPulse(2), kp);

        // Replace nist pulse with wrong value — breaks b2's prev_self
        const nistWrong = new NistBeacon(999);
        const tampered = { ...b1, nist: nistWrong.getPulse(1) };
        const result = verifyBeaconChain([b0, tampered, b2]);
        expect(result.valid).toBe(false);
    });
});
