import numpy as np

class PhysicalAcousticChannel:
    def __init__(self, sample_rate_hz: float = 48000.0, speed_of_sound_mps: float = 343.0):
        self.sample_rate_hz = sample_rate_hz
        self.c = speed_of_sound_mps
        self.rng = np.random.default_rng(42)

    def propagate(self, 
                  sent_signal: np.ndarray, 
                  face_distance_m: float, 
                  room_size_m: float = 2.0, 
                  noise_level: float = 0.05) -> np.ndarray:
        """
        Simulates the physical propagation of sound through the air.
        Models:
            1. Speed-of-sound delay to the face and back.
            2. Geometric attenuation (inverse square law) and skin absorption.
            3. Secondary wall reflections (room reverberation).
            4. Ambient microphone thermal noise.
        """
        # Define received signal buffer (e.g., 2000 samples, ~41.6ms duration)
        n_samples = len(sent_signal) + int(0.040 * self.sample_rate_hz)
        received = self.rng.normal(0, noise_level, size=n_samples)
        
        # 1. Primary Reflection: The Face
        round_trip_face_m = 2.0 * face_distance_m
        delay_sec_face = round_trip_face_m / self.c
        delay_samples_face = int(delay_sec_face * self.sample_rate_hz)
        
        # Skin reflection coefficient is roughly 0.15 (most sound is absorbed or scattered)
        # Geometric attenuation: 1 / distance^2
        attenuation_face = 0.15 / (round_trip_face_m**2 + 1e-8)
        
        # Inject the face reflection
        if delay_samples_face + len(sent_signal) < n_samples:
            received[delay_samples_face:delay_samples_face + len(sent_signal)] += sent_signal * attenuation_face
            
        # 2. Secondary Reflection: Room Wall (Reverberation)
        # Assume a wall is at distance room_size_m (e.g., 1.5m behind the user)
        round_trip_wall_m = 2.0 * room_size_m
        delay_sec_wall = round_trip_wall_m / self.c
        delay_samples_wall = int(delay_sec_wall * self.sample_rate_hz)
        
        # Wall reflection coefficient is higher (e.g., 0.6 for concrete/drywall)
        attenuation_wall = 0.40 / (round_trip_wall_m**2 + 1e-8)
        
        # Inject the wall reflection
        if delay_samples_wall + len(sent_signal) < n_samples:
            received[delay_samples_wall:delay_samples_wall + len(sent_signal)] += sent_signal * attenuation_wall
            
        return received
