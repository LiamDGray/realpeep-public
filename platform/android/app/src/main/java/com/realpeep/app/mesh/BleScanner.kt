package com.realpeep.app.mesh

import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.ParcelUuid
import android.util.Log
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.security.MessageDigest

/**
 * Passive BLE scanner for RealPeep mesh beacons.
 *
 * Receives all beacons in range; does NOT decode or verify at capture time.
 * Simply collects nonces into a Bloom filter for later verifier correlation.
 */
class BleScanner(private val context: Context) {
    companion object {
        private const val TAG = "RealPeep.Scanner"

        // Scan for RealPeep service UUID
        private val SERVICE_UUID: ParcelUuid =
            ParcelUuid.fromString("0000FEED-0000-1000-8000-00805F9B34FB")

        // Observation commitment interval
        private const val COMMIT_INTERVAL_MS = 30_000L
    }

    private val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val bluetoothAdapter = bluetoothManager.adapter
    private var scanner: BluetoothLeScanner? = null

    private val _isScanning = MutableStateFlow(false)
    val isScanning: StateFlow<Boolean> = _isScanning

    private val bloomFilter = BloomFilter(capacity = 5000, fpr = 0.02)
    private val observedNonces = mutableSetOf<String>()  // Hex-encoded for dedup

    private val _deviceCount = MutableStateFlow(0)
    val deviceCount: StateFlow<Int> = _deviceCount

    private var scanningJob: Job? = null

    /** Callback invoked with each new observation commitment. */
    var onCommitment: ((ObservationBundle) -> Unit)? = null

    /**
     * Start passive scanning. Collects nonces without verifying signatures.
     *
     * @param devicePublicKey This device's ephemeral public key (for signing commitments)
     * @param meshId Current session mesh ID
     * @param scope Coroutine scope
     */
    fun start(devicePublicKey: ByteArray, meshId: ByteArray, scope: CoroutineScope) {
        if (!bluetoothAdapter.isEnabled) {
            Log.w(TAG, "Bluetooth is not enabled")
            return
        }

        scanner = bluetoothAdapter.bluetoothLeScanner
        if (scanner == null) {
            Log.e(TAG, "BLE scanning not supported on this device")
            return
        }

        _isScanning.value = true
        bloomFilter.clear()
        observedNonces.clear()

        val scanFilter = ScanFilter.Builder()
            .setServiceUuid(SERVICE_UUID)
            .build()

        val scanSettings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
            .setMatchMode(ScanSettings.MATCH_MODE_AGGRESSIVE)
            .build()

        scanner?.startScan(listOf(scanFilter), scanSettings, scanCallback)

        // Periodically commit observations
        scanningJob = scope.launch(Dispatchers.Default) {
            while (isActive && _isScanning.value) {
                delay(COMMIT_INTERVAL_MS)
                emitCommitment(devicePublicKey, meshId)
            }
        }
    }

    fun stop() {
        _isScanning.value = false
        scanningJob?.cancel()
        try {
            scanner?.stopScan(scanCallback)
        } catch (_: Exception) {}
    }

    private fun emitCommitment(devicePublicKey: ByteArray, meshId: ByteArray) {
        val serialized = bloomFilter.serialize()
        val timestamp = System.currentTimeMillis()

        // Sign: observed || timestamp || meshId
        val message = serialized + timestamp.toBytes() + meshId
        // Note: signing happens at the caller level with the actual private key
        // The Bloom filter serialization is the commitment; signature happens in SessionManager

        val bundle = ObservationBundle(
            devicePublicKey = devicePublicKey,
            meshId = meshId,
            observed = serialized,
            numObserved = observedNonces.size,
            timestamp = timestamp,
            signature = ByteArray(0)  // Signed by caller
        )
        onCommitment?.invoke(bundle)
    }

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val scanRecord = result.scanRecord ?: return
            val serviceData = scanRecord.serviceData[SERVICE_UUID] ?: return

            val beacon = Beacon.deserialize(serviceData) ?: return

            // Deduplicate by hex nonce
            val nonceHex = beacon.nonce.joinToString("") { "%02x".format(it) }
            if (observedNonces.add(nonceHex)) {
                bloomFilter.add(beacon.nonce)
                _deviceCount.value = observedNonces.size
                Log.d(TAG, "Observed beacon from ${beacon.publicKey.take(4).joinToString("") { "%02x".format(it) }}...")
            }
        }

        override fun onScanFailed(errorCode: Int) {
            Log.e(TAG, "Scan failed: $errorCode")
            _isScanning.value = false
        }
    }

    private fun Long.toBytes(): ByteArray {
        val buf = ByteArray(8)
        for (i in 7 downTo 0) {
            buf[i] = (this shr (8 * (7 - i))).toByte()
        }
        return buf
    }
}
