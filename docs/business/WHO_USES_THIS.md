# RealPeep — Who Uses This and Why

*A non-technical explanation of anonymous provenance and the duress protocol.*

---

## The Problem in Plain Language

**Cameras are everywhere.** Anyone can point a phone at anything and get a video that *looks* real. But there's no way to prove the video wasn't faked with AI — and no way to prove it *was* faked either. This is the provenance problem.

**The usual solution is worse than the problem.** Every other system tries to prove *you are who you say you are* — facial recognition, government ID scans, biometric databases. These systems are surveillance tools masquerading as security. They can be used to track, target, and silence the very people who need protection most.

**RealPeep takes the opposite approach.** It proves the video was captured by *some* real hardware in *real physical space*, without revealing *which* hardware or *who* was holding it. It's anonymous by design. The only thing it proves is physics — and physics can't be faked.

---

## Who Uses RealPeep

Different people face different threats. The system is designed for all of them.

### The Protester

**Who they are:** Someone at a rally, a demonstration, a strike. They record police or security forces to document misconduct.

**Their problem:** They capture video of police brutality. The authorities confiscate the phone and claim the video is a deepfake — "AI-generated propaganda." Without provenance proof, the video is treated as suspect and the officer faces no consequences.

**What RealPeep gives them:** A mathematical proof that the video came from real hardware. The proof can be verified by anyone — journalists, courts, human rights organizations — without revealing the protester's identity. The authorities cannot discredit the video without disproving physics.

**The duress risk:** If the protester is arrested, the captor will demand the phone's passphrase, demand to see the video, demand to "prove it's real" — and if they find the provenance proof, they may try to use it to identify the protester or prove the video was "staged."

### The Journalist

**Who they are:** A reporter in an authoritarian country, covering government corruption, human rights abuses, or conflict zones.

**Their problem:** Their footage must cross borders — checkpoints, airport security, border control. Devices are confiscated, searched, cloned. If the footage is traced back to them, they face arrest, torture, or death.

**What RealPeep gives them:** The ZK proof strips the device identity. The proof can be sent to news organizations internationally. The captors cannot determine *which* device captured the footage, only that *some* authorized device did.

**The duress risk:** At a checkpoint, the guard demands the phone be unlocked and inspected. They watch as the journalist types the passphrase. If the passphrase looks suspicious or the phone behaves unusually, the journalist is taken for "further questioning."

### The Whistleblower

**Who they are:** An insider — corporate, government, military — who records evidence of wrongdoing.

**Their problem:** The evidence must be verifiably authentic to be admissible. But if they're caught with the evidence, they face retaliation, prosecution, or worse.

**What RealPeep gives them:** A proof chain that authenticates the footage without linking it back to them. If they're caught, they have a way to comply with demands while silently signaling for help.

**The duress risk:** If the whistleblower is detained, they'll be asked to "prove the video wasn't edited." The people detaining them are sophisticated — they know what a provenance system is and will demand to inspect the proof. Everything must look normal to a trained examiner.

### The Human Rights Lawyer

**Who they are:** A lawyer defending a client based on video evidence.

**Their problem:** The court needs to know the video is authentic. But the lawyer cannot trust a single company's watermark or certification — those can be forged, revoked, or pressured by governments.

**What RealPeep gives them:** Publicly verifiable proof. Anyone with the proof file can check it against the open verifier. No trust in a single entity required. The chain is mathematically checkable by anyone.

### The Ordinary Person

**Who they are:** Someone who happens to record a crime, an accident, or a newsworthy event on their phone.

**Their problem:** They upload the video. The internet says it's fake. The person they recorded says it's fake. They have no way to prove it's real — and no way to protect themselves from harassment if the video makes them a target.

**What RealPeep gives them:** An immutable, verifiable chain of custody for their footage. No special knowledge needed — the app handles everything in the background.

