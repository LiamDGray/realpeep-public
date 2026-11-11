import numpy as np

class SecureEnclaveAudioController:
    def __init__(self, sample_rate_hz: float = 48000.0, chirp_duration_sec: float = 0.010):
        self.sample_rate_hz = sample_rate_hz
        self.chirp_duration_sec = chirp_duration_sec
        # Near-ultrasonic band (18 kHz to 22 kHz) - inaudible to humans but detectable by hardware
        self.f_start = 18000.0
        self.f_end = 22000.0

    def generate_chirp(self) -> np.ndarray:
        """
        Generates a linear frequency-modulated (LFM) chirp sweep.
        """
        n_samples = int(self.chirp_duration_sec * self.sample_rate_hz)
        t = np.arange(n_samples) / self.sample_rate_hz
        
        # Linear sweep rate beta
        beta = (self.f_end - self.f_start) / self.chirp_duration_sec
        
        # Phase equation: phi(t) = 2 * pi * (f_start * t + 0.5 * beta * t^2)
        phase = 2 * np.pi * (self.f_start * t + 0.5 * beta * t**2)
        chirp = np.sin(phase)
        
        # Apply a Tukey window to smooth the start and end of the chirp, preventing transient clicks
        window = np.ones_like(chirp)
        fade_samples = int(0.1 * n_samples)
        fade_in = np.sin(np.linspace(0, np.pi/2, fade_samples))**2
        fade_out = np.sin(np.linspace(np.pi/2, 0, fade_samples))**2
        window[:fade_samples] = fade_in
        window[-fade_samples:] = fade_out
        
        return chirp * window

    def measure_delay_ms(self, sent_chirp: np.ndarray, received_signal: np.ndarray) -> float:
        """
        Calculates the exact delay of the primary reflection peak using matched filtering (cross-correlation).
        """
        # Cross-correlate the received signal with the reference chirp
        # This acts as a matched filter, maximizing the Signal-to-Noise Ratio (SNR) of the echo
        correlation = np.correlate(received_signal, sent_chirp, mode='full')
        
        # The correlation peak index corresponds to the arrival of the chirp
        # Find the peak in the positive correlation region
        peak_idx = np.argmax(np.abs(correlation))
        
        # Adjust for the convolution offset (convolution peak is shifted by len(sent_chirp) - 1)
        delay_samples = peak_idx - len(sent_chirp) + 1
        
        # Convert samples to milliseconds
        delay_ms = (delay_samples / self.sample_rate_hz) * 1000.0
        return float(delay_ms)
