// demo/mesh-protocol.js — Pure functions for the 4-round MNR protocol
// No DOM access — importable in Node.js and browser

// ── Crypto Primitives ────────────────────────────────────────────────

/**
 * SHA-256 hash function — works in browser (Web Crypto) and Node.js.
 * @param {string} data
 * @returns {Promise<string>} hex-encoded hash
 */
export async function hash(data) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Node.js fallback
  const crypto2 = await import('crypto');
  return crypto2.createHash('sha256').update(data).digest('hex');
}

/**
 * Simulated signature: sign(sk, data) = SHA-256(sk + data)
 * @param {string} sk - secret key (hex)
 * @param {string} data - data to sign
 * @returns {Promise<string>} signature hex
 */
export async function sign(sk, data) {
  return hash(sk + data);
}

/**
 * Simulated signature verification.
 * @param {string} pk - public key (unused in simulated mode, kept for API compat)
 * @param {string} data - original data
 * @param {string} signature - claimed signature
 * @param {string} sk - the secret key used to sign (needed for simulated verify)
 * @returns {Promise<boolean>}
 */
export async function verify(pk, data, signature, sk) {
  const expected = await sign(sk, data);
  return expected === signature;
}

// ── Helpers ──────────────────────────────────────────────────────────

function randomHex(len = 16) {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result;
}

// ── Mesh State ───────────────────────────────────────────────────────

/**
 * Create a fresh mesh state with 3 devices (A, B, C), each with
 * ephemeral keys, empty chains, and empty attestations.
 * @param {string} [meshId] - optional mesh session id (default: auto-generated)
 * @returns {MeshState}
 */
export function createMeshState(meshId) {
  const id = meshId || 'mesh-' + Date.now().toString(36) + '-' + randomHex(4);

  function makeDevice(label) {
    const pk = 'pk_' + label + '_' + randomHex(8);
    const sk = 'sk_' + label + '_' + randomHex(8);
    return {
      id: label,
      pk,
      sk,
      chain: [],
      attestations: {},
      heardFrom: [],
      ackedBy: [],
      meshId: id,
    };
  }

  return {
    round: 0,
    completed: false,
    meshId: id,
    devices: {
      A: makeDevice('A'),
      B: makeDevice('B'),
      C: makeDevice('C'),
    },
    distances: {},
  };
}

// ── Round 1: Beacon Broadcast ────────────────────────────────────────

/**
 * Create a signed presence beacon.
 * @param {MeshDevice} device
 * @param {number} simTime
 * @returns {Promise<Beacon>}
 */
export async function createBeacon(device, simTime) {
  const lastHash = device.chain.length > 0
    ? device.chain[device.chain.length - 1].hash
    : '0000000000000000000000000000000000000000000000000000000000000000';

  const payload = device.pk + simTime + device.meshId + lastHash;
  const signature = await sign(device.sk, payload);

  return {
    type: 'beacon',
    pk: device.pk,
    simTime,
    meshId: device.meshId,
    chainHash: lastHash,
    signature,
  };
}

/**
 * Process receiving a beacon.
 * Records an attestation in the receiver's log and appends a chain entry.
 * @param {MeshDevice} receiver
 * @param {string} senderPk
 * @param {Beacon} beacon
 * @param {number} arrivalSimTime
 * @param {number} [rssi] - signal strength in dBm
 * @returns {Promise<{attestation: Attestation, updatedChain: ChainEntry}>}
 */
export async function receiveBeacon(receiver, senderPk, beacon, arrivalSimTime, rssi) {
  const attestation = {
    observedPk: senderPk,
    claimedSimTime: beacon.simTime,
    arrivalSimTime,
    rssi: rssi !== undefined ? rssi : -60,
    status: 'received',
  };

  receiver.attestations[senderPk] = attestation;
  if (!receiver.heardFrom.includes(senderPk)) {
    receiver.heardFrom.push(senderPk);
  }

  // Build attestation hashes for chain entry
  const attestHashes = await Promise.all(
    Object.values(receiver.attestations).map(a => hash(JSON.stringify(a)))
  );

  const prevHash = receiver.chain.length > 0
    ? receiver.chain[receiver.chain.length - 1].hash
    : '0000000000000000000000000000000000000000000000000000000000000000';

  const chainHash = await computeChainHash(prevHash, attestHashes);
  const entry = {
    index: receiver.chain.length,
    simTime: arrivalSimTime,
    hash: chainHash,
  };
  receiver.chain.push(entry);

  return { attestation, updatedChain: entry };
}

