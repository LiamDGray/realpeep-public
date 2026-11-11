# Wireless Wearable Neopixel Driver: Hardware Architecture

**Purpose:** Select the components, power system, and control architecture for a
wireless, wearable Neopixel strip module used as a visual attestation channel in
the RealPeep system.

**Status:** Research / Design Choice

---

## 1. Requirements

| Parameter | Target | Stretch |
|-----------|--------|---------|
| Strip length | 1-3 ft (18-54 LEDs at 60/m) | 5 ft (90 LEDs) |
| Wireless control | BLE from phone | WiFi fallback |
| Refresh rate | 30 fps (matched to video) | 60 fps |
| Brightness | 50% typical, controllable | 0-100% |
| Battery life | ≥ 1 hour | 8+ hours |
| Form factor | Single wearable module | < 50g, belt/pocket mount |
| Cost (per unit) | < $20 | < $10 (qty 100) |

---

## 2. Microcontroller: The Right Tool

### 2.1 The TL;DR

**ESP32 wins for this application.** The RMT (Remote Control) peripheral is
dedicated hardware for generating the WS2812B timing protocol — zero CPU
cycles, zero jitter, zero bitbang code. Combined with the ESP32's built-in
dual-mode Bluetooth (BLE Classic + BLE 4.2), it's the only chip that does
wireless + LED driving in a single $3-5 package.

### 2.2 Comparison Matrix

#### WS2812B Timing Requirements

The WS2812B protocol is a single-wire NRZ encoding at 800kHz:

| Signal | Duration | Tolerance |
|--------|----------|-----------|
| T0H (0 bit, high) | 0.35 µs | ±150 ns |
| T0L (0 bit, low) | 0.80 µs | ±150 ns |
| T1H (1 bit, high) | 0.70 µs | ±150 ns |
| T1L (1 bit, low) | 0.60 µs | ±150 ns |
| Reset (low) | ≥ 50 µs | — |

At 24 bits per LED × N LEDs, this is ~30 µs per LED plus 50 µs reset. The
frame update at 30 fps gives a 33 ms budget — more than enough even for 300+
LEDs. The challenge is the nanosecond-level timing, which demands hardware
offload.

#### Controller Options

| Feature | ESP32 | RPi Pico (RP2040) | RPi Pico W | nRF52840 | BeagleBone Black |
|---------|-------|-------------------|------------|----------|-------------------|
| **Core** | 2× Xtensa LX6 @ 240MHz | 2× Cortex-M0+ @ 133MHz | Same as Pico | Cortex-M4F @ 64MHz | ARM Cortex-A8 + 2× PRU-ICSS @ 200MHz |
| **LED driver** | **RMT** (8 channels, pulse-train peripheral) | **PIO** (8 state machines per block, 2 blocks) | Same as Pico | SPI + PPI/timer (software-assisted) | PRU (bitbang assembly) |
| **CPU burden** | **None** — fully offloaded | **None** — fully offloaded | None | **Partial** — DMA needed | None |
| **BLE built-in** | ✅ Yes (dual-mode: BT Classic + BLE) | ❌ No | ⚠️ Yes (CYW43439, immature BLE stack, ~1KB RAM for BLE) | ✅ Yes (Nordic BLE — gold standard, Bluetooth 5.4) | ❌ No (USB dongle required) |
| **BLE RAM overhead** | ~20KB for BLE stack | N/A | ~100KB+ (shared WiFi/BLE stack on PSRAM) | ~12KB | N/A |
| **Sleep current** | ~5 µA (deep sleep) | ~0.6 µA | ~0.6 µA | ~0.4 µA | ~200+ µA |
| **Operating current** | ~80 mA (BLE active) | ~25 mA | ~30 mA (WiFi off, BLE active) | ~6 mA (BLE active) | ~400+ mA |
| **Board cost** | $3-8 (module), $12-15 (dev) | $4 | $8 | $10-20 | $70+ |
| **Wearable form factor** | ✅ Tiny modules (ESP32-S3-MINI: 21×18mm) | ✅ Pico: 51×21mm | ✅ Same as Pico | ✅ nRF52840-MDK: 30×20mm | ❌ Too large, too hot |
| **Debugging ergonomics** | Excellent (Arduino, ESP-IDF, WLED ecosystem) | Good (MicroPython, C SDK) | Good | Good (Arduino, Zephyr, nRF SDK) | Poor (TI RTOS, PRU assembly) |

