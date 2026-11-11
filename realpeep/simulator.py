import numpy as np


class LivenessDataSimulator:
    def __init__(self, seed: int = 42):
        self.rng = np.random.default_rng(seed)

    def _generate_smooth_pupil_constriction(self, 
                                            timestamps: np.ndarray, 
                                            trigger_time: float, 
                                            latency: float, 
                                            amplitude_pct: float, 
                                            duration: float, 
                                            baseline: float = 5.0) -> np.ndarray:
        pupil = np.ones_like(timestamps) * baseline
        constriction_start = trigger_time + latency
        constriction_end = constriction_start + duration
        
        target_diameter = baseline * (1.0 - amplitude_pct)
        
        for idx, t in enumerate(timestamps):
            if t < constriction_start:
                pupil[idx] = baseline + 0.02 * np.sin(2 * np.pi * 0.1 * t)
            elif t > constriction_end:
                pupil[idx] = target_diameter + 0.02 * np.sin(2 * np.pi * 0.1 * t)
            else:
                progress = (t - constriction_start) / duration
                smooth_factor = 3 * progress**2 - 2 * progress**3
                pupil[idx] = baseline - (baseline - target_diameter) * smooth_factor
                
        return pupil

    def generate_session(self, scenario: str, duration_sec: float = 3.0, sample_rate_hz: float = 30.0) -> dict:
        """
        Generates simulated session signals representing various human and spoofing behaviors.
        """
        # --- Time arrays ---
        n_samples = int(duration_sec * sample_rate_hz)
        timestamps = np.linspace(0, duration_sec, n_samples)
        
        # --- Base Symmetric Data Setup ---
        trigger_time = 1.0
        brightness_timestamps = np.linspace(0, duration_sec, 60)
        brightness = np.zeros_like(brightness_timestamps)
        brightness[brightness_timestamps < trigger_time] = 0.1
        brightness[brightness_timestamps >= trigger_time] = 1.0
        
        challenge_interval = 0.3

        challenge_timestamps = np.arange(0, duration_sec + challenge_interval, challenge_interval)
        challenge_colors = self.rng.uniform(0.2, 1.0, size=(len(challenge_timestamps), 3))
        challenge_colors = challenge_colors / np.linalg.norm(challenge_colors, axis=1, keepdims=True)
        
        response_color = np.zeros((n_samples, 3))
        rppg_regions = {}
        pupil_diameter = np.ones(n_samples) * 5.0
        heart_rate_bpm = 72.0
        hr_hz = heart_rate_bpm / 60.0

        # --- Base Asymmetric Data Setup ---
        # CME
        cme_video_ts = np.linspace(0, duration_sec * 1000, n_samples) # ms
        cme_audio_ts = np.linspace(0, duration_sec * 1000, n_samples) # ms
        cme_video_sig = np.zeros(n_samples)
        cme_audio_sig = np.zeros(n_samples)
        
        # SPCI (120Hz)
        spci_hz = 120.0
        spci_samples = int(duration_sec * spci_hz)
        spci_challenge = self.rng.integers(0, 2, size=spci_samples)
        spci_reflection = np.zeros_like(spci_challenge, dtype=float)

        # HCSJ
        hcsj_samples = 1000
        hcsj_luminance = np.ones(hcsj_samples) * 0.5
        
        # --- Scenario Generation ---
        if scenario == 'real_human':
            # Asymmetric: CME (Perfect sync)
            cme_video_sig[n_samples // 2] = 1.0
            cme_audio_sig[n_samples // 2] = 1.0
            
            # Asymmetric: SPCI (0 lag, minor noise)
            spci_reflection = spci_challenge.copy().astype(float)
            spci_reflection += self.rng.normal(0, 0.1, size=spci_samples)
            
            # Asymmetric: HCSJ (Continuous light, low variance)
            hcsj_luminance += self.rng.normal(0, 0.01, size=hcsj_samples)
            
            # Symmetric: ACCR (low latency), rPPG (coherent), PLR (normal)
            latency_sec = 0.025
            for idx, t in enumerate(timestamps):
                t_lookup = max(0.0, t - latency_sec)
                color = np.zeros(3)
                for c in range(3):
                    color[c] = np.interp(t_lookup, challenge_timestamps, challenge_colors[:, c])
                response_color[idx] = 0.4 * color + self.rng.normal(0, 0.02, size=3)
                
            region_names = ["forehead", "left_cheek", "right_cheek", "nose", "chin"]
            for name in region_names:
                phase_offset = self.rng.uniform(-0.05, 0.05)
                pulse = (
                    np.sin(2 * np.pi * hr_hz * timestamps + phase_offset) +
                    0.2 * np.sin(4 * np.pi * hr_hz * timestamps + phase_offset) +
                    self.rng.normal(0, 0.15, size=n_samples)
                )
                rppg_regions[name] = pulse
                
            pupil_diameter = self._generate_smooth_pupil_constriction(
                timestamps=timestamps, trigger_time=trigger_time, latency=0.220, amplitude_pct=0.30, duration=0.450
            )

        elif scenario == 'decoupled_digital_injection':
            # Asymmetric: CME (Audio leads video by 50ms due to decouple)
            cme_audio_sig[n_samples // 2] = 1.0
            video_idx = min((n_samples // 2) + int(0.050 * sample_rate_hz), n_samples - 1)
            cme_video_sig[video_idx] = 1.0
            
            # Asymmetric: SPCI (Digital latency, e.g., 20ms lag = ~2 samples at 120Hz)
            lag_samples = int(0.020 * spci_hz)
            spci_reflection[lag_samples:] = spci_challenge[:-lag_samples]
            spci_reflection += self.rng.normal(0, 0.05, size=spci_samples)
            
            # Asymmetric: HCSJ (Injected directly into driver, variance is zero/perfect)
            hcsj_luminance += self.rng.normal(0, 0.001, size=hcsj_samples)

            # Symmetric: Perfectly faked (generative biology beats symmetric checks)
            # (Matches real_human to show symmetric checks failing to detect)
            latency_sec = 0.025
            for idx, t in enumerate(timestamps):
                t_lookup = max(0.0, t - latency_sec)
                color = np.zeros(3)
                for c in range(3):
                    color[c] = np.interp(t_lookup, challenge_timestamps, challenge_colors[:, c])
                response_color[idx] = 0.4 * color + self.rng.normal(0, 0.02, size=3)
                
            region_names = ["forehead", "left_cheek", "right_cheek", "nose", "chin"]
            for name in region_names:
                phase_offset = self.rng.uniform(-0.05, 0.05)
                pulse = np.sin(2 * np.pi * hr_hz * timestamps + phase_offset) + 0.2 * np.sin(4 * np.pi * hr_hz * timestamps + phase_offset) + self.rng.normal(0, 0.15, size=n_samples)
                rppg_regions[name] = pulse
                
            pupil_diameter = self._generate_smooth_pupil_constriction(
                timestamps=timestamps, trigger_time=trigger_time, latency=0.220, amplitude_pct=0.30, duration=0.450
            )

        elif scenario == 'analog_hole_monitor':
            # Asymmetric: CME (Sync is OK because it's a recording/re-projection)
            cme_video_sig[n_samples // 2] = 1.0
            cme_audio_sig[n_samples // 2] = 1.0
            
            # Asymmetric: SPCI (Monitor refresh lag + capture lag, e.g., 16ms = 2 samples)
            lag_samples = int(0.016 * spci_hz)
            spci_reflection[lag_samples:] = spci_challenge[:-lag_samples]
            spci_reflection += self.rng.normal(0, 0.05, size=spci_samples)
            
            # Asymmetric: HCSJ (Analog hole monitor exhibits PWM flicker variance)
            # Simulate high/low PWM flicker
            pwm_wave = np.sin(2 * np.pi * 50 * np.linspace(0, 1, hcsj_samples)) # 50Hz beating with shutter
            hcsj_luminance += 0.2 * pwm_wave + self.rng.normal(0, 0.02, size=hcsj_samples)

            # Symmetric: Same as real, since camera captures a physical monitor perfectly
            latency_sec = 0.025
            for idx, t in enumerate(timestamps):
                t_lookup = max(0.0, t - latency_sec)
                color = np.zeros(3)
                for c in range(3):
                    color[c] = np.interp(t_lookup, challenge_timestamps, challenge_colors[:, c])
                response_color[idx] = 0.4 * color + self.rng.normal(0, 0.02, size=3)
                
            region_names = ["forehead", "left_cheek", "right_cheek", "nose", "chin"]
            for name in region_names:
                pulse = np.sin(2 * np.pi * hr_hz * timestamps) + self.rng.normal(0, 0.15, size=n_samples)
                rppg_regions[name] = pulse
                
            pupil_diameter = self._generate_smooth_pupil_constriction(
                timestamps=timestamps, trigger_time=trigger_time, latency=0.220, amplitude_pct=0.30, duration=0.450
            )

        return {
            "timestamps": timestamps,
            "challenge_timestamps": challenge_timestamps,
            "challenge_color": challenge_colors,
            "response_color": response_color,
            "rppg_regions": rppg_regions,
            "brightness_timestamps": brightness_timestamps,
            "brightness": brightness,
            "pupil_diameter": pupil_diameter,
            
            # New Asymmetric Fields
            "cme_video_timestamps": cme_video_ts,
            "cme_video_signal": cme_video_sig,
            "cme_audio_timestamps": cme_audio_ts,
            "cme_audio_signal": cme_audio_sig,
            "spci_challenge": spci_challenge,
            "spci_reflection": spci_reflection,
            "hcsj_luminance": hcsj_luminance
        }
