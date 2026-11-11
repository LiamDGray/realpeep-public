# Mutual Non-Repudiation and Collective Witness

*How physics-based provenance changes power dynamics in adversarial situations.*

---

## What Is Mutual Non-Repudiation?

**Non-repudiation** means someone cannot later deny having done something. **Mutual** means it works both ways — neither party can deny.

In everyday life, most interactions have no non-repudiation. It's just one person's word against another's. A contract has signatures (non-repudiation of the signed document), but the conversation *about* the contract has no proof. A police report describes an arrest, but the suspect's account may differ — and there's no independent physical record of who said what, when, and under what conditions.

RealPeep's acoustic mesh creates **physical, cryptographic mutual non-repudiation** — not about what someone *said*, but about the fact that two or more devices were physically present at the same event, at the same time, in the same space. This is a fundamentally different kind of proof than a recording or a signature.

---

## Scenario 1: Contract Negotiation

### Without MNR

Alice and Bob negotiate a contract over several meetings. At the final signing, Bob claims Alice agreed to a clause that Alice says was never discussed. The contract has a gap. Neither can prove what was actually said — it's word against word.

If the negotiation was recorded, either party could claim the recording was selectively edited or AI-generated. The recording itself has no provenance proof.

### With RealPeep

Both Alice and Bob attend the meeting with phones running RealPeep. The phones exchange ultrasonic beacons throughout — creating a continuous record that both devices were physically in the same room at the same time. The beacon chain proves the meeting happened, when it happened, how long it lasted, and that both parties were present throughout.

**What this proves:**
- Alice and Bob were in the same physical space for the duration of the meeting
- Neither left and returned at a different time (the beacon chain is continuous)
- The meeting happened on that date, at that location, at that time

