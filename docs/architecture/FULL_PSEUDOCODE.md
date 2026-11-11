# RealPeep — Full System Pseudocode

Architecture-independent specification. Every component described here is
implementable in any language (JS/browser, Python, Swift, Kotlin, Rust).
All operations are stateless and side-effect-free unless marked with ⚡ (I/O).

---

## 1. ZK PROOF GENERATION (Browser-Side)

### 1a. Circuit Compilation (Offline, Once)
```
// Done ONCE during build, not per-proof.
// Output: three static files → deploy to CF Pages

COMPILE(scrubber.circom) → {
    scrubber.wasm    // witness calculator (WebAssembly)
    scrubber.zkey    // proving key (Groth16)
    verification_key.json  // for the verifier
}

// File sizes (estimate for 125-line circuit, depth-20 Merkle):
//   .wasm  ~2MB
//   .zkey  ~50MB (can be chunked, or use PLONK for smaller keys)
//   vkey   ~1KB
```

### 1b. Witness Generation (Browser, Per-Proof)
```
// Input: private hardware attestation + merkle path
// Output: binary witness file

GENERATE_WITNESS(scrubber.wasm, {
    // PUBLIC inputs
    payload_hash:       PoseidonHash(video_or_audio_hash),
    ephemeral_pubkey:   RandomEdDSAKeypair().public,
    authorized_merkle_root: HARD_CODED_ROOT,  // from Apple/Google TEE registry

    // PRIVATE inputs (never leave device)
    tee_pubkey_x, tee_pubkey_y:     HardwareAttestationKey,
    tee_sig_Rx, tee_sig_Ry, tee_sig_S: EdDSASignature(payload_hash),
    merkle_path_elements[20]:       PrecomputedPath,
    merkle_path_indices[20]:        PrecomputedIndices,
}) → witness.bin
```

### 1c. Proof Generation (Browser, Per-Proof)
```
// Input: witness + proving key
// Output: Groth16 proof (~256 bytes) + public signals

GENERATE_PROOF(scrubber.zkey, witness.bin) → {
    proof: {
        pi_a: [2]field,   // ~64 bytes
        pi_b: [2][2]field, // ~128 bytes
        pi_c: [2]field,   // ~64 bytes
    },
    public_signals: [payload_hash, ephemeral_pubkey, authorized_merkle_root],
}

// Time: 2-5s in browser for this circuit
// snarkjs main.cjs bundle: 275KB
```

### 1d. Proof Verification (Worker or Browser)
```
// Can run anywhere — CF Worker, browser, native app
// Sub-millisecond operation

VERIFY_PROOF(verification_key.json, proof, public_signals) → bool
```

---

## 2. OPEN-TIMESTAMPS ANCHORING (Network)

### 2a. Submit Hash to Calendar (CF Function Proxy)
```
// Browser cannot reach Bitcoin directly; proxy through CF Function.
// The CF Function talks to the OTS calendar server.

⚡ SUBMIT_HASH(merkle_root: bytes[32]) → {
    // Step 1: POST to OTS calendar
    calendar_url = "https://alice.btc.calendar.opentimestamps.org"
    response = POST(calendar_url + "/digest", body=merkle_root)

    // Step 2: Calendar returns a pending timestamp
    pending_ots = response.body  // binary DetachedTimestampFile

    // Step 3: Return to client
    return {
        status: "pending",
        ots_proof: pending_ots,  // ~100 bytes
        submitted_at: now(),
    }
}

// CF Function: functions/api/ots-submit.js
// Method: POST
// Body: { merkle_root_hex: string[64] }
// Response: { ots_proof_hex: string, status: "pending"|"confirmed" }
```

### 2b. Upgrade Timestamp (Polling, CF Function)
```
// The calendar eventually includes the hash in a Bitcoin transaction.
// Client polls every few minutes until confirmed.

⚡ UPGRADE_TIMESTAMP(merkle_root: bytes[32], timeout: seconds) → {
    // Poll the calendar for an upgraded attestation
    deadline = now() + timeout
    while now() < deadline:
        ts = GET(calendar_url + "/timestamp/" + hex(merkle_root))
        if ts.has_bitcoin_attestation:
            return {
                status: "confirmed",
                ots_proof: serialize(ts),
                block_height: ts.block_height,
            }
        sleep(30)

    // Timeout — return whatever we have
    return { status: "pending", ots_proof: ts }
}

// CF Function: functions/api/ots-upgrade.js
// Method: POST
// Body: { merkle_root_hex: string[64], timeout: int? }
```

