package com.realpeep.app

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.camera.view.PreviewView
import androidx.compose.runtime.*
import androidx.lifecycle.lifecycleScope
import com.realpeep.app.audio.AudioRecorder
import com.realpeep.app.camera.FrameCaptureService
import com.realpeep.app.crypto.DuressKeys
import com.realpeep.app.crypto.EphemeralKey
import com.realpeep.app.crypto.HardwareAttestationManager
import com.realpeep.app.mesh.BleAdvertiser
import com.realpeep.app.mesh.BleScanner
import com.realpeep.app.mesh.MeshForegroundService
import com.realpeep.app.mesh.ObservationBundle
import com.realpeep.app.model.Session
import com.realpeep.app.storage.OfflineBundle
import com.realpeep.app.ui.screens.RecordScreen
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.security.MessageDigest

class MainActivity : ComponentActivity() {
    companion object {
        private const val TAG = "RealPeep.Main"
    }

    private lateinit var bleAdvertiser: BleAdvertiser
    private lateinit var bleScanner: BleScanner
    private lateinit var offlineBundle: OfflineBundle
    private lateinit var frameCaptureService: FrameCaptureService
    private lateinit var audioRecorder: AudioRecorder
    private lateinit var hardwareAttestation: HardwareAttestationManager

    private var session: Session? = null
    private val observationBundles = mutableListOf<ObservationBundle>()
    private lateinit var previewView: PreviewView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        bleAdvertiser = BleAdvertiser(this)
        bleScanner = BleScanner(this)
        offlineBundle = OfflineBundle(this)
        frameCaptureService = FrameCaptureService(this, this)
        audioRecorder = AudioRecorder()
        hardwareAttestation = HardwareAttestationManager()
        // COMPATIBLE uses a TextureView instead of a SurfaceView. SurfaceView
        // inside Compose AndroidView can render behind the Compose surface on
        // some devices (the Moto G7 Power showed a black preview).
        previewView = PreviewView(this).apply {
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        }

        // Wire scanner callback
        bleScanner.onCommitment = { bundle ->
            val currentSession = session
            if (currentSession != null) {
                val message = bundle.observed + bundle.timestamp.toBytes() + bundle.meshId
                val signature = EphemeralKey.sign(currentSession.ephemeralKeyPair.privateKey, message)
                val signed = bundle.copy(signature = signature)
                observationBundles.add(signed)

                val json = JSONObject().apply {
                    put("devicePublicKey", signed.devicePublicKey.toHex())
                    put("meshId", signed.meshId.toHex())
                    put("observed", signed.observed.toHex())
                    put("numObserved", signed.numObserved)
                    put("timestamp", signed.timestamp)
                    put("signature", signed.signature.toHex())
                }
                offlineBundle.storeBundle(currentSession.sessionId, json.toString())
            }
        }

        setContent {
            val meshDeviceCount by bleScanner.deviceCount.collectAsState()
            val isAdvertising by bleAdvertiser.isAdvertising.collectAsState()
            val isScanning by bleScanner.isScanning.collectAsState()
            val isCapturing by frameCaptureService.isCapturing.collectAsState()
            val isAudioRecording by audioRecorder.isRecording.collectAsState()
            val frameCount by frameCaptureService.frameHashes.collectAsState()
            val audioChunkCount by audioRecorder.audioChunkCount.collectAsState()

            RecordScreen(
                session = session,
                meshDeviceCount = meshDeviceCount,
                isAdvertising = isAdvertising,
                isScanning = isScanning,
                isCapturing = isCapturing,
                isAudioRecording = isAudioRecording,
                frameCount = frameCount,
                audioChunkCount = audioChunkCount,
                previewView = previewView,
                onStartRecording = { pin -> startRecording(pin) },
                onStopRecording = { stopRecording() }
            )
        }

