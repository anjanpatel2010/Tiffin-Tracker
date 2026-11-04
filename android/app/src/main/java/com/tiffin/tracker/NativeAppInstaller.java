package com.tiffin.tracker;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.content.FileProvider;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class NativeAppInstaller {
    private static final String TAG = "NativeAppInstaller";
    private final Activity activity;
    private final WebView webView;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    public NativeAppInstaller(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    @JavascriptInterface
    public boolean isNative() {
        return true;
    }

    @JavascriptInterface
    public void openExternalUrl(String url) {
        if (url == null || url.trim().isEmpty()) return;
        mainHandler.post(() -> {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(intent);
            } catch (Exception e) {
                Log.e(TAG, "Failed to open external URL: " + e.getMessage());
            }
        });
    }

    @JavascriptInterface
    public void downloadAndInstall(final String downloadUrl, final String filename) {
        Log.d(TAG, "Starting native APK download: " + downloadUrl);
        new Thread(() -> {
            HttpURLConnection connection = null;
            InputStream input = null;
            FileOutputStream output = null;
            File targetFile = null;
            try {
                URL url = new URL(downloadUrl);
                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(30000);
                connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Android; TiffinTracker)");
                connection.connect();

                int responseCode = connection.getResponseCode();
                // Handle 301/302 redirects
                if (responseCode == HttpURLConnection.HTTP_MOVED_PERM || 
                    responseCode == HttpURLConnection.HTTP_MOVED_TEMP || 
                    responseCode == 307 || responseCode == 308) {
                    String newUrl = connection.getHeaderField("Location");
                    connection.disconnect();
                    url = new URL(newUrl);
                    connection = (HttpURLConnection) url.openConnection();
                    connection.connect();
                }

                int fileLength = connection.getContentLength();
                input = new BufferedInputStream(connection.getInputStream(), 8192);

                File cacheDir = activity.getExternalCacheDir();
                if (cacheDir == null) cacheDir = activity.getCacheDir();
                
                String cleanName = (filename != null && !filename.trim().isEmpty()) ? filename : "Tiffin-Tracker-Update.apk";
                targetFile = new File(cacheDir, cleanName);
                if (targetFile.exists()) {
                    targetFile.delete();
                }

                output = new FileOutputStream(targetFile);

                byte[] data = new byte[8192];
                long total = 0;
                int count;
                long lastProgressTime = 0;

                while ((count = input.read(data)) != -1) {
                    total += count;
                    output.write(data, 0, count);

                    long now = System.currentTimeMillis();
                    if (fileLength > 0 && (now - lastProgressTime > 150)) {
                        lastProgressTime = now;
                        final int progress = (int) (total * 100 / fileLength);
                        final long totalBytes = total;
                        final long lengthBytes = fileLength;
                        postToWeb("window.AppUpdater && window.AppUpdater.onDownloadProgress && window.AppUpdater.onDownloadProgress(" + progress + ", " + totalBytes + ", " + lengthBytes + ");");
                    }
                }

                output.flush();
                output.close();
                output = null;

                // 100% Download Completed!
                postToWeb("window.AppUpdater && window.AppUpdater.onDownloadProgress && window.AppUpdater.onDownloadProgress(100, " + total + ", " + total + ");");
                postToWeb("window.AppUpdater && window.AppUpdater.onDownloadComplete && window.AppUpdater.onDownloadComplete();");

                final File apkFileToInstall = targetFile;
                mainHandler.post(() -> launchApkInstall(apkFileToInstall));

            } catch (final Exception e) {
                Log.e(TAG, "Download failed: " + e.getMessage(), e);
                postToWeb("window.AppUpdater && window.AppUpdater.onDownloadError && window.AppUpdater.onDownloadError('" + escapeJs(e.getMessage()) + "');");
            } finally {
                try {
                    if (output != null) output.close();
                    if (input != null) input.close();
                } catch (Exception ignored) {}
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    private void launchApkInstall(File apkFile) {
        try {
            if (apkFile == null || !apkFile.exists()) {
                Log.e(TAG, "APK file does not exist for install.");
                return;
            }

            Context context = activity.getApplicationContext();

            // Android 8.0+ Check Unknown Sources Permission
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!activity.getPackageManager().canRequestPackageInstalls()) {
                    Intent permIntent = new Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + activity.getPackageName())
                    );
                    activity.startActivity(permIntent);
                    return;
                }
            }

            Uri apkUri = FileProvider.getUriForFile(
                context,
                activity.getPackageName() + ".fileprovider",
                apkFile
            );

            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            activity.startActivity(installIntent);
            Log.d(TAG, "Dispatched native PackageInstaller Intent successfully!");
        } catch (Exception e) {
            Log.e(TAG, "Failed to launch package installer: " + e.getMessage(), e);
            postToWeb("window.AppUpdater && window.AppUpdater.onDownloadError && window.AppUpdater.onDownloadError('Failed to open installer: " + escapeJs(e.getMessage()) + "');");
        }
    }

    private void postToWeb(final String jsCode) {
        mainHandler.post(() -> {
            try {
                if (webView != null) {
                    webView.evaluateJavascript(jsCode, null);
                }
            } catch (Exception e) {
                Log.w(TAG, "evaluateJavascript error: " + e.getMessage());
            }
        });
    }

    private String escapeJs(String str) {
        if (str == null) return "";
        return str.replace("'", "\\'").replace("\n", " ").replace("\r", "");
    }
}
