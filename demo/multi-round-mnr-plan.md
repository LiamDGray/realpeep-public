# Multi-Round MNR Demo — Implementation Plan

**For:** An incoming agent to implement independently.
**Depends on:** `demo/mesh-mnr-plan.md` (the original spec), `demo/app.js` (current single-round impl).
**Target:** Replace the single-round "Device A broadcasts → Device B captures" in the Mesh Witness card with a full **4-round asynchronous protocol** with 3 devices (A, B, C), attestation logs, chain hash visualization, topology map, and notary cross-reference console.

---

## 1. Session Data Model

Create a new file `demo/mesh-protocol.js` containing ALL the pure protocol logic. No DOM access — testable in Node.js and the browser.

```javascript
// demo/mesh-protocol.js — Pure functions for the 4-round MNR protocol

/**
 * @typedef {Object} MeshDevice
 * @property {string} id - 'A' | 'B' | 'C'
 * @property {string} pk - Ephemeral public key (simulated hex)
 * @property {string} sk - Ephemeral secret key (simulated hex)
 * @property {ChainEntry[]} chain - Append-only chain hash log
 * @property {Object<string, Attestation>} attestations - pk → Attestation
 * @property {string[]} heardFrom - device IDs heard
 * @property {string[]} ackedBy - device IDs that acked us
 * @property {string} meshId - hash linking to this recording session
 */

/**
 * @typedef {Object} ChainEntry
 * @property {number} index - 0-based
 * @property {number} simTime - Simulated local clock
 * @property {string} hash - Chain hash
 */

/**
 * @typedef {Object} Attestation
 * @property {string} observedPk
 * @property {string} claimedTimestamp
 * @property {string} arrivalTimestamp
 * @property {number} rssi - Signal strength
 * @property {'received'|'ack_received'} status
 */

/**
 * @typedef {Object} Beacon
 * @property {'beacon'} type
 * @property {string} pk
 * @property {number} simTime
 * @property {string} meshId
 * @property {string} chainHash
 * @property {string} signature
 */

/**
 * @typedef {Object} Ack
 * @property {'ack'} type
 * @property {string} pkSender
 * @property {string} pkTarget
 * @property {string} beaconHash
 * @property {number} rssi
 * @property {number} simTime
 * @property {string} signature
 */

/**
 * @typedef {Object} MeshState
 * @property {number} round - 0-4
 * @property {Object<string, MeshDevice>} devices - {A, B, C}
 * @property {Object<string, number>} distances - 'A-B': 4.2
 * @property {boolean} completed
 */
```

Functions to export:

