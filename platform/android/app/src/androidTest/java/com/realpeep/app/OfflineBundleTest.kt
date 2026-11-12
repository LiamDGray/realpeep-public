package com.realpeep.app

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.realpeep.app.storage.OfflineBundle
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class OfflineBundleTest {
    @Test
    fun storeSessionCanReplaceThePreviousSession() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val bundle = OfflineBundle(context)

        bundle.storeSession(JSONObject().put("session", "first"))
        bundle.storeSession(JSONObject().put("session", "second"))
    }
}
