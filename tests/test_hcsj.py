import numpy as np

from realpeep.hcsj import HCSJVerifier


def test_hcsj_zero_variance():
    verifier = HCSJVerifier(max_allowed_variance=0.05)
    # Perfectly flat continuous light
    samples = np.ones(100) * 0.5
    
    res = verifier.verify(samples)
    assert res['passed'] is True
    assert res['variance'] == 0.0
    assert res['score'] == 1.0

def test_hcsj_exact_boundary():
    verifier = HCSJVerifier(max_allowed_variance=0.05)
    
    # Mean = 1.0. We want variance = 0.05.
    # Standard deviation = sqrt(0.05) = 0.2236
    # Let's create an array with exactly this variance.
    # For mean 1.0, half values at 1.0 + 0.2236, half at 1.0 - 0.2236
    val = np.sqrt(0.05)
    samples = np.array([1.0 + val, 1.0 - val] * 50)
    
    # np.var(samples) should be exactly 0.05, mean is 1.0
    # normalized var = 0.05 / 1.0^2 = 0.05
    
    res = verifier.verify(samples)
    assert res['passed'] is True
    assert np.isclose(res['variance'], 0.05)
    assert np.isclose(res['score'], 0.0)

def test_hcsj_over_boundary():
    verifier = HCSJVerifier(max_allowed_variance=0.05)
    val = np.sqrt(0.051)
    samples = np.array([1.0 + val, 1.0 - val] * 50)
    
    res = verifier.verify(samples)
    assert res['passed'] is False
    assert np.isclose(res['variance'], 0.051)
    
def test_hcsj_zero_mean():
    verifier = HCSJVerifier(max_allowed_variance=0.05)
    # Absolute darkness
    samples = np.zeros(100)
    
    res = verifier.verify(samples)
    # Zero light should have zero variance and pass (though it might fail other checks)
    assert res['passed'] is True
    assert res['variance'] == 0.0
