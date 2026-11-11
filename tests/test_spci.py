import numpy as np

from realpeep.spci import SPCIVerifier


def test_spci_perfect_match():
    verifier = SPCIVerifier(sample_rate_hz=1000.0, max_latency_ms=8.0, min_correlation=0.8)
    challenge = np.array([1, 0, 1, 1, 0, 0, 1])
    reflection = challenge.copy()
    
    res = verifier.verify(challenge, reflection)
    assert res['passed'] is True
    assert res['latency_ms'] == 0.0
    assert np.isclose(res['max_correlation'], 1.0)

def test_spci_exact_latency_boundary():
    # 1000Hz = 1ms per sample
    verifier = SPCIVerifier(sample_rate_hz=1000.0, max_latency_ms=8.0, min_correlation=0.8)
    challenge = np.zeros(20)
    challenge[5:10] = 1.0
    
    # Delay by exactly 8 samples = 8.0ms
    reflection = np.zeros(20)
    reflection[13:18] = 1.0
    
    res = verifier.verify(challenge, reflection)
    assert res['passed'] is True
    assert res['latency_ms'] == 8.0

def test_spci_over_latency_boundary():
    # Delay by 9 samples = 9.0ms
    verifier = SPCIVerifier(sample_rate_hz=1000.0, max_latency_ms=8.0, min_correlation=0.8)
    challenge = np.zeros(20)
    challenge[5:10] = 1.0
    reflection = np.zeros(20)
    reflection[14:19] = 1.0
    
    res = verifier.verify(challenge, reflection)
    assert res['passed'] is False
    assert res['latency_ms'] == 9.0

def test_spci_flatline_safeguard():
    verifier = SPCIVerifier(sample_rate_hz=1000.0, max_latency_ms=8.0, min_correlation=0.8)
    challenge = np.array([1, 0, 1, 1, 0])
    reflection = np.zeros(5) # Flatline, standard deviation is zero
    
    # Should not throw ZeroDivisionError and should fail gracefully
    # We suppress warnings to simulate strict mode where warning would be an error if unhandled
    import warnings
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        res = verifier.verify(challenge, reflection)
        
        # Verify no RuntimeWarning for divide by zero was emitted from our code
        for warning in w:
            assert "divide by zero" not in str(warning.message)
            assert "invalid value encountered in divide" not in str(warning.message)
            
    assert res['passed'] is False
    # Correlation with flatline is typically 0 or NaN, both should fail
    assert not (res['max_correlation'] >= 0.8)
