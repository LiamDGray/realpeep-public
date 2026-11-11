# Mesh MNR Protocol — Demo Implementation Plan

*Extending the Mesh Witness card to show multi-round attestation exchange, chain hashing, and notary cross-reference.*

---

## Current State

The Mesh Witness card shows a single round: Device A broadcasts → Device B captures → both upload → MNR certificate. This is a high-level summary but skips all the protocol detail that makes mutual non-repudiation work.

## Target State

The Mesh Witness card will show a **4-round asynchronous exchange** with full data visualization:

```
Round 1: A broadcasts beacon    → B receives and stores attestation
Round 2: B broadcasts beacon    → A receives and stores attestation  
Round 3: A broadcasts signed ack → B receives and cross-links
Round 4: Both broadcast chain hashes → both update, notary cross-references
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `demo/index.html` | Add multi-round display, attestation log, chain visualization, topology map, third device |
| `demo/styles.css` | Add styles for chain visualization, attestation log, topology map, step indicators |
| `demo/app.js` | Replace single-round simulation with 4-round async protocol, add Device C, add notary cross-reference display |
| `demo/duress-core.js` | Add pure functions: round-trip distance calculation, chain hash computation, bloom filter simulation |

---

## HTML Changes

### Multi-Round Step Indicator

Replace the single "Simulate MNR Rollup" button with a step-by-step indicator showing which round is active:

```
┌──────────────────────────────────────────┐
│ [1/4] 📡 A Broadcasts   [active]         │
│ [2/4] 📡 B Responds      [pending]       │
│ [3/4] 🔄 Acknowledgment  [pending]       │
│ [4/4] ⛓️ Chain Sync       [pending]       │
│                                           │
│ Running all 4 rounds sequentially...      │
└──────────────────────────────────────────┘
```

Or a single "Run 4-Round MNR Protocol" button that auto-advances with visual feedback between rounds.

### Attestation Log Panel (New)

Below each device, show a scrolling log of attestations:

```
┌─ Device A ───────────────────────────────┐
│ Status: Broadcasting...                   │
│ Key: PK_A_7X9V1                          │
│                                           │
│ ┌─ Attestation Log ──────────────────┐   │
│ │ [T+0s] Broadcast: pk_A            │   │
│ │ [T+3s] Heard: pk_B (RSSI -62)     │   │
│ │ [T+6s] Received ack from pk_B     │   │
│ │ [T+9s] Chain H2 includes pk_B     │   │
│ └────────────────────────────────────┘   │
│                                           │
│ Chain: [H0]──[H1]──[H2]──[H3]            │
└──────────────────────────────────────────┘
```

### Chain Visualization (New)

A horizontal chain of blocks below the devices:

```
Device A:  ═══[H0]════[H1]════[H2]════[H3]═══
                  │        │
            Attest B   Ack from B
                  
Device B:  ═══[H0]════[H1]════[H2]════[H3]═══
                  │        │
            Attest A   Ack from A
```

When a chain hash includes a cross-reference to another device, draw a connecting line between the two chains.

### Topology Map (New, Below Devices)

After all rounds complete, show a topology graph:

```
         A ──────── B
          ╲  4.2m  ╱
           ╲  3.8m ╱
            ╲     ╱
              C
              
    Edges: A↔B ✓ (mutual, 4.2m)
           A↔C ✓ (mutual, 3.8m)
           B↔C ✓ (mutual, 5.1m)
           
    Mutual Non-Repudiation: CONFIRMED
    All 3 devices were physically co-located.
```

### Third Device (New)

Add Device C between A and B in the physical space area:

```
[Device A]  ~~~ ultrasonic space ~~~  [Device B]
                    [Device C]
```

Device C has its own attestation log, chain visualization, and heartbeat/detain controls.

### Notary Cross-Reference Console (Enhanced)

The server result area becomes a **step-by-step verification console** showing each check:

```
> Receiving bundles from A, B, C...
> Running MNR cross-reference...

  Step 1/5: Verify bundle signatures
    ✓ A's bundle signed by pk_A
    ✓ B's bundle signed by pk_B
    ✓ C's bundle signed by pk_C

  Step 2/5: Check pairwise attestations
    ✓ A↔B: B heard A at T+3s, A heard B at T+6s
    ✓ A↔C: C heard A at T+4s, A heard C at T+7s
    ✓ B↔C: C heard B at T+5s, B heard C at T+8s

  Step 3/5: Compute physical distances
    ✓ A↔B: 4.2m (plausible for acoustic)
    ✓ A↔C: 3.8m (plausible)
    ✓ B↔C: 5.1m (plausible)

  Step 4/5: Verify chain consistency
    ✓ A's chain H1 includes B → A committed to seeing B
    ✓ B's chain H1 includes A → B committed to seeing A
    ✓ A's chain H2 includes C → A committed to seeing C
    ✓ C's chain H1 includes A → C committed to seeing A
    ✓ All cross-links verified: 6/6

  Step 5/5: Issue MNR Certificate
    ┌────────────────────────────────────┐
    │ [CERTIFICATE OF CO-LOCATION]       │
    │                                    │
    │ Devices: 3 (A, B, C)              │
    │ Location confidence: 97.3%         │
    │ Max pairwise distance: 5.1m        │
    │ Mutual attestations: 3/3 pairs     │
    │ Chain depth: 4 per device          │
    │                                    │
    │ ISSUED: 2026-06-26T14:32:07Z       │
    │ SIGNED: notary.sk                  │
    └────────────────────────────────────┘
