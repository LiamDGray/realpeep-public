# Acoustic Mesh Mutual Non-Repudiation Protocol

*How witness attestations are created and verified in a transmit-only, decode-later mesh.*

---

## Design Constraints

| Constraint | Why It Matters |
|-----------|----------------|
| **Listening costs battery** | A phone running 50 concurrent matched filters drains the battery in minutes. Devices must be **transmit-only** at capture time — the cheapest possible operation (one speaker driver write). |
| **Asymmetric clocks** | Each device has its own local clock. No NTP, no shared time source. Clocks drift. |
| **Asynchronous transmission** | Devices cannot coordinate who transmits when. Collisions are expected. |
| **Partial reception** | Not every device hears every other device. Acoustic range is ~20m. |
| **Offline-first** | Everything must work with zero connectivity. The notary is contacted later. |
| **Low data rate** | CDMA over a 4kHz acoustic band gives ~4-15 bps per device. Each transmission must be small. |
| **Deniability** | Individual attestations should not be incriminating if the device is confiscated. |

---

## The Insight That Changes Everything

**Listening is expensive. Decoding is expensive. Transmitting is cheap.**

A phone speaker driving a 2-second ultrasonic chirp at 18-22kHz draws ~1-5mA. Running a matched filter bank for 50 concurrent signals at 192kHz sample rate draws ~50-500mA and requires constant DSP processing. The asymmetry is 10-100x.

The protocol exploits this: **devices never listen.** They only:

1. Transmit a short beacon at random intervals
2. Record raw microphone audio continuously (already happening for video)
3. Periodically hash and sign a chunk of raw audio

That's it at capture time. **Everything else — decoding, code extraction, pairwise distance computation, MNR certificate issuance — happens on a much more powerful server after upload.**

This is "Commit Now, Compute Later" (see `MNR_LITERATURE_REVIEW.md`, Section 2: Gradual Release).

---

## The Protocol: Two On-Device Phases + One Verifier Phase

### Phase 0: Setup (Before Recording)

Each device generates an **ephemeral key pair** for the session:

```
Device A:  (sk_A, pk_A)  — ephemeral Ed25519 keypair
Device B:  (sk_B, pk_B)  — ephemeral Ed25519 keypair
```

The ephemeral key is **not** linked to the device's long-term identity.

### Phase 1: Transmit (On-Device, During Recording)

Each device broadcasts a presence beacon on the acoustic channel at random intervals (every 30-60 seconds, ± random jitter). No carrier sense, no listen-before-talk, no exponential backoff — just fire and forget.

```
Beacon_A = {
    type:       "presence",
    pk:         pk_A,
    timestamp:  t_A_1,          // Device A's local clock
    mesh_id:    H(video_seed),  // Hash linking to this recording session
    signature:  sign(sk_A, pk_A || t_A_1 || mesh_id)
}
```

**How the beacon is physically transmitted:**

1. The beacon data (136 bytes) is CDMA-spread using A's **Gold code**, which is deterministically derived from `pk_A`:
   ```
   gold_seed = first 4 bytes of SHA256(pk_A)
   gold_code = GoldCodeGenerator(poly1, poly2, gold_seed).generate(code_idx, 0, SF=128)
   ```
   This is crucial — the verifier can reconstruct A's Gold code without any side-channel because `pk_A` is embedded in every beacon and the derivation is deterministic.

2. The spread signal is modulated onto an 18-22kHz ultrasonic carrier.

3. The speaker plays the modulated signal. Total transmission time at 10 bps over 4kHz bandwidth: ~14 seconds per beacon.

**Size:** 32 bytes pk + 8 bytes timestamp + 32 bytes mesh_id + 64 bytes signature = **136 bytes**.

### Phase 2: Record and Sign (On-Device, During Recording)

While transmitting, the device also records from its microphone. It does NOT attempt to decode anything. It simply:

1. Captures raw microphone audio in ~2-second chunks (the minimum time to capture a 136-byte beacon at 10 bps)
2. For each chunk, computes `H(chunk_samples)` using SHA-256
3. Signs the hash: `sign(sk_A, H(chunk_samples) || chunk_timestamp)`

