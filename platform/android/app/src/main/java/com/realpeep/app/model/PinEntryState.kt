package com.realpeep.app.model

/**
 * Mutable state for 4-digit PIN entry.
 * Manages digit accumulation, completion detection, and masked display.
 */
class PinEntryState {
    private val _pin = StringBuilder(4)
    val pin: String get() = _pin.toString()
    val isComplete: Boolean get() = _pin.length == 4
    val maskedDisplay: String get() = "●".repeat(_pin.length)

    fun appendDigit(digit: Char): Boolean {
        if (_pin.length >= 4) return false
        if (digit !in '0'..'9') return false
        _pin.append(digit)
        return true
    }

    fun removeLastDigit() {
        if (_pin.isNotEmpty()) {
            _pin.deleteCharAt(_pin.length - 1)
        }
    }

    fun clear() {
        _pin.clear()
    }
}
