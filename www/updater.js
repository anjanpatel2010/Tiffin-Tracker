/**
 * Morphe-Inspired In-App Auto-Update Sentinel for Tiffin Tracker
 * - Background update alerts (via Android WorkManager when app is closed)
 * - Direct in-app APK download with live progress bar
 * - Automatic native Android PackageInstaller execution
 * - GitHub Release link integration
 */
(function () {
  'use strict';

  const CURRENT_VERSION = '5.3.7';
  const UPDATE_CHECK_URL = 'https://raw.githubusercontent.com/anjanpatel2010/Tiffin-Tracker/master/version.json';
  const SNOOZE_KEY = 'tiffin_update_snooze_until';

  function parseSemver(v) {
    if (!v) return [0, 0, 0];
    const cleaned = v.toString().replace(/^v/, '').trim();
    const parts = cleaned.split('.').map(n => parseInt(n, 10) || 0);
    while (parts.length < 3) parts.push(0);
    return parts;
  }

  function isNewer(remote, local) {
    const r = parseSemver(remote);
    const l = parseSemver(local);
    for (let i = 0; i < 3; i++) {
      if (r[i] > l[i]) return true;
      if (r[i] < l[i]) return false;
    }
    return false;
  }

  const AppUpdater = {
    currentVersion: CURRENT_VERSION,
    activeUpdateData: null,
    isDownloading: false,

    async checkForUpdate(isManual = false) {
      if (!isManual) {
        const snoozeUntil = parseInt(localStorage.getItem(SNOOZE_KEY), 10);
        if (snoozeUntil && Date.now() < snoozeUntil) {
          return;
        }
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);

        const response = await fetch(`${UPDATE_CHECK_URL}?t=${Date.now()}`, {
          cache: 'no-store',
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const updateData = await response.json();

        if (updateData && updateData.version && isNewer(updateData.version, CURRENT_VERSION)) {
          this.showUpdateModal(updateData);
        } else if (isManual) {
          if (typeof window.showToast === 'function') {
            window.showToast(`✨ You're running the latest version (v${CURRENT_VERSION})!`, 3000);
          } else {
            alert(`You are running the latest version of Tiffin Tracker (v${CURRENT_VERSION}).`);
          }
        }
      } catch (err) {
        console.warn('[AppUpdater] Update check failed or offline:', err);
        if (isManual) {
          if (typeof window.showToast === 'function') {
            window.showToast('⚠️ Unable to check for updates. Check internet connection.', 3500);
          } else {
            alert('Unable to check for updates. Please check your internet connection.');
          }
        }
      }
    },

    showUpdateModalFromPayload(payload) {
      if (!payload) return;
      try {
        const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
        if (data && data.version) {
          this.showUpdateModal(data);
        }
      } catch (e) {
        this.checkForUpdate(true);
      }
    },

    showUpdateModal(data) {
      this.activeUpdateData = data;
      const modal = document.getElementById('appUpdateModal');
      if (!modal) return;

      const verTag = document.getElementById('updateVersionTag');
      const curTag = document.getElementById('updateCurrentVersionTag');
      const notesList = document.getElementById('updateNotesList');
      const downloadBtn = document.getElementById('updateDownloadBtn');
      const btnText = document.getElementById('updateDownloadBtnText');
      const msgElem = document.getElementById('updateMessage');
      const githubBtn = document.getElementById('updateGithubReleaseBtn');
      const progressWrap = document.getElementById('updateDownloadProgressWrap');
      const progressBar = document.getElementById('updateProgressBar');
      const progressStatus = document.getElementById('updateProgressStatus');

      if (verTag) verTag.textContent = `v${data.version}`;
      if (curTag) curTag.textContent = `v${CURRENT_VERSION}`;
      if (msgElem && data.message) msgElem.textContent = data.message;

      // GitHub Release Link (Morphe Style)
      if (githubBtn) {
        const releaseUrl = data.downloadUrl ? 'https://github.com/anjanpatel2010/Tiffin-Tracker/releases' : 'https://github.com/anjanpatel2010/Tiffin-Tracker';
        githubBtn.href = releaseUrl;
        githubBtn.onclick = (e) => {
          if (window.NativeAppInstaller && typeof window.NativeAppInstaller.openExternalUrl === 'function') {
            e.preventDefault();
            window.NativeAppInstaller.openExternalUrl(releaseUrl);
          }
        };
      }

      // Reset progress bar state
      if (progressWrap) progressWrap.style.display = 'none';
      if (progressBar) progressBar.style.width = '0%';
      if (progressStatus) progressStatus.textContent = 'Downloading update... 0%';
      if (downloadBtn) downloadBtn.disabled = false;
      if (btnText) btnText.textContent = 'Update Now ⚡';

      if (notesList) {
        notesList.innerHTML = '';
        if (Array.isArray(data.releaseNotes) && data.releaseNotes.length > 0) {
          data.releaseNotes.forEach(note => {
            const li = document.createElement('li');
            li.textContent = note;
            notesList.appendChild(li);
          });
        } else {
          const li = document.createElement('li');
          li.textContent = 'Performance improvements and bug fixes.';
          notesList.appendChild(li);
        }
      }

      if (downloadBtn) {
        downloadBtn.onclick = () => this.startUpdateDownload();
      }

      modal.style.display = 'flex';
      setTimeout(() => modal.classList.add('active'), 10);
    },

    startUpdateDownload() {
      const data = this.activeUpdateData;
      if (!data) return;

      const downloadUrl = data.downloadUrl || `https://github.com/anjanpatel2010/Tiffin-Tracker/raw/master/${data.apkFilename || 'Tiffin-Tracker-v5.3.3-release.apk'}`;
      const filename = data.apkFilename || `Tiffin-Tracker-v${data.version}-release.apk`;

      const downloadBtn = document.getElementById('updateDownloadBtn');
      const btnText = document.getElementById('updateDownloadBtnText');
      const progressWrap = document.getElementById('updateDownloadProgressWrap');

      // Native Android App: Direct in-app stream & PackageInstaller launch
      if (window.NativeAppInstaller && typeof window.NativeAppInstaller.downloadAndInstall === 'function') {
        this.isDownloading = true;
        if (downloadBtn) downloadBtn.disabled = true;
        if (btnText) btnText.textContent = 'Downloading Update... ⏳';
        if (progressWrap) progressWrap.style.display = 'block';

        window.NativeAppInstaller.downloadAndInstall(downloadUrl, filename);
      } else {
        // Fallback for Web Browsers
        if (downloadBtn) {
          downloadBtn.disabled = true;
          if (btnText) btnText.textContent = 'Opening Download... 🚀';
        }
        window.open(downloadUrl, '_system');
        setTimeout(() => {
          if (downloadBtn) downloadBtn.disabled = false;
          if (btnText) btnText.textContent = 'Update Now ⚡';
        }, 3000);
      }
    },

    onDownloadProgress(percent, downloadedBytes, totalBytes) {
      const wrap = document.getElementById('updateDownloadProgressWrap');
      const bar = document.getElementById('updateProgressBar');
      const status = document.getElementById('updateProgressStatus');
      const btnText = document.getElementById('updateDownloadBtnText');

      if (wrap) wrap.style.display = 'block';
      if (bar) bar.style.width = Math.min(Math.max(percent, 0), 100) + '%';

      if (status) {
        if (totalBytes > 0) {
          const mbDownloaded = (downloadedBytes / (1024 * 1024)).toFixed(1);
          const mbTotal = (totalBytes / (1024 * 1024)).toFixed(1);
          status.textContent = `Downloading update: ${percent}% (${mbDownloaded} MB / ${mbTotal} MB)`;
        } else {
          status.textContent = `Downloading update: ${percent}%`;
        }
      }

      if (btnText) {
        btnText.textContent = `Downloading... ${percent}%`;
      }
    },

    onDownloadComplete() {
      this.isDownloading = false;
      const bar = document.getElementById('updateProgressBar');
      const status = document.getElementById('updateProgressStatus');
      const btnText = document.getElementById('updateDownloadBtnText');
      const downloadBtn = document.getElementById('updateDownloadBtn');

      if (bar) bar.style.width = '100%';
      if (status) status.textContent = '✅ Download complete! Launching installer...';
      if (btnText) btnText.textContent = 'Installing... 🚀';
      if (downloadBtn) downloadBtn.disabled = true;
    },

    onDownloadError(errorMessage) {
      this.isDownloading = false;
      const status = document.getElementById('updateProgressStatus');
      const btnText = document.getElementById('updateDownloadBtnText');
      const downloadBtn = document.getElementById('updateDownloadBtn');

      if (status) status.textContent = `⚠️ Download failed: ${errorMessage || 'Network error'}`;
      if (btnText) btnText.textContent = 'Retry Download ⚡';
      if (downloadBtn) downloadBtn.disabled = false;

      if (typeof window.showToast === 'function') {
        window.showToast('Download interrupted. Tap retry to resume.', 4000);
      }
    },

    dismissModal(snoozeHours = 18) {
      if (this.isDownloading) {
        if (!confirm('An update is currently downloading. Are you sure you want to dismiss?')) {
          return;
        }
      }
      const modal = document.getElementById('appUpdateModal');
      if (modal) {
        modal.classList.remove('active');
        setTimeout(() => { modal.style.display = 'none'; }, 200);
      }
      localStorage.setItem(SNOOZE_KEY, (Date.now() + snoozeHours * 3600 * 1000).toString());
    },

    init() {
      const laterBtn = document.getElementById('updateLaterBtn');
      if (laterBtn) laterBtn.onclick = () => this.dismissModal(24);

      // Manual check from Settings
      const manualBtn = document.getElementById('checkUpdateManualBtn');
      if (manualBtn) {
        manualBtn.onclick = () => {
          manualBtn.disabled = true;
          const origText = manualBtn.innerHTML;
          manualBtn.innerHTML = '<span>Checking...</span>';
          this.checkForUpdate(true).finally(() => {
            manualBtn.disabled = false;
            manualBtn.innerHTML = origText;
          });
        };
      }

      // Test Alert button
      const testAlertBtn = document.getElementById('testUpdateNotificationBtn');
      if (testAlertBtn) {
        testAlertBtn.onclick = () => {
          if (window.FirebaseBridge && typeof window.FirebaseBridge.triggerImmediateUpdateCheck === 'function') {
            window.FirebaseBridge.triggerImmediateUpdateCheck();
            if (typeof window.showToast === 'function') {
              window.showToast('🚀 Background update worker triggered! Check status bar & lockscreen.', 4000);
            }
          } else {
            this.checkForUpdate(true);
          }
        };
      }

      // Test Crashlytics button
      const testCrashBtn = document.getElementById('testCrashlyticsBtn');
      if (testCrashBtn) {
        testCrashBtn.onclick = () => {
          if (window.FirebaseBridge && typeof window.FirebaseBridge.recordException === 'function') {
            window.FirebaseBridge.log('User tapped Test Crashlytics button in Settings');
            window.FirebaseBridge.recordException('Manual test event from Tiffin Tracker Settings at ' + new Date().toISOString());
            if (typeof window.showToast === 'function') {
              window.showToast('✅ Crashlytics test exception recorded! Check Firebase Console.', 4000);
            }
          } else {
            if (typeof window.showToast === 'function') {
              window.showToast('Firebase Crashlytics is active in the native Android app.', 3000);
            }
          }
        };
      }

      // Check if URL hash requested update dialog
      if (window.location.hash === '#open-update') {
        setTimeout(() => this.checkForUpdate(true), 500);
      } else {
        // Auto check in foreground after startup
        setTimeout(() => this.checkForUpdate(false), 2600);
      }
    }
  };

  window.AppUpdater = AppUpdater;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AppUpdater.init());
  } else {
    AppUpdater.init();
  }
})();
