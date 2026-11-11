import numpy as np


class CMEVerifier:
    def __init__(self, max_allowed_delay_ms: float = 1.0):
        """
        Cross-Modal Entanglement Verifier.
        Verifies that a physical visual event (e.g., cheek tap deformation) 
        and its corresponding acoustic event (bone conduction thud) occur 
        within a strict sub-millisecond physical time bracket.
        """
        self.max_allowed_delay_ms = max_allowed_delay_ms

    def verify(self, 
               video_timestamps_ms: np.ndarray, 
               video_deformation_signal: np.ndarray,
               audio_timestamps_ms: np.ndarray,
               audio_thud_signal: np.ndarray) -> dict:
        """
        Finds the peak in both the video deformation signal and the audio thud signal
        and checks if their temporal separation is within the physical limit.
        """
        # Find peak indices
        video_peak_idx = np.argmax(video_deformation_signal)
        audio_peak_idx = np.argmax(audio_thud_signal)

        # Get timestamps of peaks
        t_video_peak = video_timestamps_ms[video_peak_idx]
        t_audio_peak = audio_timestamps_ms[audio_peak_idx]

        # Calculate absolute latency difference
        delta_ms = abs(t_video_peak - t_audio_peak)

        passed = bool(delta_ms <= self.max_allowed_delay_ms)
        
        # Scoring: 1.0 if perfectly synced (delta=0), drops to 0.0 at max_allowed_delay
        score = max(0.0, 1.0 - (delta_ms / self.max_allowed_delay_ms)) if passed else 0.0
        
        reason = "Pass" if passed else f"Cross-modal decoupling detected: audio/video delta is {delta_ms:.2f}ms (threshold: {self.max_allowed_delay_ms}ms)."
        
        return {
            "passed": passed,
            "score": score,
            "video_peak_ms": float(t_video_peak),
            "audio_peak_ms": float(t_audio_peak),
            "delta_ms": float(delta_ms),
            "reason": reason
        }
