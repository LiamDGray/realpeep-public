"""
RealPeep Protocol: A multi-layered liveness verification library.
"""

from .accr import ACCRVerifier
from .ble_mesh import (
    BleBeacon,
    BleDevice,
    BleGroupCertificate,
    BleJammer,
    BleMeshVerifier,
    BleObserver,
    BleSimulator,
    JammingAwareBleSimulator,
)
from .blockchain_anchor import BlockchainAnchor
from .cdma_mesh import (
    OfflineVerifier,
    RawAudioCapture,
    TransmitOnlyDevice,
    derive_prn_seed,
    simulate_capture,
)
from .duress_keys import DuressKeyDerivation
from .hybrid_mesh import (
    ACOUSTIC_SEARCH_WINDOW,
    THRESHOLD_ACOUSTIC_PEAK,
    THRESHOLD_BLE_OBSERVED,
    AcousticSnippet,
    HybridMeshSimulator,
    HybridVerifier,
)
from .mnr_rollup import OfflineMNRCertificate
from .plr import PLRVerifier
from .rppg import RPPGVerifier
from .verifier import RealPeepVerifier

__all__ = [
    "ACCRVerifier", "RPPGVerifier", "PLRVerifier", "RealPeepVerifier",
    "DuressKeyDerivation", "BlockchainAnchor",
    "derive_prn_seed", "TransmitOnlyDevice", "RawAudioCapture",
    "OfflineVerifier", "simulate_capture",
    "OfflineMNRCertificate",
    "BleBeacon", "BleDevice", "BleObserver", "BleSimulator",
    "BleMeshVerifier", "BleGroupCertificate",
    "BleJammer", "JammingAwareBleSimulator",
    "AcousticSnippet", "HybridMeshSimulator", "HybridVerifier",
    "THRESHOLD_BLE_OBSERVED", "THRESHOLD_ACOUSTIC_PEAK",
    "ACOUSTIC_SEARCH_WINDOW",
]