### 2c. Verify OTS Proof (Offline, No Network)
```
// Can be done entirely client-side with the OTS proof file.
// No server needed for verification.

⚡ VERIFY_OTS(ots_proof: bytes, merkle_root: bytes[32]) → {
    valid: bool,
    block_height: int?,
    timestamp: ISO8601?,
}
```

---

## 3. MNR ROLLUP SERVER (CF Worker)

### 3a. State
```
// Lightweight — fits in CF D1 (SQLite) or KV

TABLES:
  payloads:
    ephemeral_key  TEXT PRIMARY KEY,
    device_id      TEXT,
    captured_keys  TEXT,  -- JSON array of observed ephemeral keys
    received_at    INTEGER,  -- unix timestamp

  receipts:
    receipt_id     TEXT PRIMARY KEY,  -- "{device_id}_{target_key}"
    device_id      TEXT,
    target_key     TEXT,
    signature      TEXT,
    received_at    INTEGER,

  certificates:
    certificate_id TEXT PRIMARY KEY,
    key_a          TEXT,
    key_b          TEXT,
    issued_at      INTEGER,
```

### 3b. Receive Payload
```
// Device uploads its ZK payload when connectivity returns

⚡ RECEIVE_PAYLOAD({
    ephemeral_key: string,
    device_id: string,
    captured_keys: string[],  // observed BLE nonces
    zk_proof: Groth16Proof,   // proof that this device is authorized TEE
    zk_public_signals: field[],
}) → {
    // 1. Verify ZK proof
    if not VERIFY_PROOF(verification_key, zk_proof, zk_public_signals):
        return { error: "Invalid ZK proof" }

    // 2. Store payload
    INSERT INTO payloads VALUES (...)
    return { ok: true }
}
```

### 3c. Receive Receipt
```
// Device explicitly consents to entanglement with another device

⚡ RECEIVE_RECEIPT({
    device_id: string,
    target_key: string,
    signature: Ed25519Signature,
}) → {
    // 1. Verify signature
    if not VERIFY_SIG(device_public_key, target_key, signature):
        return { error: "Invalid receipt signature" }

    // 2. Store receipt
    INSERT INTO receipts VALUES (...)
    return { ok: true }
}
```

### 3d. Attempt Retroactive Rollup
```
// Called after both payloads and receipts exist.
// Checks: mutual entanglement + mutual consent → issues certificate.

ATTEMPT_ROLLUP(key_a: string, key_b: string) → {
    // 1. Both payloads must exist
    payload_a = SELECT * FROM payloads WHERE ephemeral_key = key_a
    payload_b = SELECT * FROM payloads WHERE ephemeral_key = key_b
    if not (payload_a and payload_b):
        return { error: "Missing payloads" }

    // 2. Mutual entanglement: each must have observed the other
    if key_b not in payload_a.captured_keys:
        return { error: "No mutual entanglement" }
    if key_a not in payload_b.captured_keys:
        return { error: "No mutual entanglement" }

    // 3. Mutual consent: each must have signed a receipt for the other
    receipt_a = SELECT FROM receipts
                WHERE device_id = payload_a.device_id
                  AND target_key = key_b
    receipt_b = SELECT FROM receipts
                WHERE device_id = payload_b.device_id
                  AND target_key = key_a
    if not (receipt_a and receipt_b):
        return { error: "Missing receipts" }

    // 4. Issue certificate
    cert_id = SHA256(key_a + key_b + now())
    INSERT INTO certificates VALUES (cert_id, key_a, key_b, now())
    return {
        ok: true,
        certificate_id: cert_id,
    }
}
```

### 3e. API Endpoints (CF Functions)
```
POST   /api/mnr/payload       → RECEIVE_PAYLOAD
POST   /api/mnr/receipt       → RECEIVE_RECEIPT
POST   /api/mnr/rollup        → ATTEMPT_ROLLUP(key_a, key_b)
GET    /api/mnr/certificate/:id → fetch certificate
```

---

## 4. AUDIO CAPTURE + CDMA EMBEDDING

