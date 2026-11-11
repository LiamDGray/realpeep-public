import numpy as np


class HCSJVerifier:
    def __init__(self, max_allowed_variance: float = 0.05):
        """
        Hardware Cryptographic Shutter Jitter Verifier.
        By jittering the camera shutter, we expose the Analog Hole. 
        A continuous physical light source (a real face) will show low variance 
        despite jitter. A re-projected light source (an OLED/LCD monitor) will 
        exhibit high variance due to aliasing with blanking intervals and PWM.
        """
        self.max_allowed_variance = max_allowed_variance

    def verify(self, sensor_luminance_samples: np.ndarray) -> dict:
        """
        Analyzes the variance/flicker of the raw sensor luminance samples 
        captured with a jittered shutter.
        """
        # Calculate the normalized variance of the luminance signal
        mean_lum = np.mean(sensor_luminance_samples)
        if mean_lum == 0:
            variance = 0.0
        else:
            # Coefficient of variation (variance normalized by mean squared)
            variance = np.var(sensor_luminance_samples) / (mean_lum ** 2)

        passed = bool(variance <= self.max_allowed_variance)
        
        # Score calculation: 1.0 for zero variance, drops linearly to 0 at max_allowed
        score = max(0.0, 1.0 - (variance / self.max_allowed_variance)) if passed else 0.0
        
        reason = "Pass" if passed else f"Monitor re-projection detected: Jitter variance is {variance:.4f} (threshold: {self.max_allowed_variance})"
        
        return {
            "passed": passed,
            "score": float(score),
            "variance": float(variance),
            "reason": reason
        }
