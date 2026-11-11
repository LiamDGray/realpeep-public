package com.realpeep.app.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FiberManualRecord
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.realpeep.app.model.PinValidator
import com.realpeep.app.model.Session
import com.realpeep.app.ui.components.PinEntryDialog
import com.realpeep.app.ui.theme.RealPeepTheme

@Composable
fun RecordScreen(
    session: Session?,
    meshDeviceCount: Int,
    isAdvertising: Boolean,
    isScanning: Boolean,
    isCapturing: Boolean = false,
    isAudioRecording: Boolean = false,
    frameCount: Int = 0,
    audioChunkCount: Int = 0,
    previewView: PreviewView? = null,
    onStartRecording: (pin: String) -> Unit,
    onStopRecording: () -> Unit
) {
    val context = LocalContext.current

    // PIN dialog state
    var showPinDialog by remember { mutableStateOf(false) }

    // Permission launchers
    val allPermissions = buildList {
        // BLE permissions
        if (android.os.Build.VERSION.SDK_INT >= 31) {
            addAll(listOf(
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_ADVERTISE,
                Manifest.permission.BLUETOOTH_CONNECT
            ))
        } else {
            addAll(listOf(
                Manifest.permission.BLUETOOTH,
                Manifest.permission.BLUETOOTH_ADMIN,
                Manifest.permission.ACCESS_FINE_LOCATION
            ))
        }
        // Camera and audio permissions
        add(Manifest.permission.CAMERA)
        add(Manifest.permission.RECORD_AUDIO)
    }.toTypedArray()

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions.values.all { it }) {
            showPinDialog = true
        }
    }

    fun hasPermissions(): Boolean {
        return allPermissions.all {
            ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
        }
    }

    // Show PIN dialog
    if (showPinDialog) {
        PinEntryDialog(
            title = "Enter PIN",
            subtitle = "4-digit passcode required to start recording",
            confirmLabel = "Start Recording",
            onConfirm = { pin ->
                showPinDialog = false
                if (PinValidator.isValid(pin)) {
                    onStartRecording(pin)
                }
            },
            onDismiss = {
                showPinDialog = false
            }
        )
    }

    RealPeepTheme {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background
        ) {
            Box(modifier = Modifier.fillMaxSize()) {
                // Camera preview (full screen background)
                if (previewView != null) {
                    AndroidView(
                        factory = { previewView },
                        modifier = Modifier.fillMaxSize()
                    )
                }

                // Overlay: Status and controls
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    // Status
                    Text(
                        text = if (session != null) "Session active" else "Ready",
                        fontSize = 14.sp,
                        color = if (session != null)
                            MaterialTheme.colorScheme.primary
                        else
                            MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        modifier = Modifier
                            .background(
                                MaterialTheme.colorScheme.surface.copy(alpha = 0.7f),
                                shape = MaterialTheme.shapes.small
                            )
                            .padding(horizontal = 16.dp, vertical = 4.dp)
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    // Mesh device count
                    if (session != null) {
                        Text(
                            text = "Mesh: $meshDeviceCount device${if (meshDeviceCount != 1) "s" else ""}",
                            fontSize = 48.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier
                                .background(
                                    MaterialTheme.colorScheme.surface.copy(alpha = 0.7f),
                                    shape = MaterialTheme.shapes.small
                                )
                                .padding(horizontal = 16.dp, vertical = 4.dp)
                        )

                        Spacer(modifier = Modifier.height(8.dp))

                        Row(
                            horizontalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            StatusChip("TX", isAdvertising)
                            StatusChip("RX", isScanning)
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        // Frame and audio stats
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            StatusChip("📷 $frameCount", isCapturing)
                            StatusChip("🎤 $audioChunkCount", isAudioRecording)
                        }
                    }

                    Spacer(modifier = Modifier.height(48.dp))

                    // Record / Stop button
                    if (session == null) {
                        Button(
                            onClick = {
                                if (hasPermissions()) {
                                    showPinDialog = true
                                } else {
                                    permissionLauncher.launch(allPermissions)
                                }
                            },
                            modifier = Modifier
                                .size(120.dp)
                                .clip(CircleShape),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.primary
                            )
                        ) {
                            Icon(
                                Icons.Default.FiberManualRecord,
                                contentDescription = "Record",
                                modifier = Modifier.size(48.dp),
                                tint = MaterialTheme.colorScheme.onPrimary
                            )
                        }
                    } else {
                        Button(
                            onClick = onStopRecording,
                            modifier = Modifier
                                .size(120.dp)
                                .clip(CircleShape),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.error
                            )
                        ) {
                            Icon(
                                Icons.Default.Stop,
                                contentDescription = "Stop",
                                modifier = Modifier.size(48.dp),
                                tint = MaterialTheme.colorScheme.onError
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(24.dp))

                    Text(
                        text = if (session == null) "Tap to start recording" else "Recording...",
                        fontSize = 16.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        modifier = Modifier
                            .background(
                                MaterialTheme.colorScheme.surface.copy(alpha = 0.7f),
                                shape = MaterialTheme.shapes.small
                            )
                            .padding(horizontal = 16.dp, vertical = 4.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun StatusChip(label: String, active: Boolean) {
    Surface(
        shape = MaterialTheme.shapes.small,
        color = if (active)
            MaterialTheme.colorScheme.primary.copy(alpha = 0.2f)
        else
            MaterialTheme.colorScheme.surface.copy(alpha = 0.7f),
        border = if (active)
            androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.primary)
        else
            androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.onSurface.copy(alpha = 0.2f))
    ) {
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = if (active)
                MaterialTheme.colorScheme.primary
            else
                MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f)
        )
    }
}
