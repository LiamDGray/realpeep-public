package com.realpeep.app.mesh

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.AdvertisingSet
import android.bluetooth.le.AdvertisingSetCallback
import android.bluetooth.le.AdvertisingSetParameters
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.Context
import android.os.Build
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
 * The full 117-byte signed beacon needs BLE extended advertising. We gate on
 * the controller capability, keep one advertising set alive, and rotate its
 * data with [AdvertisingSet.setAdvertisingData]. If the controller does not
 * support extended advertising (the Moto G7 Power is Bluetooth 4.2), we fall
 * back to a 21-byte unsigned presence beacon that fits the 31-byte legacy
 * packet. The scanner handles both and signs its own observation bundle.
 */
class BleAdvertiser(private val context: Context) {
    companion object {
        private const val TAG = "RealPeep.Advertiser"

        // Well-known 16-bit Service UUID for RealPeep mesh
        val SERVICE_UUID: ParcelUuid = ParcelUuid.fromString("0000FEED-0000-1000-8000-00805F9B34FB")

        // 1 len + 1 type + 2 UUID16 + 117 value + 4 UUID-list AD overhead.
        private const val EXTENDED_AD_DATA_BYTES = 125
        private const val BASE_INTERVAL_MS = 500L
        private const val JITTER_MS = 100L
    }

    private val bluetoothManager =
        context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val bluetoothAdapter: BluetoothAdapter = bluetoothManager.adapter
    private var advertiser: BluetoothLeAdvertiser? = null
    private val random = SecureRandom()

    private val _isAdvertising = MutableStateFlow(false)
    val isAdvertising: StateFlow<Boolean> = _isAdvertising

    private var advertisingJob: Job? = null

    @Volatile
    private var activeSet: AdvertisingSet? = null

    @Volatile
    private var extendedSupported = false

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
        extendedSupported = supportsExtendedAdvertising()

        advertisingJob = scope.launch(Dispatchers.Default) {
            if (extendedSupported) {
                startExtended(fullData(buildBeacon(keyPair, meshId)))
                while (isActive && _isAdvertising.value && extendedSupported) {
                    delay(intervalMs())
                    val data = fullData(buildBeacon(keyPair, meshId))
                    if (activeSet == null) {
                        // The start callback has not landed yet (or the set was
                        // stopped). Try once; failures arrive via callbacks.
                        startExtended(data)
                    } else {
                        activeSet?.setAdvertisingData(data)
                    }
                }
                stopCurrentAdvertising()
            }

            if (isActive && _isAdvertising.value) {
                // Legacy-only controller: one 21-byte presence beacon is enough.
                // It is explicitly unsigned; the scanner signs its own bundle.
                startShortLegacy(buildBeacon(keyPair, meshId))
                while (isActive && _isAdvertising.value) delay(1000)
                stopCurrentAdvertising()
            }
        }
    }

    fun stop() {
        _isAdvertising.value = false
        advertisingJob?.cancel()
        advertisingJob = null
        stopCurrentAdvertising()
    }

    private fun supportsExtendedAdvertising(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
        if (!bluetoothAdapter.isLeExtendedAdvertisingSupported) return false
        return bluetoothAdapter.leMaximumAdvertisingDataLength >= EXTENDED_AD_DATA_BYTES
    }

    private fun intervalMs(): Long =
        BASE_INTERVAL_MS + Random.nextLong(-JITTER_MS, JITTER_MS + 1)

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
            signature = signature,
        )
    }

    private fun fullData(beacon: Beacon): AdvertiseData =
        AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .setIncludeTxPowerLevel(false)
            .addServiceUuid(SERVICE_UUID)
            .addServiceData(SERVICE_UUID, Beacon.serialize(beacon))
            .build()

    private fun startExtended(data: AdvertiseData) {
        val parameters = AdvertisingSetParameters.Builder()
            .setLegacyMode(false)
            .setConnectable(false)
            .setScannable(false)
            .setInterval(800) // 500 ms in 0.625 ms units
            .setTxPowerLevel(AdvertisingSetParameters.TX_POWER_MEDIUM)
            .build()

        try {
            advertiser?.startAdvertisingSet(parameters, data, null, null, null, extendedCallback)
        } catch (error: IllegalArgumentException) {
            // startAdvertisingSet validates payload size synchronously and does
            // not always deliver onStartFailure for this case.
            Log.w(TAG, "Extended advertising rejected synchronously: ${error.message}")
            extendedSupported = false
        } catch (error: SecurityException) {
            Log.e(TAG, "BLUETOOTH_ADVERTISE permission missing: ${error.message}")
            _isAdvertising.value = false
        }
    }

    private fun startShortLegacy(beacon: Beacon) {
        val short = ShortBeacon(nonce = beacon.nonce, meshId = beacon.meshId)
        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .setIncludeTxPowerLevel(false)
            .addServiceUuid(SERVICE_UUID)
            .addServiceData(SERVICE_UUID, ShortBeacon.serialize(short))
            .build()

        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
            .setConnectable(false)
            .build()

        try {
            advertiser?.startAdvertising(settings, data, legacyCallback)
        } catch (error: Exception) {
            Log.e(TAG, "Legacy short advertising failed: ${error.message}")
        }
    }

    private fun stopCurrentAdvertising() {
        try {
            if (activeSet != null) {
                advertiser?.stopAdvertisingSet(extendedCallback)
                activeSet = null
            }
        } catch (_: Exception) {
        }
        try {
            advertiser?.stopAdvertising(legacyCallback)
        } catch (_: Exception) {
        }
    }

    private val extendedCallback = object : AdvertisingSetCallback() {
        override fun onAdvertisingSetStarted(
            advertisingSet: AdvertisingSet?,
            txPower: Int,
            status: Int,
        ) {
            if (status == AdvertisingSetCallback.ADVERTISE_SUCCESS && advertisingSet != null) {
                activeSet = advertisingSet
                extendedSupported = true
                Log.d(TAG, "Extended advertising started (txPower=$txPower)")
            } else {
                Log.w(TAG, "Extended advertising rejected (status=$status); using short beacon")
                extendedSupported = false
                activeSet = null
            }
        }

        override fun onAdvertisingDataSet(advertisingSet: AdvertisingSet?, status: Int) {
            if (status != AdvertisingSetCallback.ADVERTISE_SUCCESS) {
                Log.w(TAG, "Extended advertising data update failed (status=$status)")
                extendedSupported = false
            }
        }

        override fun onAdvertisingSetStopped(advertisingSet: AdvertisingSet?) {
            if (activeSet === advertisingSet) activeSet = null
        }
    }

    private val legacyCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            Log.d(TAG, "Short legacy advertising started")
        }

        override fun onStartFailure(errorCode: Int) {
            Log.e(TAG, "Short legacy advertising failed: $errorCode")
        }
    }
}
