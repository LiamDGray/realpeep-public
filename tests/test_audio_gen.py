"""Tests for audio_gen.py — CDMA chirp embedding in synthetic WAV files."""

import os
import tempfile

import numpy as np

from realpeep.audio_gen import (
    SAMPLE_RATE,
    DeviceConfig,
    buffer_to_wav_bytes,
    generate_device_audio,
    generate_gold_code,
    make_full_mesh_topology,
    make_line_topology,
    save_wav,
)


class TestGoldCodeGeneration:
    def test_different_keys_produce_different_codes(self):
        code_a = generate_gold_code("pk_A", sf=128)
        code_b = generate_gold_code("pk_B", sf=128)
        assert not np.array_equal(code_a, code_b)

    def test_same_key_produces_same_code(self):
        c1 = generate_gold_code("pk_A", sf=128)
        c2 = generate_gold_code("pk_A", sf=128)
        assert np.array_equal(c1, c2)

    def test_code_is_bipolar(self):
        code = generate_gold_code("pk_A", sf=128)
        assert np.all((code == 1) | (code == -1))

    def test_code_has_correct_length(self):
        for sf in [64, 128, 256]:
            code = generate_gold_code("pk_A", sf=sf)
            assert len(code) == sf


class TestDeviceAudioGeneration:
    def test_generates_correct_buffer_length(self):
        device = DeviceConfig("A", "pk_A", tx_time=5.0)
        topology = {}
        buffer = generate_device_audio(device, topology, [], sf=128)
        expected = int(30 * SAMPLE_RATE)
        assert len(buffer) == expected

    def test_own_chirp_is_loud(self):
        device = DeviceConfig("A", "pk_A", tx_time=5.0)
        topology = {}
        buffer = generate_device_audio(device, topology, [device], sf=128)
        code = generate_gold_code("pk_A", sf=128)
        corr = np.abs(np.correlate(buffer, code, mode='valid'))
        peak = np.max(corr)
        assert peak > 50, f"Own chirp correlation too low: {peak:.1f}"

    def test_neighbor_chirp_is_faint(self):
        """Neighbor's chirp should be quieter than own chirp."""
        devices = [
            DeviceConfig("A", "pk_A", tx_time=5.0),
            DeviceConfig("B", "pk_B", tx_time=12.0),
        ]
        positions = [(0.0, 0.0), (5.0, 0.0)]
        topology = make_full_mesh_topology(["A", "B"], positions)

        buffer = generate_device_audio(devices[0], topology, devices, sf=128)

        # Own chirp correlation
        code_a = generate_gold_code("pk_A", sf=128)
        corr_a = np.max(np.abs(np.correlate(buffer, code_a, mode='valid')))

        # Neighbor chirp correlation
        code_b = generate_gold_code("pk_B", sf=128)
        corr_b = np.max(np.abs(np.correlate(buffer, code_b, mode='valid')))

        assert corr_a > corr_b, (
            f"Own chirp ({corr_a:.1f}) should be louder than neighbor's ({corr_b:.1f})"
        )

    def test_line_topology_only_adjacent(self):
        """In a line topology, device 0 only hears device 1, not device 2."""
        _devices = [
            DeviceConfig("d0", "pk_0", tx_time=5.0),
            DeviceConfig("d1", "pk_1", tx_time=12.0),
            DeviceConfig("d2", "pk_2", tx_time=20.0),
        ]
        topo = make_line_topology(["d0", "d1", "d2"], spacing_m=50.0)

        # d0 only has d1 as neighbor
        assert "d1" in topo["d0"]
        assert "d2" not in topo["d0"]

        # d2 only has d1 as neighbor
        assert "d1" in topo["d2"]
        assert "d0" not in topo["d2"]


class TestWAVEncoding:
    def test_buffer_to_wav_bytes(self):
        buffer = np.sin(np.linspace(0, 440 * 2 * np.pi, 44100)).astype(np.float32)
        wav = buffer_to_wav_bytes(buffer)
        assert wav[:4] == b'RIFF'
        assert wav[8:12] == b'WAVE'
        assert b'data' in wav[:50]

    def test_wav_roundtrip(self):
        """WAV file should be readable by standard wave library."""
        buffer = np.random.randn(4410).astype(np.float32) * 0.1
        buffer = np.clip(buffer, -1, 1)

        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            save_wav(buffer, f.name)

        import wave
        with wave.open(f.name, 'rb') as wf:
            assert wf.getnchannels() == 1
            assert wf.getsampwidth() == 2
            assert wf.getframerate() == 44100

        os.unlink(f.name)


class TestFullMeshTopology:
    def test_all_pairs_connected(self):
        devices = ["a", "b", "c"]
        positions = [(0, 0), (3, 0), (0, 4)]
        topo = make_full_mesh_topology(devices, positions)

        assert len(topo["a"]) == 2  # connected to b and c
        assert len(topo["b"]) == 2
        assert len(topo["c"]) == 2

    def test_symmetric_distances(self):
        devices = ["a", "b"]
        positions = [(0, 0), (3, 0)]
        topo = make_full_mesh_topology(devices, positions)

        assert abs(topo["a"]["b"] - topo["b"]["a"]) < 0.001
        assert abs(topo["a"]["b"] - 3.0) < 0.001
