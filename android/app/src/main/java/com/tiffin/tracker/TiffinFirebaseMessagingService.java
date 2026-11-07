package com.tiffin.tracker;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Custom Firebase Cloud Messaging Service for Tiffin Tracker
 * Guarantees notification display even when app is killed, in background, or screen is locked.
 */
public class TiffinFirebaseMessagingService extends FirebaseMessagingService {
    private static final String TAG = "TiffinFCMService";
    public static final String DEFAULT_CHANNEL_ID = "tiffin_notifications";
    public static final String DEFAULT_CHANNEL_NAME = "Tiffin Tracker Notifications";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        Log.d(TAG, "FCM Message received from: " + remoteMessage.getFrom());

        // 1. Forward to Capacitor Plugin if app WebView is alive
        try {
            PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
        } catch (Throwable t) {
            Log.d(TAG, "Capacitor PushNotificationsPlugin not attached: " + t.getMessage());
        }

        // 2. Extract title & body from notification payload OR data payload
        String title = null;
        String body = null;

        if (remoteMessage.getNotification() != null) {
            title = remoteMessage.getNotification().getTitle();
            body = remoteMessage.getNotification().getBody();
        }

        Map<String, String> data = remoteMessage.getData();
        if (data != null && !data.isEmpty()) {
            if (title == null || title.trim().isEmpty()) {
                title = data.get("title");
            }
            if (body == null || body.trim().isEmpty()) {
                body = data.get("body");
                if (body == null || body.trim().isEmpty()) {
                    body = data.get("message");
                }
            }
        }

        // Fallbacks if empty
        if (title == null || title.trim().isEmpty()) {
            title = "Tiffin Tracker";
        }
        if (body == null || body.trim().isEmpty()) {
            body = "You have a new update in your flat mess!";
        }

        // 3. Dispatch native Android notification to system tray & lockscreen
        displayNotification(title, body, data);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        Log.d(TAG, "New FCM Token generated: " + token);
        try {
            PushNotificationsPlugin.onNewToken(token);
        } catch (Throwable t) {
            Log.w(TAG, "Could not pass token to PushNotificationsPlugin: " + t.getMessage());
        }
    }

    private void displayNotification(String title, String body, Map<String, String> data) {
        Context context = getApplicationContext();
        NotificationManager notificationManager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

        if (notificationManager == null) return;

        // Ensure default channel is registered
        createDefaultChannel(notificationManager);

        Intent intent = new Intent(context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);

        if (data != null) {
            for (Map.Entry<String, String> entry : data.entrySet()) {
                intent.putExtra(entry.getKey(), entry.getValue());
            }
        }

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }

        int notificationId = (int) (System.currentTimeMillis() & 0xfffffff);
        PendingIntent pendingIntent = PendingIntent.getActivity(context, notificationId, intent, flags);

        Uri defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);

        NotificationCompat.Builder builder =
            new NotificationCompat.Builder(context, DEFAULT_CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher_round)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setSound(defaultSoundUri)
                .setVibrate(new long[]{0, 250, 250, 250})
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC) // Shows on Lock Screen
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setContentIntent(pendingIntent);

        notificationManager.notify(notificationId, builder.build());
        Log.d(TAG, "Dispatched background system notification: " + title);
    }

    public static void createDefaultChannel(NotificationManager notificationManager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = notificationManager.getNotificationChannel(DEFAULT_CHANNEL_ID);
            if (channel == null) {
                channel = new NotificationChannel(
                    DEFAULT_CHANNEL_ID,
                    DEFAULT_CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Real-time mess ledger updates, meal notifications, and flat reminders");
                channel.enableLights(true);
                channel.setLightColor(Color.GREEN);
                channel.enableVibration(true);
                channel.setVibrationPattern(new long[]{0, 250, 250, 250});
                channel.setShowBadge(true);
                channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC); // Visible on lock screen
                notificationManager.createNotificationChannel(channel);
            }
        }
    }
}
