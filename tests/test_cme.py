import numpy as np

from realpeep.cme import CMEVerifier


def test_cme_perfect_sync():
    verifier = CMEVerifier(max_allowed_delay_ms=1.0)
    timestamps = np.array([0.0, 0.5, 1.0, 1.5, 2.0])
    video = np.array([0, 0, 1, 0, 0])
    audio = np.array([0, 0, 1, 0, 0])
    
    res = verifier.verify(timestamps, video, timestamps, audio)
    assert res['passed'] is True
    assert res['delta_ms'] == 0.0
    assert res['score'] == 1.0

def test_cme_exact_boundary():
    verifier = CMEVerifier(max_allowed_delay_ms=1.0)
    video_ts = np.array([0.0, 0.5, 1.0, 1.5, 2.0])
    audio_ts = np.array([0.0, 0.5, 2.0, 2.5, 3.0])  # Peak at 2.0ms
    video = np.array([0, 0, 1, 0, 0])             # Peak at 1.0ms
    audio = np.array([0, 0, 1, 0, 0])             # Peak at 2.0ms -> delta = 1.0ms
    
    res = verifier.verify(video_ts, video, audio_ts, audio)
    assert res['passed'] is True
    assert res['delta_ms'] == 1.0
    assert res['score'] == 0.0  # Exactly at threshold should score 0.0 but pass

def test_cme_over_boundary():
    verifier = CMEVerifier(max_allowed_delay_ms=1.0)
    video_ts = np.array([0.0, 0.5, 1.0, 1.5, 2.0])
    audio_ts = np.array([0.0, 0.5, 2.01, 2.5, 3.0])  # Peak at 2.01ms
    video = np.array([0, 0, 1, 0, 0])              # Peak at 1.0ms
    audio = np.array([0, 0, 1, 0, 0])              # Peak at 2.01ms -> delta = 1.01ms
    
    res = verifier.verify(video_ts, video, audio_ts, audio)
    assert res['passed'] is False
    assert np.isclose(res['delta_ms'], 1.01)
    assert res['score'] == 0.0
