import numpy as np


class SPCIVerifier:
    def __init__(self, sample_rate_hz: float = 120.0, max_latency_ms: float = 8.0, min_correlation: float = 0.8):
        """
        Sub-Perceptual Cryptographic Illumination Verifier.
        Verifies that the high-frequency corneal reflection matches the 
        cryptographic screen illumination challenge with near-zero latency,
        forcing attackers into an unsustainable ray-tracing compute loop.
        """
        self.sample_rate_hz = sample_rate_hz
        self.max_latency_ms = max_latency_ms
        self.min_correlation = min_correlation

    def verify(self, 
               challenge_sequence: np.ndarray, 
               reflection_sequence: np.ndarray) -> dict:
        """
        Cross-correlates the challenge (screen illumination) and the response
        (corneal reflection). Checks both the maximum correlation value and 
        the latency at which it occurs.
        """
        # Normalize signals
        c_norm = (challenge_sequence - np.mean(challenge_sequence)) / (np.std(challenge_sequence) + 1e-9)
        r_norm = (reflection_sequence - np.mean(reflection_sequence)) / (np.std(reflection_sequence) + 1e-9)

        # Cross-correlation
        correlation = np.correlate(r_norm, c_norm, mode='full') / len(challenge_sequence)
        
        # The center index corresponds to 0 lag
        lag_zero_idx = len(challenge_sequence) - 1
        
        # Find the peak correlation occurring at lag >= 0 (response after challenge)
        valid_lags = correlation[lag_zero_idx:]
        peak_idx = np.argmax(valid_lags)
        max_corr = valid_lags[peak_idx]
        
        # Calculate latency in ms based on sample rate
        latency_ms = (peak_idx / self.sample_rate_hz) * 1000.0

        passed_corr = max_corr >= self.min_correlation
        passed_latency = latency_ms <= self.max_latency_ms
        passed = bool(passed_corr and passed_latency)
        
        score = max(0.0, max_corr) if passed else 0.0
        
        reasons = []
        if not passed_corr:
            reasons.append(f"Reflection correlation too low: {max_corr:.2f} < {self.min_correlation}")
        if not passed_latency:
            reasons.append(f"Rendering latency too high: {latency_ms:.2f}ms > {self.max_latency_ms}ms")
            
        reason = "Pass" if passed else " | ".join(reasons)
        
        return {
            "passed": passed,
            "score": float(score),
            "max_correlation": float(max_corr),
            "latency_ms": float(latency_ms),
            "reason": reason
        }