**What this does not prove:**
- What was actually said (that's what audio recording is for)
- Who initiated the meeting
- Whether either party was under duress

**Why it matters:** If Bob later claims "Alice and I never met that day" or "I was only there for five minutes," the mesh attestation proves otherwise. The acoustic chain is physically anchored — Bob cannot claim the data was fabricated without explaining how multiple independent devices recorded the same acoustic signature.

### The Power Shift

| Party | Before RealPeep | After RealPeep |
|-------|----------------|----------------|
| **Bob** (denying meeting) | "I have no record of that meeting. Alice is lying." | "I was there — the mesh proves it. Now the question is what was said." |
| **Alice** (claiming meeting) | "We met. I have a recording." — Bob: "That's AI-generated." | "The mesh proves we were in the same room. The audio is forensically anchored to that time and place." |
| **Third party** (judge, mediator) | He-said-she-said. Impossible to resolve without external evidence. | "We know the meeting happened. The provenance chain is independently verifiable by anyone." |

---

## Scenario 2: Disciplinary Hearing

### Without MNR

An employee is called to a disciplinary hearing with their supervisor. The supervisor claims the employee was warned about performance issues. The employee claims no such warning was given. The meeting was not recorded — company policy.

The employee is fired. They sue for wrongful termination. The supervisor testifies under oath that the warning was delivered. The employee testifies it wasn't. There is no third-party evidence.

### With RealPeep

The employee has RealPeep running on their phone (placed on the table during the meeting). The supervisor's company phone also has RealPeep (corporate policy for precisely this reason). Both phones exchange acoustic beacons throughout the meeting.

**What the mesh proves:**
- Both parties were physically present for the duration
- The meeting occurred at the scheduled time
- The meeting lasted a specific duration
- Neither party left the room mid-meeting

**What happens if the supervisor fabricates a written warning:**
The supervisor claims: "I gave you a written warning during our March 15 meeting."
The employee checks: the mesh attestation from March 15 shows a 8-minute meeting. A written warning delivery takes at least 15-20 minutes (read, acknowledge, sign). The duration itself is evidence.

**What happens if the supervisor claims the employee was aggressive:**
The supervisor: "The employee was shouting and threatening."
The employee: "The mesh shows I was calm throughout."
Neither is directly proven by the mesh — but the mesh **anchors** any other forensic evidence (audio recording, room acoustics, witness testimony) to a specific time and place. Fabrication becomes much harder when the timeline is cryptographically fixed.

---

## Scenario 3: Conversation with a Supervisor

### Without MNR

A supervisor says to an employee: *"If you don't take that early retirement package, I'll make your life miserable. But you didn't hear it from me."*

The employee is later pressured into signing. No record of the threat exists. The supervisor denies ever saying it. The employee has no recourse.

### With RealPeep

The employee has RealPeep running. The mesh attestation proves the supervisor was physically present in the employee's workspace for a one-on-one conversation. The timing aligns with the pressure campaign.

**Critical distinction:** The mesh does not record what was said. It records only **presence**. But presence + timing is often enough to establish a pattern:

- *Supervisor visits employee's desk for 3 minutes the day before the retirement package deadline*
- *Supervisor visits again for 2 minutes the morning of the deadline*
- *Employee signs the package that afternoon*

The mesh chain creates a timeline that the supervisor cannot explain away. "I was just checking in" — the timing says otherwise, and the third-party verifiable proof fixes the timeline immutably.

---

## Scenario 4: Arrest by Police

This is the most consequential scenario.

### Without MNR

A person is arrested. What happens next is a he-said-she-said that can determine the rest of someone's life.

**The police claim:**
- The suspect was read their Miranda rights
- The suspect voluntarily confessed
- The suspect was not mistreated
- The suspect resisted arrest

**The suspect claims:**
- They were never read their rights
- The confession was coerced (beaten, threatened)
- They were compliant throughout

**The cellphone:** Confiscated immediately. Any recording stops. The phone's data can be cloned, edited, or planted. Even if the suspect was recording, the recording ends when the phone is seized.

### With RealPeep

The suspect has RealPeep running when they're stopped. The phone's acoustic mesh is active — it was exchanging beacons with other phones at the protest, event, or public space.

**When the phone is confiscated:**
The phone stops broadcasting. The mesh immediately notes: *"Device X stopped beaconing at timestamp T."*

**What the mesh proves (to the notary, after the fact):**
- The suspect's phone was at location L at time T
- The suspect's phone was exchanging beacons with N other devices
- At timestamp T+X, the phone stopped beaconing — this is the moment of confiscation
- The phone never resumed beaconing (it's still in police custody)

**What the police cannot explain away:**
- "The suspect was never at that location" — the mesh chain proves otherwise
- "The suspect was acting alone" — the mesh chain proves N other devices were in proximity
- "The suspect was arrested at a different time" — the beacon chain fixes the timestamp

**What about the confession?**
The police claim the suspect confessed at the station. The suspect claims they were coerced.

The mesh proves:
- When the phone stopped beaconing (when it was confiscated)
- How long the phone was offline (the arrest duration before access to a lawyer)
- Whether the phone ever beaconed from inside the station (if not, the suspect was denied communication)

**Limitation:** The mesh cannot record video inside the interrogation room. But it can prove:
- The suspect had an active mesh connection (friends, legal observers, press) before the arrest
- The suspect had witnesses nearby
- The suspect's phone was operational and was confiscated at a specific moment
- The phone did not voluntarily go offline

**The challenge for police fabricating evidence:** The mesh creates an immutable timeline. Any evidence that contradicts the mesh timeline is provably fabricated. If police claim the suspect was arrested at 2pm but the mesh shows the phone beaconing until 3pm, the police narrative is mathematically inconsistent with the physical record.

---

## Scenario 5: Corrupt Government Deepfake Narrative

This is where multiple observers in a crowd create something more powerful than any single witness.

### The Deepfake Narrative

A government wants to discredit a video of police brutality. The standard playbook:

1. **Claim the video is AI-generated.** "This is a sophisticated deepfake. Our experts have analyzed it and the lighting inconsistencies prove it's synthetic."

2. **Claim the video was staged.** "This was filmed by paid actors in a studio. You can see the lighting rig reflected in the subject's eyes."

3. **Claim the video was edited.** "The timestamp has been altered. The audio track was added later. We have forensic evidence of tampering."

4. **Arrest the person who recorded it.** Confiscate all devices. Charge them with "spreading misinformation." The legal system does the rest.

### How a Crowd with RealPeep Changes Everything

Imagine 50 people at a protest, all with RealPeep running. They don't know each other. They're not coordinating. The app runs silently in the background.

**Layer 1: Independent Verification**

Each phone generates its own provenance proof. The proofs are independent — they use different hardware, different keys, different nonces. There is no single point of failure.

If the government claims one video is a deepfake, the other 49 videos have their own independent proofs. The government would have to explain how 50 independent devices, from different manufacturers, with different cryptographic identities, all independently generated matching deepfakes of the same event.

**Layer 2: The Acoustic Mesh**

The 50 phones are exchanging ultrasonic beacons with every other phone in range. The mesh creates a web of mutual attestations:

- Phone A proves Phone B was nearby
- Phone B proves Phone C was nearby  
- Phone C proves Phone A was nearby
- Every phone proves every other phone was in the same physical space

This is the key insight: **a single phone can be isolated and confiscated. A mesh of 50 phones cannot be.** By the time the government confiscates the first phone, the other 49 have already uploaded their attestations to the notary. The mesh evidence is already public.

**Layer 3: Correlated Physics**

Each phone independently recorded:
- The same camera shutter jitter pattern (same light source, same time)
- The same 120Hz screen flicker reflections (same environment)
- The same acoustic environment (same crowd noise, same sounds)
- The same timing (all beacons synchronized to the same event)

If the government claims these 50 videos are "studio productions," they must explain how 50 independent studios, in 50 different locations, all captured:
- The same crowd noise with identical acoustic propagation delays
- The same lighting conditions with the same 120Hz flicker phase
- The same timing to the millisecond
- Mutually verifying mesh attestations

**This is physically impossible.** You cannot fake the acoustic mesh because it depends on the speed of sound through a physical space — approximately 343 meters per second. The propagation delays between phones physically encode their relative positions. Any fabrication would have to simultaneously fake the propagation delay between every pair of phones, which is astronomically complex.

### The Government's Dilemma

| Claim | Why It Fails |
|-------|-------------|
| "The video is AI-generated" | 50 independent hardware proofs. The government has to explain how 50 different devices all independently generated matching deepfakes. |
| "The video was staged in a studio" | The acoustic mesh proves physical co-location. 50 phones cannot be in the same studio without the mesh recording that fact — and if they were in a studio, the mesh proves it was a real event in that space. |
| "The timestamp was altered" | The mesh timestamps are cross-verified by every device in range. Altering one timestamp would break the consensus — the other 49 phones would show a mismatch. |
| "The person who recorded it is a liar" | It's not one person. It's 50. The government would have to discredit 50 independent witnesses, each with cryptographic proof of presence. |
| "We'll confiscate all phones" | Too late. The mesh attestations were uploaded as soon as any phone reached Wi-Fi. The evidence is already public. |

### Why This Works Where Traditional Recording Fails

Traditional recording (one phone, one video) has a single point of failure:
- The phone is confiscated → evidence disappears
- The recorder is discredited → evidence loses credibility
- The video is claimed to be fake → no way to prove otherwise

The mesh creates **distributed proof**:
- No single phone is essential; the proof lives in the network
- No single witness can be discredited in isolation; the others corroborate
- No single video can be dismissed as a deepfake; the physics correlation proves it's real

### The Threshold Effect

The mesh doesn't require 100% participation. The more phones, the stronger the proof:

| Phones | Mesh Strength | Government Countermeasure |
|--------|--------------|--------------------------|
| 1-2 | Weak — can be dismissed as isolated | "Just two people fabricating evidence" |
| 5-10 | Moderate — correlation starts to matter | "A coordinated disinformation group" |
| 20+ | Strong — acoustic mesh is independently verifiable | Cannot explain correlated physics |
| 50+ | Irrefutable — the mesh has mutual attestations from dozens of independent devices | Physically impossible to fabricate |

---

## What MNR Actually Gives You

Mutual non-repudiation in the RealPeep context does not record what people *said*. It records what physics *did*. This distinction is critical:

| What MNR Proves | What MNR Does Not Prove |
|----------------|------------------------|
| Two devices were physically in the same space at the same time | What anyone said during that time |
| How long the co-location lasted | Whether either party acted in good faith |
| The exact timestamp of the event | The content of any communication |
| Which other devices were in proximity | Whether either party was under duress |
| When a device stopped communicating (confiscation moment) | The legal context of the interaction |

This is both a limitation and a strength. It's a limitation because MNR cannot replace a recording of what was said. It's a strength because MNR cannot be contaminated by what was said — it's pure physics, and physics can't be cross-examined.

In adversarial situations, MNR transforms the question from *"Did this happen?"* to *"Given that this happened, what does it mean?"* — which is a much more tractable question for courts, journalists, and the public.

---

## Frame-Level Hash Chain: Internal Video Integrity

The mesh proves that devices were physically co-located. But it does not, by itself, prove that the *video file* hasn't been tampered with. A corrupt actor could:

- Edit out frames to change the narrative
- Reorder frames to imply a different sequence of events
- Insert synthetic frames to fabricate events that didn't happen
- Truncate the beginning or end of the recording

To prevent this, RealPeep chains every frame of the video into a cryptographic hash chain at capture time.

### How the Hash Chain Works

During recording, each frame is hashed immediately as it's captured by the camera sensor — before it's written to storage, before any compression, before anything else touches it.

```
Frame 1:  H1 = SHA256(frame_1_data)
Frame 2:  H2 = SHA256(H1 || frame_2_data)
Frame 3:  H3 = SHA256(H2 || frame_3_data)
...
Frame N:  HN = SHA256(H{N-1} || frame_N_data)
```

Each frame's hash includes the previous frame's hash. This creates an immutable chain:

- **Frames cannot be reordered** — the chain encodes ordering
- **Frames cannot be removed** — removing a frame breaks the chain at that point
- **Frames cannot be inserted** — inserting a frame between two hashes would require forging a hash that matches both neighbors, which is computationally impossible
- **Frames cannot be modified** — changing even one pixel changes the frame hash, which breaks every subsequent hash in the chain

The final hash (HN) is called the **chain root**. It uniquely identifies the exact sequence of frames in the exact order they were captured.

### Merkle Tree Optimization

For long videos, a linear hash chain is impractical — verifying any single frame requires replaying the entire chain from the beginning. RealPeep uses a **Merkle tree** instead:

A Merkle tree divides the video into segments (e.g., 1-second chunks of 30 frames each). Each segment is hashed into a leaf node, and the leaves are combined pairwise up the tree to a single Merkle root:

```
          Merkle Root
         /           \
     H(1-30)       H(31-60)
     /     \        /     \
  H1..H30  H31..H60  ...
```

**Advantages over a linear chain:**
- Anyone can verify a single frame in O(log N) time instead of O(N)
- Corrupted frames can be identified at the segment level (you know which second was tampered, not just that *something* changed)
- The Merkle root is a single hash that can be committed to a blockchain — small enough for OP_RETURN (80 bytes) or Ethereum calldata

### Anchoring to a Public Blockchain

The hash chain (or Merkle root) is generated entirely offline during capture. Later, when the phone reaches the internet, the root is **rolled up** to a public blockchain:

1. **During capture:** The phone computes the frame-level hash chain in real time. This requires no connectivity — it's purely local computation.

2. **When connectivity returns:** The phone submits the Merkle root to a public blockchain (Bitcoin OP_RETURN, Ethereum calldata, or a specialized timestamping chain like OpenTimestamps).

3. **The blockchain timestamp** becomes the definitive proof that the video existed in exactly this form at exactly this time. The blockchain's proof-of-work (or proof-of-stake) finality makes this timestamp practically irreversible.

4. **Later verification:** Anyone with the video and the hash chain can:
   - Recompute the frame hashes
   - Verify they match the Merkle root
   - Check the Merkle root against the blockchain
   - Confirm the timestamp

### What the Hash Chain Adds to the Mesh

| Layer | Proves | How |
|-------|--------|-----|
| **Acoustic Mesh** | Physical co-location | Ultrasonic beacon exchange between devices |
| **ZK Identity Scrubber** | Hardware authenticity | Anonymous proof from Secure Enclave |
| **Frame Hash Chain** | Video integrity | Time-anchored hash of every frame |
| **Public Blockchain** | Immutable timestamp | Merkle root committed to Bitcoin/Ethereum |

Together, these layers prove:
- The video was captured by real hardware (ZK proof)
- The hardware was physically present at the event (mesh attestation)
- The video file has not been tampered with (hash chain)
- The video existed at a specific point in time (blockchain timestamp)

### The Offline-to-Online Rollup

The hash chain is generated offline and rolled up online — the same pattern as the acoustic mesh. Here's the full flow:

```
┌─────────────────────────────────────────────────────────┐
│                   PHASE 1: OFFLINE                       │
│                                                         │
│  Camera rolling → per-frame hashes → Merkle tree built  │
│  Mesh active → ultrasonic beacons exchanged             │
│  ZK proof generated from Secure Enclave                 │
│  ─────────────────────────────────────────────────────  │
│  Result: video + mesh attestations + hash chain all     │
│          stored locally. No connectivity needed.         │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
               ┌─────────────────────┐
               │ Phone reaches Wi-Fi │
               └─────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  PHASE 2: ONLINE ROLLUP                  │
│                                                         │
│  Merkle root → submitted to public blockchain           │
│  Mesh attestations → uploaded to notary                 │
│  ZK proof → published to verifier                       │
│  ─────────────────────────────────────────────────────  │
│  Result: the entire chain is now publicly anchored.     │
│          Government cannot retroactively alter the      │
│          video without rewriting the blockchain.        │
└─────────────────────────────────────────────────────────┘

The delay between Phase 1 and Phase 2 is irrelevant. The
blockchain timestamp is the anchor — it proves the video
existed before the rollup, regardless of when the rollup
happens.
```

### Why This Defeats Editing Claims

If the government claims a video was "selectively edited," the hash chain provides a definitive answer:

**Claim:** "The video was shortened to remove context."
**Hash chain check:** The chain encodes the exact number of frames. If frames were removed, the chain breaks at the removal point. A truncated video simply has a different chain root — anyone can verify that the published chain root doesn't match the shortened video.

**Claim:** "The frames were reordered to make events appear in a different sequence."
**Hash chain check:** Reordering changes every subsequent hash in the chain. The chain root would be completely different. The original ordering is deterministically encoded.

**Claim:** "Synthetic frames were added to fabricate events."
**Hash chain check:** Adding a frame between two existing frames requires computing a hash that bridges the gap — this is a preimage attack on SHA256, which is computationally infeasible.

**Claim:** "The timestamp on the video was altered."
**Hash chain check:** The Merkle root is committed to a public blockchain. The blockchain timestamp is independent of the video file metadata. You cannot retroactively change a Bitcoin block or an Ethereum transaction.

### Comparison: Hash Chain vs Traditional Watermarking

| Property | Watermarking | Hash Chain |
|----------|-------------|------------|
| Survives re-encoding | Usually not | No — re-encoding changes pixel data |
| Detects frame removal | No | Yes — chain breaks |
| Detects frame reordering | No | Yes — chain breaks |
| Detects synthetic insertion | No | Yes — chain breaks |
| Publicly verifiable | Depends on proprietary detector | Yes — anyone can recompute |
| Quantum-resistant | N/A | SHA256 is post-quantum safe |
| Size overhead | Embedded in video | ~256 bits per segment (negligible) |
| Requires trusted third party | Often yes | No — blockchain is trustless |

**Important caveat:** The hash chain verifies that the *pixel data* hasn't changed. It does not verify the semantic content. A video can pass the hash chain check while being a valid recording of an actor in a staged scenario. The hash chain proves integrity, not authenticity — that's what the mesh and ZK proof are for.
