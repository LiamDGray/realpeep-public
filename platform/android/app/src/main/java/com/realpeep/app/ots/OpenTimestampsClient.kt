package com.realpeep.app.ots

import android.util.Base64
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.security.MessageDigest

/**
 * Client for the mock OpenTimestamps calendar in `mock_ots/`.
 *
 * The wire flow mirrors the OTS calendar API: POST a 32-byte digest to
 * `/digest`, read a timestamp, and optionally GET `/timestamp/<commitment>`.
 * The payload is a JSON mock token signed by a mock calendar Ed25519 key; it is
 * NOT a Bitcoin attestation and is not .ots-compatible.
 */
data class OtsTimestamp(
    val digest: ByteArray,
    val commitment: ByteArray,
    val height: Int,
    val txid: ByteArray,
    val timestamp: Long,
    val signature: ByteArray,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("version", 1)
        put("calendar", "mock-ots")
        put("digest", digest.toHex())
        put("commitment", commitment.toHex())
        put("height", height)
        put("txid", txid.toHex())
        put("timestamp", timestamp)
        put("signature", Base64.encodeToString(signature, Base64.NO_WRAP))
    }
}

class OpenTimestampsClient(
    private val publicKeyHex: String = MOCK_CALENDAR_PUBLIC_KEY,
    private val timeoutMs: Int = 10_000,
) {
    companion object {
        // Ed25519 public key of the deterministic mock calendar seed
        // 000102...1f. Demo only.
        const val MOCK_CALENDAR_PUBLIC_KEY =
            "03a107bff3ce10be1d70dd18e74bc09967e4d6309ba50d5f1ddc8664125531b8" // pragma: allowlist secret
        private val LABEL = "RP-OTS-MOCK-v1".toByteArray()
    }

    fun stamp(digest: ByteArray, calendarUrl: String): OtsTimestamp {
        require(digest.size == 32) { "digest must be 32 bytes" }
        val connection = (URL(calendarUrl.trimEnd('/') + "/digest").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            connectTimeout = timeoutMs
            readTimeout = timeoutMs
            setRequestProperty("Content-Type", "application/octet-stream")
            setRequestProperty("Accept", "application/vnd.opentimestamps.v1")
        }
        try {
            connection.outputStream.use { it.write(digest) }
            if (connection.responseCode != 200) {
                throw IOException("mock OTS calendar returned ${connection.responseCode}")
            }
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            val token = parseToken(JSONObject(body))
            if (!token.digest.contentEquals(digest)) throw IOException("OTS token digest mismatch")
            if (!verify(token)) throw IOException("OTS token signature invalid")
            return token
        } finally {
            connection.disconnect()
        }
    }

    fun get(commitment: ByteArray, calendarUrl: String): OtsTimestamp {
        val hex = commitment.toHex()
        val connection = (URL(calendarUrl.trimEnd('/') + "/timestamp/$hex").openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = timeoutMs
            readTimeout = timeoutMs
            setRequestProperty("Accept", "application/vnd.opentimestamps.v1")
        }
        try {
            if (connection.responseCode != 200) throw IOException("mock OTS timestamp ${connection.responseCode}")
            return parseToken(JSONObject(connection.inputStream.bufferedReader().use { it.readText() }))
        } finally {
            connection.disconnect()
        }
    }

    fun verify(token: OtsTimestamp): Boolean {
        if (token.commitment.size != 32 || token.txid.size != 32) return false
        if (!token.commitment.contentEquals(commitmentFor(token.digest))) return false
        val payload = ByteBuffer.allocate(LABEL.size + 32 + 32 + 4 + 32 + 8).apply {
            put(LABEL)
            put(token.digest)
            put(token.commitment)
            putInt(token.height)
            put(token.txid)
            putLong(token.timestamp)
        }.array()
        return try {
            val signer = Ed25519Signer().apply {
                init(false, Ed25519PublicKeyParameters(publicKeyHex.hexToBytes(), 0))
                update(payload, 0, payload.size)
            }
            signer.verifySignature(token.signature)
        } catch (_: Exception) {
            false
        }
    }

    fun parseTokenJson(json: JSONObject): OtsTimestamp = parseToken(json)

    private fun parseToken(json: JSONObject): OtsTimestamp = OtsTimestamp(
        digest = json.getString("digest").hexToBytes(),
        commitment = json.getString("commitment").hexToBytes(),
        height = json.getInt("height"),
        txid = json.getString("txid").hexToBytes(),
        timestamp = json.getLong("timestamp"),
        signature = Base64.decode(json.getString("signature"), Base64.NO_WRAP),
    )

    private fun commitmentFor(digest: ByteArray): ByteArray =
        MessageDigest.getInstance("SHA-256").digest(LABEL + digest)

}

private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }

private fun String.hexToBytes(): ByteArray =
    chunked(2).map { it.toInt(16).toByte() }.toByteArray()
