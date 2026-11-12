package com.realpeep.app

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.realpeep.app.ui.components.PinEntryDialog
import com.realpeep.app.ui.theme.RealPeepTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PinEntryDialogTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun fourDigitsEnableStartAndConfirm() {
        var confirmed: String? = null
        composeTestRule.setContent {
            RealPeepTheme {
                PinEntryDialog(
                    onConfirm = { confirmed = it },
                    onDismiss = {},
                )
            }
        }

        for (digit in listOf("1", "2", "3", "4")) {
            composeTestRule.onNodeWithTag("pin-key-$digit").performClick()
        }

        composeTestRule.onNodeWithTag("pin-start").assertIsEnabled()
        composeTestRule.onNodeWithTag("pin-start").performClick()
        assertEquals("1234", confirmed)
    }
}
