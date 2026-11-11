package com.realpeep.app.mesh

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.Context
import android.os.ParcelUuid
import android.util.Log
import com.realpeep.app.crypto.EphemeralKey
import com.realpeep.app.model.EphemeralKeyPair
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.security.SecureRandom
import kotlin.random.Random

/**
 * BLE advertiser for RealPeep presence beacons.
 *
 * Broadcasts ephemeral Ed25519-signed beacons at random intervals on
 * BLE advertising channels. Uses the OS-level random MAC address.
 * No pairing, no connections, no handshakes.
 */
class BleAdvertiser(private val context: Context) {
    companion object {
        private const val TAG = "RealPeep.Advertiser"

        // Well-known 16-bit Service UUID for RealPeep mesh
        val SERVICE_UUID: ParcelUuid = ParcelUuid.fromString("0000FEED-0000-1000-8000-00805F9B34FB")

        // Advertising interval: 500 ms base + uniform random jitter ±100 ms
        private const val BASE_INTERVAL_MS = 500L
        private const val JITTER_MS = 100L
    }

    private val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val bluetoothAdapter: BluetoothAdapter = bluetoothManager.adapter
    private var advertiser: BluetoothLeAdvertiser? = null
    private val random = SecureRandom()

    private val _isAdvertising = MutableStateFlow(false)
    val isAdvertising: StateFlow<Boolean> = _isAdvertising

    private var advertisingJob: Job? = null

    /**
     * Start advertising presence beacons for a recording session.
     *
     * @param keyPair Ephemeral Ed25519 keypair for this session
     * @param meshId 4-byte mesh identifier (truncated SHA-256 of video seed)
     * @param scope Coroutine scope for the advertising lifecycle
     */
    fun start(keyPair: EphemeralKeyPair, meshId: ByteArray, scope: CoroutineScope) {
        if (!bluetoothAdapter.isEnabled) {
            Log.w(TAG, "Bluetooth is not enabled")
            return
        }

        advertiser = bluetoothAdapter.bluetoothLeAdvertiser
        if (advertiser == null) {
            Log.e(TAG, "BLE advertising not supported on this device")
            return
        }

        _isAdvertising.value = true

        advertisingJob = scope.launch(Dispatchers.Default) {
            while (isActive && _isAdvertising.value) {
                val beacon = buildBeacon(keyPair, meshId)
                val data = Beacon.serialize(beacon)

                val settings = AdvertiseSettings.Builder()
                    .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                    .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
                    .setConnectable(false)
                    .build()

                val advertiseData = AdvertiseData.Builder()
                    .setIncludeDeviceName(false)
                    .setIncludeTxPowerLevel(false)
                    .addServiceUuid(SERVICE_UUID)
                    .addServiceData(SERVICE_UUID, data)
                    .build()

                advertiser?.startAdvertising(settings, advertiseData, advertiseCallback)

                // Wait for the advertising interval with jitter
                val delayMs = BASE_INTERVAL_MS + Random.nextLong(-JITTER_MS, JITTER_MS + 1)
                delay(delayMs)

                // Stop this advertisement before the next one
                advertiser?.stopAdvertising(advertiseCallback)
            }
        }
    }

    fun stop() {
        _isAdvertising.value = false
        advertisingJob?.cancel()
        try {
            advertiser?.stopAdvertising(advertiseCallback)
        } catch (_: Exception) {}
    }

    /**
     * Build a signed beacon.
     */
    private fun buildBeacon(keyPair: EphemeralKeyPair, meshId: ByteArray): Beacon {
        val nonce = ByteArray(16)
        random.nextBytes(nonce)

        // Sign: pk || nonce || mesh_id
        val message = keyPair.publicKey + nonce + meshId
        val signature = EphemeralKey.sign(keyPair.privateKey, message)

        return Beacon(
            publicKey = keyPair.publicKey,
            nonce = nonce,
            meshId = meshId,
            signature = signature
        )
    }

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            Log.d(TAG, "Advertising started")
        }

        override fun onStartFailure(errorCode: Int) {
            Log.e(TAG, "Advertising failed: $errorCode")
            _isAdvertising.value = false
        }
    }
}
