package com.tiffin.tracker

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Custom Firebase Cloud Messaging Kotlin Service for Tiffin Tracker.
 * Ensures push notifications are received and displayed with high priority
 * even when the app is completely closed, killed from recents, or the screen is locked.
 */
class TiffinFirebaseMessagingService : FirebaseMessagingService() {

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.d(TAG, "FCM Message received from: ${remoteMessage.from}")

        // 1. Forward to Capacitor PushNotificationsPlugin if WebView / runtime is active
        try {
            PushNotificationsPlugin.sendRemoteMessage(remoteMessage)
        } catch (t: Throwable) {
            Log.d(TAG, "Capacitor PushNotificationsPlugin not attached: ${t.message}")
        }

        // 2. Extract notification and data payload
        var title: String? = null
        var body: String? = null

        val notification = remoteMessage.notification
        if (notification != null) {
            title = notification.title
            body = notification.body
        }

        val data = remoteMessage.data
        if (data.isNotEmpty()) {
            if (title.isNullOrBlank()) {
                title = data["title"]
            }
            if (body.isNullOrBlank()) {
                body = data["body"] ?: data["message"]
            }
        }

        // Fallbacks if empty
        val finalTitle = if (!title.isNullOrBlank()) title else "Tiffin Tracker 🍲"
        val finalBody = if (!body.isNullOrBlank()) body else "You have a new update in your flat mess!"

        // 3. Dispatch native Android notification to system tray and lockscreen
        displayNotification(finalTitle, finalBody, data)
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "New FCM Token generated: $token")
        try {
            PushNotificationsPlugin.onNewToken(token)
        } catch (t: Throwable) {
            Log.w(TAG, "Could not pass token to PushNotificationsPlugin: ${t.message}")
        }
    }

    private fun displayNotification(title: String, body: String, data: Map<String, String>?) {
        val context = applicationContext
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            ?: return

        // Ensure default notification channel exists (Android 8.0+)
        createDefaultChannel(notificationManager)

        val intent = Intent(context, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
            putExtra("title", title)
            putExtra("body", body)
            if (data != null) {
                for ((key, value) in data) {
                    putExtra(key, value)
                }
            }
        }

        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }

        val notificationId = (System.currentTimeMillis() and 0xfffffff).toInt()
        val pendingIntent = PendingIntent.getActivity(context, notificationId, intent, flags)

        val defaultSoundUri: Uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        val builder = NotificationCompat.Builder(context, DEFAULT_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher_round)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setSound(defaultSoundUri)
            .setVibrate(longArrayOf(0, 250, 250, 250))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC) // Visible on lock screen
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setContentIntent(pendingIntent)

        notificationManager.notify(notificationId, builder.build())
        Log.d(TAG, "Dispatched native background system notification: $title")
    }

    companion object {
        private const val TAG = "TiffinFCMService"
        const val DEFAULT_CHANNEL_ID = "tiffin_notifications"
        const val DEFAULT_CHANNEL_NAME = "Tiffin Tracker Notifications"

        @JvmStatic
        fun createDefaultChannel(notificationManager: NotificationManager) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                var channel = notificationManager.getNotificationChannel(DEFAULT_CHANNEL_ID)
                if (channel == null) {
                    channel = NotificationChannel(
                        DEFAULT_CHANNEL_ID,
                        DEFAULT_CHANNEL_NAME,
                        NotificationManager.IMPORTANCE_HIGH
                    ).apply {
                        description = "Real-time mess ledger updates, meal notifications, and flat reminders"
                        enableLights(true)
                        lightColor = Color.GREEN
                        enableVibration(true)
                        vibrationPattern = longArrayOf(0, 250, 250, 250)
                        setShowBadge(true)
                        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                    }
                    notificationManager.createNotificationChannel(channel)
                    Log.d(TAG, "Created notification channel: $DEFAULT_CHANNEL_ID with IMPORTANCE_HIGH")
                }
            }
        }
    }
}
