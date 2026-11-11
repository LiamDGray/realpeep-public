package com.realpeep.app.model

/**
 * Validates 4-digit numeric PINs.
 */
object PinValidator {
    fun isValid(pin: String): Boolean {
        return pin.length == 4 && pin.all { it in '0'..'9' }
    }
}