```javascript
// ── Mesh State ──

export function createMeshState(meshId) -> MeshState
// Initializes 3 devices with ephemeral keys, empty chains, empty attestations
// meshId defaults to `hash('session-' + Date.now())`

// ── Round 1: A Broadcasts ──

export function createBeacon(device: MeshDevice, simTime: number) -> Beacon
// Creates a presence beacon signed by the device

export function receiveBeacon(
  receiverDevice: MeshDevice,
  senderPk: string,
  beacon: Beacon,
  arrivalSimTime: number,
  rssi?: number
) -> { attestation: Attestation, updatedChain: ChainEntry }
// Records attestation in receiver's log
// Appends chain entry with new chain hash
// Returns both for the UI to display

// ── Round 2: B Broadcasts ──

// Same as Round 1 but devices B and C broadcast

// ── Round 3: A Sends Signed Acknowledgment ──

export function createAck(
  senderDevice: MeshDevice,
  targetPk: string,
  beaconHash: string,
  rssi: number,
  simTime: number
) -> Ack
// Creates signed acknowledgment of a received beacon

export function receiveAck(
  receiverDevice: MeshDevice,
  senderPk: string,
  ack: Ack
) -> { updatedChain: ChainEntry }
// Records ack receipt, updates chain hash

// ── Round 4: Chain Hash Cross-Linking ──

export function computeChainHash(
  previousHash: string,
  attestationHashes: string[]
) -> string
// H(previousHash || H(attest_1) || H(attest_2) || ...)

export function createChainBroadcast(
  device: MeshDevice,
  simTime: number
) -> { type: 'chain', pk: string, chainHash: string, peerFilter: string, ... }

// ── Round-Trip Distance ──

export function computeRoundTripDistance(
  t_arrival_B_minus_t_claimed_A: number,
  t_arrival_A_minus_t_claimed_B: number,
  speedOfSound: number // default 343 m/s
) -> { distanceMeters: number, plausible: boolean }
// distance = ((t_a_arrival - t_b_claimed) + (t_b_arrival - t_a_claimed)) / 2 * speed_of_sound
// plausible = distance >= 0 && distance <= 50

// ── Bloom Filter (Simulated) ──

export function createBloomFilter(pks: string[], size: number) -> string
// Simple hash-based bloom filter returning a hex string
// For simulation, just return SHA256(pks.join(','))[:8]

export function checkBloomFilter(filter: string, pk: string) -> boolean
// Check if a pk is probably in the filter

// ── Notary Cross-Reference ──

export function runNotaryCrossReference(state: MeshState) -> NotaryReport
// Verifies all signatures (simulated: just check attestations exist)
// Checks pairwise round-trip distances
// Checks chain consistency
// Issues MNR Certificate if all checks pass

/**
 * @typedef {Object} NotaryReport
 * @property {boolean} passed
 * @property {Object<string, boolean>} sigVerification
 * @property {Object<string, number>} pairwiseDistances
 * @property {Object<string, boolean>} chainConsistency
 * @property {number} maxDistance
 * @property {number} mutualPairs
 * @property {number} totalPairs
 * @property {string} certificateId
 * @property {string[]} logs - Step-by-step verification log lines
 */
```

---

## 2. Test File

Create `tests/mesh-protocol.test.js` with these tests:

```javascript
import {
  createMeshState,
  createBeacon,
  receiveBeacon,
  createAck,
  receiveAck,
  computeRoundTripDistance,
  computeChainHash,
  runNotaryCrossReference,
} from '../demo/mesh-protocol.js';

// --- State Tests ---

test('createMeshState creates 3 devices with ephemeral keys')
// All 3 devices have different pks, all pk strings are non-empty hex-ish

test('createMeshState initial chains have length 0')
// Each device starts with chain = []

test('createMeshState initial attestations are empty')
// Each device starts with attestations = {}

// --- Round 1 Tests ---

test('createBeacon produce correct structure')
// Has type='beacon', pk matches device, simTime > 0, meshId is set, chainHash present, signature present

test('receiveBeacon records attestation')
// Device B receives A's beacon → B.attestations[A.pk] exists with status='received'

test('receiveBeacon updates chain hash')
// After receiving beacon, device's chain has 1 entry with a hash

test('receiveBeacon records rssi')
// Attestation.rssi equals the passed rssi value

// --- Round 3 Tests ---

test('createAck produces correct structure')
// Has type='ack', pkSender, pkTarget, beaconHash, rssi, simTime, signature

test('receiveAck updates status to ack_received')
// Device A receives B's ack → A.attestations[B.pk].status === 'ack_received'

test('receiveAck updates chain')
// After receiving ack, chain has new entry

// --- Round-Trip Distance ---

test('computeRoundTripDistance with zero offset gives zero distance')
// If both offsets are 0, distance = 0

test('computeRoundTripDistance with symmetric delays')
// (10ms + 10ms) / 2 * 343m/s ≈ 1.715m

test('computeRoundTripDistance marks implausible distance as false')
// 100m > 50m → plausible = false

// --- Chain Consistency ---

test('computeChainHash is deterministic')
// Same inputs → same hash

test('computeChainHash changes when inputs change')
// Different attestation set → different hash

// --- Notary Cross-Reference ---

test('runNotaryCrossReference with full mesh returns certificate')
// All 3 devices have mutual attestations → passed=true, certificateId non-null

test('runNotaryCrossReference with partial mesh marks missing pairs')
// Device C out of range → passed=false, mutualPairs=1, totalPairs=3

test('runNotaryCrossReference logs step-by-step verification')
// logs array has entries for: signature check, distance, chain consistency, certificate

// --- Edge Cases ---

test('same device cannot create two different distances')
// If device tries to claim two different distances, detector catches it

test('expired heartbeat marks attestation as coerced')
// Device with stale heartbeat → flagged in consensus
```

