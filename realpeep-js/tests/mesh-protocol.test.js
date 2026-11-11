/**
 * Tests for mesh-protocol.js — pure protocol functions for the 4-round MNR demo.
 */

import {
  createMeshState,
  createBeacon,
  receiveBeacon,
  createAck,
  receiveAck,
  computeRoundTripDistance,
  computeChainHash,
  runNotaryCrossReference,
  hash,
  sign,
  verify,
} from '../../demo/mesh-protocol.js';

// ── State Tests ──────────────────────────────────────────────────────

test('test_createMeshState_creates_three_devices', () => {
  const state = createMeshState();
  expect(state.devices.A).toBeDefined();
  expect(state.devices.B).toBeDefined();
  expect(state.devices.C).toBeDefined();
  expect(state.devices.A.pk).toMatch(/^pk_A_/);
  expect(state.devices.B.pk).toMatch(/^pk_B_/);
  expect(state.devices.C.pk).toMatch(/^pk_C_/);
});

test('test_createMeshState_ephemeral_keys_unique', () => {
  const state = createMeshState();
  const { A, B, C } = state.devices;
  expect(A.pk).not.toBe(B.pk);
  expect(A.pk).not.toBe(C.pk);
  expect(B.pk).not.toBe(C.pk);
  expect(A.sk).not.toBe(B.sk);
  expect(A.sk).not.toBe(C.sk);
  expect(B.sk).not.toBe(C.sk);
});

// ── Round 1: Beacon Tests ───────────────────────────────────────────

test('test_createBeacon_has_correct_structure', async () => {
  const state = createMeshState();
  const deviceA = state.devices.A;
  const beacon = await createBeacon(deviceA, 100);

  expect(beacon.type).toBe('beacon');
  expect(beacon.pk).toBe(deviceA.pk);
  expect(beacon.simTime).toBe(100);
  expect(beacon.meshId).toBe(state.meshId);
  expect(beacon.chainHash).toMatch(/^[0-9a-f]{64}$/);
  expect(beacon.signature).toMatch(/^[0-9a-f]{64}$/);
});

test('test_receiveBeacon_records_attestation', async () => {
  const state = createMeshState();
  const beacon = await createBeacon(state.devices.A, 100);

  await receiveBeacon(state.devices.B, state.devices.A.pk, beacon, 105, -62);

  expect(state.devices.B.attestations[state.devices.A.pk]).toBeDefined();
  expect(state.devices.B.attestations[state.devices.A.pk].status).toBe('received');
  expect(state.devices.B.attestations[state.devices.A.pk].observedPk).toBe(state.devices.A.pk);
  expect(state.devices.B.attestations[state.devices.A.pk].claimedSimTime).toBe(100);
  expect(state.devices.B.attestations[state.devices.A.pk].arrivalSimTime).toBe(105);
});

test('test_receiveBeacon_updates_chain', async () => {
  const state = createMeshState();
  const beacon = await createBeacon(state.devices.A, 100);

  await receiveBeacon(state.devices.B, state.devices.A.pk, beacon, 105);

  expect(state.devices.B.chain.length).toBe(1);
  expect(state.devices.B.chain[0].index).toBe(0);
  expect(state.devices.B.chain[0].simTime).toBe(105);
  expect(state.devices.B.chain[0].hash).toMatch(/^[0-9a-f]{64}$/);
});

test('test_receiveBeacon_records_rssi', async () => {
  const state = createMeshState();
  const beacon = await createBeacon(state.devices.A, 100);

  await receiveBeacon(state.devices.B, state.devices.A.pk, beacon, 105, -72);

  expect(state.devices.B.attestations[state.devices.A.pk].rssi).toBe(-72);
});

// ── Round 3: Ack Tests ──────────────────────────────────────────────

