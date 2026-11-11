# Jamming Resilience in BLE Mesh

## 1. Jamming Threat Model

BLE mesh observation relies on honest devices broadcasting beacons and honest
observers committing the nonces they hear into a Bloom filter. A malicious
actor ("jammer") can disrupt this process in several ways:

### Flood jamming
The attacker broadcasts *many* beacons with different nonces, filling everyone's
Bloom filters with garbage. In the extreme, every Bloom filter appears to
contain every nonce, making the adjacency matrix useless — everyone looks
connected to everyone, and no real topology can be discerned.

**Mechanism**: A single device transmits 50–100× the expected number of beacons
during a scan window. Each beacon has a unique nonce, so honest observers'
filters fill up and eventually saturate.

### Silent observer
The attacker listens without ever submitting observations. Its own Bloom filter
commitment is empty (or missing). However, other honest devices *do* hear the
attacker's beacons, so the attacker appears in their filters. This creates an
asymmetric adjacency: many devices "see" the jammer, but the jammer sees nobody.

**Mechanism**: The jammer broadcasts beacons (to be heard) but submits an empty
(or absent) Bloom filter to the verifier.

### Spoof jamming
The attacker submits a saturated Bloom filter (e.g., all bits set to 1). This
makes it look like the attacker observed *everyone's* nonces, creating a false
positive adjacency. In the matrix, the attacker appears connected to every
device, artificially inflating connectivity.

**Mechanism**: After the observation window, the jammer submits a Bloom filter
with >80% of bits set to 1 (a "saturated" filter).

### Sybil jamming
The attacker creates many fake device identities (public keys) to amplify any
of the above attacks. Instead of one flooder, the attacker registers 5–50 fake
devices, each broadcasting and/or submitting malicious observations.

**Mechanism**: One physical attacker registers N virtual devices with distinct
pks, each of which can flood, spoof, or stay silent.

---

## 2. Verifier-Side Defenses

The verifier (`BleMeshVerifier`) applies the following defenses after
collecting all observations and beacons, but before issuing a certificate.

### Observational asymmetry detection
For each device, compute:

- `observed_by_count`: how many other devices' Bloom filters contain this
  device's nonce(s) — i.e., how many peers heard this device.
- `owns_observations`: how many distinct peers' nonces this device's Bloom
  filter contains — i.e., how many peers this device heard.

If `observed_by_count > N/2` but `owns_observations == 0`, the device is
hearing nobody despite being heard by many — a strong signal of a silent
observer jammer.

**Implementation**: `BleMeshVerifier.detect_asymmetry(matrix)`

### Flood detection
Count the total number of nonces across all submitted beacons for each device.
If a device's nonce count far exceeds the median (threshold = max(median × 3,
10)), it is flagged as a flooder.

**Rationale**: An honest device emits roughly the same number of beacons as its
peers. A flood jammer emits an order of magnitude more.

**Implementation**: `BleMeshVerifier.detect_flood()`

### Saturated Bloom filter detection
Inspect each submitted Bloom filter. If >80% of its bits are set to 1, the
filter is saturated — either the device observed an implausibly large number of
nonces or submitted a garbage/spoofed filter. The device is flagged and dropped.

**Rationale**: A correctly sized Bloom filter at 2% FPR uses ~8 bits per
inserted item. Even with 5000 insertions, only ~40,000 of ~58,000 bits
(~69%) would be set. >80% saturation is a clear anomaly.

**Implementation**: `BleMeshVerifier.detect_saturated_bloom()`

### Reconnection check
After dropping flagged devices, the verifier rebuilds the adjacency matrix
from the remaining devices and re-checks connectivity. If the graph is fully
connected, a certificate is issued.

**Implementation**: `BleMeshVerifier.process_with_defenses()`

---

## 3. Arms Race Methodology

The arms race simulation pits honest witnesses against jammers at various
ratios. The verifier applies all defenses; we measure whether the attack
succeeds or the defense prevails.

### Protocol

1. **Setup**: Create N honest witnesses and M jammers.
2. **Simulation**: Run a full mesh capture cycle using `JammingAwareBleSimulator`.
   - Honest devices register and broadcast beacons normally.
   - Jammers use their strategy (flood, silent, spoof, sybil).
3. **Observation**: Each honest witness scans the channel and records observed
   nonces into a Bloom filter.
4. **Verification**: The verifier collects all observations and beacons, then
   runs `process_with_defenses()`.
5. **Metrics**:
   - `cert_issued`: Was a group certificate issued after defense?
   - `jammer_dropped`: Was at least one jammer pk flagged and removed?
   - `n_dropped`: How many devices were dropped total?
   - `defenses`: Which defenses triggered?

### Sweep parameters

| N (witnesses) | M (jammers) | Strategy |
|---------------|-------------|----------|
| 10            | 0           | —        |
| 10            | 5           | flood    |
| 10            | 10          | flood    |
| 10            | 20          | flood    |
| 50            | 0           | —        |
| 50            | 25          | flood    |
| 50            | 50          | flood    |
| 10            | 5           | silent   |
| 10            | 10          | silent   |
| 10            | 5           | spoof    |
| 10            | 5           | sybil    |

### Evolution rules
- If jammers succeed >50% of the time across sweep, add a defense.
- If defenses block >5% of honest witnesses, relax thresholds.

---

## 4. Expected Results

| W | J | Strategy   | Cert Issued | Jammer Dropped | Dropped | Defenses                  |
|---|----|------------|-------------|----------------|---------|---------------------------|
| 10|  0 | —          | ✅          | —              | 0       | []                        |
| 10|  5 | flood      | ✅          | ✅             | ≥1      | [flood_detection]         |
| 10| 10 | flood      | ✅          | ✅             | ≥1      | [flood_detection]         |
| 10| 20 | flood      | ✅          | ✅             | ≥1      | [flood_detection]         |
| 50|  0 | —          | ✅          | —              | 0       | []                        |
| 50| 25 | flood      | ✅          | ✅             | ≥1      | [flood_detection]         |
| 50| 50 | flood      | ✅          | ✅             | ≥1      | [flood_detection]         |
| 10|  5 | silent     | ✅          | ✅             | ≥1      | [asymmetry_detection]     |
| 10| 10 | silent     | ✅          | ✅             | ≥1      | [asymmetry_detection]     |
| 10|  5 | spoof      | ✅          | ✅             | ≥1      | [saturation_detection]    |
| 10|  5 | sybil      | ✅          | ✅             | ≥5      | [flood_detection]         |

---

## 5. Results (after test run)

*This section is filled in automatically after running the arms race sweep.*

```
Results populated by tests/test_arms_race.py
```
