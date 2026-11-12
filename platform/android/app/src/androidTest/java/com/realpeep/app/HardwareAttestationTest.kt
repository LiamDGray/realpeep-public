package com.realpeep.app

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.realpeep.app.crypto.HardwareAttestationManager
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class HardwareAttestationTest {
    @Test
    fun signsAndVerifiesSessionPayload() {
        val manager = HardwareAttestationManager("realpeep_test_attest_${System.nanoTime()}")
        try {
            val attestation = manager.attest("session-test", ByteArray(32) { it.toByte() })
            assertTrue("signature must verify", manager.verify(attestation))
            assertTrue("payload must be present", attestation.payload.isNotEmpty())
            assertTrue("signature must be present", attestation.signature.isNotEmpty())
            assertTrue("certificate chain must be present", attestation.certificateChain.isNotEmpty())

            val tampered = attestation.copy(payload = attestation.payload.copyOf().also { it[0] = (it[0] + 1).toByte() })
            assertFalse("tampered payload must fail", manager.verify(tampered))
        } finally {
            manager.deleteKey()
        }
    }
}
