# Duress Protocol Demo Plan

**Target:** Enhance the existing web demo (`demo/index.html`, `demo/app.js`, `demo/styles.css`)
**Deployed at:** `realpeep.pages.dev/demo/`

---

## Demo Strategy

The existing demo already has six interactive modules. The duress protocol should be demonstrated by **enhancing existing cards** rather than adding standalone new ones — this reinforces that duress is a stealth layer within existing protocol data, not a separate system.

**Three visual principles:**
1. **Captor's View** — what an adversary sees (everything looks normal)
2. **Notary's View** — what the trusted server secretly detects (invisible to captor)
3. **Toggle to switch between them** — letting the user play both roles

---

## Enhancement 1: Duress Key Derivation (Scenarios A & D)

**Target:** ZK Pipeline card (currently simulates Secure Enclave → ZK Scrubber → TCP → Server)

### Current State
The ZK Pipeline has a TCP latency slider. Pressing "Transmit Liveness Proof" runs a scripted animation:
- Enclave generates signature (shows device ID in red)
- ZK Scrubber verifies and scrubs (shows ephemeral key)
- TCP transmits with simulated latency
- Server receives and displays

### Enhancement: Dual Passphrase Input

Add a **passphrase entry** section above the TCP slider:

```
┌──────────────────────────────────────┐
│  Passphrase: [________________] (unlock) │
│  ┌────────────────────────────┐      │
│  │ Passphrase Strength: ████  │      │
│  │ (You have 2 keys stored)  │      │
│  └────────────────────────────┘      │
│  □ "Show me what the captor sees"    │
│  □ "Show me what the notary sees"    │
└──────────────────────────────────────┘
```

**Behavior:**
1. A passphrase input field. Two pre-loaded passphrases:
   - `correct-horse-battery-staple` → normal key
   - `correct-horse-duress-flag` → duress key
2. Both unlock the same UI, both produce valid proofs
3. A **toggle button** switches between:
   - **"Captor's View"** — shows the proof, shows "VERIFIED ✓" for both passphrases, no visible difference
   - **"Notary's View"** — shows the same proof, but highlights the hidden predicate match: `⚠ DURESS FLAG DETECTED (silent alert triggered)`

### Visual Design

```
     NORMAL MODE                          DURESS MODE
┌──────────────────────┐           ┌──────────────────────┐
│ Passphrase: correct- │           │ Passphrase: correct- │
│ horse-battery-staple │           │ horse-duress-flag   │
│                      │           │                      │
│ [CAPTOR VIEW] ✓      │           │ [CAPTOR VIEW] ✓      │
│                      │           │                      │
│ Enclave → Scrubber   │           │ Enclave → Scrubber   │
│ → TCP → Server       │           │ → TCP → Server       │
│                      │           │                      │
│ Status: VERIFIED ✓   │           │ Status: VERIFIED ✓   │
│ (looks identical!)   │           │ (looks identical!)   │
└──────────────────────┘           └──────────────────────┘

Click "Notary's View" on duress proof:

┌──────────────────────────────────┐
│ Passphrase: correct-horse-duress │
│                                  │
│ [NOTARY VIEW] 🔍                 │
│                                  │
│ Checking predicate:              │
│ SHA256(notary_secret || nonce)   │
│ → DUress marker found!          │
│                                  │
│ Status: ⚠ DURESS FLAG ACTIVE    │
│ (Silent alert dispatched,        │
│  no visible response to captor)  │
└──────────────────────────────────┘
```

### Implementation Notes

- No new modules needed — extend the existing ZK Pipeline card
- The "notary view" is purely visual (client-side simulation), but demonstrates the concept
- The passphrase-to-key derivation is simulated (no actual Circom keygen in the browser)
- Use CSS transitions to toggle between captor/notary overlays on the same pipeline visualization

### Scenario Mapping
| Scenario | How Demo Covers It |
|----------|-------------------|
| **A: Rubber-Hose Arrest** | User gives duress passphrase. Captor view shows VERIFIED. Only notary sees flag. |
| **D: Family Hostage** | Same mechanism — passphrase is the trigger. Demo can add context text explaining. |