### 4a. Real Audio Capture (Browser, WebAudio API)
```
// Capture from device microphone at 44.1kHz

⚡ CAPTURE_AUDIO(duration_seconds: float) → {
    // 1. Request microphone access
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })

    // 2. Create AudioContext at 44.1kHz
    ctx = new AudioContext({ sampleRate: 44100 })

    // 3. Record for `duration_seconds`
    source = ctx.createMediaStreamSource(stream)
    recorder = new MediaRecorder(stream)
    chunks = []
    recorder.ondataavailable = (e) => chunks.push(e.data)
    recorder.start()
    sleep(duration_seconds)
    recorder.stop()

    // 4. Return raw PCM buffer
    audio_buffer = await decode_to_float32(chunks)
    return {
        samples: Float32Array,      // raw PCM samples
        sample_rate: 44100,
        duration: duration_seconds,
    }
}
```

### 4b. Fake Audio Generation (for Demo)
```
// Generate synthetic WAV files with embedded CDMA chirps.
// Each device's audio file has:
//   - Its OWN chirp LOUD (the device transmitted it)
//   - Nearby devices' chirps FAINT (attenuated by distance)
//   - Ambient noise

GENERATE_FAKE_AUDIO(devices: Device[], topology: Topology) → {

    for each device D in devices:

        // 1. Create silent buffer: 30s × 44.1kHz = 1,323,000 samples
        buffer = zeros(30 * 44100)

        // 2. Embed D's OWN Gold-coded chirp at random offset (LOUD)
        chirp = GoldCode(D.ephemeral_key, SF=128, n=7)
        tx_time = random(2.0, 28.0)  // seconds into the 30s buffer
        tx_sample = tx_time * 44100
        buffer[tx_sample : tx_sample + len(chirp)] += chirp * 0.8  // LOUD

        // 3. Embed NEARBY devices' chirps (FAINT, delayed)
        for each neighbor N in topology[D]:
            if N == D: continue
            chirp_N = GoldCode(N.ephemeral_key, SF=128, n=7)
            distance = topology[D][N]  // meters
            delay_seconds = distance / 343  // speed of sound
            attenuation = 1.0 / (distance * distance)  // inverse square law
            tx_sample_N = tx_time * 44100 + delay_seconds * 44100
            buffer[tx_sample_N : tx_sample_N + len(chirp_N)] += chirp_N * attenuation * 0.3

        // 4. Add ambient noise (AWGN, σ=0.02)
        buffer += gaussian_noise(0, 0.02, len(buffer))

        // 5. Normalize to [-1, 1]
        buffer /= max(abs(buffer))

        // 6. Encode as WAV
        wav_bytes = ENCODE_WAV(buffer, sample_rate=44100, bits=16)
        SAVE("device_{D.id}_audio.wav", wav_bytes)
}
```

### 4c. WAV Encoding (Pure Function)
```
ENCODE_WAV(samples: Float32Array, sample_rate: int, bits: int) → bytes:
    // WAV header (44 bytes) + PCM data
    data_size = len(samples) * (bits / 8)
    header = [
        "RIFF",                              // chunk ID
        uint32(36 + data_size),              // chunk size
        "WAVE",                              // format
        "fmt ",                              // subchunk ID
        uint32(16),                          // subchunk size
        uint16(1),                           // audio format (PCM)
        uint16(1),                           // channels (mono)
        uint32(sample_rate),                 // sample rate
        uint32(sample_rate * bits / 8),      // byte rate
        uint16(bits / 8),                    // block align
        uint16(bits),                        // bits per sample
        "data",                              // data chunk ID
        uint32(data_size),                   // data chunk size
    ]
    pcm = int16(samples * 32767)  // float32 → int16
    return concat(header, pcm)
```

### 4d. Matched Filter Correlation (Verifier-Side)
```
// The verifier has:
//   - Every device's Gold code (derived from ephemeral_key)
//   - Every device's raw audio buffer
// Correlates each code against each buffer to find chirp peaks.

CORRELATE_ALL(audio_buffers: map[key → Float32Array],
              gold_codes: map[key → Int8Array]) → {

    results = {}

    for each (recorder_key, buffer) in audio_buffers:
        for each (transmitter_key, code) in gold_codes:
            if recorder_key == transmitter_key: continue

            // Cross-correlate code against buffer
            // O(buffer_len × code_len) — but we optimize with:
            //   - Search window: ±100ms around claimed tx time
            //   - Snippet: only correlate 2s of audio
            correlation = cross_correlate(
                buffer[tx_time - 0.1s : tx_time + 0.1s],
                code,
            )

            // Peak detection
            peak_value = max(correlation)
            peak_offset = argmax(correlation)
            if peak_value > THRESHOLD:
                distance = peak_offset / 44100 * 343  // speed of sound
                results[(transmitter_key, recorder_key)] = {
                    detected: true,
                    correlation: peak_value,
                    distance_meters: distance,
                }
            else:
                results[(transmitter_key, recorder_key)] = {
                    detected: false,
                    correlation: peak_value,
                }

    return results
}
```

