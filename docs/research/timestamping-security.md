# The Race: Timestamping as the Security Backstop

**Core insight:** Honest witnesses timestamp their footage *before an attacker can finish a spoof*. This creates an asymmetry no cryptographic protocol alone can match.

---

## The Timeline

```
T+0s    Event starts. Mesh session established. Phones recording.
        Acoustic CDMA + BLE handshake + Neopixel patterns all active.
        Session keys derived from physical proximity (in person).

T+5min  First phones upload encrypted footage + mesh attestations to cloud.
        OpenTimestamps anchors the hash to Bitcoin.
        → Proof: "this data existed at T+5min"
        → Footage is encrypted; no content leaked.

T+30min Attacker arrives at scene (or receives relayed data).
        Begins analyzing real acoustic signatures, Neopixel patterns, 
        camera positions needed to construct a coherent deepfake.

T+3hr   Attacker finishes: deepfake + spoofed mesh attestations + fake Neopixel.
        But: cannot backdate the blockchain timestamp.
        → Spoof is timestamped at T+3hr.
        → Honest footage timestamped at T+5min.
        → Verifier sees the gap. Honest footage wins.

Result: The honest witnesses had a ~25-minute window (T+5min minus T+30min)
where they could upload before the attacker could even begin constructing
a coherent spoof. This window exists because:
```

| | Honest witness | Attacker |
|---|---|---|
| **What they have** | Phone in hand, at the event | Must receive relayed data, analyze it |
| **Setup time** | None (already recording) | Must synchronize N relay channels |
| **Upload time** | Seconds (encrypt + send hash) | Can't start until they have all real data |
| **Timestamp** | Real, from event time | Would need to backdate — impossible |

**The fundamental asymmetry: the honest witness presses "upload" during the event. The attacker can't even start building their spoof until after the event, because the spoof must match the event's unique session key and multi-modal signatures.**

---

## Why Encryption Makes This Safe

The user specified: footage goes to the cloud encrypted by default, ASAP.

```
Phone encrypts:  video || mesh_attestations || neopixel_log || imu_data
                 ↓
          with:  session_public_key (established during mesh handshake)
                 ↓
          uploads: ciphertext → cloud storage
          uploads: hash(ciphertext) → OpenTimestamps → Bitcoin
```

**No content is leaked** during upload. The cloud provider sees only encrypted blobs. The timestamp proves existence without revealing content.

Decryption only happens later, when:
- A court orders it (with a signed judicial warrant — your "judge-signed rationale" model)
- Or the witness voluntarily releases the key
- Or a threshold of witnesses agree (your multi-witness trust model)

This is a **commit-then-reveal** protocol:

| Phase | Action | Security property |
|-------|--------|------------------|
| Commit | Upload encrypted blob + timestamp | Proof of existence at time T |
| Mesh | Simultaneous acoustic/Neopixel attestations | Proof of co-presence at location L |
| Reveal | Decrypt and verify | Content matches attestations |

The attacker can't backdate the commit. The attacker can't forge the mesh without the session key. The attacker can't precompute the session key because it's established via physical proximity (acoustic handshake during the event).

---

## The "YouTube for Cops" Model

Your police body camera proposal maps onto the same architecture:

```
Body camera footage → encrypted → cloud (immutable object store)
                          ↓
                    OpenTimestamps blockchain proof
                          ↓
                    Declassification trigger:
                      - Time-based (automatic after N days)
                      - Judicial order (signed warrant + rationale)
                      - Incident report filed
                          ↓
                    Decryption key released
                          ↓
                    Public archive (forever)
                          ↓
                    Redactions require:
                      - New signed judicial order
                      - Link to original rationale
                      - Only specific frames/persons redacted
                      - Full audit trail of what was redacted and why
```

**Technical requirements:**
| Component | Purpose | RealPeep analogue |
|-----------|---------|-------------------|
| Immutable object store | Can't delete or modify after upload | Any S3-compatible store + retention policy |
| Blockchain timestamp | Proof of existence at time of upload | Layer 4 (OpenTimestamps) — already exists |
| Encryption at rest | Privacy until declassification | Layer 1 (ZK identity scrubbing) — already exists |
| Judicial signature | Authorizes redaction | Extends duress key model |
| Redaction audit trail | Verifiable record of all modifications | Frame-level hash chain (Layer 3) — already exists |

The body camera case is actually *easier* than the protest case because:
- Only one camera per officer (not N×N mesh)
- Known camera parameters (mounted, fixed position)
- Officer identity is known (no anonymity needed)
- Chain of custody is linear, not mesh-based

---

## How This Changes the Attack Model

The immediate-timestamping requirement closes the remaining attack vector on the Neopixel/acoustic mesh:

```
Without timestamping:
  Attacker timeline: Event → Analyze → Construct → Spoof → Upload
                                                   ↑
                                          All steps before upload.
                                          Spoof and honest footage
                                          timestamped at same time.
                                          Verifier can't distinguish.

With timestamping:
  Honest timeline:  Event → Upload (encrypted) → Timestamp
                                    ↓
  Attacker timeline: Event → Analyze → Construct → Spoof → Upload
                                           ↓
                                    This gap (hours) is visible to verifier.
                                    The honest footage is provably older.
```

**Without timestamping, the attacker just needs a better deepfake. With timestamping, the attacker needs the honest footage to be wrong about what happened — a much higher bar.**

---

## The OpenTimestamps Layer Already Exists

RealPeep Layer 4 (`blockchain_anchor.py`) already provides this:

```python
# Current flow (prototype):
hash = calculate_merkle_root(video_frames)
ots_proof = create_timestamp(hash)  # → Bitcoin
verify_ots(ots_proof, hash)  # proves existence at block time
```

**Proposed extension for immediate upload:**

```python
# First upload (during event, seconds after capture):
encrypted_payload = encrypt(video || attestations, session_key)
upload(encrypted_payload, cloud_url)
# Immediately timestamp:
ots_proof = create_timestamp(hash(encrypted_payload))
# Store the proof locally; broadcast hash via mesh

# Later decryption:
court_order = verify_judicial_signature(warrant)
if court_order.valid:
    decrypt(session_key)  # or threshold keys
    verify_mesh_attestations()
    verify_neopixel_patterns()
    verify_opentimestamps(ots_proof)
```

**The hash goes to Bitcoin within minutes of capture.** The content stays encrypted indefinitely. The timestamp is the anchor that the attacker can't forge.

---

## The Asymmetry (Formalized)

Let **C** = cost to CREATE authentic-looking multi-modal footage (honest: be present, ~$5 Neopixel + phone)
Let **D** = cost to DETECT a forgery (our verification pipeline: ~35ms/frame)
Let **S** = cost to SPOOF acceptable footage (attacker: N relay channels + deepfake + 3D rendering)
Let **T** = time until honest footage is timestamped (minutes)
Let **Δt** = time needed for attacker to construct spoof (hours)

**Security condition:**
```
S ≫ C  (spoofing is much more expensive than honest capture)
AND
Δt ≫ T  (spoofing takes much longer than honest timestamping)
```

The literature tells us:
- **S/C ratio** grows exponentially with modalities (acoustic + BLE + Neopixel + IMU + mesh)
- **Δt/T ratio** is at least 10–100× for any non-trivial protest (minutes to upload vs hours to deepfake)

These two asymmetries together make the system secure. Neither alone would be sufficient — a perfect deepfake with a backdated timestamp would still pass verification, and a timestamp-only system with a single-modality capture could be spoofed before upload. But combined, they close both attack vectors.
