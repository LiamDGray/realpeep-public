package com.realpeep.app.audio

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import com.realpeep.app.crypto.HashChain
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Records audio at 44.1kHz mono 16-bit PCM and hashes chunks
 * into a HashChain. Each chunk is appended to the chain after
 * capture.
 */
class AudioRecorder {
    companion object {
        private const val TAG = "RealPeep.AudioRecorder"
        private const val SAMPLE_RATE = 44100
        private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
        private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
        private const val CHUNK_DURATION_MS = 100L

        /** Bytes per chunk: sampleRate * bytesPerSample * channels * duration_seconds */
        val CHUNK_SIZE_BYTES: Int = SAMPLE_RATE * 2 * 1 * (CHUNK_DURATION_MS / 1000).toInt()
    }

    private val hashChain = HashChain()
    private var audioRecord: AudioRecord? = null
    private var recordingJob: Job? = null
    private var scope: CoroutineScope? = null

    private val _isRecording = MutableStateFlow(false)
    val isRecording: StateFlow<Boolean> = _isRecording

    private val _audioChunkCount = MutableStateFlow(0)
    val audioChunkCount: StateFlow<Int> = _audioChunkCount

    private val minBufferSize: Int by lazy {
        AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)
    }

    /**
     * Start audio recording. Captures chunks on a background coroutine.
     */
    fun start(scope: CoroutineScope) {
        if (_isRecording.value) return

        val bufferSize = maxOf(minBufferSize, CHUNK_SIZE_BYTES * 2)

        try {
            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                SAMPLE_RATE,
                CHANNEL_CONFIG,
                AUDIO_FORMAT,
                bufferSize
            )

            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                Log.e(TAG, "AudioRecord failed to initialize")
                audioRecord?.release()
                audioRecord = null
                return
            }

            audioRecord?.startRecording()
            _isRecording.value = true

            this.scope = scope
            recordingJob = scope.launch(Dispatchers.IO) {
                val buffer = ByteArray(CHUNK_SIZE_BYTES)
                while (isActive && _isRecording.value) {
                    val bytesRead = audioRecord?.read(buffer, 0, buffer.size) ?: -1
                    if (bytesRead > 0) {
                        val chunk = if (bytesRead == buffer.size) {
                            buffer.copyOf()
                        } else {
                            buffer.copyOf(bytesRead)
                        }
                        hashChain.append(chunk)
                        _audioChunkCount.value = hashChain.frameCount
                    } else if (bytesRead < 0) {
                        Log.w(TAG, "AudioRecord read error: $bytesRead")
                        break
                    }
                }
            }
            Log.d(TAG, "Audio recording started")
        } catch (e: SecurityException) {
            Log.e(TAG, "RECORD_AUDIO permission denied: ${e.message}")
        } catch (e: Exception) {
            Log.e(TAG, "AudioRecord setup failed: ${e.message}")
        }
    }

    /** Stop audio recording. */
    fun stop() {
        _isRecording.value = false
        recordingJob?.cancel()
        recordingJob = null
        scope = null
        try {
            audioRecord?.stop()
            audioRecord?.release()
        } catch (_: Exception) {}
        audioRecord = null
        Log.d(TAG, "Audio recording stopped")
    }

    /** Get the Merkle root of the audio hash chain. */
    fun getMerkleRoot(): ByteArray = hashChain.buildMerkleRoot()

    /** Get total audio chunks captured. */
    fun getChunkCount(): Int = hashChain.frameCount

    /** Reset for a new session. */
    fun reset() {
        hashChain.reset()
        _audioChunkCount.value = 0
    }
}