---

## Enhancement 2: Steganographic Nonce Inspection (Scenario B)

**Target:** SPCI card (already has duress toggle)

### Current State
The SPCI card has a "Rubber Hose Duress Mode (Fake Blink)" toggle. When enabled, running the 120Hz test shows a `DURESS` badge with warning styling, and says "UI APPEARS TO PASS. SILENT DISTRESS FLAG EMBEDDED IN PAYLOAD."

### Enhancement: Deep Inspection Panel

Add an **"Inspect Network Packet"** expandable panel below the result box:

```
[Inspect Network Packet ▼]

Captor View:
  Nonce: 0x7a3f...b2c1     (random-looking)
  Payload Hash: 0x... 
  Ephemeral Key: ephem_pk_...
  ─────────────────────────────────
  → All fields look normal ✓

Notary View (decrypt with secret key):
  Nonce: 0x7a3f...b2c1
  Predicate check: SHA256(notary_secret || nonce)
  = 0x0000... (starts with 16 zero bits = duress marker!)
  ─────────────────────────────────
  → ⚠ DURESS DETECTED
```

### Visual Design

The SPCI card already runs a visual challenge-response sequence (20-step flasher + canvas trace). After completion:

1. **Captor View (default):** Shows "PASSED - Correlation > 0.8, Latency 0ms"
2. **Toggle to Notary View:** Expands to show the raw packet with the nonce highlighted
3. **Bit-level visualization:** Show the first 16 bits of the hash — in normal mode they're `10110101...` (random); in duress mode they're `0000000000000000` (all zeros)

### Implementation Notes

- The SPCI duress toggle already exists — this enhances what it reveals
- No actual cryptography needed in browser — simulate the hash output
- The nonce value can be tied to the duress toggle state

### Scenario Mapping
| Scenario | How Demo Covers It |
|----------|-------------------|
| **B: Checkpoint Inspection** | Captor sees the test executed, sees PASS. Inspector inspects the packet — all fields look random. Only the notary's key reveals the duress flag. |

---

## Enhancement 3: Heartbeat & Mesh Rollback (Scenario C)

**Target:** Mesh Witness card

### Current State
The Mesh Witness card runs a multi-phase simulation:
1. Phase 1: Device A broadcasts CDMA beacon, Device B captures it (offline)
2. Phase 2: Both devices reach internet, upload to notary
3. Phase 3: Retroactive MNR handshake → Certificate of Co-Location

### Enhancement: Heartbeat Deadline & Coercion Indicator

Add three elements:

**A) Heartbeat Timer**
```
Device A: [■■■■■■■■□□] Heartbeat: 8.2s remaining
Device B: [■■■■■■■■□□] Heartbeat: 8.2s remaining
```

A visible countdown bar beneath each device. The user can click "Refresh Heartbeat" or let it expire.

**B) Duress Toggle on the Witness**
```
Device A (Broadcaster): ▲ Normal  |  ▼ Detained (Stop Heartbeat)
Device B (Witness):     ▲ Normal  |  ▼ Detained (Coerced Upload)
```

When toggled to "Detained," the heartbeat stops counting. Once it expires:
- The notary's result changes from "MUTUAL NON-REPUDIATION ESTABLISHED" to:
  ```
  ⚠ DEVICE A HEARTBEAT EXPIRED
  → Device A's attestations are POTENTIALLY COERCED
  → Consensus: AUTHENTICITY FLAGGED — review required
  → Device B's attestation remains valid (heartbeat active)
  ```

**C) Rollback Consensus Visualization**

After expiry, add a "Consensus Grid" showing the mesh agreement:

```
┌─────────────────────────────────────┐
│          CONSENSUS STATUS           │
├─────────────────────────────────────┤
│ Device A (Expired)    │  🔴 FLAGGED │
│ Device B (Active)     │  🟢 VALID   │
│ Device C (Active)     │  🟢 VALID   │
│                                     │
│ Threshold: 2/3 active →             │
│ Overall: ⚠ Conditionally Verified  │
└─────────────────────────────────────┘
```