```
RawAudioChunk_A = {
    device_pk:     pk_A,
    chunk_hash:    H(chunk_samples),
    chunk_timestamp: t_A_chunk,
    raw_length:    len(chunk_samples),   // For reconstructing timing
    signature:     sign(sk_A, H(chunk_samples) || t_A_chunk)
}
```

The raw audio chunk is NOT stored — only its hash and signature are stored. This keeps on-device storage minimal. The raw audio can be discarded after signing (or kept if the device has space — the hash is the cryptographic commitment, the raw data is for the verifier).

**Why this works even without hearing anything:** The device doesn't need to hear other devices to prove co-location. It just needs to prove it was in a physical space where acoustic pressure waves existed. The verifier correlates other devices' known codes against this device's recorded audio. If a correlation peak exists, the devices were co-located — even if this device's app never ran a single matched filter.

### What Gets Uploaded to the Verifier

When each device reaches connectivity, it uploads:

```
Device_Bundle = {
    device_pk:      pk_B,
    mesh_id:        mesh_id,
    session_start:  t_B_start,
    session_end:    t_B_end,
    
    // Every beacon this device transmitted:
    transmitted_beacons: [
        { pk: pk_B, timestamp: t_B_1, mesh_id, signature },
        ...
    ],
    
    // Signed raw audio chunk commitments (NOT the audio itself):
    audio_chunks: [
        { chunk_hash: "sha256...", chunk_timestamp: t_B_rcv_1, raw_length: 44100, signature },
        ...
    ],
    
    // Optionally, the actual raw audio samples (if stored):
    raw_audio: [samples...] | null,  // Optional — allows verifier to run matched filter
    
    // Sign everything:
    bundle_signature: sign(sk_B, bundle_hash)
}
```

**Two modes:**
- **Lightweight mode** (default): Upload only hashes of audio chunks. The verifier can't run matched filters but can verify the device was recording.
- **Full evidence mode** (recommended if connectivity allows): Upload the raw audio. The verifier can extract other devices' codes through correlation.

**Size:** ~2KB per bundle (without raw audio) or ~700KB/minute (with raw audio at 44.1kHz, 16-bit mono).

---

## The Offline Verifier: "Commit Now, Compute Later"

This is where the real work happens. The verifier is a server with unlimited compute and no battery constraint.

### Step 1: Reconstruct Device Gold Codes

For each device that submitted a bundle, the verifier:
1. Extracts `pk_A` from the transmitted beacons
2. Computes `gold_seed = SHA256(pk_A)[:4]`
3. Generates `gold_code_A = GoldCodeGenerator(poly1, poly2, gold_seed).generate(0, 0, SF=128)`

This gives the verifier the exact spreading code that device A used, derived deterministically from its public key.

### Step 2: Pairwise Correlation (Matched Filter)

For every pair of devices (A, B) that were active during overlapping time windows:

1. Take device B's raw audio samples from the time window
2. Run the matched filter: cross-correlate B's audio against A's Gold code
3. Look for a correlation peak above threshold

```
For each pair (A, B):
    audio_B = B.raw_audio[t_start : t_end]  // B's mic recording during A's broadcast window
    correlation = cross_correlate(audio_B, gold_code_A)
    peak = max(|correlation|)
    
    if peak > THRESHOLD:
        // A's signal was physically present in B's recording
        // A and B were co-located within ~20m acoustic range
        attestations.append({
            heard: pk_A,
            recorded_by: pk_B,
            correlation: peak,
            arrival_offset: argmax(correlation),  // Samples offset → propagation delay
            confidence: peak / (mean_noise + std_noise)
        })
```

**Threshold determination:** The matched filter output for a Gold code with SF=128 has expected autocorrelation peak of 128 (for a perfect match) and bounded cross-correlation ≤17. Set `THRESHOLD = 50` (approximately 3× the max cross-correlation). This provides robust detection.

### Step 3: Time-of-Flight Distance Computation

