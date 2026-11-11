import numpy as np

class DepthGeometryVerifier:
    def __init__(self, flat_plane_threshold: float = 0.005, min_convexity: float = 0.05):
        self.flat_plane_threshold = flat_plane_threshold
        self.min_convexity = min_convexity

    def verify_3d_structure(self, depth_map: np.ndarray) -> dict:
        """
        Verifies if the depth map represents a genuine 3D structure (like a human face)
        or a flat surface (like a phone/monitor screen showing a deepfake).
        
        Method:
            1. Fits a 3D plane (z = ax + by + c) using linear least squares.
            2. Calculates the Mean Squared Error (MSE) of the planar residuals.
               A flat screen has near-zero MSE, while a 3D face has high residual error.
            3. Calculates the center-to-perimeter convexity to confirm a biological face dome.
        """
        h, w = depth_map.shape
        x, y = np.meshgrid(np.linspace(-1.0, 1.0, w), np.linspace(-1.0, 1.0, h))
        
        X = x.flatten()
        Y = y.flatten()
        Z = depth_map.flatten()
        
        # Design matrix A for linear regression: z = a*x + b*y + c
        A = np.column_stack((X, Y, np.ones_like(X)))
        
        # Solve least squares: A * P = Z
        # P = [a, b, c]
        P, _, _, _ = np.linalg.lstsq(A, Z, rcond=None)
        a, b, c = P
        
        # Calculate planar fit and residuals
        fitted_z = A @ P
        residuals = Z - fitted_z
        mse = np.mean(residuals ** 2)
        
        # Check center-to-perimeter convexity
        # Center region: middle 30% of the grid
        center_h_start, center_h_end = int(h * 0.35), int(h * 0.65)
        center_w_start, center_w_end = int(w * 0.35), int(w * 0.65)
        
        center_depths = depth_map[center_h_start:center_h_end, center_w_start:center_w_end]
        
        # Perimeter: outer edges of the grid
        perimeter_mask = np.ones_like(depth_map, dtype=bool)
        perimeter_mask[int(h * 0.1):int(h * 0.9), int(w * 0.1):int(w * 0.9)] = False
        perimeter_depths = depth_map[perimeter_mask]
        
        # In depth maps, smaller values mean closer to the camera (nose is closest)
        # Convexity = average perimeter depth - average center depth
        # A positive convexity indicates a dome structure curving toward the camera
        mean_center = np.mean(center_depths)
        mean_perimeter = np.mean(perimeter_depths)
        convexity = mean_perimeter - mean_center
        
        # Decision logic
        is_flat = mse < self.flat_plane_threshold
        has_convexity = convexity >= self.min_convexity
        
        passed = (not is_flat) and has_convexity
        
        reason = "3D spatial structure verified successfully."
        if not passed:
            if is_flat:
                reason = f"Flat surface detected (Planar MSE {mse:.6f} < {self.flat_plane_threshold:.6f}). Indicates a 2D screen re-projection attack."
            elif not has_convexity:
                reason = f"Insufficient center convexity ({convexity:.3f} < {self.min_convexity:.3f}). Surface does not match human facial contours."
                
        return {
            "passed": bool(passed),
            "planar_mse": float(mse),
            "convexity": float(convexity),
            "is_flat": bool(is_flat),
            "has_convexity": bool(has_convexity),
            "reason": reason
        }
