class AToFVerifier:
    def __init__(self, 
                 sample_rate_hz: float = 48000.0,
                 speed_of_sound_mps: float = 343.0,
                 temporal_tolerance_ms: float = 0.25):  # 250 microseconds tolerance (~4.3cm distance variance)
        self.sample_rate_hz = sample_rate_hz
        self.c = speed_of_sound_mps
        self.tolerance_ms = temporal_tolerance_ms

    def verify_temporal_bracket(self, 
                                measured_delay_ms: float, 
                                expected_distance_m: float) -> dict:
        """
        Verifies if the measured acoustic reflection peak falls within the strict
        temporal time-bracket corresponding to the physical distance of the face.
        """
        # Calculate the expected physical delay in milliseconds
        round_trip_m = 2.0 * expected_distance_m
        expected_delay_sec = round_trip_m / self.c
        expected_delay_ms = expected_delay_sec * 1000.0
        
        # Calculate the absolute difference between the physical reality and the measured signal
        difference_ms = abs(measured_delay_ms - expected_delay_ms)
        
        # Check if the delay falls within the tight temporal bracket
        passed = difference_ms <= self.tolerance_ms
        
        reason = "Acoustic time-of-flight verified successfully."
        if not passed:
            if measured_delay_ms > expected_delay_ms + self.tolerance_ms:
                # Calculate the added latency
                added_latency_ms = measured_delay_ms - expected_delay_ms
                reason = (
                    f"Acoustic delay exceeds physical limit. Expected {expected_delay_ms:.3f} ms "
                    f"(at {expected_distance_m*100.0:.1f}cm), but peak arrived at {measured_delay_ms:.3f} ms "
                    f"(Difference: +{added_latency_ms:.3f} ms). Indicates digital stream injection latency."
                )
            else:
                reason = (
                    f"Acoustic delay mismatch. Expected {expected_delay_ms:.3f} ms, "
                    f"got {measured_delay_ms:.3f} ms (Difference: {measured_delay_ms - expected_delay_ms:.3f} ms)."
                )
                
        return {
            "passed": bool(passed),
            "measured_delay_ms": float(measured_delay_ms),
            "expected_delay_ms": float(expected_delay_ms),
            "difference_ms": float(difference_ms),
            "tolerance_ms": float(self.tolerance_ms),
            "reason": reason
        }