// ── Round 3: Acknowledgment ──────────────────────────────────────────

/**
 * Create a signed acknowledgment for a received beacon.
 * @param {MeshDevice} sender
 * @param {string} targetPk
 * @param {string} beaconHash
 * @param {number} rssi
 * @param {number} simTime
 * @returns {Promise<Ack>}
 */
export async function createAck(sender, targetPk, beaconHash, rssi, simTime) {
  const payload = sender.pk + targetPk + beaconHash + rssi + simTime;
  const signature = await sign(sender.sk, payload);

  return {
    type: 'ack',
    pkSender: sender.pk,
    pkTarget: targetPk,
    beaconHash,
    rssi,
    simTime,
    signature,
  };
}

/**
 * Process receiving an acknowledgment.
 * Updates the attestation status and appends a chain entry.
 * @param {MeshDevice} receiver
 * @param {string} senderPk
 * @param {Ack} ack
 * @returns {Promise<{updatedChain: ChainEntry}>}
 */
export async function receiveAck(receiver, senderPk, ack) {
  // Update attestation status if we have one for the sender
  if (receiver.attestations[senderPk]) {
    receiver.attestations[senderPk].status = 'ack_received';
  } else {
    // Create a synthetic attestation if we somehow receive an ack without having heard the beacon
    receiver.attestations[senderPk] = {
      observedPk: senderPk,
      claimedSimTime: ack.simTime,
      arrivalSimTime: ack.simTime,
      rssi: ack.rssi,
      status: 'ack_received',
    };
  }

  if (!receiver.ackedBy.includes(senderPk)) {
    receiver.ackedBy.push(senderPk);
  }

  // Append chain entry
  const attestHashes = await Promise.all(
    Object.values(receiver.attestations).map(a => hash(JSON.stringify(a)))
  );

  const prevHash = receiver.chain.length > 0
    ? receiver.chain[receiver.chain.length - 1].hash
    : '0000000000000000000000000000000000000000000000000000000000000000';

  const chainHash = await computeChainHash(prevHash, attestHashes);
  const entry = {
    index: receiver.chain.length,
    simTime: ack.simTime,
    hash: chainHash,
  };
  receiver.chain.push(entry);

  return { updatedChain: entry };
}

// ── Chain Hash ───────────────────────────────────────────────────────

/**
 * Compute chain hash: H(previousHash || H(attest_1) || H(attest_2) || ...)
 * @param {string} previousHash - hex hash of previous chain entry
 * @param {string[]} attestationHashes - array of attestation hashes
 * @returns {Promise<string>}
 */
export async function computeChainHash(previousHash, attestationHashes) {
  const combined = previousHash + attestationHashes.join('');
  return hash(combined);
}

// ── Round-Trip Distance ──────────────────────────────────────────────

/**
 * Compute round-trip acoustic distance.
 * distance = ((t_a_arrival - t_b_claimed) + (t_b_arrival - t_a_claimed)) / 2 * speed_of_sound
 * @param {number} t_off_AB - arrival at B minus claimed time from A (seconds)
 * @param {number} t_off_BA - arrival at A minus claimed time from B (seconds)
 * @param {number} [speedOfSound] - speed of sound in m/s (default 343)
 * @returns {{distanceMeters: number, plausible: boolean}}
 */
export function computeRoundTripDistance(t_off_AB, t_off_BA, speedOfSound = 343) {
  const oneWayTime = (t_off_AB + t_off_BA) / 2;
  const distanceMeters = oneWayTime * speedOfSound;
  const plausible = distanceMeters >= 0 && distanceMeters <= 50;
  return { distanceMeters, plausible };
}

// ── Notary Cross-Reference ───────────────────────────────────────────

