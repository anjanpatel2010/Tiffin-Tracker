package com.tiffin.tracker;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.BridgeActivity;

import java.util.concurrent.TimeUnit;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    private static final int NOTIFICATION_PERMISSION_REQUEST_CODE = 1001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();

        // 1. Transparent status/navigation bars so the app's obsidian dark theme spans seamlessly
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        window.setBackgroundDrawable(new ColorDrawable(Color.parseColor("#05080c")));

        WindowInsetsControllerCompat insetsController = WindowCompat.getInsetsController(window, window.getDecorView());
        if (insetsController != null) {
            insetsController.setAppearanceLightStatusBars(false);
            insetsController.setAppearanceLightNavigationBars(false);
        }

        // 2. Measure real hardware cutouts & status bar and send exact values into CSS
        View decorView = window.getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decorView, (v, windowInsets) -> {
            Insets insets = windowInsets.getInsets(
                WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.displayCutout()
            );
            Insets navInsets = windowInsets.getInsets(
                WindowInsetsCompat.Type.navigationBars()
            );

            float density = getResources().getDisplayMetrics().density;
            int topDp = (density > 0) ? Math.max((int) Math.ceil(insets.top / density), 40) : 44;
            int bottomDp = (density > 0) ? Math.max((int) Math.ceil(navInsets.bottom / density), 18) : 22;

            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().post(() -> {
                    String js = String.format(
                        "document.documentElement.style.setProperty('--safe-area-top', '%dpx');" +
                        "document.documentElement.style.setProperty('--safe-area-bottom', '%dpx');" +
                        "document.body.classList.add('is-native-android');",
                        topDp, bottomDp
                    );
                    bridge.getWebView().evaluateJavascript(js, null);
                });
            }
            return windowInsets;
        });

        // 3. Register NativeAppInstaller Javascript Interface for direct in-app downloads
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().addJavascriptInterface(
                new NativeAppInstaller(this, bridge.getWebView()),
                "NativeAppInstaller"
            );
        }

        // 4. Register default Android Notification Channel on app startup
        createDefaultNotificationChannel();

        // 5. Automatically request POST_NOTIFICATIONS runtime permission on Android 13+ (API 33+)
        requestNotificationPermissionIfNeeded();

        // 6. Schedule Background WorkManager Update Checker (Checks even when app is killed)
        scheduleBackgroundUpdateCheck();

        // 7. Handle notification click if app was launched from an update alert
        handleUpdateNotificationIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleUpdateNotificationIntent(intent);
    }

    private void handleUpdateNotificationIntent(Intent intent) {
        if (intent != null && intent.getBooleanExtra("OPEN_UPDATE_MODAL", false)) {
            final String payload = intent.getStringExtra("UPDATE_PAYLOAD");
            Log.d(TAG, "Opened via background Update Notification! Triggering UI dialog...");
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().postDelayed(() -> {
                    if (payload != null && !payload.trim().isEmpty()) {
                        bridge.getWebView().evaluateJavascript(
                            "if (window.AppUpdater && window.AppUpdater.showUpdateModalFromPayload) { window.AppUpdater.showUpdateModalFromPayload(" + payload + "); }",
                            null
                        );
                    } else {
                        bridge.getWebView().evaluateJavascript(
                            "if (window.AppUpdater && window.AppUpdater.checkForUpdate) { window.AppUpdater.checkForUpdate(true); }",
                            null
                        );
                    }
                }, 1000);
            }
        }
    }

    private void scheduleBackgroundUpdateCheck() {
        try {
            Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

            PeriodicWorkRequest updateRequest = new PeriodicWorkRequest.Builder(
                    UpdateCheckWorker.class,
                    2, TimeUnit.HOURS
                )
                .setConstraints(constraints)
                .addTag("tiffin_update_worker")
                .build();

            WorkManager.getInstance(getApplicationContext()).enqueueUniquePeriodicWork(
                "TiffinTrackerUpdateChecker",
                ExistingPeriodicWorkPolicy.KEEP,
                updateRequest
            );
            Log.d(TAG, "Scheduled background UpdateCheckWorker via Android WorkManager successfully.");
        } catch (Exception e) {
            Log.e(TAG, "Failed to schedule UpdateCheckWorker: " + e.getMessage(), e);
        }
    }

    private void createDefaultNotificationChannel() {
        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null) {
            TiffinFirebaseMessagingService.createDefaultChannel(notificationManager);
            Log.d(TAG, "Registered default notification channel on startup: " + TiffinFirebaseMessagingService.DEFAULT_CHANNEL_ID);
        }
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) 
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                    this,
                    new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    NOTIFICATION_PERMISSION_REQUEST_CODE
                );
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == NOTIFICATION_PERMISSION_REQUEST_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                Log.d(TAG, "POST_NOTIFICATIONS permission granted by user.");
            } else {
                Log.w(TAG, "POST_NOTIFICATIONS permission denied by user.");
            }
        }
    }
}