test('test_createAck_has_correct_structure', async () => {
  const state = createMeshState();
  const deviceA = state.devices.A;
  const deviceB = state.devices.B;
  const beaconHash = 'abc123def456'; // pragma: allowlist secret
  const ack = await createAck(deviceA, deviceB.pk, beaconHash, -62, 200);

  expect(ack.type).toBe('ack');
  expect(ack.pkSender).toBe(deviceA.pk);
  expect(ack.pkTarget).toBe(deviceB.pk);
  expect(ack.beaconHash).toBe(beaconHash);
  expect(ack.rssi).toBe(-62);
  expect(ack.simTime).toBe(200);
  expect(ack.signature).toMatch(/^[0-9a-f]{64}$/);
});

test('test_receiveAck_updates_status', async () => {
  const state = createMeshState();

  // First, B receives A's beacon
  const beacon = await createBeacon(state.devices.A, 100);
  await receiveBeacon(state.devices.B, state.devices.A.pk, beacon, 105, -62);

  // Then A sends an ack to B
  const ack = await createAck(state.devices.A, state.devices.B.pk, 'beacon_hash', -62, 200);
  await receiveAck(state.devices.B, state.devices.A.pk, ack);

  expect(state.devices.B.attestations[state.devices.A.pk].status).toBe('ack_received');
});

test('test_receiveAck_updates_chain', async () => {
  const state = createMeshState();

  // B receives beacon from A
  const beacon = await createBeacon(state.devices.A, 100);
  await receiveBeacon(state.devices.B, state.devices.A.pk, beacon, 105);

  // A sends ack to B
  const ack = await createAck(state.devices.A, state.devices.B.pk, 'beacon_hash', -62, 200);
  await receiveAck(state.devices.B, state.devices.A.pk, ack);

  // Chain should have 2 entries now (one from beacon, one from ack)
  expect(state.devices.B.chain.length).toBe(2);
  expect(state.devices.B.chain[1].index).toBe(1);
  expect(state.devices.B.chain[1].hash).toMatch(/^[0-9a-f]{64}$/);
});

// ── Round-Trip Distance Tests ───────────────────────────────────────

test('test_computeRoundTripDistance_zero', () => {
  const result = computeRoundTripDistance(0, 0);
  expect(result.distanceMeters).toBe(0);
  expect(result.plausible).toBe(true);
});

test('test_computeRoundTripDistance_plausible', () => {
  // (0.010 + 0.010) / 2 * 343 = 0.01 * 343 = 3.43m
  const result = computeRoundTripDistance(0.010, 0.010);
  expect(result.distanceMeters).toBeCloseTo(3.43, 2);
  expect(result.plausible).toBe(true);
});

test('test_computeRoundTripDistance_implausible', () => {
  // (0.3 + 0.3) / 2 * 343 = 0.3 * 343 = 102.9m — way over 50m
  const result = computeRoundTripDistance(0.3, 0.3);
  expect(result.distanceMeters).toBeCloseTo(102.9, 1);
  expect(result.plausible).toBe(false);
});

// ── Chain Hash Tests ────────────────────────────────────────────────

test('test_computeChainHash_deterministic', async () => {
  const h1 = await computeChainHash('0000', ['attest1', 'attest2']);
  const h2 = await computeChainHash('0000', ['attest1', 'attest2']);
  expect(h1).toBe(h2);
});

test('test_computeChainHash_changes', async () => {
  const h1 = await computeChainHash('0000', ['attest1', 'attest2']);
  const h2 = await computeChainHash('0000', ['attest1', 'attest3']);
  expect(h1).not.toBe(h2);
});

// ── Notary Cross-Reference Tests ────────────────────────────────────

