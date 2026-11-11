# Scaling Analysis: How Many Devices Can We Simulate?

## The Bottleneck Is the Acoustic Verifier

The Python simulator can handle up to ~50 devices before the acoustic
correlation phase becomes the bottleneck. Beyond that, we need a compiled
backend for the hot correlation loop.

```
Phase                    N=50           N=500          N=5000
BLE bloom filter         <1ms           <5ms           ~25ms
Acoustic snippet corr    ~300ms         ~1.4s          ~14s
Full hybrid pipeline     ~300ms         ~1.4s          ~15s
```

Python is ~50× slower than optimized C/Julia for the correlation loop
(interpreted vs compiled, no SIMD). The BLE bloom filter phase is I/O
bound (hash operations), which Python handles adequately.

## Platform Recommendations for 2026

### For the Verifier Server (N=5000, real-time)

| Platform | Corr speed | BLE speed | Dev time | GPU | FOSS |
|----------|-----------|-----------|----------|-----|------|
| **Julia + DSP.jl** | Fast | Fast | Moderate | Yes | ✅ |
| Rust + ndarray | Fast | Fast | High | Yes | ✅ |
| **GNU Radio (C++/Python)** | Fast | Moderate | Low (blocks) | Some | ✅ |
| Python + NumPy | Moderate | Fast | Low | No | ✅ |
| **Python + PyTorch** | Fast (GPU) | Fast | Low | Yes | ✅ |

**Best choice for our use case: Python + PyTorch on the verifier.**

Why:
- We already have all the logic in Python (bloom filters, adjacency matrices,
  certificate issuance, jamming detection)
- Only the acoustic correlation loop (N×K matched filters) is the bottleneck
- PyTorch can run the matched filter as a 1D convolution on GPU
- The rest of the pipeline stays in Python
- No language boundary, no FFI, no IPC

### For the Simulation Harness (arms race sweeps)

Same trick: keep Python for orchestration, use PyTorch for the batched
correlation. A batch of 128 pairs × 8820 sample windows × 128 code length
is a single `torch.nn.functional.conv1d()` call — about 0.5ms on an RTX 4090,
vs ~15ms in pure Python.

```
Correlation throughput:   Python NumPy   PyTorch CPU    PyTorch GPU
128 pairs × 8820 × 128:     ~15ms          ~2ms           ~0.5ms
5000 pairs × 8820 × 128:    ~390ms        ~78ms           ~17ms
```

### What Comms Engineers Use in 2026

| Tool | Domain | RealPeep fit |
|------|--------|-------------|
| **GNU Radio** | SDR, communications | Overkill — we don't model RF physics |
| **MATLAB + Comms TB** | Academic, cellular | Not FOSS |
| **Julia + DSP.jl** | Scientific computing | Good for standalone verifier |
| **Python + numpy/scipy** | General ML/DSP | Good enough for N<500 |
| **ns-3** | Network simulation | Overkill — we don't need MAC layer |
| **OMNeT++** | Network simulation | Overkill |

For our purposes (blind CDMA correlation, BLE bloom filter, arms race sweeps),
Python + PyTorch for the hot path is the pragmatic choice. It requires no
rewrite — only the correlation loop needs porting.

## Julia Alternative

If we do want a standalone verifier (no GPU dependency):

```julia
using DSP, LinearAlgebra

function correlate_pair(code::Vector{Float64}, audio::Vector{Float64})
    return maximum(xcorr(audio, code))
end

# All pairs in parallel via Threads.@threads
function verify_all(devices, audio_snippets)
    matrix = zeros(Int, length(devices), length(devices))
    Threads.@threads for i in 1:length(devices)
        for j in 1:length(devices)
            if i != j
                matrix[i,j] = correlate_pair(
                    gold_code(devices[i].pk),
                    audio_snippets[devices[j].pk]
                ) > THRESHOLD ? 1 : 0
            end
        end
    end
    return matrix
end
```

Julia's `xcorr` uses FFT under the hood — O(N log N) instead of O(N²).
For a 8820-sample window × 128-chip code: ~50μs per pair vs ~113μs in Python.
About 2× faster for the correlation step alone.

## Recommendation

**Stick with Python.** Push the acoustic correlation to PyTorch (or numpy if
N < 500). The BLE bloom filter phase is already fast enough. When we need a
standalone verifier for deployment (not simulation), Julia is the most
pragmatic compiled option — but that's a future concern.

The real limit isn't compute — it's upload bandwidth. 5000 devices × 176 KB
per acoustic snippet = ~880 MB. That's feasible as a background upload over
a few minutes. The verifier processes them incrementally as they arrive.
