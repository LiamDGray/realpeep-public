"""Mock OpenTimestamps calendar.

The real OTS calendar API accepts a 32-byte digest with
`POST {calendar}/digest` and returns a serialized timestamp; clients can poll
`GET {calendar}/timestamp/<hex-commitment>`. This module implements that HTTP
shape with a JSON mock token signed by a mock calendar Ed25519 key. It is
deliberately not .ots-compatible and performs no Bitcoin anchoring.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import struct
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from nacl.signing import SigningKey, VerifyKey

LABEL = b"RP-OTS-MOCK-v1"
DEFAULT_SEED = bytes(range(32))
DEFAULT_PUBLIC_KEY = bytes(SigningKey(DEFAULT_SEED).verify_key)


def commitment_for(digest: bytes) -> bytes:
    if len(digest) != 32:
        raise ValueError("digest must be 32 bytes")
    return hashlib.sha256(LABEL + digest).digest()


def canonical_payload(
    digest: bytes, commitment: bytes, height: int, txid: bytes, timestamp: int
) -> bytes:
    return (
        LABEL
        + digest
        + commitment
        + struct.pack(">I", height)
        + txid
        + struct.pack(">Q", timestamp)
    )


def make_token(
    digest: bytes,
    signing_key: SigningKey,
    *,
    height: int = 800_000,
    timestamp: int | None = None,
) -> dict[str, Any]:
    commitment = commitment_for(digest)
    txid = hashlib.sha256(b"RP-OTS-TX-v1" + commitment + struct.pack(">I", height)).digest()
    timestamp = int(time.time()) if timestamp is None else timestamp
    payload = canonical_payload(digest, commitment, height, txid, timestamp)
    signature = signing_key.sign(payload).signature
    return {
        "version": 1,
        "calendar": "mock-ots",
        "digest": digest.hex(),
        "commitment": commitment.hex(),
        "height": height,
        "txid": txid.hex(),
        "timestamp": timestamp,
        "signature": base64.b64encode(signature).decode("ascii"),
    }


def verify_token(token: dict[str, Any], public_key: bytes = DEFAULT_PUBLIC_KEY) -> bool:
    try:
        digest = bytes.fromhex(token["digest"])
        commitment = bytes.fromhex(token["commitment"])
        txid = bytes.fromhex(token["txid"])
        height = int(token["height"])
        timestamp = int(token["timestamp"])
        signature = base64.b64decode(token["signature"])
        if commitment != commitment_for(digest):
            return False
        payload = canonical_payload(digest, commitment, height, txid, timestamp)
        VerifyKey(public_key).verify(payload, signature)
        return True
    except Exception:
        return False


class Calendar:
    def __init__(self, signing_key: SigningKey, *, height: int = 800_000):
        self.signing_key = signing_key
        self.height = height
        self.tokens_by_digest: dict[str, dict[str, Any]] = {}
        self.tokens_by_commitment: dict[str, dict[str, Any]] = {}
        self.lock = threading.Lock()

    def stamp(self, digest: bytes) -> dict[str, Any]:
        token = make_token(digest, self.signing_key, height=self.height)
        with self.lock:
            self.tokens_by_digest[digest.hex()] = token
            self.tokens_by_commitment[token["commitment"]] = token
        return token

    def get(self, commitment_hex: str) -> dict[str, Any] | None:
        with self.lock:
            return self.tokens_by_commitment.get(commitment_hex) or self.tokens_by_digest.get(commitment_hex)


class Handler(BaseHTTPRequestHandler):
    server_version = "MockOTS/0.1"

    def do_GET(self) -> None:
        if self.path == "/health":
            self._json(200, {"status": "ok"})
            return
        if self.path.startswith("/timestamp/"):
            token = self.server.calendar.get(self.path[len("/timestamp/"):])
            if token is None:
                self._json(404, {"error": "commitment not found"})
            else:
                self._json(200, token)
            return
        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self.path != "/digest":
            self._json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        digest = self.rfile.read(length)
        if len(digest) != 32:
            self._json(400, {"error": "digest must be 32 bytes"})
            return
        token = self.server.calendar.stamp(digest)
        self._json(200, token, content_type="application/vnd.opentimestamps.mock+json")

    def _json(self, status: int, payload: dict[str, Any], content_type: str = "application/json") -> None:
        body = json.dumps(payload, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args: Any) -> None:
        # Keep test output quiet; set MOCK_OTS_VERBOSE=1 to see requests.
        if os.environ.get("MOCK_OTS_VERBOSE"):
            super().log_message(fmt, *args)


def serve(port: int = 8098, host: str = "127.0.0.1", seed: bytes = DEFAULT_SEED) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer((host, port), Handler)
    server.calendar = Calendar(SigningKey(seed))  # type: ignore[attr-defined]
    return server


def main() -> None:
    parser = argparse.ArgumentParser(description="Mock OpenTimestamps calendar (demo)")
    parser.add_argument("--port", type=int, default=8098)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--seed-hex", default=os.environ.get("MOCK_OTS_SEED_HEX", DEFAULT_SEED.hex()))
    args = parser.parse_args()
    seed = bytes.fromhex(args.seed_hex)
    server = serve(args.port, args.host, seed)
    print(f"mock OTS calendar on http://{args.host}:{args.port} (NOT a Bitcoin anchor)")
    print(f"mock calendar public key: {bytes(SigningKey(seed).verify_key).hex()}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
