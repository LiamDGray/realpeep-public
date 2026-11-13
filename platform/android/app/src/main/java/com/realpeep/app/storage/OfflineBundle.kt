package com.realpeep.app.storage

import android.content.Context
import androidx.security.crypto.EncryptedFile
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.SecureRandom

/**
 * Encrypted offline storage for observation bundles and session data.
 *
 * Data is encrypted at rest using AndroidKeyStore-backed AES-256-GCM.
 * Bundles accumulate locally until connectivity is available, then upload
 * to the verifier.
 */
class OfflineBundle(private val context: Context) {
    companion object {
        private const val BUNDLES_DIR = "realpeep_bundles"
        private const val SESSION_FILE = "session.json"
        private const val SECURE_PREFS = "realpeep_secure_prefs"
        private const val INSTALL_SALT = "install_salt"
    }

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val bundlesDir = File(context.filesDir, BUNDLES_DIR).also { it.mkdirs() }

    private val securePrefs by lazy {
        EncryptedSharedPreferences.create(
            context,
            SECURE_PREFS,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    /**
     * An installation-wide salt for PIN/passphrase key derivation.
     *
     * The salt is generated once and stored in AndroidKeystore-backed encrypted
     * preferences, so the same PIN derives the same key after a process restart.
     * A production deployment should use a strong passphrase and a hardware-backed
     * key; the 4-digit PIN remains demo material.
     */
    fun getOrCreateInstallSalt(): ByteArray {
        val existing = securePrefs.getString(INSTALL_SALT, null)
        if (existing != null) {
            return existing.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        }
        val salt = ByteArray(16)
        SecureRandom().nextBytes(salt)
        securePrefs.edit().putString(INSTALL_SALT, salt.toHex()).apply()
        return salt
    }

    private fun ByteArray.toHex(): String =
        joinToString("") { "%02x".format(it) }

    /**
     * Store one observation bundle (encrypted).
     *
     * A session emits a new commitment every 30 s. Each commitment must be
     * preserved, so the filename includes a unique suffix rather than
     * overwriting the previous bundle for the same session.
     */
    fun storeBundle(sessionId: String, json: String) {
        val file = File(bundlesDir, "bundle_${sessionId}_${System.nanoTime()}.enc")
        EncryptedFile.Builder(
            context, file, masterKey,
            EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB
        ).build().apply {
            openFileOutput().use { it.write(json.toByteArray()) }
        }
    }

    /**
     * Store session metadata (encrypted).
     */
    fun storeOts(sessionId: String, json: String) {
        val file = File(bundlesDir, "ots_${sessionId}.enc")
        if (file.exists() && !file.delete()) {
            throw IllegalStateException("could not replace ${file.name}")
        }
        EncryptedFile.Builder(
            context, file, masterKey,
            EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB
        ).build().apply {
            openFileOutput().use { it.write(json.toByteArray()) }
        }
    }

    fun storeSession(sessionData: JSONObject) {
        val file = File(bundlesDir, SESSION_FILE)
        // EncryptedFile.openFileOutput() refuses to overwrite an existing file.
        // A new session must replace the previous session metadata.
        if (file.exists() && !file.delete()) {
            throw IllegalStateException("could not replace ${file.name}")
        }
        EncryptedFile.Builder(
            context, file, masterKey,
            EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB
        ).build().apply {
            openFileOutput().use { it.write(sessionData.toString().toByteArray()) }
        }
    }

    /**
     * Load all stored bundles for upload.
     */
    fun loadBundles(): List<String> {
        return bundlesDir.listFiles()
            ?.filter { it.name.startsWith("bundle_") && it.name.endsWith(".enc") }
            ?.mapNotNull { file ->
                try {
                    EncryptedFile.Builder(
                        context, file, masterKey,
                        EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB
                    ).build().openFileInput().use { String(it.readBytes()) }
                } catch (_: Exception) { null }
            } ?: emptyList()
    }

    /**
     * Clear all stored bundles after successful upload.
     */
    fun clear() {
        bundlesDir.listFiles()?.forEach { it.delete() }
    }

    fun pendingBundleCount(): Int {
        return bundlesDir.listFiles()
            ?.count { it.name.startsWith("bundle_") } ?: 0
    }
}
