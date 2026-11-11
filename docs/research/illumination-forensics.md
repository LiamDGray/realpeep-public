# Feasibility: Shadow + Specular Checks for Illumination Verification

**Question:** Can "simple shadow-direction and specular-highlight checks on 2–3 reference points" be automated, and at what cost?

---

## The Claim Is Supported — With Caveats

### Johnson & Farid (2005–2007) — The Canonical Result

The seminal work in illumination-consistency forensics (cited 1200+ times) proved that estimating **lighting direction from 3–5 points on a Lambertian surface** is sufficient to detect composites:

- **Cost:** ~100ms per face in 2005; ~5ms on modern hardware
- **Method:** Fit spherical harmonics coefficients to pixel intensities at known 3D locations
- **Accuracy:** Can distinguish real from composited with ~90% accuracy on face crops
- **Assumption:** Rough 3D face geometry is known (generic face model suffices)

**Verdict for your claim:** Yes, 2–3 reference points on a surface with known geometry give a robust lighting vector. You don't need full ray tracing.

### Specular Highlights Are Even Stronger

A single specular highlight gives the exact light source direction (angle of incidence = angle of reflection), unlike diffuse shading which gives only an underdetermined 2D projection. The trade-off:

| Cue | Points needed | Geometry needed | Computation | Strength |
|-----|--------------|-----------------|-------------|----------|
| Diffuse shading | 3–5 point correspondences | Approximate 3D surface | ~5ms (least squares) | Moderate — sensitive to surface albedo |
| Specular highlight | 1 point | None (mirror reflection) | ~1ms (geometric) | Strong — exact light direction |
| Shadow direction | 2 reference points | Known scene layout | ~2ms | Strong — needs reference |
| Inter-reflection | Many points | Full scene geometry | ~hours (path tracing) | Most detailed |

**From our search results:** "Exploring Specular Reflection Inconsistency for Generalizable Face Forgery Detection" (arXiv:2602.06452, 2026) confirms specular inconsistency as a viable deepfake detector — published just this year.

**The key finding:** You don't need ray tracing because you're not doing fully general inverse rendering. You're checking a *consistency* constraint — "does the illumination observed in the video match what the optical beacon's known position would produce?" — which is a much easier problem than "render this scene from scratch."

---

## Can It Be Automated? Yes.

**Pipeline for automated illumination verification:**

```
For each video frame:

1. Detect light bar beacon in frame (known temporal pattern + bright pixels)
   → Cost: ~2ms/frame (convolution + threshold)

2. Estimate beacon 3D position from known GPS + IMU (if available)
   OR estimate from multi-view triangulation
   → Cost: ~10ms (trigonometry / linear least squares)

3. Find 2–3 reference points in scene:
   - Option A: Detect faces, use generic face geometry
   - Option B: Detect vertical edges (poles, building corners), use as shadow references
   - Option C: Detect specular highlights on wet surfaces, glass, glossy objects
   → Cost: ~20ms (YOLO or similar detector)

4. For each reference point, compute expected illumination direction:
   - Compare shadow direction to beacon position
   - Compare specular highlight direction to beacon position
   → Cost: ~1ms per point

5. Aggregate: if >90% of reference points are consistent with the beacon's position,
   the illumination is verified. If <50%, it's likely spoofed.
   → Cost: ~1ms

Total: ~35ms/frame for first frame, ~15ms/frame for subsequent frames (reuse detections)
```

**Hardware:** All of this runs on a modern phone GPU (the object detection step is the heaviest; everything else is lightweight linear algebra). No dedicated hardware needed.

---

## 3D Scene Reconstruction from Mesh Cameras

For the case where you don't know the 3D scene geometry (e.g., an outdoor protest location you've never seen before):

### 2026 State of the Art

**NoPose-NeuS** (arXiv:2312.15238, 2023) jointly optimizes camera poses AND 3D surfaces from multi-view images without knowing camera parameters. It handles non-Lambertian surfaces and thin structures.

