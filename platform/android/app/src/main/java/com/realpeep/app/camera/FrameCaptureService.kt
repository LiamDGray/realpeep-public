package com.realpeep.app.camera

import android.content.Context
import android.graphics.Bitmap
import android.graphics.ImageFormat
import android.media.Image
import android.util.Log
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.realpeep.app.crypto.HashChain
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer

/**
 * Wraps CameraX for preview and per-frame SHA-256 hashing.
 *
 * Each frame captured by ImageAnalysis is JPEG-compressed, then hashed
 * into the frame HashChain. The camera preview is rendered via PreviewView.
 */
class FrameCaptureService(
    private val context: Context,
    private val lifecycleOwner: LifecycleOwner
) {
    companion object {
        private const val TAG = "RealPeep.FrameCapture"
        private const val JPEG_QUALITY = 85
    }

    private val hashChain = HashChain()
    private val _isCapturing = MutableStateFlow(false)
    val isCapturing: StateFlow<Boolean> = _isCapturing

    private val _frameHashes = MutableStateFlow(0)
    val frameHashes: StateFlow<Int> = _frameHashes

    private var captureJob: Job? = null

    /** Start camera preview in the given PreviewView. */
    fun startPreview(previewView: PreviewView) {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)

        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()

            val preview = androidx.camera.core.Preview.Builder()
                .build()
                .also { it.setSurfaceProvider(previewView.surfaceProvider) }

            val imageAnalysis = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .setImageQueueDepth(2)
                .build()
                .also {
                    it.setAnalyzer(ContextCompat.getMainExecutor(context)) { imageProxy ->
                        if (_isCapturing.value) {
                            hashFrame(imageProxy)
                        }
                        imageProxy.close()
                    }
                }

            try {
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(
                    lifecycleOwner,
                    androidx.camera.core.CameraSelector.DEFAULT_BACK_CAMERA,
                    preview,
                    imageAnalysis
                )
                Log.d(TAG, "Camera preview started")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to bind camera: ${e.message}")
            }
        }, ContextCompat.getMainExecutor(context))
    }

    /** Start capturing frames into the hash chain. */
    fun startCapture() {
        _isCapturing.value = true
        Log.d(TAG, "Frame capture started")
    }

    /** Stop capturing frames. */
    fun stopCapture() {
        _isCapturing.value = false
        captureJob?.cancel()
        Log.d(TAG, "Frame capture stopped")
    }

    /** Get the current Merkle root of the frame hash chain. */
    fun getMerkleRoot(): ByteArray = hashChain.buildMerkleRoot()

    /** Get the total number of frames captured. */
    fun getFrameCount(): Int = hashChain.frameCount

    /** Reset the frame hash chain for a new session. */
    fun reset() {
        hashChain.reset()
        _frameHashes.value = 0
    }

    /**
     * Hash a single frame from ImageAnalysis output.
     * Converts to JPEG and hashes the compressed data.
     */
    private fun hashFrame(imageProxy: ImageProxy) {
        try {
            val jpegData = imageProxyToJpeg(imageProxy)
            if (jpegData != null) {
                hashChain.append(jpegData)
                _frameHashes.value = hashChain.frameCount
            }
        } catch (e: Exception) {
            Log.e(TAG, "Frame hashing failed: ${e.message}")
        }
    }

    /**
     * Convert an ImageProxy (YUV_420_888) to JPEG byte array.
     */
    private fun imageProxyToJpeg(imageProxy: ImageProxy): ByteArray? {
        val image = imageProxy.image ?: return null

        return try {
            val yBuffer = image.planes[0].buffer
            val uBuffer = image.planes[1].buffer
            val vBuffer = image.planes[2].buffer

            val ySize = yBuffer.remaining()
            val uSize = uBuffer.remaining()
            val vSize = vBuffer.remaining()

            val nv21 = ByteArray(ySize + uSize + vSize)
            yBuffer.get(nv21, 0, ySize)
            vBuffer.get(nv21, ySize, vSize)
            uBuffer.get(nv21, ySize + vSize, uSize)

            val yuvImage = android.graphics.YuvImage(
                nv21,
                ImageFormat.NV21,
                image.width,
                image.height,
                null
            )

            val out = ByteArrayOutputStream()
            yuvImage.compressToJpeg(
                android.graphics.Rect(0, 0, image.width, image.height),
                JPEG_QUALITY,
                out
            )
            out.toByteArray()
        } catch (e: Exception) {
            Log.e(TAG, "YUV to JPEG conversion failed: ${e.message}")
            null
        }
    }
}