When device A's beacon appears in device B's audio, the verifier knows:

1. `t_A_claimed` — when A said it transmitted (from A's beacon)
2. `t_B_arrival` — when the peak appeared in B's audio timeline (from B's recording timestamp + sample offset)
3. The difference `t_B_arrival - t_A_claimed` includes: clock offset + acoustic propagation delay

If the pair is symmetric (A's beacon appears in B's audio AND B's beacon appears in A's audio), the verifier solves:

```
distance = ((t_B_arrival - t_A_claimed) + (t_A_arrival - t_B_claimed)) / 2 × speed_of_sound
```

This eliminates clock skew regardless of how much the devices' clocks diverged.

### Step 4: Verify Signed Audio Commitments

For each "detection" made in Step 2, the verifier checks:

1. The raw audio chunk where A's signal was found is cryptographically committed to by B's signature
2. Recompute `H(chunk_samples)` and verify it matches `B.audio_chunks[i].chunk_hash`
3. Verify `sign(sk_B, H(chunk_samples) || timestamp)` is valid

This proves the audio segment existed at capture time and was not fabricated by the verifier.

### Step 5: Issue MNR Certificate

If the following checks pass:

1. A's Gold code was detected in B's raw audio (autocorrelation peak > threshold)
2. B's Gold code was detected in A's raw audio (symmetric detection — optional but strengthens proof)
3. The computed distance is physically plausible (0.5m < d < 50m)
4. The audio commitments are cryptographically verified

Then the verifier issues a **Mutual Non-Repudiation Certificate**:

```
MNR_Certificate = {
    device_A: pk_A,
    device_B: pk_B,
    mesh_id:  mesh_id,
    mutual:   symmetric_detection,       // True if both directions found
    distance: computed_distance_meters,   // From round-trip computation
    evidence_A: {
        raw_chunk: audio_samples,        // The specific segment containing A
        chunk_hash: hash,
        signature: sign(sk_A, ...)
    },
    evidence_B: { ... },
    issued:   timestamp,
    verifier_signature: sign(verifier_sk, cert_hash)
}
```

The certificate is then anchored to a public blockchain via OpenTimestamps (see `realpeep/blockchain_anchor.py`).

---

## Collision Model

Since devices are transmit-only, they have no way to detect collisions. What happens when two devices broadcast simultaneously?

**Collision = two Gold codes mixed in the channel.** The matched filter can still distinguish them because:

1. Gold codes from the same family have bounded cross-correlation (≤17 for n=7)
2. The autocorrelation peak (128 for SF=128) is 7.5× larger than worst-case cross-correlation
3. Even with two codes mixed, each matched filter will show a distinct peak at the correct offset
4. Three or more simultaneous broadcasts degrade detection probability but don't eliminate it

**Expected collision rate:** With 20 devices broadcasting every 30 seconds ± 5 seconds jitter, the probability of any two devices overlapping in a 2-second window is approximately 2/30 × (1 - 19/20) ≈ 0.3%. Well within acceptable range.

---

## Attestation Graph Construction

After the verifier processes all pairwise correlations, it builds a graph:

```
Nodes:   pk_A, pk_B, pk_C, ...
Edges:   pk_A ↔ pk_B  (A detected in B's audio, distance 4.2m, confidence 0.97)
         pk_A ↔ pk_C  (A detected in C's audio, distance 3.8m, confidence 0.94)
         pk_B → pk_C  (B detected in C's audio but not vice versa — one-way, distance 5.1m)
```

A certificate of co-location is issued if the graph is **convex** — all devices in the set form a connected component where every pair is within acoustic range (verified by at least one direction of detection). The certificate states:

- **N devices** were physically co-located
- **Maximum pairwise distance:** X meters
- **Graph connectivity:** K/N pairs confirmed
- **Confidence:** Aggregate detection confidence

---

## Comparison: Old Protocol vs New Protocol