### 2.3 Analysis

#### BeagleBone Black PRU — Correct for 2014, Obsolete Today

The PRU-ICSS (Programmable Real-Time Unit) at 200MHz was the canonical approach
for WS2812B driving when no consumer MCU had a suitable peripheral. Each PRU
is a 32-bit RISC core that can toggle GPIO at 200MHz with 5ns resolution —
more than sufficient. But:

- **The BBB board is $70+, 86×54mm, draws 400+ mA.** Not wearable.
- **There is no BBB variant with onboard BLE.** Adds a dongle.
- **PRU assembly is painful.** Register-level programming with no standard library.

**Conclusion:** The PRU was the right answer for a 2014 light installation. It
has no place in a 2026 wearable.

#### RPi Pico PIO — Beautiful, But No In-Band BLE

The PIO (Programmable I/O) state machines on the RP2040 are genuinely elegant:
they're tiny hardware state machines (2×9 instructions per SM) purpose-built
for protocols. Writing a WS2812B driver in PIO assembly is ~6 instructions:

```
.program ws2812b
.side_set 1
.wrap_target
bitloop:
  out x, 1       side 0 [1];  delay for ~40ns, side-set low
  jmp !x, do_zero side 1 [2]; branch on bit value, drive high
 do_one:
  jmp  nop        side 1 [2]; stay high
 nop:
  nop             side 0 [3]; go low, hold for remainder
  jmp  bitloop    side 0 [2]; loop
 do_zero:
  nop             side 0 [4]; low for 1-bit time
.wrap
```

This runs entirely in hardware — the CPU just feeds 24-bit color words into a
TX FIFO. Zero CPU overhead, perfect timing, jitter-free.

**The problem:** The Pico W adds WiFi/BLE via a CYW43439 coprocessor connected
over SPI. The BLE stack is immature, consumes ~100KB+ of RAM on the RP2040
side, and has known stability issues. You end up with a more complex, less
reliable BLE experience than ESP32 — for the same $8-10 cost.

**The Pico (non-W) has no BLE at all.** You'd need an external BLE UART module
(HC-08, HM-10, ~$5) — adding cost and complexity.

**Conclusion:** PIO is beautiful hardware. But for a wearable that needs both
wireless and LED driving, you either accept the Pico W's janky BLE or add an
external BT module. Both lose to ESP32 on integration cost and reliability.

#### ESP32 RMT — Purpose-Built, Battle-Tested

The RMT (Remote Control) peripheral is a dedicated pulse-train generator with:

- **8 channels**, each with a 64-entry pulse buffer (expandable via interrupt
  or DMA)
- **1-bit resolution at 80 MHz** (12.5 ns) — well within WS2812B's ±150 ns
  tolerance
- **Automatic loop, carrier modulation, and idle level**
- **Built-in channel arbitration** — drive multiple strips from one chip
- **RMT-driven DMA on ESP32-S3** — can refresh hundreds of LEDs without any
  CPU involvement via the GDMA controller

The WS2812B driver for ESP32 is approximately 10 lines of config plus a lookup
table. It has been mass-produced in millions of devices (WLED is the largest
deployment, but the underlying RMT approach is used in commercial LED
controllers shipping >100k units/year).

**The BLE integration** is mature: the ESP32's dual-mode Bluetooth stack uses
~20KB of RAM, supports BLE GATT server/client, and has a tested phone app
ecosystem (WLED app, custom apps via Nordic UART Service / BLE Serial).

**Conclusion:** The ESP32 is the correct choice for this application. RMT
eliminates the CPU burden of LED driving, the integrated BLE eliminates a
separate radio module, and the ecosystem (WLED, ESP-IDF, Arduino) provides
battle-tested reference implementations.

#### nRF52840 — Best BLE, Weaker LED Integration

Nordic's nRF52840 has the best BLE on the market (Bluetooth 5.4, -95 dBm
sensitivity, 14mA TX peak, 0.4µA sleep). It's the gold standard for ultra-low-
power BLE peripherals. However, driving WS2812B from an nRF5x requires either:

