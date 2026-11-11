import hashlib
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes
from .depth import DepthGeometryVerifier

class ZTMPVerifier:
    def __init__(self):
        # Simulation of the hardware PKI registry (Trusted Sensor Directory)
        self.trusted_sensors = {}
        self.depth_verifier = DepthGeometryVerifier()

    def register_sensor(self, sensor_id: str, public_key) -> None:
        """
        Registers a certified camera sensor's public key in the trusted directory.
        """
        self.trusted_sensors[sensor_id] = public_key

    def verify_session_frame(self, payload: dict, expected_nonce: bytes) -> dict:
        """
        Performs the complete cryptographic and spatial audit of an incoming frame.
        """
        sensor_id = payload.get("sensor_id")
        
        # 1. Hardware Trust Check (Registry Lookup)
        if sensor_id not in self.trusted_sensors:
            return {
                "passed": False,
                "overall_status": "REJECTED",
                "checks": {
                    "hardware_trust": False,
                    "cryptographic_integrity": False,
                    "session_freshness": False,
                    "spatial_attestation": False
                },
                "reason": f"Untrusted sensor ID ({sensor_id}). Media did not originate from a certified physical sensor."
            }
            
        public_key = self.trusted_sensors[sensor_id]
        rgb = payload["rgb"]
        depth = payload["depth"]
        timestamp = payload["metadata"]["timestamp"]
        signed_nonce = payload["metadata"]["nonce"]
        signature = payload["signature"]
        
        # 2. Cryptographic Integrity Check (Signature Verification)
        # Reconstruct the digest of the raw capture data
        hasher = hashlib.sha256()
        hasher.update(rgb.tobytes())
        hasher.update(depth.tobytes())
        hasher.update(f"{timestamp:.6f}".encode())
        hasher.update(signed_nonce)
        digest = hasher.digest()
        
        try:
            public_key.verify(
                signature,
                digest,
                ec.ECDSA(hashes.SHA256())
            )
            crypto_passed = True
        except Exception:
            crypto_passed = False
            
        if not crypto_passed:
            return {
                "passed": False,
                "overall_status": "REJECTED",
                "checks": {
                    "hardware_trust": True,
                    "cryptographic_integrity": False,
                    "session_freshness": False,
                    "spatial_attestation": False
                },
                "reason": "Cryptographic signature verification failed. The media has been tampered with or modified in transit."
            }
            
        # 3. Session Freshness Check (Anti-Replay)
        nonce_passed = signed_nonce == expected_nonce
        if not nonce_passed:
            return {
                "passed": False,
                "overall_status": "REJECTED",
                "checks": {
                    "hardware_trust": True,
                    "cryptographic_integrity": True,
                    "session_freshness": False,
                    "spatial_attestation": False
                },
                "reason": f"Nonce mismatch. Expected {expected_nonce.hex()[:10]}..., got {signed_nonce.hex()[:10]}... Indicates a session replay attack."
            }
            
        # 4. 3D Spatial Attestation (Anti-Re-Projection)
        depth_report = self.depth_verifier.verify_3d_structure(depth)
        spatial_passed = depth_report["passed"]
        
        passed = crypto_passed and nonce_passed and spatial_passed
        
        return {
            "passed": bool(passed),
            "overall_status": "APPROVED" if passed else "REJECTED",
            "checks": {
                "hardware_trust": True,
                "cryptographic_integrity": crypto_passed,
                "session_freshness": nonce_passed,
                "spatial_attestation": spatial_passed
            },
            "depth_details": depth_report,
            "reason": depth_report["reason"] if not spatial_passed else "Cryptographic and spatial provenance verified successfully."
        }
