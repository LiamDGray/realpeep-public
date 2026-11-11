"""
Phase 3a: Duress Key Derivation.

Both normal and duress passphrases derive indistinguishable Ed25519 keypairs,
but the duress key produces a nonce that triggers silent detection by the notary.

Architecture:
  - Key derivation: PBKDF2-HMAC-SHA256 with 100k iterations → 32-byte seed
    → Ed25519 keypair (via PyNaCl SigningKey).
  - Normal nonce: os.urandom(32) — indistinguishable from random.
  - Duress nonce: counter-based search for a nonce such that
    SHA256(notary_secret || ephemeral_pubkey || nonce) has the first k bits
    set to 0 (the duress marker).
  - Notary detection: constant-time check of the same predicate.
"""

import hashlib
import os

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from nacl.signing import SigningKey


def derive_keypair(
    passphrase: str, salt: bytes, iterations: int = 100_000
) -> "tuple[bytes, bytes]":
    """
    Derive an Ed25519 keypair from a passphrase via PBKDF2.

    Returns (private_key_bytes, public_key_bytes) — 32 bytes each.
    """
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=iterations,
    )
    seed = kdf.derive(passphrase.encode())
    signing_key = SigningKey(seed)
    verify_key = signing_key.verify_key
    return bytes(signing_key), bytes(verify_key)


def generate_nonce(
    is_duress: bool,
    notary_secret: bytes,
    ephemeral_pubkey: bytes,
    marker_bits: int = 8,
) -> bytes:
    """
    Return a 32-byte nonce.

    If *is_duress*, the nonce satisfies the duress predicate:
        SHA256(notary_secret || ephemeral_pubkey || nonce)
        has the first *marker_bits* bits set to 0.

    If *not is_duress*, returns os.urandom(32).
    """
    if not is_duress:
        return os.urandom(32)

    counter = 0
    threshold = 1 << (8 - marker_bits)  # e.g. marker_bits=8 → threshold=1
    while True:
        candidate = hashlib.sha256(counter.to_bytes(8, "big")).digest()[:32]
        h = hashlib.sha256(
            notary_secret + ephemeral_pubkey + candidate
        ).digest()
        if h[0] < threshold:
            return candidate
        counter += 1


def check_duress(
    notary_secret: bytes,
    ephemeral_pubkey: bytes,
    nonce: bytes,
    marker_bits: int = 8,
) -> bool:
    """
    Return True if the duress marker is detected in *nonce*.

    The check is a single SHA256 — O(1) regardless of outcome (constant-time
    at the algorithmic level; no branching on the secret predicate).
    """
    h = hashlib.sha256(notary_secret + ephemeral_pubkey + nonce).digest()
    return h[0] < (1 << (8 - marker_bits))


class DuressKeyDerivation:
    """
    Main entry point for duress key derivation.

    Parameters
    ----------
    salt : bytes
        Salt for PBKDF2 (should be unique per application instance).
    notary_secret : bytes
        Secret known only to the notary, used for the duress marker predicate.
    marker_bits : int
        Number of leading zero bits required in the duress marker hash.
        Defaults to 8 (~256 expected trials to find a duress nonce).
    iterations : int
        PBKDF2 iteration count (default 100_000).
    """

    def __init__(
        self,
        salt: bytes,
        notary_secret: bytes,
        marker_bits: int = 8,
        iterations: int = 100_000,
    ):
        self.salt = salt
        self.notary_secret = notary_secret
        self.marker_bits = marker_bits
        self.iterations = iterations

    def derive_normal(self, passphrase: str) -> "tuple[bytes, bytes, bytes]":
        """
        Derive a normal keypair + random nonce (no duress flag).

        Returns (private_key, public_key, nonce) — 32 bytes each.
        """
        priv, pub = derive_keypair(passphrase, self.salt, self.iterations)
        nonce = generate_nonce(
            is_duress=False,
            notary_secret=self.notary_secret,
            ephemeral_pubkey=pub,
            marker_bits=self.marker_bits,
        )
        return priv, pub, nonce

    def derive_duress(self, passphrase: str) -> "tuple[bytes, bytes, bytes]":
        """
        Derive a keypair + duress nonce that carries the notary flag.

        Returns (private_key, public_key, nonce) — 32 bytes each.
        """
        priv, pub = derive_keypair(passphrase, self.salt, self.iterations)
        nonce = generate_nonce(
            is_duress=True,
            notary_secret=self.notary_secret,
            ephemeral_pubkey=pub,
            marker_bits=self.marker_bits,
        )
        return priv, pub, nonce

    def detect(self, ephemeral_pubkey: bytes, nonce: bytes) -> bool:
        """
        Check whether *nonce* carries the duress marker.

        Returns True if the duress flag is present.
        """
        return check_duress(
            self.notary_secret,
            ephemeral_pubkey,
            nonce,
            self.marker_bits,
        )
