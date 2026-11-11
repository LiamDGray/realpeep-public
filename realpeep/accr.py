import numpy as np


class ACCRVerifier:
    def __init__(self, sample_rate_hz: float = 60.0, max_allowed_latency_ms: float = 50.0, min_correlation: float = 0.60):
        self.sample_rate_hz = sample_rate_hz
        self.max_allowed_latency_ms = max_allowed_latency_ms
        self.min_correlation = min_correlation

    def _resample_signal(self, timestamps: np.ndarray, signal: np.ndarray, target_timestamps: np.ndarray) -> np.ndarray:
        """
        Resamples a 1D or multi-dimensional signal to the target timestamps using linear interpolation.
        """
        if signal.ndim == 1:
            return np.interp(target_timestamps, timestamps, signal)
        
        resampled = np.zeros((len(target_timestamps), signal.shape[1]))
        for col in range(signal.shape[1]):
            resampled[:, col] = np.interp(target_timestamps, timestamps, signal[:, col])
        return resampled

    def verify(self, 
               challenge_timestamps: np.ndarray, 
               challenge_signal: np.ndarray, 
               response_timestamps: np.ndarray, 
               response_signal: np.ndarray) -> dict:
        """
        Verifies the alignment between the screen color challenge and the captured skin reflection.
        
        Parameters:
            challenge_timestamps (np.ndarray): Timestamps of screen color changes (in seconds).
            challenge_signal (np.ndarray): RGB values of screen colors, shape (N, 3).
            response_timestamps (np.ndarray): Timestamps of camera frames (in seconds).
            response_signal (np.ndarray): RGB values of skin reflections, shape (M, 3).
            
        Returns:
            dict: Verification results containing liveness score, estimated latency, and status flags.
        """
        # Define common time grid
        t_start = max(challenge_timestamps[0], response_timestamps[0])
        t_end = min(challenge_timestamps[-1], response_timestamps[-1])
        
        if t_end <= t_start:
            return {
                "passed": False,
                "score": 0.0,
                "latency_ms": 0.0,
                "max_correlation": 0.0,
                "reason": "Insufficient overlapping time range between challenge and response."
            }
            
        dt = 1.0 / self.sample_rate_hz
        target_timestamps = np.arange(t_start, t_end, dt)
        
        # Resample signals to common grid
        c_resampled = self._resample_signal(challenge_timestamps, challenge_signal, target_timestamps)
        r_resampled = self._resample_signal(response_timestamps, response_signal, target_timestamps)
        
        # Normalize signals (zero mean, unit variance) to calculate Pearson correlation
        c_norm = (c_resampled - np.mean(c_resampled, axis=0)) / (np.std(c_resampled, axis=0) + 1e-8)
        r_norm = (r_resampled - np.mean(r_resampled, axis=0)) / (np.std(r_resampled, axis=0) + 1e-8)
        
        # We search for lag in a range of -200ms to +400ms
        max_lag_frames = int(0.400 * self.sample_rate_hz)
        min_lag_frames = -int(0.200 * self.sample_rate_hz)
        
        best_lag_frames = 0
        best_correlation = -1.0
        
        # Flatten signals or average across RGB channels to compute overall temporal alignment
        c_flat = np.mean(c_norm, axis=1)
        r_flat = np.mean(r_norm, axis=1)
        
        n_samples = len(target_timestamps)
        
        for lag in range(min_lag_frames, max_lag_frames + 1):
            if lag >= 0:
                c_slice = c_flat[:n_samples - lag]
                r_slice = r_flat[lag:]
            else:
                c_slice = c_flat[-lag:]
                r_slice = r_flat[:n_samples + lag]
                
            if len(c_slice) < int(0.5 * n_samples):
                continue
                
            correlation = np.corrcoef(c_slice, r_slice)[0, 1]
            if np.isnan(correlation):
                correlation = 0.0
                
            if correlation > best_correlation:
                best_correlation = correlation
                best_lag_frames = lag
                
        estimated_latency_ms = (best_lag_frames / self.sample_rate_hz) * 1000.0
        
        # Check criteria
        correlation_passed = best_correlation >= self.min_correlation
        # Human latency is typically positive and small (10ms to 50ms camera/display pipeline delay)
        # Latencies > 80ms or negative latencies indicate anomalies (virtual cameras or generation lag)
        latency_passed = 0.0 <= estimated_latency_ms <= self.max_allowed_latency_ms
        
        passed = bool(correlation_passed and latency_passed)
        
        # Determine specific failure reasons
        reason = "Verification passed."
        if not passed:
            if not correlation_passed:
                reason = f"Low correlation ({best_correlation:.2f} < {self.min_correlation:.2f}). Possible replay attack or mismatch."
            elif not latency_passed:
                if estimated_latency_ms < 0:
                    reason = f"Negative latency detected ({estimated_latency_ms:.1f} ms). Signal is predictive, indicating virtual camera simulation."
                else:
                    reason = f"High latency detected ({estimated_latency_ms:.1f} ms > {self.max_allowed_latency_ms:.1f} ms). Indicates neural rendering delay."
                    
        # Score computation: combination of correlation quality and latency penalty
        score = max(0.0, best_correlation)
        if estimated_latency_ms > self.max_allowed_latency_ms:
            # Penalize high latency linearly
            penalty = min(1.0, (estimated_latency_ms - self.max_allowed_latency_ms) / 200.0)
            score *= (1.0 - penalty)
        elif estimated_latency_ms < 0:
            score = 0.0
            
        return {
            "passed": passed,
            "score": float(score),
            "latency_ms": float(estimated_latency_ms),
            "max_correlation": float(best_correlation),
            "reason": reason
        }