test('test_runNotaryCrossReference_full_mesh_passes', async () => {
  const state = createMeshState('test-mesh-full');

  // Round 1: A broadcasts, B and C hear
  const beaconA = await createBeacon(state.devices.A, 100);
  await receiveBeacon(state.devices.B, state.devices.A.pk, beaconA, 105, -62);
  await receiveBeacon(state.devices.C, state.devices.A.pk, beaconA, 107, -65);

  // Round 2: B broadcasts, A and C hear
  const beaconB = await createBeacon(state.devices.B, 110);
  await receiveBeacon(state.devices.A, state.devices.B.pk, beaconB, 115, -61);
  await receiveBeacon(state.devices.C, state.devices.B.pk, beaconB, 118, -64);

  // Round 2 (continued): C broadcasts, A and B hear
  const beaconC = await createBeacon(state.devices.C, 120);
  await receiveBeacon(state.devices.A, state.devices.C.pk, beaconC, 125, -63);
  await receiveBeacon(state.devices.B, state.devices.C.pk, beaconC, 128, -66);

  // Round 3: A acks B and C, B acks A and C, C acks A and B
  const ackAB = await createAck(state.devices.A, state.devices.B.pk, 'bh1', -61, 200);
  await receiveAck(state.devices.B, state.devices.A.pk, ackAB);
  const ackAC = await createAck(state.devices.A, state.devices.C.pk, 'bh2', -63, 201);
  await receiveAck(state.devices.C, state.devices.A.pk, ackAC);

  const ackBA = await createAck(state.devices.B, state.devices.A.pk, 'bh3', -62, 210);
  await receiveAck(state.devices.A, state.devices.B.pk, ackBA);
  const ackBC = await createAck(state.devices.B, state.devices.C.pk, 'bh4', -66, 211);
  await receiveAck(state.devices.C, state.devices.B.pk, ackBC);

  const ackCA = await createAck(state.devices.C, state.devices.A.pk, 'bh5', -65, 220);
  await receiveAck(state.devices.A, state.devices.C.pk, ackCA);
  const ackCB = await createAck(state.devices.C, state.devices.B.pk, 'bh6', -64, 221);
  await receiveAck(state.devices.B, state.devices.C.pk, ackCB);

  const report = await runNotaryCrossReference(state);
  expect(report.passed).toBe(true);
  expect(report.certificateId).toBeTruthy();
  expect(report.mutualPairs).toBe(3);
  expect(report.totalPairs).toBe(3);
});

test('test_runNotaryCrossReference_partial_fails', async () => {
  const state = createMeshState('test-mesh-partial');

  // Only A and B exchange — C is isolated
  const beaconA = await createBeacon(state.devices.A, 100);
  await receiveBeacon(state.devices.B, state.devices.A.pk, beaconA, 105, -62);

  const beaconB = await createBeacon(state.devices.B, 110);
  await receiveBeacon(state.devices.A, state.devices.B.pk, beaconB, 115, -61);

  const ackAB = await createAck(state.devices.A, state.devices.B.pk, 'bh1', -61, 200);
  await receiveAck(state.devices.B, state.devices.A.pk, ackAB);
  const ackBA = await createAck(state.devices.B, state.devices.A.pk, 'bh2', -62, 210);
  await receiveAck(state.devices.A, state.devices.B.pk, ackBA);

  const report = await runNotaryCrossReference(state);
  expect(report.passed).toBe(false);
  expect(report.mutualPairs).toBe(1);
  expect(report.totalPairs).toBe(3);
  expect(report.certificateId).toBeNull();
});

// ── Crypto Tests ─────────────────────────────────────────────────────

test('test_hash_deterministic', async () => {
  const h1 = await hash('hello world');
  const h2 = await hash('hello world');
  expect(h1).toBe(h2);
  expect(h1).toMatch(/^[0-9a-f]{64}$/);
});

test('test_sign_verify_roundtrip', async () => {
  const sk = 'sk_test_key_abc123';
  const pk = 'pk_test_key_def456';
  const data = 'hello world';

  const sig = await sign(sk, data);
  expect(sig).toMatch(/^[0-9a-f]{64}$/);

  const valid = await verify(pk, data, sig, sk);
  expect(valid).toBe(true);

  // Wrong key should fail
  const wrongValid = await verify(pk, data, sig, 'sk_wrong_key');
  expect(wrongValid).toBe(false);
});
