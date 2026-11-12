package com.realpeep.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Backspace
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.activity.compose.BackHandler

/**
 * 4-digit numeric PIN entry dialog.
 *
 * Designed to be indistinguishable between normal and duress PIN entry.
 * Displays masked dots and a numeric keypad with backspace.
 */
@Composable
fun PinEntryDialog(
    title: String = "Enter PIN",
    subtitle: String = "4-digit passcode required to start recording",
    confirmLabel: String = "Start Recording",
    onConfirm: (pin: String) -> Unit,
    onDismiss: () -> Unit
) {
    // Hold the PIN in Compose state. PinEntryState is a plain class, so
    // mutating it does not trigger recomposition; the dots and the Start button
    // would stay visually disabled even after four taps.
    var pin by remember { mutableStateOf("") }
    val maskedDisplay = "●".repeat(pin.length)
    val isComplete = pin.length == 4
    BackHandler(onBack = onDismiss)

    // Render as an in-activity overlay rather than a platform Dialog. On the
    // Moto G7 Power / Android 10 the Dialog window receives key events but not
    // touch events, leaving the keypad unusable. An overlay stays in the
    // activity's window and avoids that platform/Compose interaction.
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.6f)),
        contentAlignment = Alignment.Center
    ) {
        // Tap outside the card to dismiss.
        Box(
            modifier = Modifier
                .fillMaxSize()
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onDismiss
                )
        )

        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface
            )
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Title
                Text(
                    text = title,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )

                Spacer(modifier = Modifier.height(8.dp))

                // Subtitle
                Text(
                    text = subtitle,
                    fontSize = 14.sp,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(24.dp))

                // PIN dots display
                PinDotsDisplay(
                    maskedDisplay = maskedDisplay,
                    isComplete = isComplete
                )

                Spacer(modifier = Modifier.height(24.dp))

                // Numeric keypad
                NumericKeypad(
                    onDigit = { digit ->
                        if (pin.length < 4 && digit.isDigit()) pin += digit
                    },
                    onBackspace = {
                        if (pin.isNotEmpty()) pin = pin.dropLast(1)
                    }
                )

                Spacer(modifier = Modifier.height(24.dp))

                // Confirm button
                Button(
                    onClick = { onConfirm(pin) },
                    enabled = isComplete,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .testTag("pin-start"),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        text = confirmLabel,
                        fontSize = 16.sp
                    )
                }
            }
        }
    }
}

/**
 * Displays masked PIN dots (●) with animation feel.
 */
@Composable
private fun PinDotsDisplay(
    maskedDisplay: String,
    isComplete: Boolean
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        repeat(4) { index ->
            val filled = index < maskedDisplay.length
            Box(
                modifier = Modifier
                    .size(20.dp)
                    .clip(CircleShape)
                    .background(
                        if (filled)
                            MaterialTheme.colorScheme.primary
                        else
                            MaterialTheme.colorScheme.onSurface.copy(alpha = 0.2f)
                    )
                    .then(
                        if (!filled)
                            Modifier.border(
                                2.dp,
                                MaterialTheme.colorScheme.onSurface.copy(alpha = 0.3f),
                                CircleShape
                            )
                        else Modifier
                    )
            )
        }
    }
}

/**
 * Numeric keypad layout: 1-9 in a 3x3 grid, then 0 and backspace.
 */
@Composable
private fun NumericKeypad(
    onDigit: (Char) -> Unit,
    onBackspace: () -> Unit
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Row 1: 1 2 3
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            KeypadButton("1", onClick = { onDigit('1') })
            KeypadButton("2", onClick = { onDigit('2') })
            KeypadButton("3", onClick = { onDigit('3') })
        }

        // Row 2: 4 5 6
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            KeypadButton("4", onClick = { onDigit('4') })
            KeypadButton("5", onClick = { onDigit('5') })
            KeypadButton("6", onClick = { onDigit('6') })
        }

        // Row 3: 7 8 9
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            KeypadButton("7", onClick = { onDigit('7') })
            KeypadButton("8", onClick = { onDigit('8') })
            KeypadButton("9", onClick = { onDigit('9') })
        }

        // Row 4: [empty] 0 [backspace]
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            // Empty spacer for layout symmetry
            Box(modifier = Modifier.size(64.dp))

            KeypadButton("0", onClick = { onDigit('0') })

            // Backspace button
            IconButton(
                onClick = onBackspace,
                modifier = Modifier.size(64.dp)
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.Backspace,
                    contentDescription = "Backspace",
                    tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                )
            }
        }
    }
}

@Composable
private fun KeypadButton(
    label: String,
    onClick: () -> Unit
) {
    Button(
        onClick = onClick,
        modifier = Modifier
            .size(64.dp)
            .testTag("pin-key-$label"),
        shape = CircleShape,
        colors = ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.surface,
            contentColor = MaterialTheme.colorScheme.onSurface
        ),
        elevation = ButtonDefaults.buttonElevation(
            defaultElevation = 0.dp,
            pressedElevation = 0.dp
        ),
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            MaterialTheme.colorScheme.onSurface.copy(alpha = 0.2f)
        )
    ) {
        Text(
            text = label,
            fontSize = 24.sp,
            fontWeight = FontWeight.Medium
        )
    }
}