---

## 3. UI Components to Add to `demo/index.html`

### 3.1 Round Stepper

Above the two device cards, add a horizontal 4-step progress indicator:

```html
<div class="round-stepper" id="round-stepper">
  <div class="step active" data-round="1">
    <span class="step-number">1</span>
    <span class="step-label">A Broadcasts</span>
  </div>
  <div class="step-connector"></div>
  <div class="step" data-round="2">
    <span class="step-number">2</span>
    <span class="step-label">B Responds</span>
  </div>
  <div class="step-connector"></div>
  <div class="step" data-round="3">
    <span class="step-number">3</span>
    <span class="step-label">Acknowledgment</span>
  </div>
  <div class="step-connector"></div>
  <div class="step" data-round="4">
    <span class="step-number">4</span>
    <span class="step-label">Chain Sync</span>
  </div>
</div>
```

States: `pending` (gray), `active` (pulsing cyan), `completed` (green checkmark).

### 3.2 Device C Card

Add a third device card between A and B, using the same `mesh-device` CSS class. Contains:
- Status indicator
- Ephemeral key display
- Attestation log (scrolling, monospace)

### 3.3 Attestation Log (inside each device card)

```html
<div class="attestation-log" id="attestation-log-A">
  <div class="log-entry"><span class="log-time">[T+0s]</span> Broadcast: pk_A_7X9V1</div>
  <div class="log-entry"><span class="log-time">[T+3s]</span> Heard: pk_B_9Y2M4 (RSSI -62dBm)</div>
</div>
```

Each entry has: timestamp, icon/emoji, message. New entries append at bottom with animation.

### 3.4 Chain Hash Visualization

Below the 3 device cards, show parallel chains:

```html
<div class="chain-visualization">
  <div class="chain-row">
    <span class="chain-device-label">A:</span>
    <div class="chain-blocks" id="chain-A">
      <!-- dynamically add chain-block divs -->
    </div>
  </div>
  <div class="chain-row">
    <span class="chain-device-label">B:</span>
    <div class="chain-blocks" id="chain-B"></div>
  </div>
  <div class="chain-row">
    <span class="chain-device-label">C:</span>
    <div class="chain-blocks" id="chain-C"></div>
  </div>
</div>
```

Each chain block is a small rounded rectangle with the first 6 chars of the hash, connected by a horizontal line.

### 3.5 Topology Map

After round 4, show a graph with 3 nodes and edges:

```html
<div class="topology-map" id="topology-map" style="display:none">
  <svg viewBox="0 0 400 200">
    <!-- Position A at (100,100), B at (300,100), C at (200,40) -->
    <!-- Draw edges with distance labels -->
  </svg>
  <div class="topology-legend">
    B↔C: 5.1m ✓ | A↔C: 3.8m ✓ | A↔B: 4.2m ✓
  </div>
</div>
```

Edges: solid green if mutual attestation exists, dashed red if one-way only.

### 3.6 Enhanced Notary Console

Replace the simple mesh-server-result div with a step-by-step verification console:

```html
<div class="notary-verification" id="notary-verification">
  <div class="notary-step">Step 1/5: Verify bundle signatures</div>
  <div class="notary-step">Step 2/5: Check pairwise attestations</div>
  <div class="notary-step">Step 3/5: Compute physical distances</div>
  <div class="notary-step">Step 4/5: Verify chain consistency</div>
  <div class="notary-step">Step 5/5: Issue MNR Certificate</div>
</div>
```

Each step highlights as it runs, then shows ✓ or ✗.