**D) Scenario Context Label**

Add a small label above the button that changes:
- "Simulate Normal Witnessing" (default)
- "Simulate Coerced Witness" (clickable to switch between scenarios)

### Implementation Notes

- The Mesh module already has the concept of offline → online transition
- Heartbeat is a simple `setInterval` countdown
- The existing `mesh-network-state` indicator already shows OFFLINE/OFFLINE status — leverage it
- The "Notary" output box (`.mesh-server-result`) is already HTML-capable — use it for the consensus grid

### Scenario Mapping
| Scenario | How Demo Covers It |
|----------|-------------------|
| **C: Coerced Mesh Witness** | Witness is "detained" → heartbeat expires → attestations flagged. Captor uploading a stale attestation can't prove it's real. |

---

## Enhancement 4: Duress Mode Hub / Scenario Selector

**Target:** Header area, above the dashboard grid

### Enhancement: Scenario Selector Strip

Add a horizontal row of scenario cards that the user clicks to focus the demo:

```
┌──────────────────────────────────────────────────────────────────┐
│  REALPEEP DURESS PROTOCOL — Interactive Simulation               │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────┐ │
│  │ Arrest   │ │ Checkpt  │ │ Witness  │ │ Hostage  │ │ Repud │ │
│  │ Rubber   │ │ Inspect  │ │ Coerced  │ │ Family   │ │ Deny  │ │
│  │ Hose     │ │ Device   │ │ Mesh     │ │ Coercion │ │ Proof │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └───────┘ │
│                                                                  │
│  Active: Arrest ▸ Use SPCI + ZK Pipeline below                  │
│  "You are detained. Captor demands passphrase."                 │
└──────────────────────────────────────────────────────────────────┘
```

Each scenario button:
1. Highlights which demo cards are relevant (greys out irrelevant ones)
2. Sets toggles/passphrases to the "duress" state automatically
3. Shows a brief narrative text at the top

### Scenario → Card Mapping

| Scenario | Primary Card | Secondary Card | Auto-Configures |
|----------|-------------|----------------|-----------------|
| **A: Rubber-Hose Arrest** | ZK Pipeline | SPCI | Sets duress passphrase in ZK card |
| **B: Checkpoint Inspection** | SPCI | ZK Pipeline | Enables duress toggle, shows packet inspector |
| **C: Coerced Witness** | Mesh Witness | — | Starts heartbeat timer, adds detain toggle |
| **D: Family Hostage** | ZK Pipeline | — | Same as A but with context text "your family is being held" |
| **E: Retroactive Repudiation** | ZK Pipeline (enhanced) | — | Adds "Claim Proof Was Forged" button |

### Implementation Notes

- Pure CSS + JS, no new modules
- Use `data-scenario` attributes on cards for show/hide logic
- Narrative text updates via a single DOM element
- Could use a carousel/slider approach instead of buttons if space is tight on mobile

---

## Enhancement 5: Retroactive Repudiation (Scenario E)

**Target:** New collapsible section in the ZK Pipeline card (or a new card)

### Enhancement: "Claim This Proof Was Forged" Button

After a proof is transmitted, add:

```
[✓] Proof transmitted successfully.
[✓] Public verification: VALID

[ Claim This Proof Was Forged — Designated-Verifier Deniability ]

User's confession to captor:
  "That proof was fake. The notary simulated it to frame me."

But the user CANNOT prove it was fake:
  → The notary CAN generate proofs that look identical to real ones
  → The captor CANNOT distinguish simulated from genuine
  → The user's "confession" is as unprovable as the notary's "simulation"

Result: The user survives interrogation. The proof's validity is 
cryptographically deniable.
```

### Visual Flow

```
1. User transmits proof (normal mode)
2. Captor says "I know this is fake, confess"
3. User clicks "Claim Forgery" button
4. Demo shows:
   - "The notary could have generated this proof"
   - "The captor cannot prove otherwise"
   - "Your confession has no cryptographic weight"
5. The captor is left with an unsatisfiable verification dilemma
```

