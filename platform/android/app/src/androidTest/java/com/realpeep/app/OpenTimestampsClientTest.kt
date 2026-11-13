package com.realpeep.app

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.realpeep.app.ots.OpenTimestampsClient
import org.json.JSONObject
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class OpenTimestampsClientTest {
    @Test
    fun verifiesMockCalendarToken() {
        val context = InstrumentationRegistry.getInstrumentation().context
        val json = context.assets.open("ots_token.json").bufferedReader().use { it.readText() }
        val client = OpenTimestampsClient()
        val token = client.parseTokenJson(JSONObject(json))
        assertTrue(client.verify(token))

        val tampered = client.parseTokenJson(JSONObject(json).apply { put("digest", "22".repeat(32)) })
        assertFalse(client.verify(tampered))
    }
}
