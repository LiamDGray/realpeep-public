package com.realpeep.app

import com.realpeep.app.mesh.DeviceObservationTracker
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DeviceObservationTrackerTest {
    @Test
    fun rotatingNoncesForOneDeviceCountOnce() {
        val tracker = DeviceObservationTracker()
        assertTrue(tracker.observe("tag:01020304"))
        assertFalse(tracker.observe("tag:01020304"))
        assertFalse(tracker.observe("tag:01020304"))
        assertEquals(1, tracker.count)
    }

    @Test
    fun twoDevicesCountTwice() {
        val tracker = DeviceObservationTracker()
        assertTrue(tracker.observe("tag:01020304"))
        assertTrue(tracker.observe("tag:05060708"))
        assertEquals(2, tracker.count)
    }
}
