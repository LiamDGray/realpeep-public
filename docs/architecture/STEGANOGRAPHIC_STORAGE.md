# Steganographic Local Storage for Video Footage

*Hiding video evidence on-device under forensic threat.*

---

## The Problem

You're recording sensitive footage — police brutality, government corruption, a human rights violation. You cannot stream it live (no connectivity, or the network is monitored). The video is stored on your phone. If you're detained, the captor will:

1. Confiscate the phone
2. Clone the storage (bit-for-bit forensic image)
3. Search for video files, deleted files, and encrypted containers
4. Demand passphrases under duress
5. Run forensic tools (Cellebrite, Oxygen Detective, AXIOM) to recover hidden data

The question: **Can you hide video footage on the device such that a captor cannot find it, a forensic examiner cannot detect it, and you can plausibly deny its existence — while still being able to recover it after release?**

---

## Physical Constraints

Before evaluating patterns, the physical reality of modern phones:

| Constraint | Implication |
|-----------|-------------|
| **Flash storage is block-addressed** | There's no "unused space" to hide in — the OS controls all blocks. Hidden data must exist inside a file the OS knows about. |
| **Modern phones use F2FS/APFS with TRIM** | Deleted files are securely erased within seconds. Undelete forensics is nearly impossible on modern phones. |
| **iOS has hardware encryption at rest** | The file system is encrypted with a key derived from the passcode. Without the passcode, no data can be read. But under duress, you give the passcode. |
| **iOS Secure Enclave** | Keys can be stored in the Secure Enclave, making them inaccessible even with the passcode — but this also makes them inaccessible to you for recovery. |
| **Android file-based encryption (FBE)** | Different keys for different profiles. A work profile can be locked independently. |
| **Forensic tools exist** | Cellebrite, GrayKey, and others can bypass passcodes on many devices. Assume the captor can read everything. |

The fundamental tension: **the device OS knows about all files it stores. You cannot hide from the OS. You can only make the data look like something it's not.**

---

## Validated Patterns

### Pattern 1: Deniable Hidden Container (VeraCrypt Model)

**Citation:** TrueCrypt/VeraCrypt hidden volume specification (2012-present). Security analysis: "Plausible Deniability in Encrypted File Systems" — A. Czeskis, D. J. St. Hilaire, et al., *USENIX HotSec*, 2008.

**How it works:**

Create a single encrypted file on the device that contains **two nested volumes**:

```
┌─────────────────────────────────────────────┐
│         Encrypted Container File             │
│                                              │
│  ┌──────────────────┐  ┌──────────────────┐  │
│  │  Outer Volume     │  │  Inner Volume     │  │
│  │  (Decoy data)     │  │  (Hidden video)   │  │
│  │                   │  │                   │  │
│  │ Innocent photos   │  │ Encrypted video   │  │
│  │ Notes, documents  │  │ Evidence footage  │  │
│  │                   │  │                   │  │
│  │ Key: normal       │  │ Key: duress       │  │
│  │ passphrase        │  │ passphrase        │  │
│  └──────────────────┘  └──────────────────┘  │
│                                              │
│  Outer volume header at fixed offset          │
│  Inner volume header at random offset         │
│  Inner volume appears as random data          │
│  without the correct key                      │
└─────────────────────────────────────────────┘
```

