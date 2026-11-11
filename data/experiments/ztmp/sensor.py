import time
import hashlib
import numpy as np
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes, serialization

class SecureSensorEmulator:
    def __init__(self):
        # Generate a hardware-bound ECDSA key pair using the SECP256R1 curve
        self._private_key = ec.generate_private_key(ec.SECP256R1())
        self.public_key = self._private_key.public_key()
        
        # Derive a unique sensor ID from the public key bytes
        pub_bytes = self.public_key.public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
        self.sensor_id = hashlib.sha256(pub_bytes).hexdigest()[:16]

    def capture_frame(self, rgb_data: np.ndarray, depth_data: np.ndarray, session_nonce: bytes) -> dict:
        """
        Simulates the hardware-level capture and cryptographic signing of a frame.
        The signing boundary is within the physical sensor, preventing software tampering.
        """
        # Secure hardware clock timestamp
        timestamp = time.time()
        
        # Build the physical-data hash
        hasher = hashlib.sha256()
        hasher.update(rgb_data.tobytes())
        hasher.update(depth_data.tobytes())
        hasher.update(f"{timestamp:.6f}".encode())
        hasher.update(session_nonce)
        digest = hasher.digest()
        
        # Generate the ECDSA signature using the hardware private key
        signature = self._private_key.sign(
            digest,
            ec.ECDSA(hashes.SHA256())
        )
        
        return {
            "rgb": rgb_data,
            "depth": depth_data,
            "metadata": {
                "timestamp": timestamp,
                "nonce": session_nonce
            },
            "signature": signature,
            "sensor_id": self.sensor_id
        }
