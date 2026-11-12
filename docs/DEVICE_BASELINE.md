# Device baselines: Moto G7 Power + Pixel 8a

**Measured:** 12 November 2026  
**Devices:** `moto g(7) power` (`XT1955-5`, codename `ocean`) and Pixel 8a (`akita`)  
**OS:** Android 10 / API 29, arm64-v8a, 720×1520, 3 GB RAM  
**Chrome:** 146.0.7680.177  
**Bluetooth:** 4.2 class (no extended-advertising path observed)  
**Moto battery/thermal:** 67% at start, 71% after, 28.7 °C, thermal status 0  
**Pixel battery/thermal:** 37% at start, 39% after, 30.7 °C, thermal status 0

## Native app

Built, installed, and run from `platform/android`.

| Check | Result |
|---|---|
| Camera frame chain | **83 frames** after ~6 s; **377 frames** in the final ~26 s session |
| Audio chain | **77 chunks** after ~6 s; **257 chunks** in the final ~26 s session |
| Second recording session | works after fixing the `session.json` overwrite crash |
| BLE advertising | **`Short legacy advertising started`** — the 21-byte fallback, as expected on BT 4.2 |
| BLE scanning | `onScannerRegistered() status=0`; no scan failure |
| Mesh devices | **1** in the two-device test with the Pixel 8a |
| Stop/cleanup | Final Moto session stopped cleanly: `Frames: 377, Audio chunks: 257, Mesh devices: 0` (pre-peer); two-device session: `Frames: 553, Audio chunks: 375, Mesh devices: 1` |
| PIN UX | four digits fill the dots, Start enables, session starts |
| Camera preview | **confirmed working** after switching `PreviewView` to `COMPATIBLE` (TextureView); a live frame showed the curtain/bookshelf scene. |

### Bugs found and fixed during this run

1. **PIN state was not observable by Compose.** `PinEntryState` is a plain class;
   mutating it did not trigger recomposition, so dots stayed empty and Start
   stayed disabled even after four correct taps. The dialog now holds the PIN in
   Compose `mutableStateOf`. Regression test: `PinEntryDialogTest`.
2. **Second session crashed.** `EncryptedFile.openFileOutput()` refuses to
   overwrite an existing `session.json`. `OfflineBundle.storeSession` now
   deletes the old file first. Regression test: `OfflineBundleTest`.
3. **The platform `Dialog` was replaced with an in-activity overlay**, and the
   camera `AndroidView` is hidden while the overlay is open. This also makes the
   PIN flow testable with Compose UI tests.
4. **Mesh count text overflowed** at 48 sp on a 720 px screen; reduced to 24 sp.
5. **Camera preview was black** with the default `PreviewView` `PERFORMANCE`
   mode (`SurfaceView`) inside Compose. Switching to `COMPATIBLE` (TextureView)
   rendered the preview correctly.
6. **Repeated BLE observation bundles crashed.** `storeBundle` used
   `bundle_<sessionId>.enc`, so the second 30 s commitment hit the same
   `EncryptedFile` overwrite error. Bundles now get a unique suffix and all
   observations are preserved.

### Instrumented tests

```
./gradlew :app:connectedDebugAndroidTest
Starting 3 tests on moto g(7) power - 10
Finished 3 tests on moto g(7) power - 10
BUILD SUCCESSFUL
```

The PIN test needs the device to be unlocked; on the lock screen it reports
`No compose hierarchies found` even though the storage tests pass. On the Pixel
(API 37) the Compose UI test is skipped because Compose 1.6's test harness calls
the removed `InputManager.getInstance()`; the app/manual PIN flow works.

## JS proof in Chrome on the Moto

Served over USB with `adb reverse`; page at
`http://localhost:8099/demo/real-proof.html`; driven over Chrome DevTools
Protocol. The page uses the same long-lived worker as desktop.

| Run | Prove | Verify | Total | Result |
|---|---:|---:|---:|---|
| Clip, cold | **9,068 ms** | 185 ms | **12,623 ms** | verified |
| Clip, warm | **7,734 ms** | 105 ms | **11,082 ms** | verified |
| Webcam | **7,478 ms** | 104 ms | **10,627 ms** | verified |

Webcam stage detail: capture 2,555 ms; SHA-256/Merkle 2 ms; demo EdDSA +
witness 477 ms; prove 7,478 ms; verify 104 ms. The webcam preview was black in
the screenshot (likely covered/low light), but 20 frames were captured and the
proof verified.

No tab crash or Chrome OOM kill occurred. `performance.memory` reported 10 MB,
which is Chrome's capped value and not a useful peak-heap measurement.

## What this means

- **JS is viable on the Moto for a demo:** ~11–13 s end-to-end, dominated by
  proving (~7.5–9.5 s). It is not real-time and not a production mobile path.
- **The native prover is not urgent for the demo.** It is still the right path
  for a production Android client (rapidsnark via JNI), but the current Android
  app has no ZK integration at all.