---

## 5. END-TO-END FLOW

### 5a. Capture Session (Offline)
```
// N devices in proximity, no internet

for each device D:
    // 1. Generate ephemeral EdDSA keypair from duress passphrase
    priv, pub, nonce = DERIVE_DURESS_KEY(passphrase, is_duress)

    // 2. Start audio recording (continuous, 30s buffer)
    start_audio_recording()

    // 3. Broadcast BLE beacon every 5s
    beacon = { pk: pub, nonce: nonce, timestamp: now() }
    ble_advertise(beacon)

    // 4. Passively observe BLE beacons into bloom filter
    observed = bloom_filter(capacity=500, fpr=0.02)
    for each beacon in ble_scan():
        observed.add(beacon.nonce)

    // 5. Transmit acoustic CDMA chirp
    chirp = GoldCode(pub, SF=128)
    play_ultrasonic(chirp)  // 18-22kHz, inaudible

    // 6. After 30s, stop recording
    audio_buffer = stop_audio_recording()

    // 7. Sign the raw audio hash
    audio_hash = SHA256(audio_buffer)
    signature = Ed25519_Sign(priv, audio_hash)

    // 8. Store everything locally (no network yet)
    save_locally({
        pub, nonce,
        observed_bloom: observed.serialize(),
        audio_buffer,
        audio_hash,
        signature,
        ble_beacons_sent: [...],
    })
```

### 5b. Upload (When Connectivity Returns)
```
for each device D:
    // 1. Generate ZK proof of hardware authenticity
    witness = GENERATE_WITNESS(scrubber.wasm, { ... })
    proof = GENERATE_PROOF(scrubber.zkey, witness)

    // 2. Upload payload to MNR server
    POST /api/mnr/payload {
        ephemeral_key: D.pub,
        device_id: D.hardware_id,
        captured_keys: D.observed_bloom.extract_keys(),
        zk_proof: proof,
        zk_public_signals: proof.public_signals,
    }

    // 3. Sign receipts for every observed device
    for each observed_key in D.observed_bloom.keys():
        receipt_sig = Ed25519_Sign(D.priv, observed_key)
        POST /api/mnr/receipt {
            device_id: D.hardware_id,
            target_key: observed_key,
            signature: receipt_sig,
        }
```

### 5c. Verification (Online)
```
// A third party wants to verify the video's provenance

// 1. Compute frame hash chain from video
hashes = [SHA256(f) for f in video_frames]
chain = build_hash_chain(hashes)      // each links to previous
merkle_root = compute_merkle_root(chain)

// 2. Check OTS proof: was this Merkle root anchored in Bitcoin?
ots_result = VERIFY_OTS(ots_proof, merkle_root)
// → { valid: true, block_height: 812345 }

// 3. Check MNR certificate: were there co-located witnesses?
cert = GET /api/mnr/certificate/{cert_id}
// → { key_a, key_b, issued_at, ... }

// 4. Check ZK proof: was this filmed on authorized hardware?
zk_result = VERIFY_PROOF(verification_key, proof, public_signals)
// → true (but doesn't reveal which hardware)

// 5. All checks passed → video is authentic
return ots_result.valid && cert.exists && zk_result
```

---

## Decision: Proof Language?

For the native port: the protocol itself benefits from formal specification but
the IMPLEMENTATION doesn't need a proof language. What would add value:

| Component | Formal verification? | Tool |
|-----------|---------------------|------|
| ZK circuit | Already formally verified by Circom compiler | ✅ |
| MNR rollup protocol | Could model in TLA+ for liveness/safety | Optional |
| Duress key derivation | Trivial crypto — standard library suffices | ❌ |
| CDMA correlation | Signal processing — test with synthetic data | ❌ |

**Recommendation:** Don't use a proof language yet. The Circom circuit is
already the formal specification of the ZK component. For the MNR protocol,
if you want to prove properties like "no certificate issued without mutual
entanglement," that's a ~50-line TLA+ spec. Everything else is standard
crypto that's well-tested by library authors.
