import numpy as np


class RPPGVerifier:
    def __init__(self, 
                 sample_rate_hz: float = 30.0, 
                 min_hr_bpm: float = 45.0, 
                 max_hr_bpm: float = 180.0, 
                 min_coherence: float = 0.80,
                 min_snr_db: float = 1.5):
        self.sample_rate_hz = sample_rate_hz
        self.min_hr_hz = min_hr_bpm / 60.0
        self.max_hr_hz = max_hr_bpm / 60.0
        self.min_coherence = min_coherence
        self.min_snr_db = min_snr_db

    def _bandpass_filter_fft(self, signal: np.ndarray) -> np.ndarray:
        """
        Applies a sharp bandpass filter in the frequency domain using FFT.
        Isolates the typical human cardiac frequency band (0.75 Hz to 3.0 Hz).
        """
        n = len(signal)
        fft_vals = np.fft.rfft(signal)
        freqs = np.fft.rfftfreq(n, d=1.0/self.sample_rate_hz)
        
        # Create bandpass mask
        mask = (freqs >= self.min_hr_hz) & (freqs <= self.max_hr_hz)
        
        filtered_fft = fft_vals.copy()
        filtered_fft[~mask] = 0.0
        
        return np.fft.irfft(filtered_fft, n)

    def _calculate_snr(self, signal: np.ndarray) -> float:
        """
        Calculates the Signal-to-Noise Ratio (SNR) in decibels (dB) for the cardiac band.
        Measures the strength of the dominant frequency peak relative to surrounding noise.
        """
        n = len(signal)
        fft_vals = np.fft.rfft(signal)
        psd = np.abs(fft_vals) ** 2
        freqs = np.fft.rfftfreq(n, d=1.0/self.sample_rate_hz)
        
        # Focus on the cardiac band
        cardiac_mask = (freqs >= self.min_hr_hz) & (freqs <= self.max_hr_hz)
        if not np.any(cardiac_mask):
            return -20.0
            
        cardiac_psd = psd[cardiac_mask]
        cardiac_freqs = freqs[cardiac_mask]
        
        max_idx = np.argmax(cardiac_psd)
        peak_freq = cardiac_freqs[max_idx]
        
        # Define the signal band around the peak (peak_freq +/- 0.1 Hz)
        half_width = 0.10
        signal_mask = (freqs >= (peak_freq - half_width)) & (freqs <= (peak_freq + half_width)) & cardiac_mask
        
        signal_power = np.sum(psd[signal_mask])
        noise_power = np.sum(psd[cardiac_mask & ~signal_mask]) + 1e-8
        
        snr = 10.0 * np.log10(signal_power / noise_power)
        return snr

    def verify(self, regions_data: dict, timestamps: np.ndarray) -> dict:
        """
        Verifies spatial-temporal phase coherence of blood volume pulses across facial regions.
        
        Parameters:
            regions_data (dict): Dictionary mapping region names (e.g., 'forehead') to 1D arrays of green-channel values.
            timestamps (np.ndarray): Timestamps corresponding to the frames.
            
        Returns:
            dict: Verification results containing coherence score, SNR, and status flags.
        """
        region_names = list(regions_data.keys())
        if len(region_names) < 2:
            return {
                "passed": False,
                "score": 0.0,
                "coherence": 0.0,
                "snr_db": -20.0,
                "reason": "At least two facial regions are required for coherence check."
            }
            
        # Ensure identical lengths
        n_samples = len(timestamps)
        filtered_signals = {}
        snr_values = []
        
        for name in region_names:
            sig = regions_data[name]
            if len(sig) != n_samples:
                # Interpolate to match the timestamp length
                sig = np.interp(timestamps, np.linspace(timestamps[0], timestamps[-1], len(sig)), sig)
                
            # Remove mean and detrend slightly by subtracting a moving average
            window = int(self.sample_rate_hz * 2.0) # 2-second window
            if len(sig) > window:
                trend = np.convolve(sig, np.ones(window)/window, mode='same')
                detrended = sig - trend
            else:
                detrended = sig - np.mean(sig)
                
            filtered = self._bandpass_filter_fft(detrended)
            filtered_signals[name] = filtered
            
            snr = self._calculate_snr(filtered)
            snr_values.append(snr)
            
        # Compute correlation matrix
        matrix_size = len(region_names)
        corr_matrix = np.zeros((matrix_size, matrix_size))
        
        for i in range(matrix_size):
            for j in range(matrix_size):
                sig_i = filtered_signals[region_names[i]]
                sig_j = filtered_signals[region_names[j]]
                
                std_i = np.std(sig_i)
                std_j = np.std(sig_j)
                
                if std_i > 1e-6 and std_j > 1e-6:
                    corr = np.corrcoef(sig_i, sig_j)[0, 1]
                    corr_matrix[i, j] = 0.0 if np.isnan(corr) else corr
                else:
                    corr_matrix[i, j] = 0.0
                    
        # Extract upper triangle of correlation matrix (excluding diagonal)
        tri_indices = np.triu_indices(matrix_size, k=1)
        pairwise_correlations = corr_matrix[tri_indices]
        
        mean_coherence = np.mean(pairwise_correlations) if len(pairwise_correlations) > 0 else 0.0
        mean_snr = np.mean(snr_values)
        
        # Check criteria
        coherence_passed = mean_coherence >= self.min_coherence
        snr_passed = mean_snr >= self.min_snr_db
        
        passed = bool(coherence_passed and snr_passed)
        
        reason = "Verification passed."
        if not passed:
            if not coherence_passed:
                reason = f"Low spatial coherence ({mean_coherence:.2f} < {self.min_coherence:.2f}). Signals across regions are phase-drifted or uncorrelated."
            elif not snr_passed:
                reason = f"Low cardiac signal strength (SNR {mean_snr:.1f} dB < {self.min_snr_db:.1f} dB). Lacks a distinct physiological pulse."
                
        # Compute score
        score = max(0.0, mean_coherence)
        if mean_snr < self.min_snr_db:
            # Penalize low SNR
            penalty = max(0.0, min(1.0, (self.min_snr_db - mean_snr) / 5.0))
            score *= (1.0 - penalty)
            
        return {
            "passed": passed,
            "score": float(score),
            "coherence": float(mean_coherence),
            "snr_db": float(mean_snr),
            "reason": reason,
            "correlation_matrix": corr_matrix.tolist()
        }