        // Start camera preview immediately so user sees the feed
        frameCaptureService.startPreview(previewView)
    }

    private fun startRecording(pin: String) {
        lifecycleScope.launch {
            // ── Duress Key Derivation from PIN ──
            // The PIN is used as the passphrase for key derivation. The salt is
            // installation-wide and encrypted at rest, so the same PIN derives the
            // same key after a process restart. Production needs a strong
            // passphrase and a hardware-backed key; the 4-digit PIN is demo UX.
            val salt = offlineBundle.getOrCreateInstallSalt()
            val keyPair = DuressKeys.deriveKeypair(pin, salt)

            // Derive mesh ID from a random session seed
            val sessionSeed = ByteArray(32)
            java.security.SecureRandom().nextBytes(sessionSeed)
            val meshId = MessageDigest.getInstance("SHA-256")
                .digest(sessionSeed)
                .copyOfRange(0, 4)

            // Create session
            val newSession = Session(
                meshId = meshId,
                ephemeralKeyPair = keyPair
            )
            session = newSession

            // Hardware attestation is a separate signal over the session id and
            // ephemeral public key. It is not the Ed25519 proof key and is not
            // bound in-circuit; the 4-digit PIN remains demo material.
            val attestation = try {
                hardwareAttestation.attest(newSession.sessionId, keyPair.publicKey)
            } catch (error: Exception) {
                Log.w(TAG, "hardware attestation unavailable: ${error.message}")
                null
            }
            newSession.hardwareBacked = attestation?.hardwareBacked == true
            newSession.strongBox = attestation?.strongBox == true
            Log.i(TAG, "Attestation hardwareBacked=${newSession.hardwareBacked} strongBox=${newSession.strongBox}")

            Log.i(TAG, "Starting session ${newSession.sessionId} with PIN-derived key")

            // ── Start BLE mesh AFTER PIN is entered ──
            startForegroundService(Intent(this@MainActivity, MeshForegroundService::class.java))
            bleAdvertiser.start(keyPair, meshId, lifecycleScope)
            bleScanner.start(keyPair.publicKey, meshId, lifecycleScope)

            // ── Start frame capture and audio recording concurrently with BLE mesh ──
            frameCaptureService.reset()
            frameCaptureService.startCapture()

            audioRecorder.reset()
            audioRecorder.start(lifecycleScope)

            // Persist session
            val sessionJson = JSONObject().apply {
                put("sessionId", newSession.sessionId)
                put("meshId", meshId.toHex())
                put("publicKey", keyPair.publicKey.toHex())
                put("startedAt", newSession.startedAt)
                put("hardwareBacked", newSession.hardwareBacked)
                put("strongBox", newSession.strongBox)
                attestation?.let {
                    put("attestation", JSONObject().apply {
                        put("signature", it.signatureBase64())
                        put("certificate", it.certificateBase64())
                    })
                }
            }
            offlineBundle.storeSession(sessionJson)
        }
    }

    private fun stopRecording() {
        val s = session ?: return
        session = null

        // Stop frame capture and audio recording
        frameCaptureService.stopCapture()
        audioRecorder.stop()

        // Get final Merkle roots
        val frameMerkleRoot = frameCaptureService.getMerkleRoot()
        val audioMerkleRoot = audioRecorder.getMerkleRoot()
        val totalFrames = frameCaptureService.getFrameCount()
        val totalAudioChunks = audioRecorder.getChunkCount()

        bleAdvertiser.stop()
        bleScanner.stop()

        stopService(Intent(this, MeshForegroundService::class.java))

        // Finalize session with frame/audio data
        val sessionJson = JSONObject().apply {
            put("sessionId", s.sessionId)
            put("meshId", s.meshId.toHex())
            put("endedAt", System.currentTimeMillis())
            put("meshDeviceCount", observationBundles.size)
            put("frameCount", totalFrames)
            put("audioChunkCount", totalAudioChunks)
            put("frameMerkleRoot", frameMerkleRoot.toHex())
            put("audioMerkleRoot", audioMerkleRoot.toHex())
        }
        offlineBundle.storeSession(sessionJson)

        Log.i(TAG, "Session ${s.sessionId} ended. " +
                "Frames: $totalFrames, Audio chunks: $totalAudioChunks, " +
                "Mesh devices: ${observationBundles.size}")

        observationBundles.clear()
    }

    override fun onDestroy() {
        super.onDestroy()
        audioRecorder.stop()
    }

    // ── Helpers ──

    private fun ByteArray.toHex(): String =
        joinToString("") { "%02x".format(it) }

    private fun Long.toBytes(): ByteArray {
        val buf = ByteArray(8)
        for (i in 7 downTo 0) {
            buf[i] = (this shr (8 * (7 - i))).toByte()
        }
        return buf
    }
}
