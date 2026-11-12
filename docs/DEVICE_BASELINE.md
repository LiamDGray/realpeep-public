# Device baseline: Moto G7 Power

**Measured:** 12 November 2026  
**Device:** `moto g(7) power` (`XT1955-5`, codename `ocean`)  
**OS:** Android 10 / API 29, arm64-v8a, 720×1520, 3 GB RAM  
**Chrome:** 146.0.7680.177  
**Bluetooth:** 4.2 class (no extended-advertising path observed)  
**Battery/thermal at start:** 67%, 28.7 °C, thermal status 0  
**Battery/thermal after:** 70% (charging), 28.7 °C, thermal status 0

## Native app

Built, installed, and run from `platform/android`.

| Check | Result |
|---|---|
| Camera frame chain | **83 frames** after ~6 s; count kept increasing |
| Audio chain | **77 chunks** after ~6 s; count kept increasing |
| Second recording session | works after fixing the `session.json` overwrite crash |
| BLE advertising | **`Short legacy advertising started`** — the 21-byte fallback, as expected on BT 4.2 |
| BLE scanning | `onScannerRegistered() status=0`; no scan failure |
| Mesh devices | 0 (no second device in range; peer test not performed) |
| PIN UX | four digits fill the dots, Start enables, session starts |
| Camera preview | grey/black in the screenshot; frames were still hashed, so the preview needs a visual check |

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

### Instrumented tests

```
./gradlew :app:connectedDebugAndroidTest
Starting 2 tests on moto g(7) power - 10
Finished 2 tests on moto g(7) power - 10
BUILD SUCCESSFUL
```

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
- **The Moto confirms the legacy BLE fallback works.** A true mesh test needs a
  second Android device; the current result only proves local advertising and
  scanning start successfully.
- **Camera preview needs a visual check** before claiming the native capture UX
  works; the frame/audio hash chains do advance.

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
