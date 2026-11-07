package com.tiffin.tracker;

import android.app.Activity;
import android.content.Context;
import android.util.Log;
import android.webkit.JavascriptInterface;

import androidx.work.Constraints;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

import com.google.android.gms.tasks.Tasks;
import com.google.firebase.crashlytics.FirebaseCrashlytics;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.perf.FirebasePerformance;
import com.google.firebase.perf.metrics.Trace;
import com.google.firebase.remoteconfig.FirebaseRemoteConfig;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * JavaScript Interface exposing Firebase SDKs to Tiffin Tracker:
 * - Firebase Crashlytics (Runtime crashes, non-fatal logs, custom keys)
 * - Firebase Performance Monitoring (Custom traces, network & screen timing)
 * - Firebase Remote Config (Cloud feature toggles & settings)
 * - FCM Token Provider
 */
public class FirebaseBridge {
    private static final String TAG = "FirebaseBridge";

    private final Activity activity;
    private final FirebaseRemoteConfig remoteConfig;
    private final FirebaseCrashlytics crashlytics;
    private final FirebasePerformance performance;
    private final ConcurrentHashMap<String, Trace> activeTraces = new ConcurrentHashMap<>();

    public FirebaseBridge(
            Activity activity,
            FirebaseRemoteConfig remoteConfig,
            FirebaseCrashlytics crashlytics,
            FirebasePerformance performance) {
        this.activity = activity;
        this.remoteConfig = remoteConfig;
        this.crashlytics = crashlytics;
        this.performance = performance;
    }

    // =========================================================================
    // 1. FIREBASE CRASHLYTICS SDK
    // =========================================================================

    @JavascriptInterface
    public void log(String message) {
        if (crashlytics != null && message != null) {
            crashlytics.log(message);
            Log.d(TAG, "[Crashlytics Log] " + message);
        }
    }

    @JavascriptInterface
    public void setUserId(String userId) {
        if (crashlytics != null && userId != null) {
            crashlytics.setUserId(userId);
            Log.d(TAG, "[Crashlytics] Bound User ID: " + userId);
        }
    }

    @JavascriptInterface
    public void setCustomKey(String key, String value) {
        if (crashlytics != null && key != null && value != null) {
            crashlytics.setCustomKey(key, value);
        }
    }

    @JavascriptInterface
    public void recordException(String message) {
        if (crashlytics != null && message != null) {
            crashlytics.recordException(new Exception("[WebException] " + message));
            Log.w(TAG, "[Crashlytics] Recorded non-fatal exception: " + message);
        }
    }

    @JavascriptInterface
    public void triggerTestCrash() {
        Log.i(TAG, "Forcing Crashlytics test crash as requested by user...");
        throw new RuntimeException("Test Crash initiated via FirebaseBridge to verify Crashlytics integration!");
    }

    // =========================================================================
    // 2. FIREBASE PERFORMANCE MONITORING SDK
    // =========================================================================

    @JavascriptInterface
    public void startTrace(String traceName) {
        if (performance != null && traceName != null && !traceName.trim().isEmpty()) {
            try {
                Trace trace = performance.newTrace(traceName.trim());
                trace.start();
                activeTraces.put(traceName.trim(), trace);
                Log.d(TAG, "[PerfTrace] Started trace: " + traceName);
            } catch (Exception e) {
                Log.w(TAG, "Could not start performance trace: " + e.getMessage());
            }
        }
    }

    @JavascriptInterface
    public void stopTrace(String traceName) {
        if (traceName != null) {
            Trace trace = activeTraces.remove(traceName.trim());
            if (trace != null) {
                try {
                    trace.stop();
                    Log.d(TAG, "[PerfTrace] Stopped trace: " + traceName);
                } catch (Exception e) {
                    Log.w(TAG, "Could not stop performance trace: " + e.getMessage());
                }
            }
        }
    }

    // =========================================================================
    // 3. FIREBASE REMOTE CONFIG SDK
    // =========================================================================

    @JavascriptInterface
    public boolean getBoolean(String key, boolean defaultValue) {
        if (remoteConfig != null && key != null) {
            try {
                return remoteConfig.getBoolean(key);
            } catch (Exception e) {
                Log.w(TAG, "RemoteConfig getBoolean error: " + e.getMessage());
            }
        }
        return defaultValue;
    }

    @JavascriptInterface
    public String getString(String key, String defaultValue) {
        if (remoteConfig != null && key != null) {
            try {
                String val = remoteConfig.getString(key);
                return (val != null && !val.isEmpty()) ? val : defaultValue;
            } catch (Exception e) {
                Log.w(TAG, "RemoteConfig getString error: " + e.getMessage());
            }
        }
        return defaultValue;
    }

    @JavascriptInterface
    public long getLong(String key, long defaultValue) {
        if (remoteConfig != null && key != null) {
            try {
                return remoteConfig.getLong(key);
            } catch (Exception e) {
                Log.w(TAG, "RemoteConfig getLong error: " + e.getMessage());
            }
        }
        return defaultValue;
    }

    @JavascriptInterface
    public double getDouble(String key, double defaultValue) {
        if (remoteConfig != null && key != null) {
            try {
                return remoteConfig.getDouble(key);
            } catch (Exception e) {
                Log.w(TAG, "RemoteConfig getDouble error: " + e.getMessage());
            }
        }
        return defaultValue;
    }

    // =========================================================================
    // 4. TEST NOTIFICATION TRIGGER (Helps user test update alerts immediately)
    // =========================================================================

    @JavascriptInterface
    public void triggerImmediateUpdateCheck() {
        try {
            Context context = activity.getApplicationContext();
            OneTimeWorkRequest checkRequest = new OneTimeWorkRequest.Builder(UpdateCheckWorker.class)
                .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .addTag("manual_test_check")
                .build();
            WorkManager.getInstance(context).enqueue(checkRequest);
            Log.d(TAG, "Dispatched immediate OneTimeWorkRequest for UpdateCheckWorker.");
        } catch (Exception e) {
            Log.e(TAG, "Failed to dispatch immediate update check: " + e.getMessage());
        }
    }

    // =========================================================================
    // 5. FCM REGISTRATION TOKEN PROVIDER
    // =========================================================================

    @JavascriptInterface
    public String getFcmToken() {
        try {
            return Tasks.await(FirebaseMessaging.getInstance().getToken(), 3, TimeUnit.SECONDS);
        } catch (Exception e) {
            Log.w(TAG, "Error fetching FCM token: " + e.getMessage());
            return null;
        }
    }
}
