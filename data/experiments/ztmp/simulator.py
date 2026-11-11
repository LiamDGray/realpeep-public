import numpy as np
from .sensor import SecureSensorEmulator

class ZTMPAttackSimulator:
    def __init__(self, seed: int = 42):
        self.rng = np.random.default_rng(seed)
        self.grid_size = 50

    def _generate_3d_face_depth(self) -> np.ndarray:
        """
        Generates a simulated 3D depth map representing a human face dome.
        The center (nose) is closer to the camera (smaller value), and the edges curve away.
        """
        x, y = np.meshgrid(
            np.linspace(-1.0, 1.0, self.grid_size),
            np.linspace(-1.0, 1.0, self.grid_size)
        )
        # Hemispherical dome equation: z = 1.0 - 0.4 * max(0, 1 - (x^2 + y^2))
        r_sq = x**2 + y**2
        depth = 1.2 - 0.35 * np.maximum(0.0, 1.0 - r_sq)
        
        # Add high-frequency sensor noise
        depth += self.rng.normal(0, 0.003, size=depth.shape)
        return depth

    def _generate_flat_screen_depth(self) -> np.ndarray:
        """
        Generates a simulated 2D depth map representing a flat screen.
        All depth coordinates lie on a single planar surface.
        """
        # Flat plane: z = 1.2 (constant distance from the camera)
        depth = np.ones((self.grid_size, self.grid_size)) * 1.2
        # Add high-frequency sensor noise
        depth += self.rng.normal(0, 0.001, size=depth.shape)
        return depth

    def run_simulation(self, verifier) -> dict:
        """
        Executes the ZTMP threat simulation suite and returns a detailed audit report.
        """
        # Instantiate a certified hardware sensor (e.g., in a secure mobile device)
        certified_sensor = SecureSensorEmulator()
        
        # Register the certified sensor in the verifier's PKI directory
        verifier.register_sensor(certified_sensor.sensor_id, certified_sensor.public_key)
        
        # Define the active session nonce
        active_nonce = b"session_nonce_june_26_2026_9999"
        
        # Pre-generate mock RGB data
        mock_rgb = self.rng.integers(0, 255, size=(self.grid_size, self.grid_size, 3), dtype=np.uint8)
        
        results = {}
        
        # ---------------------------------------------------------------------
        # Scenario A: Authentic Capture (Real Human + Certified Sensor)
        # ---------------------------------------------------------------------
        real_depth = self._generate_3d_face_depth()
        authentic_payload = certified_sensor.capture_frame(mock_rgb, real_depth, active_nonce)
        results["authentic_capture"] = verifier.verify_session_frame(authentic_payload, active_nonce)
        
        # ---------------------------------------------------------------------
        # Scenario B: Stream Injection Attack (Software Bypass)
        # ---------------------------------------------------------------------
        # The attacker injects synthetic frames at the OS level.
        # Since they cannot access the physical secure enclave, they must sign the frames
        # using a self-generated, uncertified software key.
        uncertified_sensor = SecureSensorEmulator() # Not registered in the PKI directory
        injection_payload = uncertified_sensor.capture_frame(mock_rgb, real_depth, active_nonce)
        results["stream_injection"] = verifier.verify_session_frame(injection_payload, active_nonce)
        
        # ---------------------------------------------------------------------
        # Scenario C: Re-Projection Attack (2D Screen Deepfake)
        # ---------------------------------------------------------------------
        # The attacker displays a deepfake on a screen. A certified ZTMP camera records it.
        # The signature and session nonce are valid, but the physical depth map is a flat plane.
        flat_depth = self._generate_flat_screen_depth()
        reprojection_payload = certified_sensor.capture_frame(mock_rgb, flat_depth, active_nonce)
        results["reprojection_attack"] = verifier.verify_session_frame(reprojection_payload, active_nonce)
        
        # ---------------------------------------------------------------------
        # Scenario D: Replay Attack (Session Hijacking)
        # ---------------------------------------------------------------------
        # The attacker intercepts an authentic payload from a previous session.
        # They attempt to replay it in the current session (which has a different nonce).
        old_nonce = b"session_nonce_past_session_1111"
        replay_payload = certified_sensor.capture_frame(mock_rgb, real_depth, old_nonce)
        results["replay_attack"] = verifier.verify_session_frame(replay_payload, active_nonce)
        
        return results