**Dynamic Gaussians Mesh** (arXiv:2404.12379, 2024) extends to dynamic scenes — relevant for protest footage where people are moving.

**Cost breakdown for mesh-scale reconstruction (10–50 phones):**

| Step | Algorithm | Time | Hardware |
|------|-----------|------|----------|
| Feature matching (SIFT/AKAZE across all camera pairs) | COLMAP / OpenMVG | 2–10 min | CPU (16 cores) |
| Sparse point cloud + camera poses | Bundle adjustment | 1–5 min | CPU |
| Dense reconstruction (MVS / NeRF) | Instant-NGP / 3D Gaussian Splatting | 5–30 min | GPU (NVIDIA RTX) |
| Illumination verification | Our pipeline above | 35ms/frame | Phone GPU |

**Can you skip the 3D reconstruction entirely?** Yes, if:
- You have the light bar beacon visible in multiple phone cameras → triangulate its 3D position directly
- Or you have IMU data from each phone → known camera poses → 3D from stereo pairs
- Or you only need shadow direction (not magnitude) → 2D image analysis suffices

---

## Should You Add IMU Support?

**Short answer: Yes, strongly recommended.** Here's why:

### What IMU gives you

| Sensor | What it provides | Why it matters |
|--------|-----------------|----------------|
| **Accelerometer** | Gravity direction → horizon line | Tells you camera pitch/roll — critical for mapping 2D image features to 3D world coordinates |
| **Gyroscope** | Angular velocity → camera rotation over time | Enables rolling-shutter correction and video stabilization deconvolution |
| **Magnetometer (compass)** | Absolute heading (magnetic north) | Gives camera yaw — the hardest IMU dimension. Without it, your 3D reconstruction has unknown absolute orientation |
| **All three (9-axis IMU)** | Full camera pose (6-DOF) at 100–1000 Hz | Makes multi-view fusion trivial: each phone's camera position and orientation are known before any image processing |

### Without IMU

NoPose-NeuS can reconstruct from sparse views without known poses — but it's solving a much harder problem (simultaneous pose estimation + geometry) and takes 10–100× longer. It also has scale ambiguity: without IMU gravity direction, you don't know which way is up.

### With IMU

Camera pose is known to within ~1° rotation and ~10cm translation (phone-quality IMU + visual-inertial odometry). This makes multi-view 3D reconstruction a *linear* problem instead of a *nonlinear* one — orders of magnitude faster.

### Compelling finding: "Image as an IMU"

A 2025 paper (arXiv:2503.17358) shows you can estimate camera motion from a single motion-blurred image. So IMU isn't strictly required — but it makes everything 10–100× cheaper and more reliable. Most phones already have IMUs; you just need to read them.

### Recommendation

| Phase | Sensor requirement | Rationale |
|-------|-------------------|-----------|
| Minimum viable | Accelerometer only | Gives gravity direction → horizon. Most phones have this. |
| Good | 6-axis IMU (accel + gyro) | Enables visual-inertial odometry for camera pose tracking |
| Best | 9-axis IMU (accel + gyro + magnetometer) | Full absolute orientation. $2–5 BOM cost on a phone. |

Most modern phones already ship with 9-axis IMUs. You likely just need to read and export the data alongside the video.

---

## Summary of Costs

| Task | Cost | Can it be automated? |
|------|------|---------------------|
| Shadow direction check (2 reference points) | ~2ms/frame | Yes — edge detection + line fitting |
| Specular highlight check (1 point) | ~1ms/frame | Yes — specular detection via pixel intensity threshold |
| Full illumination consistency (3–5 points) | ~35ms/frame | Yes — ~25ms for initial detections, ~10ms thereafter |
| 3D scene reconstruction from mesh (10–50 cameras) | 5–30 min offline | Yes — COLMAP + 3D Gaussian Splatting |
| With IMU: linear approximation | 10–60s | Yes — known poses make it fast |
| Without IMU: joint optimization | 30 min+ | Yes — NoPose-NeuS or similar |
