package com.realpeep.app.storage

import android.content.Context
import androidx.security.crypto.EncryptedFile
import androidx.security.crypto.MasterKey
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

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
    }

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val bundlesDir = File(context.filesDir, BUNDLES_DIR).also { it.mkdirs() }

    /**
     * Store a session's observation bundle (encrypted).
     */
    fun storeBundle(sessionId: String, json: String) {
        val file = File(bundlesDir, "bundle_${sessionId}.enc")
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
    fun storeSession(sessionData: JSONObject) {
        val file = File(bundlesDir, SESSION_FILE)
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
