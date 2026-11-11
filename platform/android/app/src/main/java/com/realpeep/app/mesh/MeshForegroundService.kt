package com.realpeep.app.mesh

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.realpeep.app.MainActivity

/**
 * Foreground service for BLE mesh during active recording.
 *
 * Keeps BLE advertising and scanning alive when the app is backgrounded.
 * Required by Android for sustained BLE operations.
 */
class MeshForegroundService : Service() {
    companion object {
        const val CHANNEL_ID = "realpeep_mesh"
        const val NOTIFICATION_ID = 1
        const val ACTION_STOP = "com.realpeep.app.STOP_MESH"
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        val pendingIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("RealPeep Mesh Active")
            .setContentText("BLE mesh is running")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

        startForeground(NOTIFICATION_ID, notification)
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "RealPeep Mesh",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Active RealPeep BLE mesh recording"
            setShowBadge(false)
        }
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(channel)
    }
}
