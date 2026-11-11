from .accr import ACCRVerifier
from .cme import CMEVerifier
from .hcsj import HCSJVerifier
from .plr import PLRVerifier
from .rppg import RPPGVerifier
from .spci import SPCIVerifier


class RealPeepVerifier:
    def __init__(self, 
                 sample_rate_hz: float = 30.0,
                 # Asymmetric Defenses (Primary)
                 cme_weight: float = 0.30,
                 spci_weight: float = 0.30,
                 hcsj_weight: float = 0.30,
                 # Symmetric Biometric Defenses (Fallback/Deprecating)
                 accr_weight: float = 0.033,
                 rppg_weight: float = 0.033,
                 plr_weight: float = 0.034):
        
        # Initialize old symmetric verifiers
        self.accr_verifier = ACCRVerifier(sample_rate_hz=sample_rate_hz)
        self.rppg_verifier = RPPGVerifier(sample_rate_hz=sample_rate_hz)
        self.plr_verifier = PLRVerifier(sample_rate_hz=sample_rate_hz)
        
        # Initialize new asymmetric verifiers
        self.cme_verifier = CMEVerifier()
        self.spci_verifier = SPCIVerifier()
        self.hcsj_verifier = HCSJVerifier()
        
        self.cme_weight = cme_weight
        self.spci_weight = spci_weight
        self.hcsj_weight = hcsj_weight
        
        self.accr_weight = accr_weight
        self.rppg_weight = rppg_weight
        self.plr_weight = plr_weight

    def verify_session(self, session_data: dict) -> dict:
        """
        Runs the full RealPeep multi-modal verification suite on session data.
        """
        # --- Primary Asymmetric Defenses ---
        
        cme_result = self.cme_verifier.verify(
            video_timestamps_ms=session_data.get('cme_video_timestamps', []),
            video_deformation_signal=session_data.get('cme_video_signal', []),
            audio_timestamps_ms=session_data.get('cme_audio_timestamps', []),
            audio_thud_signal=session_data.get('cme_audio_signal', [])
        )
        
        spci_result = self.spci_verifier.verify(
            challenge_sequence=session_data.get('spci_challenge', []),
            reflection_sequence=session_data.get('spci_reflection', [])
        )
        
        hcsj_result = self.hcsj_verifier.verify(
            sensor_luminance_samples=session_data.get('hcsj_luminance', [])
        )

        # --- Secondary Symmetric Defenses ---
        
        accr_result = self.accr_verifier.verify(
            challenge_timestamps=session_data['challenge_timestamps'],
            challenge_signal=session_data['challenge_color'],
            response_timestamps=session_data['timestamps'],
            response_signal=session_data['response_color']
        )
        
        rppg_result = self.rppg_verifier.verify(
            regions_data=session_data['rppg_regions'],
            timestamps=session_data['timestamps']
        )
        
        plr_result = self.plr_verifier.verify(
            brightness_timestamps=session_data['brightness_timestamps'],
            brightness_signal=session_data['brightness'],
            pupil_timestamps=session_data['timestamps'],
            pupil_diameter_signal=session_data['pupil_diameter']
        )
        
        # Strict policy: ALL primary asymmetric defenses must pass.
        # We allow fallback on symmetric defenses as long as asymmetric are solid.
        passed_primary = bool(cme_result['passed'] and spci_result['passed'] and hcsj_result['passed'])
        
        # Optional: We could enforce all pass, but for now, primary is mandatory
        passed = passed_primary and bool(accr_result['passed'] and rppg_result['passed'] and plr_result['passed'])
        
        # Compute weighted liveness score
        weighted_score = (
            self.cme_weight * cme_result['score'] +
            self.spci_weight * spci_result['score'] +
            self.hcsj_weight * hcsj_result['score'] +
            self.accr_weight * accr_result['score'] +
            self.rppg_weight * rppg_result['score'] +
            self.plr_weight * plr_result['score']
        )
        
        # Collect failure reasons
        reasons = []
        if not cme_result['passed']:
            reasons.append(f"CME: {cme_result['reason']}")
        if not spci_result['passed']:
            reasons.append(f"SPCI: {spci_result['reason']}")
        if not hcsj_result['passed']:
            reasons.append(f"HCSJ: {hcsj_result['reason']}")
        if not accr_result['passed']:
            reasons.append(f"ACCR: {accr_result['reason']}")
        if not rppg_result['passed']:
            reasons.append(f"rPPG: {rppg_result['reason']}")
        if not plr_result['passed']:
            reasons.append(f"PLR: {plr_result['reason']}")
            
        summary_reason = "All security layers verified successfully." if passed else "; ".join(reasons)
        
        return {
            "passed": passed,
            "overall_liveness_score": float(weighted_score),
            "summary_reason": summary_reason,
            "details": {
                "asymmetric": {
                    "cross_modal_cme": cme_result,
                    "cryptographic_illumination_spci": spci_result,
                    "shutter_jitter_hcsj": hcsj_result
                },
                "symmetric": {
                    "optical_challenge_accr": accr_result,
                    "physiological_rppg": rppg_result,
                    "autonomic_pupil_plr": plr_result
                }
            }
        }
