"""
Optimized acoustic verifier cost model.
Key insights:
1. Snippets, not full recordings (2s per chirp)
2. Verifier knows claimed transmission time (±100ms search window)
3. Acoustic range ≈ 20m → each device hears ~K neighbors, not all N
4. BLE mesh pre-filters which pairs to correlate
5. Clustering by proximity
"""
import math

def fmt_time(t):
    if t > 86400: return f'{t/86400:.1f} days'
    if t > 3600:  return f'{t/3600:.1f} hours'
    if t > 60:    return f'{t/60:.1f} min'
    if t > 1:     return f'{t:.1f}s'
    if t > 0.001: return f'{t*1000:.1f}ms'
    return f'{t*1e6:.1f}us'

SF = 128
SAMPLE_RATE = 44100

# Optimized parameters
CHIRP_DURATION = 2          # seconds — short acoustic snippet
SNIPPET_SAMPLES = CHIRP_DURATION * SAMPLE_RATE  # ~88k samples

SEARCH_WINDOW_MS = 100      # ±100ms around claimed tx time
SEARCH_SAMPLES = int(SEARCH_WINDOW_MS * SAMPLE_RATE / 1000 * 2)  # 200ms total

# Acoustic neighbors (what a phone actually hears in a crowd)
K_ACOUSTIC = 25             # conservative: ~25 devices within 20m
K_ACOUSTIC_DENSE = 50       # dense crowd

FLOP_RATE = 10e9

print("=" * 72)
print("  OPTIMIZED ACOUSTIC VERIFIER COST MODEL")
print("=" * 72)

print(f"""
Brute-force baseline (what I computed before):
  Audio: 30s × 44.1kHz = {30*44100:,} samples
  Search: full recording (no claimed-time window)
  Pairs: N² (every device vs every other)
  Cost per pair: {30*44100*SF:,} MACs

Three optimizations applied together:
""")

# ── Optimization 1: Snip instead of full recording ──
print("1. SNIPPET CORRELATION (2s chirp, not 30s recording)")
print(f"   Before: {30*44100:,} samples/device")
print(f"   After:  {SNIPPET_SAMPLES:,} samples/device")
print(f"   Factor: {30*44100 / SNIPPET_SAMPLES:.0f}×")

# ── Optimization 2: Known transmission time → narrow window ──
print(f"""
2. NARROW SEARCH WINDOW (known claimed tx time ±{SEARCH_WINDOW_MS}ms)
   Device embeds local timestamp in beacon.
   Verifier knows A said it transmitted at t_A.
   When checking B's audio for A's code, only search [{SEARCH_WINDOW_MS}ms window].
   Before: {SNIPPET_SAMPLES:,} samples/pair
   After:  {SEARCH_SAMPLES:,} samples/pair
   Factor: {SNIPPET_SAMPLES / SEARCH_SAMPLES:.0f}×
""")

# ── Optimization 3: Acoustic range limits pairs ──
print("3. LOCAL CLUSTERS (acoustic range ≈ 20m)")
print(f"   A phone hears ~{K_ACOUSTIC} devices in sparse crowd, ~{K_ACOUSTIC_DENSE} in dense crowd")
print(f"   Verifier only checks pairs within BLE-confirmed proximity")
print(f"   BLE bloom filter tells verifier which pairs to check")
print(f"   N² → N × K_neighbors")
print(f"   Factor for N=5000, K=25: {5000*5000 / (5000*25):.0f}×")
print("")

# ── Combined cost ──
print("-" * 72)
print("  COMBINED COST: per-pair acoustic correlation")
print("-" * 72)

COST_PER_PAIR = SEARCH_SAMPLES * SF

print(f"""
  Search samples:     {SEARCH_SAMPLES:,}
  Code length (SF):   {SF}
  MACs per pair:      {COST_PER_PAIR:,}
  At 10 GFLOP/s:      {fmt_time(COST_PER_PAIR / FLOP_RATE)}
""")

# ── Time estimates ──
print("-" * 72)
print("  TOTAL VERIFIER TIME: unoptimized vs optimized")
print("-" * 72)

print(f"\n{'Scenario':>40} | {'Before':>18} | {'After':>18}")
print("-" * 80)

for label, N, K in [
    ("Small crowd (N=100)", 100, 25),
    ("Medium crowd (N=500)", 500, 25),
    ("Large crowd (N=5000, K=25)", 5000, 25),
    ("Dense large crowd (N=5000, K=50)", 5000, 50),
]:
    # Before: N² × full recording × full search
    before_ops = N * N * 30 * SAMPLE_RATE * SF
    before_t = before_ops / FLOP_RATE

    # After: N × K × search_window × SF
    after_ops = N * K * COST_PER_PAIR
    after_t = after_ops / FLOP_RATE

    print(f"{label:>40} | {fmt_time(before_t):>18} | {fmt_time(after_t):>18}")

# ── Distributed processing note ──
print("""
────────────────────────────────────────────────────────────────────────
  NOTE: K acoustic neighbors can be processed IN PARALLEL
────────────────────────────────────────────────────────────────────────
  Each pair correlation is independent. With 1000 workers:
    N=5000, K=50:  (6.25M pairs) / 1000 workers × 0.11ms = 0.7s

  Dopper shift at walking speed (1.5 m/s) at 20 kHz:
    f_shift = 1.5/343 × 20000 ≈ 87 Hz (0.4% of carrier)
    Matched filter with SF=128 is tolerant at this scale.
    Only an issue at >10 m/s (running vehicle) — irrelevant for crowds.

  Real constraint: the audio snippets must be uploaded.
    2s × 44.1kHz × 16bit = ~176 KB per chirp per device.
    For 5000 devices: ~880 MB total (feasible asynchronously).
""")

print("-" * 72)
print("  HYBRID VERIFIER ARCHITECTURE")
print("-" * 72)
print("""
  Phase 1: BLE bloom filter (fast, all devices)
    → adjacency matrix: who heard whom
    → cost: O(N² × k) ≈ 25ms for N=5000
    → issues: provisional group certificate

  Phase 2: Acoustic audit (targeted, selected pairs)
    → for each observed BLE edge, verify with acoustic snippet
    → cost: O(N × K × search_window × SF) ≈ 2.8s for N=5000, K=25
    → confirms room-level co-location

  Phase 3: Challenge (on demand)
    → if a pair's acoustic correlation fails, investigate
    → could be noise, could be spoofing
    → acoustic confidence score per pair

  This keeps the fast path fast (25ms) and the slow path
  bounded (seconds, not hours or days).
""")
