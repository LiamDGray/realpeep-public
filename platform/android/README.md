# RealPeep Android

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Android app for RealPeep — anonymous provenance via camera sensor authentication, acoustic CDMA mesh consensus, and duress-resistant key management.

`minSdk: 29` | `targetSdk: 34` | Kotlin + Jetpack Compose

---

## Status

See [STATUS.md](STATUS.md) for the current build/test result, implemented vs
unimplemented features, known defects, and the proposed Rust core shape.
The module is a capture scaffold, not a production provenance client.

## Quick Start

```bash
# Build
./gradlew assembleDebug

# Run tests
./gradlew testDebugUnitTest

# Install on device
./gradlew installDebug
```

Open in Android Studio and sync Gradle, or use the command line above.

---

## App Architecture

```
com.realpeep.app/
├── MainActivity.kt            # Single-activity host, navigation
├── RealPeepApplication.kt     # App-level init (crypto, storage)
│
├── audio/
│   └── AudioRecorder.kt       # Microphone capture → acoustic CDMA
│
├── camera/
│   └── FrameCaptureService.kt # CameraX video recording + per-frame hash chain
│
├── cdma/
│   ├── GoldCodeGenerator.kt   # Gold code generation for CDMA
│   ├── Lfsr.kt                # Linear feedback shift register
│   └── MatchedFilter.kt       # Acoustic matched filter detection
│
├── crypto/
│   ├── DuressKeys.kt          # Duress key derivation (wrong PIN → plausible-deniability keys)
│   ├── EphemeralKey.kt        # Ed25519 ephemeral key generation
│   └── HashChain.kt           # SHA-256 frame hash chain + Merkle root
│
├── mesh/
│   ├── Beacon.kt              # BLE beacon payload (CDMA code + hash)
│   ├── BleAdvertiser.kt       # BLE advertisement broadcasting
│   ├── BleScanner.kt          # BLE scan for nearby beacons
│   ├── BloomFilter.kt         # Efficient duplicate beacon detection
│   ├── MeshForegroundService.kt # Foreground service for mesh uptime
│   └── ObservationBundle.kt   # Aggregated witness observations
│
├── model/
│   ├── PinEntryState.kt       # 4-digit PIN state machine
│   ├── PinValidator.kt        # PIN → duress key derivation validation
│   └── Session.kt             # Capture session data model
│
├── storage/
│   └── OfflineBundle.kt       # Offline capture bundle (Room DB)
│
├── ui/
│   ├── components/
│   │   └── PinEntryDialog.kt  # PIN entry dialog with duress detection
│   ├── screens/
│   │   └── RecordScreen.kt    # Main capture screen (video + mesh status)
│   └── theme/
│       └── Theme.kt           # Material 3 dark theme
│
└── tests/                     # Unit tests (JUnit 4)
    ├── AudioCaptureTest.kt
    ├── BloomFilterTest.kt
    ├── DuressKeysTest.kt
    ├── FrameCaptureTest.kt
    ├── GoldCodeGeneratorTest.kt
    ├── HashChainTest.kt
    └── PinEntryTest.kt
```

---

## Shared Documentation

Architecture docs live at `docs/` in the repo root — symlinked here for convenience:

| What | Link |
|------|------|
| Module map & data flow | [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) |
| MNR mesh protocol | [docs/architecture/MESH_MNR_PROTOCOL.md](docs/architecture/MESH_MNR_PROTOCOL.md) |
| BLE + Acoustic hybrid | [docs/architecture/HYBRID_VERIFIER.md](docs/architecture/HYBRID_VERIFIER.md) |
| Duress key patterns | [docs/research/duress-patterns-research.md](docs/research/duress-patterns-research.md) |
| Technology comparison | [docs/comparisons/COMPARISON_TABLE.md](docs/comparisons/COMPARISON_TABLE.md) |
| Roadmap | [docs/roadmap/ROADMAP.md](docs/roadmap/ROADMAP.md) |

---

## Dependencies

- **CameraX** — video capture with per-frame access for hash chaining
- **BouncyCastle** — Ed25519 signing (API 29 lacks native Ed25519)
- **Jetpack Compose** — declarative UI with Material 3
- **Room** — offline capture bundle persistence
- **Security Crypto** — encrypted key storage
- **Coroutines** — async camera, BLE, and audio pipelines

---

## Known Constraints

- **minSdk 29** (Android 10) — needed for CameraX video recording. Below that, fall back to photo-only capture.
- **BLE mesh is foreground-service-bound** — Android background BLE scanning is unreliable post-API 26. The `MeshForegroundService` keeps the mesh alive during capture.
- **Ed25519 via BouncyCastle** — native Ed25519 is API 34+ only. If targeting API 34+, drop the BC dependency and use `java.security` providers.

---

## License

Apache 2.0 (shared with the monorepo root)
