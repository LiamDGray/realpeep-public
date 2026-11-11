# Neopixel Chest Strip: Collective Visual Signature

**Concept:** Each protester wraps a Neopixel strip around their chest, phone-controlled. It serves as a directional marker, illumination source, and collective visual signature field.

---

## What It Proves

### 1. Camera Direction (Phone Pose)

When Phone A records the scene, Protester B's Neopixel strip appears in A's video. The strip's visible shape (a curve wrapping around a human torso) tells the verifier:

- **Where B was** relative to A's camera (direction in frame)
- **Which way B's phone was facing** (the strip is on B's chest; B's phone points the same direction as B faces)
- **Consistency check:** If A's phone records B's strip, and B's phone records A's strip, the mutual visibility constrains both camera poses.

This is essentially a **passive visual lighthouse** — the strip doesn't need to be bright enough to illuminate the scene; it just needs to be visible in other cameras.

### 2. Cryptographic Temporal Signature

The phone controls the Neopixel with a pseudorandom color sequence derived from the mesh session key:

```
Frame 1: RGB(0x7A, 0x3F, 0xC1)  ← derived from session_key || nonce || frame_number
Frame 2: RGB(0xD4, 0x92, 0x0B)
Frame 3: RGB(0x1E, 0x58, 0xF7)
...
```

Other phones' cameras record these patterns. A verifier can:
1. Extract the color sequence from the video (sub-pixel tracking of the strip in frame)
2. Verify it matches the expected sequence for that device at that session time
3. Cross-check that the timing is consistent with the phone's acoustic CDMA frame clock

**This is a visual attestation:** "Device A's camera attests that it saw Device B's Neopixel pattern at video frame T."

### 3. Collective Signature Field (Superposition)

Multiple Neopixel strips in one camera frame create a **spatiotemporal color field**:

```
Frame at time T:
  Pixels at (x₁,y₁): Device A's color    
  Pixels at (x₂,y₂): Device B's color
  Pixels at (x₃,y₃): Device C's color
  ...
```

The verifier checks:
- Are all observed color sequences consistent with the mesh session's keyed PRNG?
- Are the spatial positions consistent with each device's reported location?
- Are the temporal offsets within the mesh synchronization tolerance?

**This is the visual equivalent of the acoustic CDMA mesh.** Instead of Gold-code sequences in audio, you have color sequences in video. The two modalities are independent but synchronized via the mesh session clock.

---

## Why This Beats a Simple Light Bar

| Property | Light bar (single) | Neopixel strip (per person) |
|----------|-------------------|---------------------------|
| Cryptographic binding | One beacon, one key | Each phone controls its own strip with its own derived key |
| Spatial coverage | Single point | Distributed across all participants |
| Mutual visibility | Beacon sees everyone; cameras see beacon | Every phone sees every other phone's strip |
| Spoofing cost | Spoof one beacon | Spoof N strips with N different keys simultaneously |
| Redundancy | Single point of failure | N independent channels |

The **mutual visibility** is the key. With a single light bar, you need the camera to capture the beacon and the scene. With per-person strips, every phone captures the strips of all nearby phones — creating an N×N attestation matrix.

---

## Attack Model

### Relay Attack Against Neopixel

To fake presence, an attacker needs to:

1. **Know the pseudorandom sequence** for each device they're impersonating. This requires compromising the mesh session key — infeasible if the key is established via the acoustic CDMA handshake (physical proximity required).

2. **Display the correct color sequence** on a screen that appears in other cameras' footage. The attacker must position their screen at the correct location and angle to match the impersonated device's field of view.

3. **Synchronize with the mesh clock.** The Neopixel pattern timing must match the acoustic CDMA frame clock within ~10ms. Any misalignment reveals the relay.

### Why This Is Harder Than Acoustic Relay