| Aspect | Old Protocol (4 Phases) | New Protocol (Transmit-Only) |
|--------|------------------------|------------------------------|
| Device listens? | Yes — runs matched filter on every beacon | **No — pure transmit + record** |
| Device decodes? | Yes — extracts nonces from CDMA | **No — signs raw audio hash only** |
| Ack sent? | Yes — requires bidirectional exchange | **No — verifier does pairwise correlation** |
| Chain hash? | Yes — on-device append-only log | **No — not needed** |
| On-device compute | High (50× matched filters) | **Minimal (one SHA-256 hash per chunk)** |
| On-device battery | High | **Low (transmit only, very occasionally)** |
| Verifier compute | Moderate | **Higher (pairwise correlation of all N² pairs)** |
| Network upload | ~5KB (attestations only) | **~2KB or ~700KB/min (with raw audio)** |
| Collision tolerance | Low (need clear ack channel) | **High (verifier separates codes offline)** |
| Proof strength | "Device B claims it heard A" | **"Device A's ultrasonic signal is physically present in B's recording"** |

---

## Summary

**On-device (capture time):**
- Generate ephemeral keypair
- Derive Gold code from public key
- Transmit beacon every 30-60s with random jitter
- Record raw audio, hash it, sign the hash

**Offline verifier (after upload):**
- Reconstruct Gold codes from public keys
- Cross-correlate every pair's codes against raw audio
- Compute distances from timing offsets
- Verify cryptographic commitments
- Issue MNR certificate

This design is:
- **Energy-efficient** — devices transmit, rarely compute
- **Scalable** — N devices need N×N correlations server-side, but N is bounded by physical room capacity (~50)
- **Forensically stronger** — the raw audio signature is evidence of the actual acoustic environment, not a decoded nonce
- **Collision-tolerant** — collisions only reduce detection probability marginally

---

## Spatio-Temporal Hash-Linked Mesh

The transmit-only protocol proves spatial co-location. This section extends
it to prove **temporal ordering** — not just that devices were in the same room,
but that their beacons form a verifiable directed acyclic graph through time.

### The Insight

Each beacon includes a hash of the device's previous beacon (self-chain) AND a
Merkle root of the latest beacons heard from every neighbor (cross-chain). The
result is a verifiable DAG that proves:

1. **No beacon deletion.** Missing a beacon breaks the self-chain hash.
2. **No beacon reordering.** Each beacon links to its specific predecessor.
3. **Temporal ordering between devices.** If A's beacon at t₅ references B's
   beacon at t₃, then A definitely heard B before transmitting — proven without
   synchronized clocks.
4. **External time bracketing.** Each beacon includes the latest NIST randomness
   beacon pulse, anchoring the DAG to wall-clock time.

### Beacon Format (All Modalities)

```
Beacon_0 (initial, no prior state):
  pk:          pk_A                        // 32 bytes, ephemeral Ed25519
  nist:        nist_pulse_60s              // 16 bytes, latest NIST beacon
  prev_self:   null                        // 32 bytes (null for first beacon)
  heard_root:  null                        // 32 bytes (null — no neighbors yet)
  sig:         sign(sk_A, pk_A || nist || 0x00...00 || 0x00...00)

Beacon_N (N > 0):
  pk:          pk_A                        // 32 bytes
  nist:        nist_pulse_now              // 16 bytes, current NIST pulse
  prev_self:   SHA256(Beacon_{N-1})        // 32 bytes, link to own prior beacon
  heard_root:  MerkleRoot({                // 32 bytes, Merkle tree of all heard:
    (pk_B, SHA256(Beacon_B_K)),             //   — latest beacon from neighbor B
    (pk_C, SHA256(Beacon_C_J)),             //   — latest beacon from neighbor C
    ...                                     //   — one entry per heard neighbor
  })
  sig:         sign(sk_A, pk_A || nist || prev_self || heard_root)
  // Total: ~176 bytes — fits in one BLE advertisement (≤255 bytes)
```

**Merkle root of heard beacons:** Including every neighbor's hash individually
would exceed BLE advertisement limits at scale (50 neighbors × 32 bytes = 1.6KB).
Instead, we compute a Merkle tree over the set of `(neighbor_pk, beacon_hash)`
pairs and include only the 32-byte root. The verifier receives the full set
in the observation bundle and can prove inclusion of each neighbor.