---

## 4. Changes to `demo/styles.css`

Add styles for:

```css
/* Round stepper */
.round-stepper { display: flex; align-items: center; justify-content: center; margin: 1rem 0; }
.step { display: flex; flex-direction: column; align-items: center; padding: 0.5rem 1rem; border-radius: 8px; transition: all 0.3s; }
.step.active { background: rgba(0,210,255,0.1); border-color: var(--primary-color); }
.step.completed { background: rgba(0,230,118,0.1); border-color: var(--pass-color); }
.step-connector { width: 40px; height: 2px; background: var(--glass-border); }

/* Attestation log */
.attestation-log { font-family: monospace; font-size: 0.7rem; background: rgba(0,0,0,0.3); border-radius: 6px; padding: 0.5rem; max-height: 120px; overflow-y: auto; }
.log-entry { padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
.log-time { color: var(--text-muted); margin-right: 0.5rem; }

/* Chain visualization */
.chain-visualization { background: rgba(0,0,0,0.3); border-radius: 8px; padding: 1rem; margin-top: 1rem; }
.chain-row { display: flex; align-items: center; margin: 0.25rem 0; }
.chain-device-label { width: 20px; font-weight: 700; font-size: 0.75rem; color: var(--primary-color); }
.chain-block { display: inline-block; padding: 2px 6px; border: 1px solid var(--glass-border); border-radius: 4px; font-size: 0.65rem; font-family: monospace; background: rgba(0,210,255,0.05); cursor: pointer; }
.chain-block:hover { background: rgba(0,210,255,0.15); }
.chain-arrow { color: var(--text-muted); font-size: 0.7rem; margin: 0 2px; }
.chain-crosslink { border-top: 2px dashed var(--warn-color); position: relative; }

/* Topology map */
.topology-map { background: rgba(0,0,0,0.3); border-radius: 8px; padding: 1rem; margin-top: 1rem; text-align: center; }
.topology-legend { font-size: 0.75rem; margin-top: 0.5rem; }

/* Notary verification steps */
.notary-verification { background: rgba(0,0,0,0.3); border-radius: 8px; padding: 1rem; margin-top: 1rem; }
.notary-step { padding: 0.5rem; border-left: 3px solid var(--glass-border); margin-bottom: 0.5rem; padding-left: 1rem; font-size: 0.8rem; }
.notary-step.pass { border-left-color: var(--pass-color); }
.notary-step.fail { border-left-color: var(--fail-color); }
.notary-step.active { border-left-color: var(--primary-color); animation: pulse 1s infinite alternate; }
```

---

## 5. Changes to `demo/app.js`

### 5.1 Remove old single-round code

Delete (or comment out) the existing mesh witness simulation — everything in section `// 5. P0b: Mesh Witness` from the `runMeshTest()` function and its helper functions.

### 5.2 Import the protocol module

```javascript
import { createMeshState, createBeacon, receiveBeacon, createAck, receiveAck, runNotaryCrossReference, computeRoundTripDistance } from './mesh-protocol.js';
```

### 5.3 New mesh state variable

```javascript
let currentMeshState = null;
let protocolTimer = null;
let simMeshId = 'mesh-' + Date.now().toString(36);
```

### 5.4 New "Run 4-Round MNR Protocol" button

Replace the old `mesh-test-btn` handler. The new handler runs all 4 rounds sequentially with delays:

