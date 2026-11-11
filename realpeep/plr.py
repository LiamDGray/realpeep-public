import numpy as np


class PLRVerifier:
    def __init__(self, 
                 sample_rate_hz: float = 30.0,
                 min_latency_ms: float = 150.0,
                 max_latency_ms: float = 400.0,
                 min_amplitude_pct: float = 0.15,
                 max_amplitude_pct: float = 0.50,
                 min_duration_ms: float = 200.0,
                 max_duration_ms: float = 600.0):
        self.sample_rate_hz = sample_rate_hz
        self.min_latency_ms = min_latency_ms
        self.max_latency_ms = max_latency_ms
        self.min_amplitude_pct = min_amplitude_pct
        self.max_amplitude_pct = max_amplitude_pct
        self.min_duration_ms = min_duration_ms
        self.max_duration_ms = max_duration_ms

    def verify(self, 
               brightness_timestamps: np.ndarray, 
               brightness_signal: np.ndarray, 
               pupil_timestamps: np.ndarray, 
               pupil_diameter_signal: np.ndarray) -> dict:
        """
        Verifies if the pupil constriction response matches physiological bounds following a brightness increase.
        
        Parameters:
            brightness_timestamps (np.ndarray): Timestamps of screen brightness changes (in seconds).
            brightness_signal (np.ndarray): Screen brightness values (0.0 to 1.0).
            pupil_timestamps (np.ndarray): Timestamps of pupil diameter measurements (in seconds).
            pupil_diameter_signal (np.ndarray): Pupil diameter measurements (arbitrary units or mm).
            
        Returns:
            dict: Verification results containing latency, amplitude, duration, and status flags.
        """
        # Find the trigger moment: when screen brightness increases significantly (e.g., > 0.5 step increase)
        trigger_time = None
        for i in range(1, len(brightness_signal)):
            if brightness_signal[i] - brightness_signal[i-1] >= 0.4:
                trigger_time = brightness_timestamps[i]
                break
                
        if trigger_time is None:
            return {
                "passed": False,
                "score": 0.0,
                "latency_ms": 0.0,
                "amplitude_pct": 0.0,
                "duration_ms": 0.0,
                "reason": "No valid brightness trigger detected in stimulus signal."
            }
            
        # Extract the pupil response window: from trigger_time to trigger_time + 1.5 seconds
        window_mask = (pupil_timestamps >= trigger_time) & (pupil_timestamps <= trigger_time + 1.5)
        window_times = pupil_timestamps[window_mask]
        window_pupil = pupil_diameter_signal[window_mask]
        
        if len(window_pupil) < int(self.sample_rate_hz * 1.0):
            return {
                "passed": False,
                "score": 0.0,
                "latency_ms": 0.0,
                "amplitude_pct": 0.0,
                "duration_ms": 0.0,
                "reason": "Insufficient pupil tracking data within response window."
            }
            
        # Baseline is the pupil diameter at or just before the trigger
        baseline_indices = np.where(pupil_timestamps <= trigger_time)[0]
        if len(baseline_indices) > 0:
            baseline_diameter = pupil_diameter_signal[baseline_indices[-1]]
        else:
            baseline_diameter = window_pupil[0]
            
        # Detect minimum diameter in the response window
        min_idx = np.argmin(window_pupil)
        min_diameter = window_pupil[min_idx]
        min_time = window_times[min_idx]
        
        # Calculate amplitude
        amplitude_pct = (baseline_diameter - min_diameter) / (baseline_diameter + 1e-8)
        
        # Detect the start of constriction (first frame where pupil falls below 98% of baseline and continues downward)
        constriction_start_time = None
        for t, val in zip(window_times, window_pupil):
            if val < 0.98 * baseline_diameter:
                constriction_start_time = t
                break
                
        if constriction_start_time is None or constriction_start_time > min_time:
            constriction_start_time = trigger_time
            
        # Calculate latency: time from trigger to start of constriction
        latency_ms = (constriction_start_time - trigger_time) * 1000.0
        
        # Calculate duration: time from start of constriction to minimum diameter
        duration_ms = (min_time - constriction_start_time) * 1000.0
        
        # Check if the pupil is static
        is_static = np.std(window_pupil) < 1e-4 * baseline_diameter
        
        # Evaluate physiological parameters
        latency_passed = self.min_latency_ms <= latency_ms <= self.max_latency_ms
        amplitude_passed = self.min_amplitude_pct <= amplitude_pct <= self.max_amplitude_pct
        duration_passed = self.min_duration_ms <= duration_ms <= self.max_duration_ms
        
        passed = bool(latency_passed and amplitude_passed and duration_passed and not is_static)
        
        reason = "Verification passed."
        if is_static:
            reason = "Static pupil detected. Indicates static image, video replay, or non-reactive artificial eye."
            passed = False
        elif not passed:
            reasons = []
            if not latency_passed:
                if latency_ms < self.min_latency_ms:
                    reasons.append(f"Instantaneous constriction ({latency_ms:.1f} ms < {self.min_latency_ms:.1f} ms). Indicates simulated mapping spoof.")
                else:
                    reasons.append(f"Delayed constriction ({latency_ms:.1f} ms > {self.max_latency_ms:.1f} ms).")
            if not amplitude_passed:
                reasons.append(f"Abnormal constriction amplitude ({amplitude_pct*100.0:.1f}% outside [{self.min_amplitude_pct*100.0:.1f}%, {self.max_amplitude_pct*100.0:.1f}%]).")
            if not duration_passed:
                reasons.append(f"Abnormal constriction duration ({duration_ms:.1f} ms outside [{self.min_duration_ms:.1f} ms, {self.max_duration_ms:.1f} ms]).")
            reason = " ".join(reasons)
            
        # Compute score: 1.0 if perfect, scale down based on deviation
        score = 0.0
        if passed:
            score = 1.0
        else:
            if not is_static:
                # Give partial credit if it reacts but falls outside physiological bounds
                score = 0.3 * (amplitude_pct > 0.05)
                
        return {
            "passed": passed,
            "score": float(score),
            "latency_ms": float(latency_ms),
            "amplitude_pct": float(amplitude_pct),
            "duration_ms": float(duration_ms),
            "reason": reason
        }