- **The mixed-generation mesh works:** both phones see each other when the
  extended-capable phone also emits the short legacy beacon.
- **Camera preview is verified** on both phones; the earlier black frames were
  physical camera coverage, confirmed with the stock camera app.
- **Pixel 8a is the faster demo target**, but its CameraX native library needs a
  16 KB-page compatibility fix before production.

## Reproduce

```bash
scripts/android-probe.sh
cd platform/android && ./gradlew :app:installDebug
# launch, enter any 4-digit PIN, record ~10 s

# JS baseline:
cd demo/recording
adb reverse tcp:8099 tcp:8099
python3 -m http.server 8099 --bind 127.0.0.1 &
adb shell am start -a android.intent.action.VIEW \
  -d http://localhost:8099/demo/real-proof.html
adb forward tcp:9222 localabstract:chrome_devtools_remote
node benchmark_android.mjs --runs 2
node benchmark_android.mjs --webcam --runs 1
```

The benchmark script is [demo/recording/benchmark_android.mjs](../demo/recording/benchmark_android.mjs).


## Native core

`realpeep-core` is built as an arm64 `cdylib` with NDK r28c and loaded through
`NativeCore`/JNI. Instrumented parity tests compare SHA-256, frame hashing, and
Merkle roots against pure-Java references:

- Moto: **5 tests passed**.
- Pixel: **4 tests passed** (Compose PIN test skipped on API 37).
- The packaged `librealpeep_core.so` has `0x4000` LOAD alignment and is included
  in `scripts/check-16kb.sh`.

## Two-device mesh test (Moto + Pixel 8a)

The Pixel 8a runs Android 17 / API 37, Chrome 157.0.8103.50, 1080×2400.
The Moto was reachable over Wi-Fi ADB (`192.168.1.169:5555`) so both phones
could run at once.

### Advertising fix

The Moto cannot receive extended advertising. The Pixel originally advertised
only the 117-byte extended beacon, so the Pixel saw the Moto but the Moto saw
nothing. `BleAdvertiser` now starts the 21-byte legacy presence beacon **in
addition** to the extended beacon on capable devices. On the Pixel the log
shows:

```text
RealPeep.Advertiser: Extended advertising started (txPower=-7)
RealPeep.Advertiser: Short legacy advertising started
RealPeep.Scanner: Observed beacon from short (unsigned presence)
```

### Result

| Device | Advertising | Scanner | Session result |
|---|---|---|---|
| Moto G7 Power | short legacy (BT 4.2) | saw Pixel | **553 frames, 375 audio chunks, Mesh: 1** |
| Pixel 8a | extended + short legacy | saw Moto | **1,188 frames, 404 audio chunks, Mesh: 1** |

Full extended beacons are now signature-verified by the scanner; the short
legacy beacon remains unsigned by design. Both screens showed
**`Mesh: 1 device`**, TX/RX active, and live camera previews. This validates the mixed-generation mesh path for the demo. After
rotating/refreshing sessions, both still count one device because the tag is
stable.

## Pixel 8a JS proof

Same page and long-lived worker, driven over Chrome DevTools Protocol.

| Run | Prove | Verify | Total | Result |
|---|---:|---:|---:|---|
| Clip, cold | **2,667 ms** | 31 ms | **5,299 ms** | verified |
| Clip, warm | **2,077 ms** | 37 ms | **4,689 ms** | verified |

The Pixel is roughly **2.4× faster** than the Moto end-to-end and is comfortably
usable for the demo.

## Pixel 16 KB page-size compatibility

CameraX 1.3.4 shipped `libimage_processing_util_jni.so` with 4 KB LOAD
alignment, producing the Android 17 compatibility warning. CameraX **1.4.2**
ships the same libraries with `0x4000` alignment; the app was upgraded with no
SDK/AGP change. The Pixel now launches with no 16 KB warning, and
`scripts/check-16kb.sh` verifies every native LOAD segment in the built APK.


## x86_64 emulator validation

An API 29 (`pixel29`) x86_64 AVD booted with KVM. `connectedDebugAndroidTest`
ran **6/6** tests, including the native SHA-256/frame/Merkle parity tests and
the hardware-attestation test. This validates the x86_64 `librealpeep_core.so`
and the non-arm64 `jniLibs` packaging; emulator camera/BLE behavior is not
claimed.

## Hardware attestation on the Moto

`HardwareAttestationManager` generated a Keystore EC P-256 key and signed a
canonical session payload. The Moto log reports:

```text
RealPeep.Attestation: StrongBox unavailable; falling back to TEE/secure hardware
RealPeep.Main: Attestation hardwareBacked=true strongBox=false
```

The attestation is a separate hardware signal over the session id and ephemeral
public key. It is **not** the Ed25519 proof key and is not bound in-circuit.
StrongBox could not be exercised because the Pixel was unavailable; the code
prefers it when the device supports it.