```javascript
async function runProtocol() {
  currentMeshState = createMeshState(simMeshId);
  updateAllDeviceUI(currentMeshState); // Reset UI
  
  // Round 1: A broadcasts → B and C hear
  updateRoundStepper(1, 'active');
  await animateWave('A', 'B', 500);
  await animateWave('A', 'C', 500);
  const beaconA = createBeacon(currentMeshState.devices.A, getSimTime());
  receiveBeacon(currentMeshState.devices.B, currentMeshState.devices.A.pk, beaconA, getSimTime());
  receiveBeacon(currentMeshState.devices.C, currentMeshState.devices.A.pk, beaconA, getSimTime());
  updateDeviceUI('A'); updateDeviceUI('B'); updateDeviceUI('C');
  updateAttestationLog('A', 'Broadcast: pk_A');
  updateAttestationLog('B', 'Heard: pk_A (RSSI -62dBm)');
  updateAttestationLog('C', 'Heard: pk_A (RSSI -65dBm)');
  updateChainVisualization(currentMeshState);
  updateRoundStepper(1, 'completed');
  
  // Round 2: B broadcasts → A and C hear (same pattern)
  await delay(800);
  updateRoundStepper(2, 'active');
  // ... B broadcasts, A receives, C receives
  
  // Round 3: A sends ack → B and C receive
  await delay(800);
  updateRoundStepper(3, 'active');
  // ... A creates ack for B and C, B receives, C receives
  
  // Round 4: All devices broadcast chain hashes
  await delay(800);
  updateRoundStepper(4, 'active');
  // ... each device broadcasts chain hash, others cross-link
  
  // Notary cross-reference
  await delay(1000);
  const report = runNotaryCrossReference(currentMeshState);
  showNotaryVerification(report);
  showTopologyMap(currentMeshState, report);
  
  currentMeshState.completed = true;
  updateRoundStepper(4, 'completed');
}
```

### 5.5 Helper functions

```javascript
function updateRoundStepper(round, state) { /* 'active'|'completed'|'pending' */ }
function updateDeviceUI(deviceId) { /* Update key display, status indicator */ }
function updateAttestationLog(deviceId, message) { /* Append a line */ }
function updateChainVisualization(state) { /* Rebuild chain blocks */ }
function showNotaryVerification(report) { /* Step-by-step with delays */ }
function showTopologyMap(state, report) { /* SVG edges + legend */ }
function getSimTime() { /* Returns a simulated clock value */ }
function simulateAcousticDelay() { /* Returns a random delay between 0.3-0.8s for realism */ }
function animateWave(fromId, toId, duration) { /* CSS animation on the wave between devices */ }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
```

---

## 6. Implementation Order

| Step | What | Files | Estimated time |
|------|------|-------|----------------|
| 1 | Write pure functions in `demo/mesh-protocol.js` (NO DOM) | `mesh-protocol.js` (new) | 2h |
| 2 | Write `tests/mesh-protocol.test.js` — all test cases | `mesh-protocol.test.js` (new) | 1.5h |
| 3 | Run tests RED → implement → GREEN | Both | 1h |
| 4 | Add HTML for Device C, round stepper, attestation logs, chain visualization, topology map, notary console | `index.html` | 1h |
| 5 | Add CSS for all new components | `styles.css` | 1h |
| 6 | Replace old mesh logic in `app.js` with new 4-round protocol | `app.js` | 3h |
| 7 | Wire up all UI updates (animateWave, visual timers, log streams) | `app.js` | 2h |
| 8 | Integration test: run all rounds, verify visual output | manual | 1h |
| 9 | Run existing test suite (make sure nothing broke) | all | 30m |

**Total: ~13h (2-3 focused sessions)**

---

## 7. Verification Checklist

After implementation, verify:

- [ ] Clicking "Run 4-Round MNR Protocol" starts the round stepper at Round 1
- [ ] Each round shows a wave animation between devices
- [ ] After Round 1: B and C show "Heard: A" in their attestation logs
- [ ] After Round 2: A and C show "Heard: B" in their logs
- [ ] After Round 3: devices show "Acknowledged by X" in logs
- [ ] After Round 4: chain visualization shows 4 blocks per device with cross-links
- [ ] Notary console shows 5/5 steps with green checkmarks
- [ ] Topology map shows 3 nodes with edges and distance labels
- [ ] MNR Certificate is displayed with the expected data
- [ ] All existing tests pass (Python + JS)
- [ ] "Normal Witnessing" scenario works without heartbeat bars
- [ ] "Coerced Witness" scenario shows heartbeat expiry and flagged attestation
