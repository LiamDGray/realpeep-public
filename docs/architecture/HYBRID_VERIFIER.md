# Hybrid Mesh Verifier: BLE + Acoustic Architecture

## Overview

The verifier combines two physical channels — BLE radio and acoustic ultrasound — in
a three-phase pipeline. The BLE channel provides fast, scalable pairwise detection.
The acoustic channel provides room-level spatial proof via matched filter correlation
on short audio snippets. Neither alone is sufficient; together they cover each other's
weaknesses.

```
┌─────────────────────────────────────────────────────────────────┐
│                     CAPTURE TIME (on-device)                     │
│                                                                  │
│  ┌──────────────────────┐   ┌──────────────────────────────────┐ │
│  │ BLE Channel          │   │ Acoustic Channel                  │ │
│  │                      │   │                                   │ │
│  │ Advertise every 5s:  │   │ Transmit Gold-coded chirp         │ │
│  │ pk + nonce + mesh_id │   │ (2s, 18-22kHz) every 30s          │ │
│  │                      │   │                                   │ │
│  │ Build bloom filter of│   │ Record 2s raw audio around        │ │
│  │ OTHER devices' nonces│   │ OWN transmission timestamp        │ │
│  │                      │   │                                   │ │
│  │ Sign bloom filter    │   │ Hash raw audio → sign the hash    │ │
│  └──────────────────────┘   └──────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│                    Both uploaded to verifier                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    VERIFIER TIME (server-side)                    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ PHASE 1: BLE Bloom (fast, all pairs)                        │ │
│  │                                                             │ │
│  │  For each device D:                                         │ │
│  │    For each other device O:                                 │ │
│  │      if O.nonce in D.bloom_filter → D heard O              │ │
│  │                                                             │ │
│  │  Output: N×N adjacency matrix (~25ms for N=5000)           │ │
│  │  Issue: PROVISIONAL group certificate                        │ │
│  └──────────────────────┬──────────────────────────────────────┘ │
│                         │                                         │
│                         ▼                                         │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ PHASE 2: Acoustic Audit (targeted, per BLE edge)            │ │
│  │                                                             │ │
│  │  For each BLE-confirmed pair (A, B):                        │ │
│  │    Derive A's Gold code from pk_A                            │ │
│  │    Search B's raw audio snippet at claimed t_A ±100ms       │ │
│  │    Cross-correlate: ρ = max(matched_filter(code_A, audio_B))│ │
│  │    if ρ > threshold → room-level co-location CONFIRMED      │ │
│  │    else → FLAG for challenge                                │ │
│  │                                                             │ │
│  │  Output: confidence score per pair (~14s for N=5000, K=25)  │ │
│  └──────────────────────┬──────────────────────────────────────┘ │
│                         │                                         │
│                         ▼                                         │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ PHASE 3: Challenge (on demand)                              │ │
│  │                                                             │ │
│  │  For each flagged pair:                                     │ │
│  │    Cross-correlate at higher resolution (longer window)     │ │
│  │    Check propagation delay plausibility                     │ │
│  │    if still failing → mark as COERCED / SUSPICIOUS         │ │
│  │                                                             │ │
│  │  Output: FINAL group certificate or FLAGGED report          │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Channel Comparison

| Property | BLE | Acoustic |
|----------|-----|----------|
| **Range** | ~10m | ~20m |
| **Evidence** | Signed receipt (bloom filter) | Raw audio with embedded signal |
| **Proves** | Two devices within ~10m | Two devices in same PHYSICAL ROOM |
| **Verifier cost** | O(N² × k), ~25ms for N=5000 | O(N × K × window × SF), ~14s for N=5000 |
| **On-device cost** | ~30mW Rx, ~10mW Tx | ~5mW Tx (speaker), recording is free |
| **Noise immunity** | High (2.4GHz) | Low (crowd noise, obstacles) |
| **Spatial resolution** | None (RSSI is unreliable) | ±0.3m from propagation delay |

## The Acoustic Snippet Constraint

Each device records a **2-second raw audio snippet** centered on its own transmission
timestamp. The timestamp is embedded in the BLE beacon (signed, cannot be forged).
The verifier knows exactly when each device claimed to transmit.

When checking if Device A was present in Device B's recording, the verifier:

1. Gets A's claimed transmission time t_A from A's BLE beacon
2. Opens B's raw audio snippet around t_A (search window ±100ms)
3. Derives A's Gold code from A's public key
4. Cross-correlates the code against the search window
5. If correlation peak > threshold: A was physically in B's acoustic space

The ±100ms window covers:
- Acoustic propagation delay (max ~58ms for 20m at 343m/s)
- Clock skew between devices (typically <20ms for synchronized phones)
- Audio sample rate drift (negligible over 2s)

## Pseudocode

```python
class HybridVerifier:
    """Three-phase verifier combining BLE bloom + acoustic correlation."""

    def __init__(self):
        self.ble_verifier = BleMeshVerifier()
        self.acoustic_pairs: dict[tuple[int,int], AudioSnippet] = {}
        self.phase1_result = None
        self.phase2_result = None

    # ── Phase 1: BLE Bloom ──

    def submit_ble_observation(self, pk, bloom): ...
    def submit_ble_beacon(self, beacon): ...

    def run_phase1(self) -> dict:
        """Fast BLE adjacency matrix. Always runs first."""
        matrix = self.ble_verifier.build_matrix()
        cert = self.ble_verifier.issue_certificate(matrix) if \
               self.ble_verifier.is_connected(matrix) else None
        self.phase1_result = {
            'matrix': matrix,
            'cert_provisional': cert,
            'observed_pairs': self._get_observed_pairs(matrix),
        }
        return self.phase1_result

    # ── Phase 2: Acoustic Audit ──

    def submit_acoustic_capture(self, pk, raw_audio_snippet, claimed_tx_time):
        """Submit a 2s raw audio snippet with known transmission time.
        pk: the device's ephemeral public key
        raw_audio_snippet: ~88k samples at 44.1kHz
        claimed_tx_time: local timestamp when device transmitted its chirp
        """
        self.acoustic_pairs[pk] = {
            'audio': raw_audio_snippet,
            'tx_time': claimed_tx_time,
        }

    def run_phase2(self) -> dict:
        """For each BLE-observed pair, verify with acoustic correlation.
        Only checks pairs that BLE says are proximate."""
        pairs = self.phase1_result['observed_pairs']
        results = []
        for pk_a, pk_b in pairs:
            confidence = self._correlate_pair(pk_a, pk_b)
            results.append({
                'pair': (pk_a, pk_b),
                'ble_observed': True,
                'acoustic_confidence': confidence,
                'acoustic_confirmed': confidence > THRESHOLD,
            })
        self.phase2_result = {
            'pair_results': results,
            'confirmed_pairs': [r for r in results if r['acoustic_confirmed']],
            'flagged_pairs': [r for r in results if not r['acoustic_confirmed']],
        }
        return self.phase2_result

    def _correlate_pair(self, pk_heard, pk_recorder) -> float:
        """Cross-correlate heard device's Gold code against recorder's audio.
        Returns peak correlation value (0-128 for SF=128)."""
        audio = self.acoustic_pairs[pk_recorder]['audio']
        tx_time = self.acoustic_pairs[pk_heard]['tx_time']

        # Search window: ±100ms around claimed tx time
        window_start = max(0, tx_time - 0.100)
        window_end = min(len(audio), tx_time + 0.100)
        search_window = audio[window_start:window_end]

        # Derive Gold code from heard device's pk
        code = gold_code_from_pk(pk_heard)

        # Cross-correlate
        peak = np.max(np.correlate(search_window, code))
        return float(peak)

    # ── Phase 3: Challenge ──

    def run_phase3(self, flagged_pairs: list) -> dict:
        """Re-examine flagged pairs with higher scrutiny.
        Longer correlation window, distance plausibility check."""
        for pair in flagged_pairs:
            # Wider search window (±250ms)
            confidence = self._correlate_pair(pair[0], pair[1], window_ms=250)
            # Distance check from propagation delay
            distance = self._estimate_distance(pair[0], pair[1])
            pair['phase3_confidence'] = confidence
            pair['distance_plausible'] = 0.5 < distance < 50

    def issue_final_certificate(self) -> BleGroupCertificate:
        """Issue the final group certificate.
        Only includes devices that passed all phases."""
        ...
```

## Cost Summary

```
                          Single Pair          N=100              N=5000
                          (μs/ops)             (total)            (total)
Phase 1 (BLE bloom)       0.001 μs             0.1 μs             25 ms
Phase 2 (acoustic)        113 μs              282 ms              14 s
Phase 3 (challenge)       226 μs (2× window)  564 ms (worst-case) 28 s

Note: Phase 2 only runs on BLE-observed pairs (N × K_hops), not N².
In a crowd of 5000, each device hears ~25 neighbors → 125K pairs, not 25M.
```

## Upload Constraints

```
BLE observation commitment (bloom filter + signatures): ~200 bytes/device
Acoustic snippet (2s × 44.1kHz × 16-bit):             ~176 KB/device
Acoustic snippet with metadata:                        ~200 KB/device

For N=5000:
  BLE data:    ~1 MB total (trivial)
  Acoustic:    ~1 GB total (feasible as progressive upload over ~few min)

Acoustic uploads can be deferred and batched — the BLE phase
provides immediate provisional proof. The acoustic audit runs
asynchronously as snippets arrive.
```
