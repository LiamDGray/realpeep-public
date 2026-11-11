import numpy as np

class AcousticDigitalInjector:
    def __init__(self, 
                 sample_rate_hz: float = 48000.0,
                 computation_delay_ms: float = 5.0,  # AI inference + DSP detection time
                 buffer_size_samples: int = 64):       # Low-latency audio buffer size
        self.sample_rate_hz = sample_rate_hz
        self.computation_delay_ms = computation_delay_ms
        self.buffer_size_samples = buffer_size_samples
        self.c = 343.0
        self.rng = np.random.default_rng(101)

    def calculate_attacker_latency_ms(self) -> float:
        """
        Calculates the total hardware buffer and software processing latency.
        An injector must read the output stream (1 buffer delay), process it (inference delay),
        and write to the input stream (1 buffer delay).
        """
        # Buffer delay for a single direction (in ms)
        buffer_delay_ms = (self.buffer_size_samples / self.sample_rate_hz) * 1000.0
        # Total round-trip digital injection delay
        return (2.0 * buffer_delay_ms) + self.computation_delay_ms

    def generate_spoofed_echo(self, 
                             sent_signal: np.ndarray, 
                             target_face_distance_m: float, 
                             noise_level: float = 0.05) -> np.ndarray:
        """
        Simulates the digital injection of a spoofed face echo.
        Although the attacker attempts to simulate a face at target_face_distance_m,
        their stream injection pipeline inevitably adds buffer and computational latency.
        """
        # Calculate the intended physical delay
        round_trip_m = 2.0 * target_face_distance_m
        physical_delay_sec = round_trip_m / self.c
        physical_delay_ms = physical_delay_sec * 1000.0
        
        # Calculate the unavoidable digital injection delay
        attacker_delay_ms = self.calculate_attacker_latency_ms()
        
        # Actual arrival time of the spoofed echo
        total_delay_ms = physical_delay_ms + attacker_delay_ms
        total_delay_samples = int((total_delay_ms / 1000.0) * self.sample_rate_hz)
        
        # Build the received buffer
        n_samples = len(sent_signal) + int(0.040 * self.sample_rate_hz)
        received = self.rng.normal(0, noise_level, size=n_samples)
        
        # Attenuation based on simulated physical distance
        attenuation = 0.15 / (round_trip_m**2 + 1e-8)
        
        # Inject the delayed, attenuated signal representing the spoofed face
        if total_delay_samples + len(sent_signal) < n_samples:
            received[total_delay_samples:total_delay_samples + len(sent_signal)] += sent_signal * attenuation
            
        return received