```

---

## JavaScript Data Model

The 4-round protocol is simulated as a series of async steps with delays. Here's the data flow:

```javascript
// State for the mesh protocol
const meshState = {
    round: 0,           // 0-4
    devices: {
        A: { pk: null, chain: [], attestations: {}, acks: [], heard: [] },
        B: { pk: null, chain: [], attestations: {}, acks: [], heard: [] },
        C: { pk: null, chain: [], attestations: {}, acks: [], heard: [] }
    },
    distances: {},       // 'A-B': 4.2
    roundTripDelays: {}, // 'A-B': 0.012
    completed: false
};
```

Each round:

```javascript
async function runRound1() {
    // A broadcasts beacon
    const beaconA = {
        type: 'beacon', pk: meshState.devices.A.pk,
        timestamp: getSimTime(), mesh_id: currentMeshId,
        chain_hash: getChainHash('A'),
        signature: 'sig_A'
    };
    // B receives with propagation delay
    await simulateAcousticDelay(0.5); // 0.5s propagation
    receiveBeacon('B', 'A', beaconA, getSimTime());
    // C also receives
    await simulateAcousticDelay(0.3);
    receiveBeacon('C', 'A', beaconA, getSimTime());
    updateUI_Round1();
}

async function runRound2() {
    // B broadcasts (B's scheduled slot)
    const beaconB = { /* B's data + attestation of A */ };
    await simulateAcousticDelay(0.4);
    receiveBeacon('A', 'B', beaconB, getSimTime());
    // C also receives
    await simulateAcousticDelay(0.2);
    receiveBeacon('C', 'B', beaconB, getSimTime());
    updateUI_Round2();
}

async function runRound3() {
    // A sends signed acknowledgment of B and C
    const ackA = {
        type: 'ack',
        pk_sender: 'A',
        acks: [
            { target: 'B', beacon_hash: hash(meshState.devices.B.lastBeacon) },
            { target: 'C', beacon_hash: hash(meshState.devices.C.lastBeacon) }
        ],
        timestamp: getSimTime(),
        signature: 'sig_A_ack'
    };
    await simulateAcousticDelay(0.5);
    receiveAck('B', 'A', ackA);
    await simulateAcousticDelay(0.3);
    receiveAck('C', 'A', ackA);
    updateUI_Round3();
}

async function runRound4() {
    // All devices broadcast their chain hashes
    for (const dev of ['A', 'B', 'C']) {
        updateChainHash(dev);
        broadcastChain(dev);
    }
    updateUI_Round4();
    // Notary cross-references
    await runNotaryCrossReference();
}
```

Each receive function logs to the device's attestation log and updates the chain.

---

## CSS Additions Needed

| Component | Key Styles |
|-----------|-----------|
| **Step indicator** | Horizontal stepper with active/completed/pending states, connecting lines between steps |
| **Attestation log** | Monospace font, scrolling container, colored timestamps, alternating row backgrounds |
| **Chain visualization** | Horizontal blocks with hashes, connecting lines, cross-links between parallel chains |
| **Topology map** | Graph with nodes positioned absolutely, SVG edges with distance labels |
| **Notary console** | Step-by-step verification, green checkmarks, red X marks, certificate block with border |

---

## Files to Create

| File | Contents |
|------|----------|
| `demo/mesh-mnr-plan.md` | This document |
| `demo/duress-core.js` | Add: `computeRoundTripDistance()`, `computeChainHash()`, `simulateBloomFilter()` |

---

## Implementation Order

| Step | What | Why |
|------|------|-----|
| 1 | Add pure functions to `duress-core.js`: distance computation, chain hash, bloom filter | Testable in Node before browser |
| 2 | Write Jest tests for the pure functions | TDD |
| 3 | Update HTML: add Device C, attestation logs, chain visualization, topology map | Structure before logic |
| 4 | Update CSS: all new component styles | Visual before behavioral |
| 5 | Update app.js: replace single-round with 4-round protocol | Core logic |
| 6 | Add notary cross-reference console | Verifiability |
| 7 | Test: run all rounds, verify attestations, check chain consistency | Integration |

---

## Verifying the MNR Protocol (Test Cases)

After implementing, the demo should pass these tests:

1. **Three devices, all in range** → all mutual attestations confirmed → full MNR certificate
2. **Device C out of range** (simulated) → A↔B mutual, C isolated → partial MNR certificate
3. **Chain tampering detection** → if one device's chain hash is modified, the notary detects inconsistency
4. **Duplicate attestation prevention** → the same device can't claim two different distances
5. **Replay attack prevention** → old attestations can't be reused with a different mesh_id
