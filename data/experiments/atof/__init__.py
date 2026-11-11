"""
Acoustic Time-of-Flight (AToF) Temporal Bracketing Emulator.
"""

from .enclave import SecureEnclaveAudioController
from .channel import PhysicalAcousticChannel
from .attacker import AcousticDigitalInjector
from .verifier import AToFVerifier

__all__ = ["SecureEnclaveAudioController", "PhysicalAcousticChannel", "AcousticDigitalInjector", "AToFVerifier"]
