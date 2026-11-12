package com.realpeep.app

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.realpeep.app.crypto.HashChain
import com.realpeep.app.crypto.NativeCore
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.security.MessageDigest

@RunWith(AndroidJUnit4::class)
class NativeCoreTest {
    @Test
    fun nativeLibraryIsAvailable() {
        assertTrue("librealpeep_core.so must load", NativeCore.available)
    }

    @Test
    fun nativeHashesMatchJavaReference() {
        assumeTrue(NativeCore.available)
        assertArrayEquals(sha256(ByteArray(0)), NativeCore.sha256(ByteArray(0)))
        assertArrayEquals(sha256("abc".toByteArray()), NativeCore.sha256("abc".toByteArray()))

        val previous = sha256(ByteArray(0))
        val frame = "frame-1".toByteArray()
        assertArrayEquals(
            sha256(previous + frame),
            NativeCore.frameHash(previous, frame),
        )

        val leaves = listOf("a", "b", "c", "d", "e").map { sha256(it.toByteArray()) }
        assertArrayEquals(merkle(leaves), NativeCore.merkleRoot(leaves.toTypedArray()))

        // The Kotlin HashChain must use the same values when the native lib is present.
        val chain = HashChain()
        chain.append(frame)
        assertArrayEquals(NativeCore.frameHash(ByteArray(32), frame), chain.buildMerkleRoot())
    }

    private fun sha256(data: ByteArray): ByteArray =
        MessageDigest.getInstance("SHA-256").digest(data)

    private fun merkle(leaves: List<ByteArray>): ByteArray {
        if (leaves.isEmpty()) return ByteArray(32)
        var level = leaves
        while (level.size > 1) {
            level = level.chunked(2).map { pair ->
                val right = if (pair.size > 1) pair[1] else pair[0]
                sha256(pair[0] + right)
            }
        }
        return level[0]
    }
}
