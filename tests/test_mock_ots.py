import json
import threading
import urllib.error
import urllib.request

from nacl.signing import SigningKey

from mock_ots.calendar import (
    DEFAULT_PUBLIC_KEY,
    DEFAULT_SEED,
    canonical_payload,
    commitment_for,
    make_token,
    serve,
    verify_token,
)


def test_token_verifies_and_binds_digest():
    digest = b"\x11" * 32
    token = make_token(digest, SigningKey(DEFAULT_SEED), timestamp=1_760_000_000)
    assert verify_token(token, DEFAULT_PUBLIC_KEY)
    assert token["digest"] == digest.hex()
    assert token["commitment"] == commitment_for(digest).hex()

    token["digest"] = (b"\x22" * 32).hex()
    assert not verify_token(token, DEFAULT_PUBLIC_KEY)


def test_server_post_digest_and_get_timestamp():
    server = serve(port=0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address
    base = f"http://{host}:{port}"
    digest = b"\x33" * 32
    try:
        request = urllib.request.Request(
            base + "/digest",
            data=digest,
            headers={"Accept": "application/vnd.opentimestamps.v1"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            assert response.status == 200
            token = json.loads(response.read())
        assert verify_token(token, DEFAULT_PUBLIC_KEY)
        with urllib.request.urlopen(base + "/timestamp/" + token["commitment"], timeout=5) as response:
            fetched = json.loads(response.read())
        assert fetched == token
        with urllib.request.urlopen(base + "/timestamp/" + "00" * 32, timeout=5) as response:
            raise AssertionError("missing commitment should 404")
    except urllib.error.HTTPError as error:
        assert error.code == 404
    finally:
        server.shutdown()
        server.server_close()


def test_payload_is_canonical():
    digest = b"\x01" * 32
    commitment = commitment_for(digest)
    payload = canonical_payload(digest, commitment, 1, b"\x02" * 32, 3)
    assert payload.startswith(b"RP-OTS-MOCK-v1")
    assert len(payload) == len(b"RP-OTS-MOCK-v1") + 32 + 32 + 4 + 32 + 8
