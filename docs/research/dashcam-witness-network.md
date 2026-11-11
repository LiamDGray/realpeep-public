# Dash Cam Witness Network: RealPeep for Traffic Incidents

**Core idea:** Every dash cam runs RealPeep's lightweight mesh protocol. After an incident, witnesses can be discovered and their footage retrieved — without knowing each other, without exchanging contact info, and without revealing witness identities to the offending driver.

---

## How It Works

### During the Incident (30-second mesh session)

```\nTwo vehicles approach intersection.\nBoth dash cams are running RealPeep (BLE-only mode).\n\nT-10s:  Vehicle A and B enter BLE range (~50-100m).\n        BLE mesh handshake: exchange public keys, establish session nonce.\n        Both begin recording: video + GPS + IMU + BLE beacon log.\n\nT-5s:   Each vehicle's camera captures the other's vehicle.\n        Visual data: license plate, vehicle model, paint color, damage pattern.\n\nT=0s:   Collision. Both cameras capture the impact frame.\n        Frame hash chain locks the moment. OpenTimestamps queued.\n\nT+30s:  Vehicles separate. BLE mesh session closes.\n        Each device has: {peer_pubkeys, BLE_beacon_log, video_segments, \n                         GPS_trace, IMU_data, OTS_proof_queue}\n```

### Immediately After (upload phase)

Each dash cam independently:

1. Encrypts its full evidence package with its own key
2. Uploads to cloud storage (S3, IPFS, whatever)
3. Anchors the hash to Bitcoin via OpenTimestamps
4. Registers with the directory service: {GPS_bbox ± 50m, time_window ± 30s, device_pubkey_hash}

**No witness identity is revealed.** The directory only knows: "Some device with hash `0x7A3F...` was at location (X,Y) at time T."

### Witness Discovery (later)

```
You, after the collision:
  1. "I was at (X,Y) at time T. Who else was there?"
  2. Directory returns: { device_pubkey_hashes: [0x7A3F..., 0xC19D..., ...], count: 4 }
  3. You generate a PSI query from your mesh session log:
     Input: {pubkeys_A, pubkeys_B, pubkeys_C, ...}  ← the devices your phone heard
     Execute PSI with directory
     Output: {0x7A3F..., 0xC19D...}  ← the devices your phone heard AND the directory registered
  4. You now have the public keys of the witnesses.
  5. You can send them an anonymous message via the directory:
     "I was in the same incident. Please share your encrypted footage."
  6. Each witness can respond: yes (send decryption key), no, or yes-with-bounty.
```

**The key property:** The offending driver also had a dash cam and can query the directory. But they only learn:
- How many witnesses registered
- The *hashes* of witnesses' public keys (not their identities)
- The witnesses' responses are mediated by the directory

The witnesses remain anonymous to the offending driver unless they choose to reveal themselves (e.g., in court).

---

## The Bad Driver / Bounty Model

This is where it gets interesting.

### Pattern Detection

The directory accumulates evidence over time:

```
Bad Driver X:
  Incident 1:  2026-03-15 14:30, 3 witnesses registered
  Incident 2:  2026-04-02 09:15, 2 witnesses registered  
  Incident 3:  2026-04-20 18:45, 5 witnesses registered
  → Same license plate detected across all 3 incidents
  → Pattern: habitual dangerous driving
```

### Threshold-Triggered Alert

```
Algorithm detects: ≥ 3 incidents, same vehicle, ≥ 2 witnesses each.
                   
Action: Notify all witnesses from all incidents:
  "A pattern has been detected involving vehicle [partial VIN hash].
   Would you like to release your footage to the insurance company 
   of [offending driver] for rate adjustment proceedings?
   
   If yes, you may be eligible for a bounty of [amount TBD].
   Your identity will remain anonymous to the offending driver.
   "
```

### Witness Consent via Threshold Cryptography

Each witness's footage is encrypted with their key. To release it, the protocol requires:

```
Release condition: 
  Witness count ≥ 3  
  AND
  Each witness signs: "I consent to release footage from incident #N"
  AND
  Judicial order (optional, for legal weight)

When condition met:
  Each witness sends their decryption key to the insurance company
  Insurance company decrypts the collective evidence
  Rates are adjusted based on the evidence
  Bounty is distributed to witnesses (via Lightning/blinded addresses)
```

**No single witness can be coerced into revealing.** The threshold (3+ witnesses) means the offending driver would need to coerce all of them — and they don't know who the witnesses are.

### Bounty Distribution

```
Bounty pool: 
  Part 1: From the offending driver's rate increase (deterrence)
  Part 2: From the insurance company (incentive for witnesses to participate)
  
Distribution:
  Proportional to evidence quality (more footage = larger share)
  Proportional to witness count (more witnesses = each gets less, but 
    collective evidence is stronger so total pool is larger)
  Anonymized via blind signatures or Lightning trampoline payments
  
Economic model:
  Witness: $50–$200 per incident for 5 minutes of upload time
  Offending driver: rate increase of $500–$2000/year  
  Insurance company: saves on investigation costs, has better risk models
  Society: safer driving through collective accountability
```

---

## Key Differences from the Protest Model

