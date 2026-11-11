# Attack Model: Multi-Modality Witness Spoofing

**Core question:** Does ease of spoofing grow more slowly than ease of proving real events?

---

## The Relay Attack Family

You've identified the unified attack: any single-modality presence proof can be relayed.

| Modality | Relay Method | Hardware Cost | Detectable? |
|----------|-------------|---------------|-------------|
| **Acoustic** (CDMA) | Mic → internet → speaker | Cheap ($5 mic + $5 speaker) | **Yes** — time-of-flight ranging catches latency >~50ms |
| **BLE** | BLE scanner → internet → BLE transmitter | $10 nRF dongle × 2 | **Partially** — BLE 5.1 AoA/ranging can detect, but range is short (~10m) |
| **Optical** (camera) | Camera → video feed → screen | $20 webcam + $50 monitor | **Yes** — screen flicker, Moiré patterns, perspective mismatch |
| **Optical beacon** (your light bar idea) | Light sensor → internet → bright light | $10 photodiode + $100 light | **Hard** — needs physically consistent illumination in 3D space |

The key insight is: **a single relay is cheap, but synchronous N-way relay is exponentially harder.**

---

## Why BLE Mesh Helps (and Doesn't)

**How BLE helps:** BLE advertisements in the mesh create an independent *channel* for exchanging cryptographic handshake data (public keys, session nonces, signed attestations) that the acoustic channel can't carry efficiently due to its low data rate (Gold-code sequences carry ~1 bit/symbol).

The benefit is **protocol, not physics**: BLE separates the key-exchange layer from the ranging layer.

| Layer | Channel | Purpose | Spoofable? |
|-------|---------|---------|------------|
| Ranging | Acoustic CDMA | Prove co-presence via TOF | Yes, with relay |
| Handshake | BLE | Exchange keys, nonces, signatures | Yes, with relay |
| Verification | Cross-modal (CME) | Prove both came from same device | **No** — CME binds audio + BLE timing |

The cross-modal entanglement (CME) is the actual security: if the acoustic ranging frame and the BLE advertisement arrive at the verifier with mismatched timing, it reveals a relay. CME already exists in RealPeep for audio+video; extending it to audio+BLE is straightforward.

**Where BLE is weaker:** BLE 5.1 ranging accuracy is ~1–5m vs acoustic's ~10cm. But BLE's angle-of-arrival (AoA) adds *directional* data that acoustics doesn't provide — if the BLE signal arrives from a different direction than the acoustic source, that's a relay signature.

**Verdict:** BLE mesh doesn't prevent relay attacks by itself. But BLE + acoustic together create a **cross-modal timing constraint** that's hard to spoof synchronously. The two channels operate at different speeds of light/sound — any relay that introduces different delays on each channel is detectable by CME.

---

## The Optical Beacon Idea — Analysis

A bright light bar with an IMU (like emergency vehicle lighting) creates a **physically verifiable illumination source**:

### What it proves

1. **The light was there** — its temporal pattern (cryptographically signed, with nonce) appears in the video
2. **It illuminated the scene** — shadows, skin reflections, and surface highlights are physically consistent with the light's position
3. **It moved consistently** — IMU data from the light bar matches its visible motion in the video

### This is NOT ray tracing

You don't need full ray tracing. Cheaper checks that are sufficient:

```
Simple check:     Does the beacon's temporal pattern appear in the video?
                  (Cross-correlation between IMU clock and video frames)
                  
Better check:     Are the shadows consistent with one bright light source?
                  (Check shadow direction in 2–3 reference points in the frame)
                  
Strong check:     Is the specular highlight on skin/glass consistent with 
                  the light's position? (Reflection direction test)
```

All three are lightweight pixel operations, not Monte Carlo path tracing.

### How it kills the relay

To spoof presence via relay, the attacker now needs:
1. Acoustic relay (mic → internet → speaker)
2. BLE relay (scanner → internet → transmitter)
3. **Optical replay** — record the light bar pattern and play it back on a screen

