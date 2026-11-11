"""
Audio generation with CDMA chirp embedding for RealPeep demo.

Generates synthetic WAV files where:
  - Each device's OWN Gold-coded chirp is LOUD (transmitted)
  - Nearby devices' chirps are FAINT (attenuated by distance)
  - Ambient noise is added

Pure functions suitable for both Python and eventual native port.
"""

import math
import struct
from dataclasses import dataclass
from typing import Dict, List, Tuple

import numpy as np

from realpeep.cdma_mesh import GoldCodeGenerator

SAMPLE_RATE = 44100
DURATION_SECONDS = 30
SPEED_OF_SOUND = 343.0  # m/s
CHIRP_DURATION_SECONDS = 2.0


@dataclass
class DeviceConfig:
    """Configuration for a simulated device."""
    device_id: str
    ephemeral_key: str
    tx_time: float  # seconds into the recording when this device chirps


@dataclass
class TopologyEdge:
    """Distance between two devices."""
    device_a: str
    device_b: str
    distance_m: float


def generate_gold_code(ephemeral_key: str, sf: int = 128) -> np.ndarray:
    """Generate a Gold code from an ephemeral key.

    Uses the default preferred pair (x⁷+x+1, x⁷+x³+1) with the key hashed
    to produce shift values for the two LFSRs.

    Args:
        ephemeral_key: The device's ephemeral public key (used as seed).
        sf: Spreading factor (code length).

    Returns:
        Bipolar code array of length sf (values -1 or 1).
    """
    from realpeep.cdma_mesh import DEFAULT_GOLD_POLY1, DEFAULT_GOLD_POLY2

    # Hash the key to get a seed
    seed = abs(hash(ephemeral_key)) % (2**31)

    gen = GoldCodeGenerator(DEFAULT_GOLD_POLY1, DEFAULT_GOLD_POLY2, seed)
    # Use different shifts for the two LFSRs based on the seed
    shift_a = seed % 100
    shift_b = (seed // 100) % 100
    code = gen.generate_code(shift_a, shift_b, sf)
    return code


def generate_device_audio(
    device: DeviceConfig,
    topology: Dict[str, Dict[str, float]],
    all_devices: List[DeviceConfig],
    sf: int = 128,
    noise_std: float = 0.02,
) -> np.ndarray:
    """Generate a 30s audio buffer for one device.

    The buffer contains:
      - The device's OWN chirp at tx_time (loud)
      - Nearby devices' chirps (faint, delayed by distance / speed_of_sound)
      - Ambient Gaussian noise

    Args:
        device: The device whose perspective we're generating.
        topology: Dict[device_id][neighbor_id] → distance_meters.
        all_devices: All devices in the simulation.
        sf: Spreading factor.
        noise_std: Standard deviation of ambient noise.

    Returns:
        Float32 audio buffer, shape (DURATION_SECONDS * SAMPLE_RATE,).
    """
    n_samples = int(DURATION_SECONDS * SAMPLE_RATE)
    buffer = np.zeros(n_samples, dtype=np.float32)

    # Generate and embed OWN chirp (loud)
    own_code = generate_gold_code(device.ephemeral_key, sf=sf)
    own_tx_sample = int(device.tx_time * SAMPLE_RATE)
    own_end = own_tx_sample + len(own_code)
    if own_end <= n_samples:
        buffer[own_tx_sample:own_end] += own_code * 0.8  # loud

    # Generate and embed NEIGHBORS' chirps (faint, delayed)
    neighbors = topology.get(device.device_id, {})
    for neighbor_id, distance in neighbors.items():
        neighbor = next((d for d in all_devices if d.device_id == neighbor_id), None)
        if neighbor is None:
            continue

        neighbor_code = generate_gold_code(neighbor.ephemeral_key, sf=sf)

        # Delay = distance / speed_of_sound
        delay_samples = int((distance / SPEED_OF_SOUND) * SAMPLE_RATE)

        # Attenuation = 1 / distance^2 (inverse square law)
        attenuation = min(1.0, 1.0 / (distance * distance)) * 0.3

        neighbor_tx_sample = int(neighbor.tx_time * SAMPLE_RATE)
        arrival_sample = neighbor_tx_sample + delay_samples
        arrival_end = arrival_sample + len(neighbor_code)

        if 0 <= arrival_sample < n_samples:
            end = min(arrival_end, n_samples)
            length = end - arrival_sample
            buffer[arrival_sample:end] += neighbor_code[:length] * attenuation

    # Add ambient noise
    buffer += np.random.normal(0, noise_std, n_samples)

    # Normalize to [-1, 1]
    max_abs = np.max(np.abs(buffer))
    if max_abs > 0:
        buffer /= max_abs

    return buffer


def buffer_to_wav_bytes(buffer: np.ndarray, sample_rate: int = 44100) -> bytes:
    """Encode a Float32 audio buffer as a 16-bit mono WAV file.

    Args:
        buffer: Float32 audio samples in [-1, 1].
        sample_rate: Sample rate in Hz.

    Returns:
        WAV file bytes.
    """
    # Convert float32 [-1, 1] to int16 [-32768, 32767]
    int16_data = (np.clip(buffer, -1.0, 1.0) * 32767).astype(np.int16)
    pcm_bytes = int16_data.tobytes()

    data_size = len(pcm_bytes)
    file_size = 36 + data_size

    # WAV header
    header = struct.pack(
        '<4sI4s4sIHHIIHH4sI',
        b'RIFF',           # ChunkID
        file_size,          # ChunkSize
        b'WAVE',           # Format
        b'fmt ',           # Subchunk1ID
        16,                 # Subchunk1Size (PCM)
        1,                  # AudioFormat (1 = PCM)
        1,                  # NumChannels (mono)
        sample_rate,        # SampleRate
        sample_rate * 2,    # ByteRate (SampleRate * NumChannels * BitsPerSample/8)
        2,                  # BlockAlign
        16,                 # BitsPerSample
        b'data',           # Subchunk2ID
        data_size,          # Subchunk2Size
    )

    return header + pcm_bytes


def save_wav(buffer: np.ndarray, filepath: str, sample_rate: int = 44100):
    """Save an audio buffer as a WAV file."""
    wav_bytes = buffer_to_wav_bytes(buffer, sample_rate)
    with open(filepath, 'wb') as f:
        f.write(wav_bytes)


def generate_all_devices_audio(
    devices: List[DeviceConfig],
    topology: Dict[str, Dict[str, float]],
    output_dir: str = '.',
    sf: int = 128,
) -> Dict[str, str]:
    """Generate WAV files for all devices in a topology.

    Args:
        devices: List of device configurations.
        topology: Adjacency map of distances.
        output_dir: Directory to write WAV files.
        sf: Spreading factor.

    Returns:
        Dict mapping device_id → output filepath.
    """
    import os
    os.makedirs(output_dir, exist_ok=True)

    outputs = {}
    for device in devices:
        buffer = generate_device_audio(device, topology, devices, sf=sf)
        filepath = os.path.join(output_dir, f"{device.device_id}_audio.wav")
        save_wav(buffer, filepath)
        outputs[device.device_id] = filepath
        print(f"  {device.device_id}: {filepath} "
              f"({len(buffer) / SAMPLE_RATE:.0f}s, "
              f"{os.path.getsize(filepath) / 1024:.0f} KB)")

    return outputs


# ── Topology helpers ───────────────────────────────────────────────

def make_line_topology(device_ids: List[str], spacing_m: float = 5.0) -> Dict[str, Dict[str, float]]:
    """Create a line topology: each device hears its immediate neighbors.

    Args:
        device_ids: Ordered list of device IDs.
        spacing_m: Distance between consecutive devices.

    Returns:
        Topology dict.
    """
    topo = {}
    for i, dev_id in enumerate(device_ids):
        neighbors = {}
        if i > 0:
            neighbors[device_ids[i - 1]] = spacing_m
        if i < len(device_ids) - 1:
            neighbors[device_ids[i + 1]] = spacing_m
        topo[dev_id] = neighbors
    return topo


def make_full_mesh_topology(
    device_ids: List[str],
    positions: List[Tuple[float, float]],
) -> Dict[str, Dict[str, float]]:
    """Create a full mesh topology from 2D positions.

    Every device hears every other device (distance = Euclidean distance).

    Args:
        device_ids: List of device IDs.
        positions: List of (x, y) tuples in meters.

    Returns:
        Topology dict.
    """
    topo = {}
    for i, dev_id in enumerate(device_ids):
        neighbors = {}
        for j, other_id in enumerate(device_ids):
            if i == j:
                continue
            dx = positions[i][0] - positions[j][0]
            dy = positions[i][1] - positions[j][1]
            dist = math.sqrt(dx * dx + dy * dy)
            neighbors[other_id] = dist
        topo[dev_id] = neighbors
    return topo


# ── Demo entry point ───────────────────────────────────────────────

def demo_generate():
    """Generate a 3-device demo audio set."""
    devices = [
        DeviceConfig("device_a", "pk_AAAA0001", tx_time=5.0),
        DeviceConfig("device_b", "pk_BBBB0002", tx_time=12.0),
        DeviceConfig("device_c", "pk_CCCC0003", tx_time=20.0),
    ]

    positions = [(0.0, 0.0), (4.0, 0.0), (8.0, 0.0)]
    topology = make_full_mesh_topology(
        [d.device_id for d in devices], positions
    )

    print("Generating 3-device CDMA audio demo:")
    return generate_all_devices_audio(devices, topology, output_dir="/tmp/realpeep_audio")


if __name__ == "__main__":
    demo_generate()
    print("\nDone. Audio files at /tmp/realpeep_audio/")
