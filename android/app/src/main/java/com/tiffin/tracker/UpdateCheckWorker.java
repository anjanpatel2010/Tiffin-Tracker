package com.tiffin.tracker;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class UpdateCheckWorker extends Worker {
    private static final String TAG = "UpdateCheckWorker";
    public static final String CHANNEL_ID = "tiffin_updates";
    private static final String VERSION_URL = "https://raw.githubusercontent.com/anjanpatel2010/Tiffin-Tracker/master/version.json";
    private static final String PREF_NAME = "tiffin_update_prefs";
    private static final String KEY_LAST_NOTIFIED_VERSION = "last_notified_version";
    private static final String KEY_LAST_NOTIFIED_TIME = "last_notified_time";

    public UpdateCheckWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        Log.d(TAG, "Starting periodic background update check (App is closed)...");
        HttpURLConnection conn = null;
        try {
            URL url = new URL(VERSION_URL + "?t=" + System.currentTimeMillis());
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setRequestProperty("Cache-Control", "no-cache");

            if (conn.getResponseCode() != 200) {
                Log.w(TAG, "HTTP " + conn.getResponseCode() + " while fetching version.json");
                return Result.retry();
            }

            BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            reader.close();

            String jsonString = sb.toString();
            JSONObject json = new JSONObject(jsonString);
            int remoteVersionCode = json.optInt("versionCode", 0);
            String remoteVersion = json.optString("version", "");
            String message = json.optString("message", "A new update for Tiffin Tracker is available!");

            long localVersionCode = 0;
            try {
                android.content.pm.PackageInfo pInfo = getApplicationContext().getPackageManager().getPackageInfo(getApplicationContext().getPackageName(), 0);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    localVersionCode = pInfo.getLongVersionCode();
                } else {
                    localVersionCode = pInfo.versionCode;
                }
            } catch (Exception e) {
                Log.w(TAG, "Could not get package info: " + e.getMessage());
            }
            Log.d(TAG, "Background Check: Local versionCode=" + localVersionCode + ", Remote versionCode=" + remoteVersionCode);

            boolean isManualTest = getTags().contains("manual_test_check");

            if (remoteVersionCode > localVersionCode || isManualTest) {
                SharedPreferences prefs = getApplicationContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
                String lastNotifiedVer = prefs.getString(KEY_LAST_NOTIFIED_VERSION, "");
                long lastNotifiedTime = prefs.getLong(KEY_LAST_NOTIFIED_TIME, 0);
                long now = System.currentTimeMillis();

                // Alert if it's a new version, a manual test, or if 18 hours have passed
                if (isManualTest || !remoteVersion.equals(lastNotifiedVer) || (now - lastNotifiedTime) > (18 * 3600 * 1000L)) {
                    sendUpdateNotification(remoteVersion, message, jsonString);
                    prefs.edit()
                         .putString(KEY_LAST_NOTIFIED_VERSION, remoteVersion)
                         .putLong(KEY_LAST_NOTIFIED_TIME, now)
                         .apply();
                }
            }

            return Result.success();
        } catch (Exception e) {
            Log.e(TAG, "Background update check exception: " + e.getMessage(), e);
            return Result.retry();
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    private void sendUpdateNotification(String version, String message, String payloadJson) {
        Context context = getApplicationContext();
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "App Updates",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Notifications about new versions and feature updates");
            channel.enableVibration(true);
            channel.setShowBadge(true);
            channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            manager.createNotificationChannel(channel);
        }

        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("OPEN_UPDATE_MODAL", true);
        intent.putExtra("UPDATE_PAYLOAD", payloadJson);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }

        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            7771,
            intent,
            flags
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher_round)
            .setContentTitle("🚀 Update Available: v" + version)
            .setContentText(message)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(message + "\nTap to see what's new and update!"))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent);

        manager.notify(7771, builder.build());
        Log.d(TAG, "Dispatched system update notification for v" + version);
    }
}