Attack #3 is detectable: a screen showing a replayed light pattern will have:
- Different polarization than a real bright light
- Screen refresh artifacts (PWM, scanning)
- Lower dynamic range (a real light bar is ~1000+ nits; screens are ~300–600 nits)
- Incorrect shadows (the replay screen doesn't actually illuminate the scene)

A real bright light illuminates the *entire 3D scene*. A screen only illuminates the pixels pointing at it. This is the fundamental asymmetry.

---

## The Asymmetry Property

Your framing is exactly right: **real security comes from proving that spoofing cost grows faster than proving cost.**

### Single modality

| Dimension | Proving (honest) | Spoofing (relay) |
|-----------|-----------------|------------------|
| Hardware | 1 phone | 2 phones + internet |
| Setup | None | Synchronized relay |
| Detection risk | 0 | Time-of-flight mismatch |

**Ratio:** ~2× cost for attacker. **Not enough.**

### Two modalities (acoustic + BLE)

| Dimension | Proving | Spoofing |
|-----------|---------|----------|
| Hardware | 1 phone | 4 phones + internet |
| Sync | None | Acoustic + BLE must match within ms |
| Detection risk | 0 | TOF mismatch on EITHER channel catches you |

**Ratio:** ~4× cost. **Better, but a state actor can do this.**

### Three modalities (acoustic + BLE + optical beacon)

| Dimension | Proving | Spoofing |
|-----------|---------|----------|
| Hardware | 1 phone + light bar ($50) | 6+ devices + sync infrastructure + scene-aware video projector |
| Sync | None | 3 channels synchronized |
| Detection risk | 0 | TOF on acoustic, AoA on BLE, illumination physics on optical |
| Scene knowledge | Not needed | Need to know the 3D scene geometry for consistent shadows |

**Ratio:** ~100×+ cost for attacker. The scene knowledge requirement is the kicker — to spoof the optical beacon, you need to know the exact 3D geometry of the protest location and render physically correct illumination in real time.

### N modalities (with time bracketing)

With time bracketing narrowing to ~1 second CDMA frames:

| | Proving | Spoofing |
|--|---------|----------|
| Cost | O(N) — N phones, present once | O(2^N × K) — N relay channels × K scene renderings |
| Scaling | Linear with participants | Exponential with modalities |

This is the asymmetry you're looking for.

---

## What the Literature Says

Several papers from our review are directly relevant:

**Proximity testing SoK (Gambs 2020):** Classifies multi-modality co-presence as "hybrid peer-verified" — the strongest category. No paper in their SoK considered using a physical beacon (light bar) as an independent verification channel.

**Watch Nearby! (Caprolu 2023):** Telegram's GPS-based "People Nearby" failed because GPS is a single modality that's easily spoofed with mock location providers. The key failure was lack of independent physical verification.

**Cross-Modal Entanglement (CME) — RealPeep's existing module:** CME already cross-correlates audio and video timing. Adding optical beacon correlation extends this to a third modality (bright light temporal patterns).

**Distance bounding (Boureanu et al. 2016):** Standard distance bounding protocols use round-trip time of a single RF channel. Multi-modality ranging (acoustic TOF + BLE AoA + optical cross-correlation) is a novel extension not covered in the literature.

---

## Practical Recommendation

**Don't build the light bar yet.** Start with:

```
Phase 1 (current):   Acoustic CDMA mesh only
  Attack surface:     Relay attack (mic→internet→speaker)
  Mitigation:         TOF ranging catches >50ms latency
                      10-witness mesh requires 10 synchronized relays

Phase 2 (next):      Add BLE mesh as data channel
  Attack surface:     Same relay, harder sync
  Mitigation:         Attacker must now relay BOTH acoustic + BLE
                      with consistent ranging on both

Phase 3 (future):    Add optical beacon verification
  Attack surface:     Relay + scene rendering required
  Mitigation:         Illumination physics can't be faked on a flat screen
```

The light bar idea is worth prototyping because it's the first modality that can't be trivially relayed — it fundamentally interacts with the 3D scene. But the multi-witness mesh (Phase 1 + Phase 2) already makes relay expensive enough for most adversaries. A protest with 100 phones in the mesh requires 100 synchronized relay channels to spoof — that's nation-state level.