**The duress risk:** They're contacted by someone claiming to be law enforcement, demanding they delete the video or hand over the phone. They comply, but they want the network to know they were coerced — without the captor realizing they signaled.

---

## The Normal Workflow

Here's what using RealPeep feels like for someone who's never heard of zero-knowledge proofs.

### Setup (One Time)

1. **Install the app.** It creates a cryptographic identity on your phone, protected by the Secure Enclave — the same chip that stores Face ID and Apple Pay data. This takes about 30 seconds.

2. **Choose two passphrases.** You're prompted to enter two passphrases:
   - **Your normal passphrase** — use this day-to-day. Something memorable, like a sentence: `my-cat-is-named-mittens`
   - **Your duress passphrase** — use this only if you're being coerced. Similar format, easy to remember: `my-cat-is-named-socks`

   Both unlock the phone. Both produce valid proofs. They look identical to anyone inspecting them. You memorize both and forget about it.

### Recording (Every Time)

3. **Hit record.** While filming, the app silently captures:
   - The video itself (obviously)
   - The **camera shutter timing** — phones don't expose every frame identically. The pattern of timing variations is physically unique to a real-time capture.
   - The **screen flicker on your face** — your screen is flashing a cryptographic pattern at 120Hz. It's invisible to you, but the camera sees your face reflecting it. A recording played back on another screen won't have the right reflection pattern.
   - **Audio from the microphone** — if someone taps their cheek, the skin deformation (video) and the bone-conduction thud (audio) must arrive within 1 millisecond of each other. That's the speed of sound through a human skull. A software pipeline can't fake that.
   - If another phone running RealPeep is nearby (even without internet), they exchange an **ultrasonic beacon** at 18-22kHz — inaudible to humans but proving both phones were physically in the same space at the same time.

4. **The video ends.** The app generates a small proof file (a few kilobytes) that mathematically proves the video came from real hardware. It contains no identifying information about you or your phone.

5. **Share the video + proof.** Anyone with the public verifier can check: "Was this recorded by real hardware?" If the proof verifies, the video is authentic. If it doesn't, the video may be a deepfake.

---

## The Duress Workflow

Now imagine it's not a normal day.

### Scenario A: Rubber-Hose Arrest

**You're at a protest.** You recorded a police officer striking a vulnerable person. You're detained.

**The captor says:**
- "Unlock the phone."
- "Show me what you recorded."
- "Prove this is real."

**What you do:** You type your duress passphrase: `my-cat-is-named-socks`

**What the captor sees:**
- The phone unlocks (same as always)
- The app opens (same as always)
- A proof is generated (same format, same size, same everything)
- They run the public verifier → it says **PASSED**
- They have no reason to suspect anything

**What the captor doesn't see:**
- The proof contains a nonce — a random-looking number — that, when checked against a secret key held by a trusted notary organization, reveals a duress signal
- The notary silently triggers: legal observer alert, embassy notification, proof freeze
- None of this is visible to the captor — no alerts, no latency change, no error messages

**The outcome:** The captor is satisfied. You survive. The notary knows you were coerced.

### Scenario B: Checkpoint Device Inspection

**You're crossing a border.** The guard demands your phone. They watch you unlock it. They demand you generate a provenance proof in front of them so they can "verify" your footage.

**The captor says:**
- "Type your passphrase."
- "Generate the proof."
- "Send it to my device."

**What you do:** You type your duress passphrase while they watch. The app generates a proof. The proof contains a nonce — to the guard it looks like random data, but a hidden mathematical property flags it as duress.

**Why it works even though they watch everything:**
- The duress passphrase looks like a normal passphrase (all printable characters, same length range)
- The proof looks identical to any normal proof (same format, same structure)
- The nonce looks random — to detect the flag, you need the notary's secret key
- The guard sees you comply normally and sees a valid proof

**The outcome:** You pass through the checkpoint. The notary receives the flagged proof and initiates silent protocols.

