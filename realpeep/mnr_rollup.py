import hashlib
import time
from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass
class ZKPayload:
    device_id: str
    ephemeral_key: str
    captured_keys: List[str]

@dataclass
class MNRReceipt:
    device_id: str
    target_key: str
    signature: str

@dataclass
class RollupResult:
    success: bool
    reason: str
    certificate_id: Optional[str] = None

@dataclass
class OfflineMNRCertificate:
    """Certificate issued by the offline verifier after cross-correlation analysis.

    Documents the pairwise co-location detections between devices in a mesh,
    including distances, confidence scores, and device identities.
    """
    mesh_id: str
    devices: list[str]         # pk hex strings
    pairwise_detections: list[dict]
    max_distance_m: float
    num_mutual_pairs: int
    total_pairs: int
    aggregate_confidence: float
    certificate_id: str


class MNRServer:
    def __init__(self):
        # Database of offline payloads uploaded by devices when they hit internet
        self.payloads: Dict[str, ZKPayload] = {}
        # Database of cryptographic receipts signed by devices explicitly agreeing to the MNR
        self.receipts: Dict[str, MNRReceipt] = {}
        
    def receive_payload(self, payload: ZKPayload):
        self.payloads[payload.ephemeral_key] = payload
        
    def receive_receipt(self, receipt: MNRReceipt):
        # Keyed by the device that signed it + the target they are agreeing to entangle with
        key = f"{receipt.device_id}_{receipt.target_key}"
        self.receipts[key] = receipt
        
    def attempt_retroactive_rollup(self, key_a: str, key_b: str) -> RollupResult:
        """
        Attempts to formally bind two side-chain payloads into an MNR Certificate.
        Requires both physical entanglement (acoustic mesh) AND digital consent (receipts).
        """
        if key_a not in self.payloads or key_b not in self.payloads:
            return RollupResult(success=False, reason="Missing payloads on server.")
            
        payload_a = self.payloads[key_a]
        payload_b = self.payloads[key_b]
        
        # 1. Verify Physical Acoustic Entanglement (Offline Mesh Witness)
        if key_b not in payload_a.captured_keys or key_a not in payload_b.captured_keys:
            return RollupResult(
                success=False, 
                reason="No mutual entanglement found in the offline side-chain payloads."
            )
            
        # 2. Verify Digital Consent (Retroactive MNR Receipts)
        # Did A sign a receipt for B?
        receipt_a_key = f"{payload_a.device_id}_{key_b}"
        # Did B sign a receipt for A?
        receipt_b_key = f"{payload_b.device_id}_{key_a}"
        
        if receipt_a_key not in self.receipts or receipt_b_key not in self.receipts:
            return RollupResult(
                success=False,
                reason="Missing MNR cryptographic receipts from one or both parties."
            )
            
        # 3. Issue Certificate
        # Both physical physics and digital cryptography are satisfied.
        cert_data = f"{key_a}:{key_b}:{time.time()}".encode()
        cert_id = hashlib.sha256(cert_data).hexdigest()
        
        return RollupResult(
            success=True,
            reason="Mutual Non-Repudiation Established. Certificate issued.",
            certificate_id=cert_id
        )