| Dimension | Protest witness | Dash cam witness |
|-----------|----------------|-----------------|
| Mesh formation | Pre-existing social trust (friends) | Ad-hoc (strangers at same intersection) |
| Duration | Hours (entire protest) | Seconds (passing each other) |
| Trust anchor | Friend-of-friend vouching | Co-incident GPS + time + visual evidence |
| Discovery | PSI over contact lists | PSI over mesh session logs + directory query |
| Incentive | Justice / accountability | Bounty / insurance rate fairness |
| Anonymity | From authorities | From offending driver |
| Evidence release | Court order / threshold key | Witness consent + threshold + optional court order |

---

## Technical Requirements

### Dash Cam Hardware

| Component | Requirement | Notes |
|-----------|-------------|-------|
| Camera | 1080p+ H.265 | Most dash cams already meet this |
| GPS | ±5m accuracy | Required for location-bound witness discovery |
| IMU (accel + gyro) | For impact detection and camera pose | Most phones have this; dash cams less common |
| BLE | Bluetooth 4.0+ | Ad-hoc mesh discovery. Acoustic CDMA not needed for civilian traffic (no jamming threat) |
| Network | Cellular (4G/5G) | For immediate upload after incident |
| Storage | Encrypted local buffer | In case network is unavailable |

### Phone-Based Dash Cam App (Minimum Viable)

Most people already have a phone with all the sensors. A dash cam app would be the quickest path to deployment:

```
RealPeep DashCam app:
  - Runs in background while driving
  - Records loop video (5-min encrypted buffer)
  - Listens for BLE beacons from nearby RealPeep devices
  - On impact (IMU + audio analysis): 
    - Lock current buffer (don't overwrite)
    - Upload + timestamp immediately
    - Register with directory
  - On manual trigger (button press):
    - Same as impact
    - Useful for "I saw a bad driver" situations
  - Witness discovery UI:
    - "Find witnesses from [time] [location]"
    - "N witnesses found. Request footage?"
    - "Bounty offered: $X"
```

### Dedicated Dash Cam (Integrated)

A dedicated dash cam with RealPeep built in would have:

```
- ESP32 or similar (BLE + WiFi + audio I/O)
- Camera module (OV2640 or better)
- GPS module (+ accelerometer)
- Cellular module (or phone tethering)
- $30–$50 BOM cost above a basic dash cam
```

---

## Novelty Assessment

Searching the literature (see `research/literature-synthesis.md`):

- **PSI-based witness discovery for traffic incidents** — not found. The closest work is PSI for contact discovery in messaging apps (Pinkas 2014, PEPSI 2023), but nobody has applied it to ad-hoc traffic witness networks.

- **Anonymized bounty system for traffic evidence** — not found. Insurance companies use telematics (direct monitoring of their policyholders), but there's no system for third-party witness evidence with privacy.

- **Threshold-decryption traffic evidence release** — not found. Threshold crypto is used for key management; applying it to witness consent is novel.

| **BLE-only mesh for traffic witness discovery** — not found. BLE mesh for ad-hoc vehicle co-presence logging is novel; combining it with PSI-based directory discovery and threshold bounty release is a new application. (Acoustic CDMA is reserved for the protest/atrocity scenario where BLE jamming is a threat.)

**Potential patent/IP concerns:** None identified in the literature. The component technologies (PSI, threshold crypto, OpenTimestamps) are all standard building blocks. The combination for traffic witness discovery appears to be a novel application.

---

## What Would Need to Be Built

### New RealPeep Modules

| Module | Purpose | Priority |
|--------|---------|----------|
| `directory_service.py` | Location-and-time bounded device registry | High — core infrastructure |
| `psi_discovery.py` | Private set intersection for witness matching | High — core protocol |
| `bounty_contract.py` | Smart contract for bounty distribution | Medium — economic layer |
| `threshold_release.py` | Multi-witness consent + decryption release | Medium — trust layer |
| `dashcam_recorder.py` | Loop recording with impact detection | Low — app-level, not protocol |

### Existing RealPeep Modules (Reusable)

| Module | How it maps to dash cams |
|--------|-------------------------|
| `cdma_mesh.py` | Acoustic ranging (protest/atrocity mode only; not used in civilian traffic) |
| `mnr_rollup.py` | Mesh notary for traffic incident attestations |
| `duress_keys.py` | Graduated consent for evidence release |
| `blockchain_anchor.py` | OTS timestamping for immediate upload |
| `frameHashChain.js` | Dash cam video integrity |
| `zk_wrapper.py` | Identity scrubbing for witness privacy |

### Open Questions

1. **Acoustic ranging in traffic noise** — **Resolved: not applicable.** Acoustic CDMA is reserved for protest/atrocity scenarios (BLE jamming threat). Civilian traffic uses BLE-only mesh discovery. See `research/timestamping-security.md` and `attack-model.md` for the protest-mode threat model.

2. **GPS accuracy for witness matching** — 5m GPS is usually fine for "which intersection." But GPS-denied areas (tunnels, urban canyons) need fallback.

3. **Adoption threshold** — Witness discovery only works if enough dash cams run RealPeep. The phone app approach (zero hardware cost) solves this for early adoption.

4. **Legal framework** — Does timestamped+encrypted footage count as evidence? What about the bounty model — is it legal to pay witnesses? (Reference: insurance anti-fraud bounties exist in many jurisdictions.)
