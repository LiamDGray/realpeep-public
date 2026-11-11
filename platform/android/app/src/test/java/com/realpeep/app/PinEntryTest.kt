package com.realpeep.app

import com.realpeep.app.model.PinEntryState
import com.realpeep.app.model.PinValidator
import org.junit.Assert.*
import org.junit.Test

/**
 * Tests for PIN entry validation logic.
 *
 * The PIN is 4 digits, entered via a numeric keypad.
 * Validation:
 * - Must be exactly 4 digits
 * - Each digit must be 0-9
 * - Empty or short PIN is rejected
 * - Non-numeric input is rejected
 */
class PinEntryTest {

    @Test
    fun `valid 4-digit PIN is accepted`() {
        assertTrue(PinValidator.isValid("1234"))
        assertTrue(PinValidator.isValid("0000"))
        assertTrue(PinValidator.isValid("9999"))
        assertTrue(PinValidator.isValid("5721"))
    }

    @Test
    fun `empty PIN is rejected`() {
        assertFalse(PinValidator.isValid(""))
    }

    @Test
    fun `short PIN is rejected`() {
        assertFalse(PinValidator.isValid("1"))
        assertFalse(PinValidator.isValid("12"))
        assertFalse(PinValidator.isValid("123"))
    }

    @Test
    fun `long PIN is rejected`() {
        assertFalse(PinValidator.isValid("12345"))
        assertFalse(PinValidator.isValid("123456"))
    }

    @Test
    fun `non-numeric PIN is rejected`() {
        assertFalse(PinValidator.isValid("abcd"))
        assertFalse(PinValidator.isValid("12a4"))
        assertFalse(PinValidator.isValid("!@#$"))
        assertFalse(PinValidator.isValid(" 123"))
        assertFalse(PinValidator.isValid("12 4"))
    }

    @Test
    fun `PIN with leading zeros is valid`() {
        assertTrue(PinValidator.isValid("0001"))
        assertTrue(PinValidator.isValid("0012"))
        assertTrue(PinValidator.isValid("0123"))
    }

    @Test
    fun `PIN digit entry appends correctly`() {
        val state = PinEntryState()
        assertEquals("", state.pin)
        assertFalse(state.isComplete)

        state.appendDigit('1')
        assertEquals("1", state.pin)
        assertFalse(state.isComplete)

        state.appendDigit('2')
        assertEquals("12", state.pin)

        state.appendDigit('3')
        assertEquals("123", state.pin)

        state.appendDigit('4')
        assertEquals("1234", state.pin)
        assertTrue(state.isComplete)
    }

    @Test
    fun `PIN digit entry stops at 4 digits`() {
        val state = PinEntryState()
        state.appendDigit('1')
        state.appendDigit('2')
        state.appendDigit('3')
        state.appendDigit('4')
        state.appendDigit('5')  // Should be ignored

        assertEquals("1234", state.pin)
        assertTrue(state.isComplete)
    }

    @Test
    fun `PIN backspace removes last digit`() {
        val state = PinEntryState()
        state.appendDigit('5')
        state.appendDigit('6')
        state.appendDigit('7')
        assertEquals("567", state.pin)

        state.removeLastDigit()
        assertEquals("56", state.pin)

        state.removeLastDigit()
        assertEquals("5", state.pin)

        state.removeLastDigit()
        assertEquals("", state.pin)

        // Backspace on empty PIN is no-op
        state.removeLastDigit()
        assertEquals("", state.pin)
    }

    @Test
    fun `PIN clear resets to empty`() {
        val state = PinEntryState()
        state.appendDigit('9')
        state.appendDigit('8')
        state.appendDigit('7')
        state.appendDigit('6')
        assertTrue(state.isComplete)

        state.clear()
        assertEquals("", state.pin)
        assertFalse(state.isComplete)
    }

    @Test
    fun `masked PIN display shows dots for entered digits`() {
        val state = PinEntryState()
        assertEquals("", state.maskedDisplay)

        state.appendDigit('1')
        assertEquals("●", state.maskedDisplay)

        state.appendDigit('2')
        assertEquals("●●", state.maskedDisplay)

        state.appendDigit('3')
        assertEquals("●●●", state.maskedDisplay)

        state.appendDigit('4')
        assertEquals("●●●●", state.maskedDisplay)
    }

    @Test
    fun `PIN digits must only be 0-9`() {
        val state = PinEntryState()
        // Non-digit characters should be rejected
        assertFalse(state.appendDigit('a'))
        assertFalse(state.appendDigit('A'))
        assertFalse(state.appendDigit('!'))
        assertFalse(state.appendDigit(' '))
        assertFalse(state.appendDigit('\n'))

        assertEquals("", state.pin)

        // Valid digits should work
        assertTrue(state.appendDigit('0'))
        assertEquals("0", state.pin)
    }
}