- **SPI + PPI/timer trick:** Send 3× 10-bit symbols per bit (for 0 and 1
  encoding) via SPI at 8 MHz, with PPI linking the timer compare to the SPI
  transaction. This works but requires 72 bytes per LED (vs 3 bytes for
  ESP32's RMT), and the SPI DMA channel must be reloaded per frame.
- **I2S:** The I2S peripheral can be used as a parallel data output, but it's
  a hack.
- **External addressable LED driver:** Skip WS2812B entirely and use APA102
  (2-wire SPI), which the nRF52840 handles trivially — but now you need
  different strip hardware.

None of these are as clean as RMT or PIO. The nRF52840 is the right choice
only if absolute minimum power consumption (days on a coin cell) is the
primary requirement, or if the strip alternative (APA102) is acceptable.

**Conclusion:** The nRF52840 is over-engineered for this task. Its BLE
capabilities are wasted on a strip where the phone already handles the BLE
connection, and driving WS2812B requires heroic peripheral gymnastics.

### 2.4 Recommendation

**Use the ESP32 (preferably ESP32-S3 or ESP32-C3).**

The ESP32-S3 adds:
- RMT with DMA (no CPU cycles at all for strip refresh)
- BLE 5.0 (vs ESP32's BLE 4.2)
- More GPIO for peripherals (buttons, sensors)
- The ESP32-C3 (RISC-V) is cheaper ($2.50) but has fewer GPIO and no dual-core

For a prototype, a standard ESP32 dev board ($12) is fine. For a wearable
module, the **ESP32-S3-MINI-1** ($4) is 21×18mm with integrated antenna, and
FCC-certified.

| Part | Cost (1) | Cost (100) | Notes |
|------|----------|------------|-------|
| ESP32 Dev Board (generic) | $12 | — | Prototyping only |
| ESP32-S3-MINI-1 module | $3.50 | ~$2.80 | Tiny, FCC, production-ready |
| ESP32-C3-MINI-1 | $2.50 | ~$2.00 | Cheaper, RISC-V, fewer pins |
| WROOM-32 (standard module) | $3.00 | ~$2.40 | The proven workhorse |

---

## 3. RGB vs. RGBW (SK6812) and How It Changes the Board

### 3.1 The Options

| LED Type | LEDs per strip | Pins per LED | Color channels | White quality | Max current/LED |
|----------|---------------|--------------|----------------|---------------|-----------------|
| **WS2812B** | 60/m typical | 4 (VDD, DIN, DOUT, GND) | **RGB** (3× 8-bit PWM) | Mixed RGB (poor CRI, blue-tinted) | ~60mA (20mA per channel) |
| **SK6812 (RGBW)** | 60/m typical | 4 (same pinout) | **RGBW** (4× 8-bit PWM) | **Dedicated white LED** (4000K typical, ~80 CRI) | ~60mA (RGB total) + ~20mA (W) |
| **APA102** | 60/m typical | 5 (VDD, CI, DI, DO, CO) | **RGB** (5V, separate clock) | Mixed RGB only | ~60mA |
| **SK9822** | 60/m typical | 5 (same as APA102) | **RGBW** (5V, separate clock) | Dedicated white LED | ~60mA + ~20mA |

### 3.2 Why RGBW Matters for RealPeep

The Neopixel strip serves as a **visual attestation channel** — a color
pattern that appears in other cameras' footage. The camera captures the
emitted light, and the verifier extracts the color sequence.

**RGB (WS2812B) has a white quality problem:**

```
White at 50% brightness, RGB WS2812B:
  R: 50%  G: 50%  B: 50%  →  #808080 (neutral gray/white)
  
But on most WS2812B LEDs:
  - Blue LED is ~470nm (peak), green is ~520nm, red is ~625nm
  - Mixed white has a strong blue-green cast (not D65)
  - CRI: ~50-60 (poor)
  - Illuminating skin with this makes people look cyan
```

**RGBW (SK6812) fixes this:**

```
White at 50% brightness, SK6812 RGBW:
  R: 0%  G: 0%  B: 0%  W: 50%  →  clean 4000K white
  
Additional uses:
  - Cool white (W) for illumination → people look natural on camera
  - Warm white (W) for ambient → less harsh, more comfortable
  - RGB+W for color mixing → more saturated colors since white doesn't dilute
  - Pure W for power efficiency → 20mA vs 60mA for same brightness
```

### 3.3 Impact on Board Choice

**RGBW requires a 4th PWM channel per LED.** This matters for the controller:

| LED Type | Data format | Bits per LED | Controller impact |
|----------|------------|--------------|-------------------|
| WS2812B (RGB) | GRB (24 bits) | 24 | Standard, every controller handles it |
| **SK6812 (RGBW)** | **GRBW (32 bits)** | **32** | **33% more data per LED** |
| APA102 (RGB) | Start frame + 32-bit per LED + end frame | 32 per LED + overhead | Requires 2 pins (data + clock) |

**For ESP32's RMT:**

The RMT peripheral has a **64-entry pulse buffer per channel** by default.
With the standard double-buffering pattern (interrupt on half-full):

| Strip length | WS2812B (24-bit) | SK6812 (32-bit) | Buffers needed |
|-------------|------------------|-----------------|----------------|
| 18 LEDs (1 ft) | 432 bits | **576 bits** | 9 RMT entries (fine) |
| 54 LEDs (3 ft) | 1296 bits | **1728 bits** | 27 RMT entries (fine) |
| 90 LEDs (5 ft) | 2160 bits | **2880 bits** | 45 RMT entries (fine — 64 max) |
| **300 LEDs** | 7200 bits | **9600 bits** | **150 RMT entries — exceeds 64-entry buffer** |

For a wearable with 18-90 LEDs, the 64-entry buffer handles both RGB and RGBW
without DMA. But **if you're pushing beyond ~120 LEDs**, the ESP32-S3's RMT
DMA mode becomes necessary for RGBW (while ESP32's basic RMT can still
double-buffer WS2812B up to ~240 LEDs).

**The practical impact:**

- **RGBW is slightly harder on the controller** (33% more bits), but ESP32 RMT
  handles it fine up to ~120 LEDs with the built-in 64-entry buffer.
- **The real impact is on power efficiency.** If your primary mode is white
  illumination (for camera visibility), RGBW with a dedicated white LED draws
  **1/3 the power** of mixed-RGB white (~20mA vs ~60mA). This is the decisive
  factor.
- **APA102 (separate clock)** is the alternative path: trivial to drive from
  any MCU (straight SPI), but requires 5-pin strips and doesn't offer RGBW in
  the same footprint.

### 3.4 Recommendation

**Use SK6812 (RGBW) strips for the RealPeep wearable.** The dedicated white
LED is a 3× power savings for the dominant use case (white illumination for
camera visibility), and the protocol overhead (32-bit vs 24-bit) is trivial
for the ESP32's RMT at the strip lengths we need.

The ESP32-S3 handles both RGB and RGBW without any hardware change — it's
purely a software config difference in the RMT driver.

---

## 4. Power Architecture

### 4.1 Current Budget

**Component currents (5V rail):**

| Component | Current (active) | Notes |
|-----------|-----------------|-------|
| ESP32 (BLE + CPU active) | ~80 mA | Can drop to ~10 mA in light sleep with BLE connection |
| ESP32 (deep sleep) | ~5 µA | Only for power-off standby |
| **SK6812 per LED, full white (RGBW)** | ~80 mA | 20mA × 4 channels — worst case |
| **SK6812 per LED, W-only at 50%** | **~10 mA** | Most efficient mode |
| **SK6812 per LED, animated RGB at 50%** | ~30-45 mA | Typical pattern, not all-white |
| Level shifter (if needed) | ~1 mA | 74HCT245 or similar |
| Boost converter quiescent | ~1-3 mA | Depends on module |

**Total for representative scenarios:**

| Scenario | 18 LEDs (1 ft) | 54 LEDs (3 ft) |
|----------|----------------|----------------|
| White illumination (W-only, 50%) | 10 mA×18 + 80 mA + 3 mA = **263 mA** | 10 mA×54 + 80 mA + 3 mA = **623 mA** |
| Color animation (RGB, 50%) | ~30 mA×18 + 80 mA + 3 mA = **623 mA** | ~30 mA×54 + 80 mA + 3 mA = **1.70 A** |
| Color animation (RGBW, 50%) | ~40 mA×18 + 80 mA + 3 mA = **803 mA** | ~40 mA×54 + 80 mA + 3 mA = **2.24 A** |
| White full brightness | ~80 mA×18 + 80 mA + 3 mA = **1.52 A** | ~80 mA×54 + 80 mA + 3 mA = **4.35 A** |

**Correction note:** The existing neopixel-witness-analysis.md states "~50mA at
5V for 60 LEDs on white." This is a factor of **~60× too low** — the strip
draws ~60mA per LED at full white (3.6A for 60 LEDs), not 50mA total. At half
brightness with W-only operation, 60 LEDs draw ~600mA. The discrepancy
probably came from measuring an idle strip or misreading the datasheet. The
figures above are validated against the SK6812/WS2812B datasheets and real-
world measurements from the WLED community.

### 4.2 Battery Sizing

**Estimating for the likely use case:** A 1-3 ft strip running a cryptographic
color animation at 50% brightness (not all-white, so ~30-40 mA/LED).

| Battery | Capacity | 1 ft × 6h | 3 ft × 6h | 1 ft × 8h | 3 ft × 8h |
|---------|----------|-----------|-----------|-----------|-----------|
| 18650 Li-ion (3000 mAh, 3.7V) | 3.7V × 3Ah = 11.1 Wh | ✅ ~5.7 Wh needed | ❌ ~15.4 Wh needed | ✅ ~7.6 Wh needed | ❌ |
| **2× 18650 in parallel** (3.7V, 6000 mAh) | 22.2 Wh | ✅ | ✅ (~70% DOD) | ✅ | ✅ (~55% DOD) |
| LiPo 1200 mAh | 4.44 Wh | ❌ (~2.5h max) | ❌ (~1h) | ❌ | ❌ |
| LiPo 2200 mAh | 8.14 Wh | ✅ (~6h) | ❌ (~2h) | ⚠️ (~4.5h) | ❌ |
| **USB power bank 5000 mAh** (5V, 85% eff → ~3600 mAh usable) | **18 Wh** | ✅ ~15h | ✅ ~5h | ✅ ~20h | ✅ ~7h |
| USB power bank 10000 mAh | 36 Wh | ✅ 30h+ | ✅ 10h+ | ✅ 40h+ | ✅ 14h+ |

**Note:** These calculations use a boost converter efficiency of ~85% (3.7V →
5V). The ESP32 runs on the same 5V rail via its VIN pin (onboard 3.3V
regulator). At low load the boost converter efficiency drops; at very high
load (3 ft strip full white, 4.35A) the MT3608 boost converter is well within
its rated 2A max — you'd need a beefier booster for >2A sustained.

### 4.3 Power Path Options

#### Option A: USB Power Bank (Simplest)

A standard USB power bank provides 5V at 1-3A from its USB-A port. Wire a
USB breakout board to the strip's 5V rail and the ESP32's VIN pin. No battery
management, no boost converter, no soldering required.

- **Cost:** $10-20 for 5000-10000 mAh
- **Runtime on 1 ft / 50% animation:** ~12-24 hours
- **Fits:** Pocket or belt pouch
- **Cons:** The power bank's boost converter runs continuously ~80-90% efficient; idle drain over weeks

#### Option B: Single 18650 + TP4056 + MT3608 (Lightest Wearable)

- **TP4056** charges the 18650 from USB (1A max, overcurrent protection)
- **MT3608** boost converter: 3.7V → 5V, up to 2A, ~$1.50
- **18650 cell:** 3000+ mAh, $5-8
- **Battery holder:** Spring-loaded 18650 holder, $1

**Wiring:** USB → TP4056 → 18650 → MT3608 → 5V rail (strip + ESP32 VIN)

- **Cost:** ~$8-10 per unit
- **Runtime on 1 ft / 50% animation:** ~6-9 hours
- **Runtime on 3 ft / 50% animation:** ~2-3 hours
- **Fits:** Small belt pouch or 3D-printed case

#### Option C: 2× 18650 in Parallel (Extended Runtime)

Same as Option B but with two 18650 cells in parallel via a protected holder.
Doubles capacity to ~6000-7000 mAh. The TP4056 can charge them (at 1A, expect
6-8 hours charge time) or use a TP5100 (2A charger).

- **Cost:** ~$15-18 per unit
- **Runtime on 3 ft / 50% animation:** ~5-7 hours
- **Runtime on 1 ft / W-only at 50%:** ~25+ hours

#### Option D: 3.7V LiPo + Integrated Charger Module (Smallest)

- **Adafruit PowerBoost 500C** (~$15) integrates charging + boost + power
  switch in one 27×35mm board
- **1200-2200 mAh LiPo pouch** ($8-12)
- **Wiring:** PowerBoost → 5V rail

- **Cost:** ~$25 per unit
- **Runtime on 1 ft / 50% animation:** 1200 mAh → ~2.5h; 2200 mAh → ~4.5h
- **Fits:** Smallest profile — the battery is the size of an AirPods case

### 4.4 Recommendation

For a prototype: **Option A (USB power bank)** — zero soldering, no battery
safety concerns, everyone already has one. Prove the concept, then optimize.

For the final wearable: **Option B (single 18650 + TP4056 + MT3608)** — good
balance of cost ($8), capacity (6-9h on 1 ft), and repairability (18650 is a
standard cell).

---

## 5. Existing Complete Solutions

### 5.1 Software

**WLED** ([github.com/Aircoookie/WLED](https://github.com/Aircoookie/WLED))

The dominant open-source LED control firmware. Installed on >500k ESP32
devices. Features relevant to RealPeep:

- **BLE control** via WLED mobile app (both iOS and Android)
- **HTTP API** with real-time UDP for low-latency control
- **Presets and effect engine** (60+ effects) — replaceable with our own
- **Time-based macros** — can generate pseudorandom color sequences from a
  seeded PRNG (the core RealPeep need)
- **JSON API** over HTTP — can be driven from a phone app or server
- **Segment support** — drive multiple strips from one board
- **Sound-reactive** — not needed, but demonstrates the extensibility

**Custom WLED "usermod":** The WLED architecture supports "usermods" —
custom C++ modules compiled into the firmware. A RealPeep usermod would
replace the effect engine with the cryptographic PRNG sequence. This is the
shortest path to a working prototype:

1. Take the standard WLED build
2. Add a usermod that accepts `(session_key, device_id, frame_number)` over
   BLE
3. The usermod generates `color = PRNG(session_key || device_id || frame)`
   and feeds it to the LED output at 30 fps
4. The phone sends frame sync timestamps over BLE

### 5.2 Hardware

#### Controller Boards

| Product | MCU | Built for | Cost | Notes |
|---------|-----|-----------|------|-------|
| **ESP32 Dev Board** (generic) | ESP32 | Prototyping | $12 | Fine for bench; too exposed for wearable |
| **QuinLED-Dig-Uno** | ESP32 | WLED installs | $20-25 | Has level shifter, fusing, screw terminals, 5V regulator |
| **QuinLED-Dig-Quad** | ESP32 | 4× pixel outputs | $35 | Overkill for wearable but very professional |
| **PixelBlaze V3** | ESP32 | Wearable/VJ | $30 | Dedicated OLED display, SD card patterns, sensor headers |
| **Adafruit Feather ESP32 V3** | ESP32 | Feather ecosystem | $18 | Stackable with LiPo FeatherWing |
| **Lolin D32 Pro** | ESP32 | Compact dev | $15 | Built-in LiPo charger, 4MB PSRAM |

#### Strips

| Strip | Type | Price per meter | LEDs/m | Notes |
|-------|------|----------------|--------|-------|
| WS2812B | RGB | ~$5 | 60 or 144 | The classic, cheap, well-understood |
| **SK6812 (RGBW)** | **RGBW** | **~$8** | **60 or 144** | **Recommended — dedicated white LED** |
| APA102 (DotStar) | RGB, separate clock | ~$12 | 60 or 144 | 2-pin control, easier to drive, higher speed, no RGBW option |
| SK9822 | RGBW, separate clock | ~$14 | 60 | APA102-compatible with RGBW, but harder to find |
| **Neopixel (Adafruit brand)** | RGB | ~$15 | 60 | Adafruit's branded WS2812B — same chip, higher quality control |

### 5.3 The Quickest Path: WLED + Power Bank

**Bill of Materials (BOM):**

| Item | Cost | Source |
|------|------|--------|
| ESP32 Dev Board (NodeMCU-32S or similar) | $12 | Amazon, Aliexpress |
| SK6812 RGBW strip, 1m (60 LEDs) | $8 | Amazon, Aliexpress |
| 3-pin JST SM connector (for strip data/power) | $2 | Amazon |
| USB power bank (5000 mAh) | $12 | Already owned? |
| USB micro cable | $2 | Already owned? |
| **Total** | **~$24-36** | |

**Steps:**

1. Go to [install.wled.com](https://install.wled.com) on a browser
2. Plug in ESP32 via USB, click "Install" — WLED is flashed in 30 seconds
3. Wire: SK6812 GND → ESP32 GND, SK6812 DIN → ESP32 GPIO2, SK6812 5V → USB
   power bank 5V (through USB breakout)
4. Phone connects via WLED app → set colors/effects
5. For RealPeep mode: replace WLED effect engine with custom usermod

---

## 6. Platform Trade-offs Summary

| Criterion | ESP32 + WLED | RPi Pico + BT module | Custom nRF52840 | BeagleBone |
|-----------|-------------|---------------------|-----------------|------------|
| Time to prototype | **30 minutes** | 2-4 hours | 1-2 days | 1 day |
| Wireless integration | **Built-in BLE** | External BT module (+$5, extra pairing) | Built-in BLE (best) | USB dongle |
| LED driving | **RMT (hardware, zero-CPU)** | PIO (hardware, zero-CPU) | SPI+PPI hack (partial CPU) | PRU (assembly) |
| BLE stability | **Very good** | Poor on Pico W | Excellent | N/A |
| Ecosystem | **Huge** (WLED, 500k+ users) | Small | Medium (Adafruit) | Small |
| Wearable form factor | **Yes** (mini modules) | OK (51×21mm) | Yes (tiny, need custom PCB) | No |
| Battery life (1 ft, 50%) | **6-9h** (18650) | ~6-9h (18650) | 8-12h (18650, more efficient) | ~1h |
| RGBW support | **Trivial** (software config) | Trivial (PIO pattern change) | Possible but more complex | Trivial |
| Cost | **$3-12** | $4-10 | $10-20 | $70+ |
| **Winner** | **✅** | ❌ | ⚠️ (if power > all else) | ❌ |

### Verdict

**Use ESP32 + WLED (custom usermod) + 18650 battery pack + SK6812 RGBW strip.**
This is the fastest, cheapest, and most reliable path to a working wireless
wearable Neopixel driver for the RealPeep visual attestation channel.

The nRF52840 only becomes the correct choice if:
- Battery life must exceed 12 hours on a single charge (the nRF52's 0.4µA
  sleep and 6mA active BLE beat ESP32's 5µA / 80mA by a meaningful margin at
  that timescale)
- The strip is W-only at low brightness (10mA/LED, 18 LEDs → 180mA + 6mA BLE
  = 186mA → 186 mA × 12h = 2232 mAh — an 18650 works)
- The BLE connection must be maintained for days (nRF52840's BLE link layer
  can be in sleep mode between advertising events)

For RealPeep's likely use case (1-3 ft, 50% brightness animation, up to 8
hours on one charge), the ESP32 is undershoot on the power axis but
dramatically wins on time-to-solution, cost, and ecosystem.

---

## 7. Next Steps

1. **Order prototype parts** (ESP32 dev board + SK6812 strip + 18650 + TP4056 +
   MT3608)
2. **Flash WLED** via web installer — confirm stock firmware works
3. **Wire the power path** — verify boost converter does not brown out at
   strip peak current
4. **Write RealPeep usermod** for WLED: BLE command → PRNG color sequence
5. **Design wearable mount** (3D-printable belt clip or elastic band sleeve)
6. **Test mutual visual attestation** — two phones, two strips, cross-camera
   recording