| Attack | Acoustic-only | Acoustic + Neopixel |
|--------|--------------|-------------------|
| Know what to transmit | Capture acoustic signal over radio | Capture acoustic signal + know the visual sequence (requires same session key) |
| Synchronize channels | 1 channel (audio) | 2 channels (audio + visual) with different physics |
| Position correctly | Just need a speaker | Need a screen at the correct 3D position relative to all cameras |
| Avoid visual detection | N/A (audio relay is invisible) | Screen must match Neopixel's spatial structure (individual LEDs on a curved surface) |

**The visual channel adds a spatial geometric constraint that the audio channel doesn't have.** With audio relay, the speaker just needs to be somewhere in the room. With Neopixel relay, the screen showing the pattern must appear in the correct 3D position relative to every other camera — which is geometrically constrained by the multi-view consistency check.

---

## Physical Properties That Help

Neopixel strips have measurable physical characteristics that distinguish them from a screen replay:

| Property | Neopixel strip | Screen replay |
|----------|---------------|---------------|
| Spatial structure | Visible individual LEDs at ~1cm pitch | Continuous pixels on a flat panel |
| Curve | Wraps around a 3D torso (visible curvature) | Flat plane or slight curve |
| Brightness | WS2812b: ~2000 mcd per LED | Screen: ~300–600 nits (much less per-pixel intensity) |
| Refresh | PWM at ~800Hz (visible as scan lines in fast video) | Screen refresh at 60–240Hz |
| Color shift | Off-angle LEDs show different colors due to encapsulation lens | Screen stays uniform off-angle |
| Scatter | Lights up nearby surfaces (ambient chest glow) | Screen illuminates only its own pixels |

A verifier doesn't need to check all of these. Any one of them detects a naive screen replay. A sophisticated attacker would need to simulate all simultaneously — which is the exponential scaling problem.

---

## Practical Considerations

### Hardware

- **WS2812B strip** (or similar): ~$5/meter, 60 LEDs/meter
- **1 meter per person:** ~$5 per protester
- **Phone connection:** Via GPIO audio jack (data pin on tip) or BLE. Audio jack is simpler (no pairing, no battery drain).
- **Power:** The strip draws ~50mA at 5V for 60 LEDs on white. Most phones can supply this via USB-OTG or the strip has its own small battery pack ($2).

### Control Protocol

```
Phone generates:
  session_key ← CDMA mesh handshake (existing)
  
  for each video frame f:
    color_f = PRNG(session_key || device_id || f) → RGB24
  
  sends to Neopixel: color_f at video frame rate (30fps)
  also embeds: color_f as metadata in video encode (side-channel)
```

The verifier:
1. Reads the Neopixel pattern from the video (average color of the strip region)
2. Reads the expected pattern from the phone's side-channel data
3. Computes: do they match within tolerance?
4. Cross-checks: does phone A's camera show phone B's correct pattern?

### Should This Replace the Acoustic Mesh?

**No — it's an additional channel, not a replacement.** The acoustic mesh provides:
- Precise time-of-flight ranging (~10cm accuracy) that visual can't match
- Omnidirectional coverage (sound goes around obstacles; visual requires line of sight)
- Low power (microphone vs camera always-on)

The Neopixel provides:
- Visual attestation that's geometrically constrained by multi-view cameras
- Directional data (phone pose) that acoustics can't provide
- Collective signature visible to all participants simultaneously

Together, they create **four independent channels**: acoustic CDMA, BLE handshake, visual Neopixel, and IMU data. All four must be consistent for a verifier to accept the session as genuine.

---

## Open Questions for the Literature

No paper in our search addresses **distributed visual signatures** as a collective co-presence proof. The closest related work is:

1. **Structured light for depth sensing** (Kinect, iPhone LiDAR) — but those use a single active emitter, not a mesh of coordinated emitters.
2. **Smartphone flash synchronization** (research cameras syncing phone flashes) — but no cryptographic binding.
3. **Visual light communication (VLC)** — LiFi, camera-to-camera optical data links — but no co-presence verification use case.

**This is genuinely novel.** A distributed multi-witness visual signature field with cryptographic temporal patterns and cross-camera attestation doesn't exist in the literature.