**How deniability works:**
- The container file appears to be a normal encrypted volume containing the decoy data
- The inner volume is stored in the "free space" of the outer volume
- Without the inner volume passphrase, the inner volume is indistinguishable from random data (which is what you'd expect to see in unallocated space inside an encrypted container)
- You give the captor the outer volume passphrase — they see only the decoy data
- You never admit the inner volume exists

**Forensic detection:**
- The container file itself is visible — you must explain why it exists
- Typical cover: "I use encrypted backups for my journal/notes/medical records"
- Stronger cover: the container is hidden inside a corrupted media file
- An examiner with both passphrases can verify both volumes exist and are populated

**Mobile applicability:**
- Works on any OS — the container is just a file
- VeraCrypt has mobile clients (though not officially supported)
- Custom implementation needed for RealPeep integration
- Large video files require large containers — a 1GB hidden video needs at least 2GB total container (outer + inner)

**Limitations:**
- The container file itself is detectable. An examiner can ask "Why do you have a 2GB encrypted file?"
- If the captor has both passphrases (demands the duress one too), deniability collapses
- File system level forensics can detect that the container's "free space" has non-random patterns (mitigated by filling with random data at creation)

---

### Pattern 2: Cover File Steganography (Hiding Inside Innocent Media)

**Citation:** N. Provos, P. Honeyman, "Hide and Seek: An Introduction to Steganography," *IEEE Security & Privacy*, 2003. J. Fridrich, "Steganography in Digital Media: Principles, Algorithms, and Applications," Cambridge University Press, 2009.

**How it works:**

Encode the sensitive video footage inside another innocent-looking video or image on the device. The cover file looks normal to human inspection and passes automated content analysis — but contains the evidence hidden in its pixel data.

```
┌────────────────────────────────┐
│  Cover file (innocent photo)   │
│                                │
│  ┌───── Visible Content ────┐  │
│  │  Your vacation photo     │  │
│  │  A screenshot of memes   │  │
│  │  A downloaded movie      │  │
│  └──────────────────────────┘  │
│                                │
│  ┌───── Hidden Content ─────┐  │
│  │  LSB of each pixel       │  │
│  │  encodes encrypted       │  │
│  │  video footage           │  │
│  └──────────────────────────┘  │
└────────────────────────────────┘
```

**Common techniques:**

| Technique | Description | Capacity for a 10MB photo |
|-----------|-------------|--------------------------|
| **LSB (Least Significant Bit)** | Replace the lowest bit of each RGB channel with hidden data | ~3.75 MB (if all 3 channels used) |
| **DCT coefficient modification (JPEG)** | Hide data in frequency domain coefficients | ~1-2 MB (JPEG-compressed, more robust) |
| **Palette-based (GIF/PNG)** | Use palette ordering to encode data | Limited by palette size |
| **Video inter-frame** | Hide data in B-frames (rarely inspected visually) | High — depends on video length |
| **Audio spectrogram** | Hide data in inaudible frequency bands | Moderate |

**Mobile applicability:**
- **Very high** — phones are full of innocent photos, videos, music
- Cover selection is natural: you already have vacation photos, cat videos, downloaded movies
- The cover file passes inspection — "that's just my photo from last weekend"

**Limitations:**
- **Capacity is limited for images.** A 20MP photo (~6MB JPEG) can hide only ~1-2MB of data via LSB. For video footage, you need video cover files.
- **Re-compression destroys hidden data.** If the captor re-encodes the cover file (e.g., "optimizing storage"), the hidden data is lost.
- **Statistical detection.** Modern steganalysis can detect LSB manipulation with high accuracy on uncompressed images. Compressed (JPEG) images are harder to analyze.
- **The captor may not re-encode** — but if they do, you lose everything.

**Best use case:** Hiding small clips or frame sequences (not full-length videos) inside the device's existing photo library. The cover photo is one the user genuinely took — it has correct EXIF data, GPS, and camera metadata, making it indistinguishable from a real photo.

---

### Pattern 3: File Extension / Magic Byte Masquerade

**Citation:** This is a well-known counter-forensic technique documented in R. Harris, "Arriving at an Anti-Forensics Consensus: Examining How to Define and Control the Anti-Forensics Problem," *Digital Investigation*, 2006.

**How it works:**

The encrypted video file is given a file extension and magic bytes that make it appear to be a different, innocent file type. When opened, the OS tries to interpret it as the masqueraded type — and either shows an error ("corrupted file") or garbage content.

```
┌─────────────────────────────────────┐
│  File: "receipt_scan_2024.jpg"       │
│                                      │
│  Magic bytes: 0xFFD8FFE0 (JPEG)     │
│  Extension: .jpg                     │
│  Thumbnail: embedded mini-JPEG       │
│  of an innocent receipt              │
│                                      │
│  But the actual file body contains:  │
│  Encrypted video data + Merkle root  │
│  + ZK provenance proof               │
│                                      │
│  If opened in photos app: shows      │
│  a corrupted/garbled image           │
│  ("This image cannot be displayed")  │
└─────────────────────────────────────┘
```

**Variations:**
- **Media file with deliberate corruption:** A .mp4 that plays a decoy clip for the first 3 seconds, then the rest is encrypted data. Any media player shows only the first 3 seconds and reports "file may be corrupted."
- **PDF with hidden data:** A PDF that renders a decoy page, with the hidden data stored in a PDF comment stream or after the %%EOF marker.
- **Audio file with spectrogram stego:** An .mp3 that plays normal music, with the hidden data in sub-20Hz or >18kHz frequency bands (inaudible).

**Forensic considerations:**
- Entropy analysis will flag any file containing encrypted data — encrypted content has near-perfect entropy, which stands out against normal JPEG/mp4 entropy
- Mitigation: compress the hidden video before encryption, reducing entropy to near-native-compression levels
- A file that appears "corrupted" is suspicious — legitimate corrupted files exist, but an examiner may investigate why

**Mobile applicability:**
- **High** — creating a "corrupted" photo taken from a corrupted transfer is plausible
- "I tried to download this photo but it didn't load properly" is a credible cover story
- Works on both iOS and Android without special filesystem access

---

### Pattern 4: Detachable Hidden Volume via Cloud Trigger

**Citation:** Cloud-based deniable storage is a newer but documented pattern in "Cloud Storage and Deniable Encryption" — M. G. Kaosar, et al., *IEEE TrustCom*, 2015.

**How it works:**

The device stores **only an encrypted key fragment**. The actual encrypted video is uploaded to the cloud (or never stored on-device at all). Under duress, the user reveals the cloud account — which contains only decoy data. The real video is in a hidden folder that requires a second key not stored on the device.

```
┌─────────────────────────────────────────────────────┐
│                  Device Storage                       │
│                                                      │
│  - Innocent app data                                 │
│  - Decoy photos/videos                               │
│  - Cloud sync token (for decoy account)              │
│  - ⚠ NOTHING that looks like encrypted video         │
│  - ⚠ Key fragment memorized by user (not on device)  │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│                 Cloud Storage (e.g. Google Drive)     │
│                                                      │
│  ┌──────────────────┐  ┌──────────────────┐          │
│  │ Decoy Account    │  │ Hidden Account    │         │
│  │                  │  │                   │         │
│  │ password: normal │  │ password: duress  │         │
│  │ → vacation pics  │  │ → evidence videos │         │
│  │ → innocuous docs │  │ → provenance data │         │
│  └──────────────────┘  └──────────────────┘          │
└─────────────────────────────────────────────────────┘
```

**Advantages:**
- **Nothing incriminating on the device.** Forensic tools find nothing. Even with a full clone, there's no encrypted data to analyze.
- **The captor cannot distinguish a "no cloud" situation from "I have nothing to hide."** Everyone has cloud backups — the captor expects to find nothing unusual.
- **The hidden account name is memorized** (not stored on device). The captor cannot discover it from device forensics.
- **Recovery is trivial** — log into the hidden account from any device after release.

**Disadvantages:**
- **Requires internet to upload** — back to the original problem if you're in a no-connectivity zone
- **Cloud provider may comply with government takedown requests** — the evidence could be deleted if the provider is pressured
- **Account creation is detectable** — the captor may check cloud account creation dates (mitigated by creating the decoy account first, then the hidden account from a burner device)
- **Metadata analysis** — the cloud provider knows you accessed the hidden account if you do so from your primary device

**Best use case:** Hybrid approach — hide video locally using Pattern 1 or 2, and when connectivity is available, upload to the hidden cloud account and delete the local copy. The two-layer approach gives you both immediate offline hiding and long-term secure storage.

---

### Pattern 5: Shamir's Secret Sharing Across Innocent Files

**Citation:** A. Shamir, "How to Share a Secret," *Comm. ACM*, 1979. Extended for steganography in: R. J. Anderson, F. A. P. Petitcolas, "On the Limits of Steganography," *IEEE Journal on Selected Areas in Communications*, 1998.

**How it works:**

Split the encrypted video into N shares using Shamir's Secret Sharing, where any K of N shares are needed to reconstruct. Distribute the shares across innocent files on the device. Each individual share is indistinguishable from random data.

```
Video → encrypted → split into 7 shares, need 3 to reconstruct

Share 1 → hidden in photo_library/img_001.jpg LSB
Share 2 → hidden in photo_library/img_042.jpg LSB
Share 3 → hidden in downloads/thesis_draft.pdf after %%EOF
Share 4 → hidden in music/song_forever.mp3 spectrogram
Share 5 → hidden in notes/shopping_list.txt (invis chars)
Share 6 → hidden in cloud decoy account
Share 7 → memorized by user (or stored offline)
```

**Deniability properties:**
- The captor finds any N-1 shares → still cannot reconstruct the video (information-theoretic security)
- The captor cannot prove shares exist — each looks like random noise in a different innocent file
- You can reveal K-1 shares under duress without compromising the secret
- The final share (required for reconstruction) is memorized by the user, not stored on device

**Mobile applicability:**
- **High** — the shares are distributed across the device's existing file system
- Each share is small (e.g., 256KB for a 1GB video split into 7 shares at ~150KB each)
- No single file looks suspicious
- Requires a file-level embedding tool (RealPeep app manages share distribution)

**Limitations:**
- **Complex setup** — user must maintain multiple innocent-looking files across the device
- **If any cover file is deleted** (e.g., "cleaning up storage"), the share is lost
- **Reconstruction requires locating all K valid shares** — if the captor modifies a cover file, the embedded share may be corrupted (use error correction codes to mitigate)

---

### Pattern 6: Deliberate "Corrupted" Video File with Decoy Segment

**How it works (combining Pattern 3 with practical video engineering):**

Create a video file that:
- **Plays normally for the first 5-10 seconds** — shows an innocent scene (a street, a room, a park)
- **Then appears corrupted** — the rest of the file is actually encrypted video footage, but the media player interprets it as damaged frames and shows artifacts or a freeze
- **When decoded with the correct key**, the "corrupted" segment yields the real evidence footage

```
┌─────────────────────────────────────────────────┐
│              "corrupt_video.mp4"                   │
│                                                    │
│  ┌──────────────┐  ┌────────────────────────────┐ │
│  │ Decoy Segment │  │ Encrypted Evidence Segment │ │
│  │               │  │                            │ │
│  │ 5 seconds of  │  │ 2 minutes of encrypted     │ │
│  │ street scene  │  │ protest footage            │ │
│  │               │  │                            │ │
│  │ Plays in any  │  │ Shows as "corrupted"       │ │
│  │ media player  │  │ artifacts in media player  │ │
│  └──────────────┘  └────────────────────────────┘ │
│                                                    │
│  File metadata: normal .mp4 container              │
│  Duration reported: "2:05" (decoy + corrupted)     │
│  Forensic entropy: high in second segment          │
│  (mitigated by re-encoding corrupted segment       │
│   with low-quality video codec before encryption)  │
└─────────────────────────────────────────────────┘
```

**Cover story:** "I was recording a video and my phone crashed halfway through. The file is corrupted. Look — it plays for 5 seconds then freezes."

**Detectability:** An examiner would notice the entropy change between the two segments. Mitigation: re-encode the encrypted segment as low-bitrate video before encryption, matching the natural entropy of compressed video.

---

## Recommended Architecture for RealPeep

### Primary: Two-Layer Hybrid (Pattern 1 + Pattern 5)

Combine deniable hidden container with secret sharing for maximum deniability:

```
Layer 1: Encrypted container file on device
  └─ Outer volume (decoy): innocuous backups
  └─ Inner volume (hidden): encrypted video fragments

Layer 2: Secret sharing across device
  └─ Share 1: inner volume itself
  └─ Share 2: hidden in photo library (LSB)
  └─ Share 3: hidden in music library (spectrogram)
  └─ Share 4: uploaded to cloud hidden account
  └─ Share 5: memorized key fragment

Reconstruction: need 3 of 5 shares + duress passphrase
```

**Deniability properties against different captor types:**

| Captor Type | Access | What They Find | Outcome |
|-------------|--------|---------------|---------|
| **Basic** (checks gallery) | Visual inspection | Decoy photos, "corrupted" video | No suspicion |
| **Intermediate** (runs file search) | Searches for .mp4, .mov, hidden files | Encrypted container + "corrupted" video | Container is explained as "encrypted backup" |
| **Advanced** (Cellebrite/GrayKey) | Full clone + deleted file recovery | Container with high-entropy inner volume | Inner volume is indistinguishable from random — cannot prove it contains data |
| **Adversarial** (forensic examiner + duress) | Demands both passphrases | Decoy volume + hidden volume | Hidden volume is revealed — but the Shamir shares are still distributed across files the captor didn't inspect |

### Secondary: Live Streaming Attempt + Fallback Local Hiding

The ideal flow:

```
1. Start recording
2. Attempt live streaming to notary/cloud (WebRTC, segmented upload)
   └─ If connectivity: stream succeeds, video is safe
   └─ If no connectivity: fall back to local steganographic storage
3. Encrypt video with key derived from duress passphrase
4. Embed in cover files using the strategies above
5. When connectivity returns: upload from hiding, then wipe local copies
6. If captured before upload: captor finds nothing incriminating
7. After release: recover using memorized key + knowledge of share distribution
```

### The Stego Key (What the User Must Remember)

The user memorizes **one additional piece of information** — the name of a file on their device that acts as the stego key's anchor:

1. **Memorized:** Duress passphrase (already in the system)
2. **Memorized:** A specific file on the device (e.g., "IMG_0042.jpg" or "the third song in my workout playlist")
3. **Derived:** The stego key = `SHA256(duress_passphrase + file_path + file_creation_timestamp)`

The captor cannot derive the stego key without knowing which file is the anchor. The user can plausibly deny knowing any stego system exists.

---

## Comparison Matrix

| Pattern | Deniability | Forensic Detectability | Capacity | Mobile | Recovery | Complexity |
|---------|-------------|----------------------|----------|--------|----------|-----------|
| **1. Hidden Container** | High (dual volume) | Container itself visible | High | Medium | Easy | Low |
| **2. Cover File Stego (image)** | Very high | Statistically detectable for LSB | Low | High | Medium | Medium |
| **3. File Masquerade** | Medium (file is suspicious) | Entropy analysis | High | High | Easy | Low |
| **4. Cloud Detachable** | Very high (nothing on device) | Low (cloud access logs) | Unlimited | High | Very easy | Medium |
| **5. Secret Sharing** | Very high (distributed) | Very low (each share is tiny) | Medium | Medium | Complex | High |
| **6. Corrupted Video** | Medium ("corrupted" is suspicious) | Segment entropy mismatch | High | High | Medium | Medium |

**Recommended combination for RealPeep:** **Pattern 1 (hidden container)** + **Pattern 4 (cloud detachable)** + **Pattern 5 (secret sharing)** as a belt-and-suspenders approach. No single method is perfect, but layered together they provide deniability against all but the most determined adversary.

---

## References

1. A. Czeskis, D. J. St. Hilaire, et al., "Plausible Deniability in Encrypted File Systems," *USENIX HotSec*, 2008.
2. N. Provos, P. Honeyman, "Hide and Seek: An Introduction to Steganography," *IEEE Security & Privacy*, 2003.
3. J. Fridrich, *Steganography in Digital Media: Principles, Algorithms, and Applications*, Cambridge University Press, 2009.
4. R. J. Anderson, F. A. P. Petitcolas, "On the Limits of Steganography," *IEEE Journal on Selected Areas in Communications*, 1998.
5. R. Harris, "Arriving at an Anti-Forensics Consensus," *Digital Investigation*, 2006.
6. M. G. Kaosar, et al., "Cloud Storage and Deniable Encryption," *IEEE TrustCom*, 2015.
7. A. Shamir, "How to Share a Secret," *Comm. ACM*, 1979.
8. TrueCrypt/VeraCrypt Hidden Volume Specification, 2012–present.
9. Boldyreva, et al., "Statistically-Hiding Storage," *ACM CCS*, 2011.
10. M. Backes, et al., "Steganographic File Systems," *IEEE S&P*, 2002.