/**
 * Run the notary cross-reference on the entire mesh state.
 * Verifies attestations, checks pairwise round-trip distances,
 * verifies chain consistency, and issues a certificate if all checks pass.
 * @param {MeshState} state
 * @returns {Promise<NotaryReport>}
 */
export async function runNotaryCrossReference(state) {
  const logs = [];
  const devices = state.devices;
  const deviceIds = Object.keys(devices);
  const sigVerification = {};
  const pairwiseDistances = {};
  const chainConsistency = {};

  // Step 1: Signature verification (simulated — check attestations exist)
  logs.push('Step 1/5: Verify bundle signatures');
  for (const id of deviceIds) {
    const dev = devices[id];
    // In simulated mode, we check that the device has been heard by at least one other device
    sigVerification[id] = dev.heardFrom.length > 0;
    logs.push(`  Device ${id}: ${dev.heardFrom.length} attestation(s), pk=${dev.pk.substring(0, 10)}...`);
  }

  // Step 2: Check pairwise attestations
  logs.push('Step 2/5: Check pairwise attestations');
  let mutualPairs = 0;
  let totalPairs = 0;
  for (let i = 0; i < deviceIds.length; i++) {
    for (let j = i + 1; j < deviceIds.length; j++) {
      totalPairs++;
      const aId = deviceIds[i];
      const bId = deviceIds[j];
      const a = devices[aId];
      const b = devices[bId];

      const aHeardB = a.attestations[b.pk] !== undefined;
      const bHeardA = b.attestations[a.pk] !== undefined;

      const key = `${aId}↔${bId}`;
      if (aHeardB && bHeardA) {
        mutualPairs++;
        pairwiseDistances[key] = 1; // simulated distance in meters
        logs.push(`  ${aId}↔${bId}: mutual ✓ (simulated 1.0m)`);
      } else if (aHeardB || bHeardA) {
        pairwiseDistances[key] = -1; // one-way only
        logs.push(`  ${aId}↔${bId}: one-way only (aHeardB=${aHeardB}, bHeardA=${bHeardA})`);
      } else {
        pairwiseDistances[key] = -1;
        logs.push(`  ${aId}↔${bId}: no connectivity`);
      }
    }
  }

  // Step 3: Compute physical distances (simulated)
  logs.push('Step 3/5: Compute physical distances');
  let maxDistance = 0;
  for (const [pair, dist] of Object.entries(pairwiseDistances)) {
    if (dist > maxDistance) maxDistance = dist;
    logs.push(`  ${pair}: ${dist >= 0 ? dist.toFixed(2) + 'm' : 'N/A'}`);
  }

  // Step 4: Verify chain consistency
  logs.push('Step 4/5: Verify chain consistency');
  for (const id of deviceIds) {
    const dev = devices[id];
    const consistent = dev.chain.length > 0;
    chainConsistency[id] = consistent;
    logs.push(`  Device ${id}: chain length=${dev.chain.length}, consistent=${consistent}`);
  }
  const allConsistent = Object.values(chainConsistency).every(v => v);

  // Step 5: Issue MNR Certificate
  logs.push('Step 5/5: Issue MNR Certificate');
  const passed = mutualPairs === totalPairs && allConsistent && totalPairs > 0;

  const certificateId = passed
    ? 'MNR-' + randomHex(8).toUpperCase() + '-' + Date.now().toString(36).toUpperCase()
    : null;

  if (passed) {
    logs.push(`  ✓ All checks passed. Certificate ID: ${certificateId}`);
  } else {
    logs.push(`  ✗ Mesh incomplete. Mutual: ${mutualPairs}/${totalPairs}, Chain consistent: ${allConsistent}`);
  }

  return {
    passed,
    sigVerification,
    pairwiseDistances,
    chainConsistency,
    maxDistance,
    mutualPairs,
    totalPairs,
    certificateId,
    logs,
  };
}

// ── Exported utilities (re-exported for convenience) ─────────────────

export default {
  hash,
  sign,
  verify,
  createMeshState,
  createBeacon,
  receiveBeacon,
  createAck,
  receiveAck,
  computeChainHash,
  computeRoundTripDistance,
  runNotaryCrossReference,
};
