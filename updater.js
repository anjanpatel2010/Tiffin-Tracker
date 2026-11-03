/**
 * In-App Auto-Update Sentinel for Tiffin Tracker Standalone APK
 * Automatically checks for updates and displays a popup notification when a new version is published.
 */
(function () {
  'use strict';

  const CURRENT_VERSION = '5.3.2';
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

    async checkForUpdate(isManual = false) {
      if (!isManual) {
        const snoozeUntil = parseInt(localStorage.getItem(SNOOZE_KEY), 10);
        if (snoozeUntil && Date.now() < snoozeUntil) {
          return;
        }
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

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
            window.showToast(`✨ You're using the latest version (v${CURRENT_VERSION})!`, 3000);
          } else {
            alert(`You are using the latest version of Tiffin Tracker (v${CURRENT_VERSION}).`);
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

    showUpdateModal(data) {
      const modal = document.getElementById('appUpdateModal');
      if (!modal) return;

      const verTag = document.getElementById('updateVersionTag');
      const curTag = document.getElementById('updateCurrentVersionTag');
      const notesList = document.getElementById('updateNotesList');
      const downloadBtn = document.getElementById('updateDownloadBtn');
      const msgElem = document.getElementById('updateMessage');

      if (verTag) verTag.textContent = `v${data.version}`;
      if (curTag) curTag.textContent = `Current: v${CURRENT_VERSION}`;
      if (msgElem && data.message) msgElem.textContent = data.message;

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
          li.textContent = 'Bug fixes and performance improvements.';
          notesList.appendChild(li);
        }
      }

      if (downloadBtn) {
        downloadBtn.onclick = () => {
          const targetUrl = data.downloadUrl || data.apkUrl || `https://github.com/anjanpatel2010/Tiffin-Tracker/raw/master/${data.apkFilename || 'Tiffin-Tracker-v5.3.0-release.apk'}`;
          window.open(targetUrl, '_system');
        };
      }

      modal.style.display = 'flex';
      setTimeout(() => modal.classList.add('active'), 10);
    },

    dismissModal(snoozeHours = 12) {
      const modal = document.getElementById('appUpdateModal');
      if (modal) {
        modal.classList.remove('active');
        setTimeout(() => { modal.style.display = 'none'; }, 200);
      }
      localStorage.setItem(SNOOZE_KEY, (Date.now() + snoozeHours * 3600 * 1000).toString());
    },

    init() {
      // Setup dismiss buttons
      const closeBtn = document.getElementById('updateModalCloseBtn');
      const laterBtn = document.getElementById('updateLaterBtn');
      if (closeBtn) closeBtn.onclick = () => this.dismissModal(6);
      if (laterBtn) laterBtn.onclick = () => this.dismissModal(24);

      // Setup manual check button in settings
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

      // Auto check after a pleasant delay
      setTimeout(() => {
        this.checkForUpdate(false);
      }, 2500);
    }
  };

  window.AppUpdater = AppUpdater;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AppUpdater.init());
  } else {
    AppUpdater.init();
  }
})();