### Implementation Notes

- This is the most abstract concept — needs careful UX to communicate the idea
- Use side-by-side comparison: real proof vs notary-simulated proof — both look identical
- Add a "Captor's Dilemma" text box explaining why the captor can't prove coercion

---

## Implementation Priority

| Priority | Enhancement | Effort | Impact | Why |
|----------|------------|--------|--------|-----|
| **P0** | 1 — Duress Key Derivation (ZK Pipeline) | Medium | High | Core mechanism, demonstrates Scenario A (the most relatable) |
| **P0** | 3 — Heartbeat & Mesh Rollback (Mesh) | Medium | High | Scenario C is technically the most novel aspect |
| **P1** | 2 — Steganographic Nonce Inspection (SPCI) | Small | Medium | Leverages existing duress toggle, shows bit-level proof |
| **P1** | 5 — Retroactive Repudiation | Small | Medium | Important for completeness, but abstract |
| **P2** | 4 — Scenario Selector Hub | Large | High | Best done last after all card enhancements exist |

---

## File Changes Summary

### `demo/index.html`
- Add passphrase input + view toggle to ZK Pipeline card
- Add heartbeat timer + detain toggle to Mesh Witness card
- Add nonce inspection panel to SPCI card
- Add scenario selector strip in header
- Add repudiation button + explanation to ZK Pipeline card

### `demo/app.js`
- `runZKPipeline()` — add passphrase-aware proof generation (dual path)
- Add duress key simulation (two passphrases → two key states)
- Add captor/notary view toggle handler
- Add heartbeat countdown logic + expiry detection
- Add `runMeshDuress()` variant for Scenario C
- Add nonce predicate check visualization
- Add `claimForgery()` handler for Scenario E
- Add scenario selector click handlers

### `demo/styles.css`
- Add styles for: passphrase input, dual-view overlay, heartbeat bars, detain toggle, consensus grid, nonce inspector, scenario selector, captor dilemma box

### New CSS classes needed:
- `.passphrase-input`, `.passphrase-strength`
- `.view-toggle`, `.captor-view`, `.notary-view`
- `.heartbeat-bar`, `.heartbeat-ok`, `.heartbeat-expired`
- `.detain-toggle`, `.detained`
- `.consensus-grid`, `.consensus-valid`, `.consensus-flagged`
- `.nonce-inspector`, `.bit-visualization`
- `.scenario-selector`, `.scenario-btn`, `.scenario-active`
- `.repudiation-panel`, `.dilemma-box`

---

## Demo Narrative Flow (Suggested Walkthrough)

The demo should guide visitors through scenarios in increasing sophistication:

### Step 1: The Setup
User sees the normal demo — CME, SPCI, HCSJ all showing PASS. Clicks "Transmit" on ZK Pipeline. A valid provenance proof is generated.

### Step 2: The Capture (Scenario A)
A modal/overlay appears: *"You are detained. The captor demands your passphrase."* The user types a passphrase. Both work. The user tries the duress one — the captor's view shows VERIFIED (looks identical). Switching to notary view reveals the hidden flag.

### Step 3: The Inspection (Scenario B)
User clicks to the SPCI card. Runs the 120Hz test with duress toggle on. Looks at the "Network Packet" — all fields seem random. Shows captor. Then reveals the nonce predicate.

### Step 4: The Witness (Scenario C)
User moves to the Mesh Witness card. Runs normal witnessing. Then flips to "Coerced Witness" — sees the heartbeat timer, watches it expire, sees the consensus network flag the attestation.

### Step 5: The Escape (Scenario E)
User clicks "I survived. Now I need to deny everything." The repudiation panel shows why the captor cannot prove any proof was genuinely generated.

---

## Files
- This document: `~/src/realpeep/demo/duress-demo-plan.md`
- Tracked in ROADMAP.md under Phase 3 implementation