### NIST Randomness Beacon as External Time Anchor

The [NIST Randomness Beacon](https://www.nist.gov/programs-projects/nist-randomness-beacon)
publishes a 512-bit random value every 60 seconds, signed by NIST. Each RealPeep
beacon includes the latest pulse value (truncated to 128 bits) as `nist`. This
provides:

- **Wall-clock time bracketing.** If beacon_N includes nist_pulse_T, it was
  transmitted after time T (the pulse was published) and before T+60 (the next
  pulse). Outside the US NIST jurisdiction, alternative beacons (EU's DRAND,
  Cloudflare's League of Entropy) can substitute.
- **Replay protection.** A captor cannot replay an old beacon in a new 60-second
  window because the NIST pulse changes.
- **Cross-session ordering.** Two recording sessions can be temporally ordered
  by comparing their NIST-anchored beacon chains.

### Self-Chain Integrity

Each device maintains a running SHA-256 hash of its previous beacon:

```
Beacon_0  →  H0 = SHA256(Beacon_0)
Beacon_1  →  H1 = SHA256(Beacon_1),  prev_self = H0
Beacon_2  →  H2 = SHA256(Beacon_2),  prev_self = H1
```

The verifier reconstructs each device's chain. Any gap (missing beacon) or
fork (two beacons claiming the same predecessor) is detectable. A device that
stops transmitting produces a terminal beacon; a device that resumes creates a
new chain with `prev_self = null` (a new session).

### Cross-Chain Entanglement (Spatio-Temporal)

Each device maintains a map of the latest beacon hash heard from each neighbor.
On transmitting a new beacon, it computes:

```
heard_set = {
  (pk_B, latest_heard_hash_from_B),
  (pk_C, latest_heard_hash_from_C),
  ...
}
heard_root = MerkleRoot(sort(heard_set))
```

The verifier cross-references these roots:

1. **Forward check:** If A's beacon_N claims `heard_root` includes B's
   beacon_K, the verifier confirms that B's beacon_K exists and that A was
   within BLE/acoustic/optical range at that time.
2. **Backward check:** If A claims to have heard B at time t, but B's beacon
   at time t shows B heard C but NOT A, there's an asymmetry — either A is
   lying or propagation was one-directional.
3. **Consistency check:** If A's beacon_N references B's beacon_K, and
   A's beacon_{N+1} references B's beacon_{K+1}, the verifier confirms the
   temporal ordering is consistent (B transmitted K+1 after K, and A
   observed both in the correct order).

### Merkle Proof Format (in Observation Bundle)

The Merkle proof for a specific `(neighbor_pk, beacon_hash)` pair travels in
the observation bundle (uploaded to verifier), not in the beacon itself:

```
ObservationBundle = {
  device_pk:     pk_B,
  beacons:       [Beacon_0, Beacon_1, ...],   // All beacons this device transmitted
  heard_proofs:  {                              // Merkle proofs for heard_root
    pk_A: { hash: SHA256(Beacon_A_3), proof: [sibling_hashes...] },
    pk_C: { hash: SHA256(Beacon_C_1), proof: [sibling_hashes...] },
  },
  signature:     sign(sk_B, bundle_hash),
}
```

The verifier:
1. Verifies each beacon's signature
2. Reconstructs each device's self-chain
3. For each `heard_root` in each beacon, verifies the Merkle proof for each
   claimed neighbor
4. Builds the full spatio-temporal DAG

### DAG Properties

```
                    Time →
Device A:  ●──────●──────●──────●
           │      │      │
Device B:  ●──●───●──────●──────●
              │         │
Device C:  ●───●────────●──────●
              
● = beacon
── = self-chain (prev_self)
│  = cross-chain (heard_root reference)
```

**Verifiable properties of the DAG:**

| Property | How it's proved |
|----------|----------------|
| No beacon deletion | Self-chain hashes must be continuous |
| No beacon reordering | Each prev_self matches one specific predecessor |
| Temporal ordering A→B | A's beacon references B's beacon hash → A heard B first |
| External time bound | NIST pulse brackets each beacon within ±60s |
| Co-location A↔B | Mutual cross-chain references in both directions |
| Terminal state | Last beacon before silence has no successor |
| No backdating | NIST pulse in beacon_N must be ≥ pulse in beacon_{N-1} |

### Application to All Three Modalities

The beacon format is modality-agnostic. The `prev_self`, `heard_root`, `nist`,
and `sig` fields are identical for BLE, acoustic, and optical mesh:

| Modality | Physical payload | Beacon data | Notes |
|----------|-----------------|-------------|-------|
| **BLE** | 176 bytes in advertisement service data | Full beacon fits in one BLE extended advertisement | Primary mesh |
| **Acoustic** | 136 bytes CDMA-spread over 18-22kHz chirp | Beacon data CDMA-modulated onto chirp carrier | Same format, different PHY |
| **Optical (TLK)** | Luminance modulation per frame | Beacon data BPSK-modulated onto chirp, sampled as per-frame luminance | Compression-survivable |

The verifier reconstructs the DAG from all three modalities simultaneously —
a cross-reference in BLE, acoustic, or optical carries equal weight. The more
modalities confirm a link, the stronger the evidence.

### Precedents and Novelty

This protocol combines elements from several established systems, none of which
combine them all in a physical-layer anonymous mesh:

| System | Self-chain | Cross-chain | Physical layer | Anonymous | Offline verify |
|--------|-----------|-------------|----------------|-----------|---------------|
| Hashgraph | ✅ gossip-about-gossip | ✅ virtual voting | ❌ consensus only | ❌ node IDs | ❌ online |
| Secure Scuttlebutt | ✅ append-only log | ✅ follows | ❌ social/app layer | ⚠️ pseudonymous | ⚠️ local only |
| IOTA Tangle | ❌ | ✅ 2-parent DAG | ❌ financial ledger | ⚠️ pseudonymous | ❌ |
| Certificate Transparency | ✅ Merkle tree | ❌ single log | ❌ web PKI | ❌ identified | ✅ |
| CoSi | ❌ | ✅ collective sig | ❌ attestation | ❌ identified | ⚠️ |
| **RealPeep S-T Mesh** | ✅ prev_self | ✅ Merkle(heard) | ✅ BLE/acoustic/optical | ✅ ephemeral | ✅ offline |

**Novel contributions:**
1. Self-chain + cross-chain DAG at the **physical beacon layer** (not consensus or social layer)
2. **Merkle root of heard beacons** to bound advertisement size while enabling cross-chain verification
3. **NIST randomness beacon** as external time anchor for beacon-level temporal ordering
4. **Anonymous ephemeral keys** — the DAG proves ordering between anonymous participants
5. **Offline verification** — the entire DAG is reconstructed from uploaded bundles, not live consensus

**Patent search:** Google Patents and USPTO searches (July 2026) found no patents
on temporal hash-linked beacon meshes combining these elements. The closest
patents cover BLE mesh networking and blockchain-based attestation separately,
not their combination at the physical beacon layer.

The same "commit now, compute later" architecture applies to a BLE radio mesh.
This is the preferred mode in noisy acoustic environments and also supports
strictly larger crowds (N > 50) since BLE has no acoustic bandwidth bottleneck.

### Physical Layer

| Property | Value |
|----------|-------|
| Medium | BLE Advertising Channel 37/38/39 (2.4 GHz) |
| Beacon interval | 500 ms (configurable, + random jitter ±100 ms) |
| Beacon payload | ≤ 255 bytes (BLE extended advertising) |
| Rx power | ~30 mW (BT chip scanning — CPU stays asleep) |
| Tx power | ~10 mW (one advertising packet = ~5 ms transmit) |
| Range | ~10 m (tight enough for co-location proof) |
| Collision handling | Inherent — advertising channel uses CSMA/CA |

### Privacy: BLE MAC Address Randomization

RealPeep's threat model requires that BLE advertisements not link to device
identity. This section assesses whether modern smartphone BLE implementations
meet that requirement.

**MAC address types (BLE 4.2+, 2014):**

| Type | Changes | Resolution | Suitable? |
|------|---------|------------|-----------|
| Public | Never (factory-assigned) | Globally unique | ❌ Never use |
| Random Static | On power cycle / reboot | Stable per boot | ⚠️ Linkable within a session |
| Random Private Resolvable (RPA) | ~15 min (spec recommendation) | Only by bonded devices with IRK | ✅ Use if bonding not required |
| Random Private Non-Resolvable | ~15 min | Not resolvable by anyone | ✅ Best choice |

**Platform behavior:**

- **iOS** (since iOS 7 / CoreBluetooth): Apps cannot access the real MAC
  address. Advertising always uses a random address. No app-level control
  needed — privacy is enforced by the OS.
- **Android** (since 5.0): BLE Privacy feature available. Since Android 8.0,
  `BluetoothLeAdvertiser` uses random addresses by default when the app does
  not specify. However, OEM implementations vary; some older or low-cost
  devices may not properly randomize. RealPeep should detect and warn.

**The fingerprinting problem:** Even with MAC randomization, BLE advertisement
metadata can fingerprint individual devices (see "Device Identification from
BLE Advertising Packets with Randomized MAC Addresses", COMEX 2024). An
adversary can use:
- Service UUIDs (if unique per app/device)
- Manufacturer-specific data
- TX power level (varies by phone model)
- Advertisement interval and timing jitter patterns
- Overall payload structure and length

**RealPeep countermeasures:**

1. **Uniform advertisement format.** All RealPeep devices emit identical
   advertisement structure: same service UUID (a well-known constant), no
   manufacturer-specific data, fixed TX power level (+4 dBm), fixed
   advertisement interval (500 ms + uniform random jitter ±100 ms).

2. **Ephemeral beacon payload.** Every field in the beacon is session-ephemeral:
   `pk_A` is generated fresh per recording session, `nonce_A` is random per
   beacon, `mesh_id` is a hash of the video seed. No field persists across
   sessions or links to device identity.

3. **Within-session linkability is acceptable and required.** Other devices
   must recognize repeated beacons from the same source during a recording
   session. The random MAC is stable for ~15 min per BLE spec, which is
   sufficient for most recording sessions. If a session exceeds the
   re-randomization window, the mesh consensus relies on `pk_A` continuity
   (the ephemeral key, not the MAC) to link beacons from the same device.

4. **No cross-session linkability.** Session boundaries reset all state:
   new `pk_A`, new MAC (new advertising instance on modern OS), new `mesh_id`.
   An observer cannot link two recording sessions to the same device.

5. **Protocol fingerprinting is acceptable.** An observer can determine that a
   device is running RealPeep (uniform UUID, fixed payload structure). This is
   inherent to any open protocol and does not identify the individual.

**Minimum OS requirement:** RealPeep requires Android 8.0+ or iOS 13+ to
guarantee OS-level MAC randomization during BLE advertising. Devices below
this threshold should warn the user (MAC may be linkable). In practice, >95%
of active smartphones meet this requirement as of 2026.

**Verifier protection:** The verifier never learns the MAC address — it
receives only the beacon payload (pk_A, nonce, mesh_id, signature) from the
upload bundle. The observational commitment (Bloom filter) contains nonces,
not MACs. Even if the verifier is compromised, it cannot map beacons to
devices.

### Protocol (On-Device, Capture Time)

Each device transmits its presence beacon at random intervals on the
BLE advertising channel. Every device in range receives all beacons
passively — no connections, no pairing, no handshakes.

```
Beacon = {
    type:       "presence",
    pk:         pk_A,                   // 32 bytes, ephemeral Ed25519
    nonce:      nonce_A,                // 16 bytes, random
    mesh_id:    H(video_seed),          // 4 bytes (truncated SHA-256)
    signature:  sign(sk_A, pk_A || nonce_A || mesh_id)
    // Total: ~68 bytes — fits easily in a BLE advertisement
}
```

**Device B's capture-time behavior:**

```python
# Device B — receive-only, no verification at capture time
observed_nonces = BloomFilter(capacity=5000, fpr=0.02)  # ~200 bytes

for packet in ble_scan_cycle:
    if packet.mesh_id == current_session:
        observed_nonces.add(packet.nonce)

# Periodically (every ~30 s), commit to the set of observed nonces
commitment = {
    "type":         "observation",
    "device_pk":    pk_B,
    "mesh_id":      current_session,
    "observed":     observed_nonces.serialize(),
    "num_seen":     len(observed_nonces),         # for verifier calibration
    "timestamp":    t_B,                           # device's local clock
    "signature":    sign(sk_B, H(observed.serialize() || t_B || mesh_id))
}
```

The observation commitment is **not broadcast** — it's stored locally
and uploaded to the verifier when connectivity returns. The only
capture-time radio activity is broadcasting beacons and passively
receiving them. No decoding, no verification, no acknowledgments.

### Verifier Processing (After Upload)

The verifier reconstructs the many-to-many adjacency matrix from all
devices' unilateral observation commitments. No pairwise exchange needed.

```python
# Verifier: build correlation matrix from unilateral observations
devices = [D1, D2, ..., DN]   # all devices that submitted
matrix = zeros((N, N))        # N × N correlation matrix

for i, device_i in enumerate(devices):
    bloom = BloomFilter.deserialize(device_i.observed)
    for j, device_j in enumerate(devices):
        if i == j:
            continue
        if device_j.nonce in bloom:
            matrix[i][j] = 1   # device_i heard device_j
```

**Properties of the matrix:**

- **Row i** = which devices device_i observed (outgoing edges)
- **Column j** = which devices observed device_j (incoming edges)
- **Symmetric** → mutual observation (both devices heard each other)
- **Connected component** → all N devices were co-located

The verifier issues a **single group MNR certificate** if the matrix
forms a connected component:

```
GroupMNR_Certificate = {
    mesh_id:        current_session,
    devices:        [pk_A, pk_B, pk_C, ...],     // all N devices
    matrix_hash:    H(matrix),                     // commitment to full matrix
    connected:      true,                          // graph is fully connected
    max_distance:   max(estimated_distances),       // from signal strength
    num_devices:    N,
    num_observations: sum(matrix) / 2,             // number of heard pairs
    issued:         timestamp,
    verifier_sig:   sign(verifier_sk, H(cert_data))
}
```

### Many-to-Many Property

The BLE variant achieves true many-to-many MNR because **every device's
commitment is checked against every other device's nonce.** This is not
a set of pairwise exchange proofs — it is one N-way adjacency matrix
built from N unilateral commitments. No two-party exchange protocol can
produce this; the classic Even-Yacobi impossibility result does not
apply because there is no exchange.

| Property | 2-Party Fair Exchange | RealPeep BLE Mesh |
|----------|----------------------|-------------------|
| Unit of proof | Signed contract between two parties | Bloom filter of N observed nonces |
| Verification | Check one signature pair | Check N × N nonce membership queries |
| Scales to | 2 | N up to ~5000 (bloom filter capacity) |
| Requires exchange? | Yes (must send and receive) | No (passive observation only) |
| Impossibility result? | Even-Yacobi (no TTP-free fair exchange) | Not applicable (no exchange) |

### Combining Acoustic and BLE

The two channels are complementary and can run simultaneously:

| Channel | Proves | Strength | Weakness | Best for |
|---------|--------|----------|----------|----------|
| **Acoustic** | Same physical room | Propagation delay gives distance ±0.3m | Low data rate, noise-sensitive | Forensic evidence, high-trust scenarios |
| **BLE** | Within ~10m proximity | High throughput, noise-immune, 5000+ devices | No room-level spatial proof | Large crowds, noisy environments, primary mesh |

The verifier can require **either channel** (BLE-only fallback in noise)
or **both channels** (maximum assurance — device must have been in the
room AND within BLE range of other specific devices).