### Scenario C: Coerced Witness on the Mesh

**You're at the same protest as Scenario A.** You're not the one recording — you're standing next to someone who is. Your phone silently exchanged an ultrasonic beacon with theirs — proving you were in the same physical space at the same time. You don't know this happened. It's automatic.

**Later, you're detained.** The captor finds the witness attestation on your phone and demands you upload it to "prove the event happened."

**What you do:** You upload the attestation. It looks valid — because it is. The beacon exchange was real.

**What the captor doesn't know:** Every attestation has a heartbeat deadline — a future timestamp by which you must confirm you're still free. Because you're detained and cannot send the heartbeat, the deadline passes. The network sees the expired heartbeat and retroactively marks the attestation as **potentially coerced**.

**The outcome:** The captor gets a valid-looking attestation that's actually flagged. The network's consensus layer deprioritizes it. Other witnesses' attestations (from people who are still free) carry the weight.

### Scenario D: Family / Close Contact Coercion

**You're not arrested. Someone you love is.** A regime intelligence officer tells you: "If you don't produce a provenance proof for this fabricated video, your family member dies."

**What you do:** You generate a proof using your duress passphrase. To the captor, the proof looks identical to any other — they can verify it against the public ledger. They think they've succeeded.

**What the captor doesn't know:** The notary receives the flagged proof and correlates it with other flags from the same geographic area — detecting coordinated coercion. Multiple flags from one region → evidence of a regime-wide operation.

**The outcome:** Your family member is released. The network has cryptographic evidence of coordinated coercion.

### Scenario E: Retroactive Repudiation

**You generated a proof freely — it was authentic.** But later, armed men come to your home. They threaten you and your family unless you "confess" that the proof was faked. They want you to publicly admit the video was a deepfake, destroying its credibility.

**What you can truthfully say:** "That proof was fake. The notary simulated it to frame me."

**But you can't prove it was fake.** Here's why: designated-verifier proofs allow the notary to generate proofs that look *identical* to real ones. The notary *could have* simulated it. The captor cannot distinguish a real proof from a simulated one — even if you "confess."

**The outcome:** You survive the interrogation. The proof's validity is cryptographically deniable. Your "confession" has no mathematical weight. The captor is left with an unsatisfiable dilemma: they cannot prove the proof was genuine, even with your cooperation.

---

## The Captor's Dilemma

Every duress scenario exploits a fundamental asymmetry: the captor can inspect everything — the code, the proof, the passphrase, the device — but they cannot distinguish two mathematically identical things.

| Observer | Normal Proof | Duress Proof | Can Detect Difference? |
|----------|-------------|-------------|----------------------|
| **Captor** (holds your phone, sees all data) | Shows VERIFIED | Shows VERIFIED | **No** — identical structure, identical verification |
| **Notary** (holds the secret key) | Standard proof | Flagged as duress | **Yes** — silently triggers alert |
| **Public verifier** (anyone with the tool) | Valid proof | Valid proof | **No** — both pass public checks |
| **Mesh network** (other witnesses) | Normal attestation | Expired heartbeat | **No** — only the notary correlates deadlines |

The captor sees a valid proof from a legitimate device. They have no reason to suspect coercion. The notary sees the truth.

---

## What This Changes

**Before RealPeep:**
- A video of police brutality is dismissed as a deepfake
- A journalist's footage is traced back to them through watermark metadata
- A whistleblower has no way to authenticate evidence without revealing their identity
- An ordinary person records a crime but cannot prove the recording is real

**After RealPeep:**
- The video carries mathematical proof of authenticity, independently verifiable
- The device identity is scrubbed — no tracking, no surveillance
- Under duress, the user can comply without signaling to the captor
- The network can detect coordinated coercion through heartbeat expiry
- After release, the user can deny any proof was genuine — and the captor cannot prove otherwise

The system doesn't ask you to trust anyone. It asks you to trust physics.
