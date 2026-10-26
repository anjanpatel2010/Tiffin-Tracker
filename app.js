/**
 * October Tiffin Expense Tracker - Core Application Logic
 * Mobile-First, Real-Time Cloud Sync, Voting Poll, Configurable Pricing & Audit Log
 */

(function () {
  'use strict';

  // --- Application Version & Automatic Cache Sentinel ---
  const APP_VERSION = '5.2.1';

  function checkAndMigrateAppVersion() {
    try {
      const storedVersion = localStorage.getItem('tiffin_app_version');
      if (storedVersion !== APP_VERSION) {
        console.log(`[VersionSentinel] Upgrading app from ${storedVersion || 'legacy'} to v${APP_VERSION}`);

        // 1. Purge CacheStorage caches from previous versions
        if ('caches' in window) {
          caches.keys().then((keys) => {
            return Promise.all(
              keys.map((k) => {
                if (k !== `tiffin-tracker-v${APP_VERSION}`) {
                  console.log('[VersionSentinel] Purging old cache:', k);
                  return caches.delete(k);
                }
              })
            );
          }).catch(() => {});
        }

        // 2. Update service worker registrations
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then((registrations) => {
            for (const reg of registrations) {
              reg.update().catch(() => {});
            }
          }).catch(() => {});
        }

        // 3. Mark new version in storage
        localStorage.setItem('tiffin_app_version', APP_VERSION);

        // 4. PRESERVE USER IDENTITY & ROOM STATE:
        const existingSession = localStorage.getItem('tiffin_user_session');
        if (existingSession) {
          try {
            const parsed = JSON.parse(existingSession);
            if (parsed && parsed.name && parsed.roomCode) {
              setTimeout(() => {
                if (typeof showToast === 'function') {
                  showToast(`✨ Updated to v${APP_VERSION}! You're all set.`);
                }
              }, 1200);
            }
          } catch (e) {}
        }
      }
    } catch (e) {
      console.warn('[VersionSentinel] Migration warning:', e);
    }
  }

  // Execute version sentinel immediately
  checkAndMigrateAppVersion();

  // --- Month & Calendar Constants ---
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const MONTH_SHORTS = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
  ];
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  const now = new Date();
  const storedYear = parseInt(localStorage.getItem('tiffin_last_viewed_year'), 10);
  const storedMonth = parseInt(localStorage.getItem('tiffin_last_viewed_month'), 10);

  let currentYear = (!isNaN(storedYear) && storedYear >= 2024 && storedYear <= 2035) ? storedYear : now.getFullYear();
  let currentMonth = (!isNaN(storedMonth) && storedMonth >= 1 && storedMonth <= 12) ? storedMonth : (now.getMonth() + 1);

  // Application State declaration (initialized to null to prevent TDZ reference errors)
  let appState = null;

  function getDynamicTodayForMonth(year, month) {
    if (now.getFullYear() === year && (now.getMonth() + 1) === month) {
      return Math.min(Math.max(now.getDate(), 1), getDaysInMonth(year, month));
    }
    return 1;
  }

  // --- Configuration & Constants ---
  const CONFIG = {
    year: currentYear,
    month: currentMonth,
    daysInMonth: getDaysInMonth(currentYear, currentMonth),
    todayDay: getDynamicTodayForMonth(currentYear, currentMonth),
    adminPassword: 'Flower',
    defaultRoom: 'flat-tiffin-group',
    defaultRates: {
      half: 80,
      full: 110,
      special: 90,
      amulPacket: 35
    },
    defaultProvider: {
      name: '',
      upi: '',
      phone: ''
    }
  };

  let ROOMMATES = [];

  function getActiveRoomCode() {
    try {
      if (typeof RoomManager !== 'undefined' && RoomManager?.activeRoom?.code) {
        return RoomManager.activeRoom.code;
      }
      if (typeof RoomManager !== 'undefined' && RoomManager?.session?.roomCode) {
        return RoomManager.session.roomCode;
      }
    } catch (e) {}
    try {
      if (typeof SyncEngine !== 'undefined' && SyncEngine?.roomCode) {
        return SyncEngine.roomCode;
      }
    } catch (e) {}
    try {
      const rawSession = localStorage.getItem('tiffin_user_session');
      if (rawSession) {
        const parsed = JSON.parse(rawSession);
        if (parsed && parsed.roomCode) return parsed.roomCode;
      }
    } catch (e) {}
    try {
      const storedSync = localStorage.getItem('tiffin_sync_room');
      if (storedSync) return storedSync;
    } catch (e) {}
    return CONFIG.defaultRoom;
  }

  function getStorageKey(year, month) {
    const roomCode = getActiveRoomCode().toString().trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    return `tiffin_tracker_ledger_${roomCode}_${year}_${month}`;
  }

  // Generate blank month dataset for active roommates
  function getDefaultDataForMonth(year, month) {
    const daysInM = getDaysInMonth(year, month);
    const monthName = MONTH_NAMES[month - 1];
    const monthShort = MONTH_SHORTS[month - 1].slice(0, 3);
    const days = {};

    for (let d = 1; d <= daysInM; d++) {
      const dateObj = new Date(year, month - 1, d);
      const dayOfWeek = DAY_NAMES[dateObj.getDay()];
      const mealsObj = {};
      const amulObj = {};

      ROOMMATES.forEach(r => {
        mealsObj[r.id] = { lunch: '', dinner: '' };
        amulObj[r.id] = 0;
      });

      days[d] = {
        day: d,
        dayOfWeek: dayOfWeek,
        dateFormatted: `${dayOfWeek}, Day ${d}`,
        dateShort: `Day ${d}`,
        sabzi: '',
        sabziUpdatedAt: 0,
        meals: mealsObj,
        mealTimestamps: {},
        amul: amulObj,
        amulTimestamps: {}
      };
    }

    const rates = (appState && appState.rates) ? { ...appState.rates } : { ...CONFIG.defaultRates };
    const provider = (appState && appState.provider) ? { ...appState.provider } : { ...CONFIG.defaultProvider };

    return {
      version: 4,
      year: year,
      month: month,
      lastModified: new Date().toISOString(),
      rates: rates,
      provider: provider,
      days: days,
      activePoll: null,
      pollHistory: [],
      amulMembers: ROOMMATES.map(r => r.id),
      auditLog: []
    };
  }

  function loadStateForMonth(year, month) {
    // 1. Try URL hash state for initial import
    if (year === 2026 && month === 10 && window.location.hash && window.location.hash.startsWith('#data=')) {
      try {
        const encoded = window.location.hash.slice(6);
        const jsonStr = decodeURIComponent(atob(encoded));
        const parsed = JSON.parse(jsonStr);
        if (parsed && parsed.days) {
          if (!parsed.pollHistory) parsed.pollHistory = [];
          if (!parsed.amulMembers || !Array.isArray(parsed.amulMembers)) parsed.amulMembers = ['anjan', 'saurabh'];
          saveStateForMonth(year, month, parsed);
          return parsed;
        }
      } catch (err) {
        console.warn('Could not parse shared state from URL hash', err);
      }
    }

    // 2. Try localStorage
    try {
      const key = getStorageKey(year, month);
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.days) {
          parsed.rates = { ...CONFIG.defaultRates, ...(parsed.rates || {}) };
          parsed.provider = { ...CONFIG.defaultProvider, ...(parsed.provider || {}) };
          if (!parsed.auditLog) parsed.auditLog = [];
          if (!parsed.pollHistory) parsed.pollHistory = [];
          if (!parsed.amulMembers || !Array.isArray(parsed.amulMembers)) parsed.amulMembers = ['anjan', 'saurabh'];

          // Ensure timestamps dictionaries exist on every day
          const daysInM = getDaysInMonth(year, month);
          for (let d = 1; d <= daysInM; d++) {
            if (parsed.days[d]) {
              if (!parsed.days[d].mealTimestamps) parsed.days[d].mealTimestamps = {};
              if (!parsed.days[d].amulTimestamps) parsed.days[d].amulTimestamps = {};
              if (typeof parsed.days[d].sabziUpdatedAt !== 'number') parsed.days[d].sabziUpdatedAt = 0;
            }
          }

          return parsed;
        }
      }
    } catch (e) {
      console.warn('localStorage error', e);
    }

    // 3. Fallback to default month generator
    return getDefaultDataForMonth(year, month);
  }

  function saveStateForMonth(year, month, stateObj) {
    stateObj.lastModified = new Date().toISOString();
    stateObj.year = year;
    stateObj.month = month;
    try {
      const key = getStorageKey(year, month);
      localStorage.setItem(key, JSON.stringify(stateObj));
      if (year === 2026 && month === 10) {
        localStorage.setItem('tiffin_tracker_oct2026_data_v3', JSON.stringify(stateObj));
      }
    } catch (e) {
      console.warn('Storage quota exceeded', e);
    }
  }

  function saveStateToStorage(stateObj) {
    saveStateForMonth(currentYear, currentMonth, stateObj);
  }

  function loadState() {
    return loadStateForMonth(currentYear, currentMonth);
  }

  // Application State
  appState = loadState();
  let selectedDay = CONFIG.todayDay;
  let selectedUpiRoommate = 'anjan';
  let customUpiAmount = null;
  let pendingPasswordCallback = null;
  let activeSheetFilter = 'all'; // 'all' or roommate ID

  function logActivity(author, action, details) {
    if (!appState.auditLog) appState.auditLog = [];
    const entry = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      timestamp: Date.now(),
      timeFormatted: formatLogTime(Date.now()),
      author: author || SyncEngine.identity || 'Anjan',
      action: action,
      details: details
    };
    appState.auditLog.unshift(entry);
    if (appState.auditLog.length > 250) appState.auditLog.pop();
  }

  function formatLogTime(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function persistAndBroadcast(actionPayload) {
    saveStateToStorage(appState);
    renderAll();
    if (actionPayload && typeof SyncEngine !== 'undefined' && SyncEngine.broadcast) {
      SyncEngine.broadcast(actionPayload);
    }
  }

  function switchMonth(targetYear, targetMonth) {
    if (targetYear === currentYear && targetMonth === currentMonth) return;
    saveStateToStorage(appState);

    currentYear = targetYear;
    currentMonth = targetMonth;
    localStorage.setItem('tiffin_last_viewed_year', currentYear.toString());
    localStorage.setItem('tiffin_last_viewed_month', currentMonth.toString());

    CONFIG.year = currentYear;
    CONFIG.month = currentMonth;
    CONFIG.daysInMonth = getDaysInMonth(currentYear, currentMonth);
    CONFIG.todayDay = getDynamicTodayForMonth(currentYear, currentMonth);

    appState = loadStateForMonth(currentYear, currentMonth);
    selectedDay = CONFIG.todayDay;

    updateMonthUI();
    populateDateSelectors();
    renderAll();
    showToast(`📅 Switched to ${MONTH_NAMES[currentMonth - 1]} ${currentYear}`);
  }

  function updateMonthUI() {
    const monthShortStr = `${MONTH_SHORTS[currentMonth - 1]} ${currentYear}`;
    const monthFullStr = `${MONTH_NAMES[currentMonth - 1]} ${currentYear}`;

    const monthText = document.getElementById('headerMonthText');
    const dateStripMonthName = document.getElementById('dateStripMonthName');
    const sheetMonthText = document.getElementById('sheetMonthText');
    const sheetTitle = document.getElementById('sheetMatrixTitle');
    const sheetDaysSub = document.getElementById('sheetDaysSubLabel');
    const amulTitle = document.getElementById('amulSectionTitle');
    const splitRatesSub = document.getElementById('splitRatesSubtitle');

    if (monthText) monthText.textContent = monthShortStr;
    if (dateStripMonthName) dateStripMonthName.textContent = monthShortStr;
    if (sheetMonthText) sheetMonthText.textContent = monthShortStr;
    if (sheetTitle) sheetTitle.textContent = 'Master Matrix';
    if (sheetDaysSub) sheetDaysSub.textContent = `${CONFIG.daysInMonth} Days`;
    if (amulTitle) amulTitle.textContent = 'Amul Milk Tracker';
    if (splitRatesSub) splitRatesSub.textContent = `${monthFullStr} • Live Rates`;
  }

  function populateDateSelectors() {
    const daySelect = document.getElementById('daySelectInput');
    const pollDaySelect = document.getElementById('pollDaySelect');

    const fillSelect = (sel) => {
      if (!sel) return;
      sel.innerHTML = '';
      for (let d = 1; d <= CONFIG.daysInMonth; d++) {
        const opt = document.createElement('option');
        opt.value = d;
        const dateObj = new Date(currentYear, currentMonth - 1, d);
        const dayName = DAY_NAMES[dateObj.getDay()].slice(0, 3);
        opt.textContent = `Day ${d} (${dayName})`;
        sel.appendChild(opt);
      }
      sel.value = selectedDay;
    };

    fillSelect(daySelect);
    fillSelect(pollDaySelect);
  }

  // Convert base64 VAPID public key to Uint8Array for PushManager
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // ==========================================================================
  // NATIVE PHONE NOTIFICATION BAR SYSTEM (PWA / Web Push / Android / iOS)
  // ==========================================================================
  const NotificationManager = {
    VAPID_PUBLIC: 'BKdzxa4We0gIQMuW9gJedEKnTecB-PxOIS24zjIK4EFpScY5hXUsZu6n7rfKBnP_V-TMYO9NjxJlh8VnjWyoITM',
    currentSubscription: null,

    isSupported() {
      return ('Notification' in window);
    },

    getPermission() {
      return this.isSupported() ? Notification.permission : 'unsupported';
    },

    async getVapidPublicKey() {
      try {
        const res = await fetch('/api/vapid-public-key');
        if (res.ok) {
          const data = await res.json();
          if (data && data.publicKey) return data.publicKey;
        }
      } catch (e) {}
      return this.VAPID_PUBLIC;
    },

    async subscribeWebPush() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
      if (Notification.permission !== 'granted') return null;

      try {
        const reg = await navigator.serviceWorker.ready;
        if (!reg || !reg.pushManager) return null;

        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          const publicKey = await this.getVapidPublicKey();
          const convertedKey = urlBase64ToUint8Array(publicKey);
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedKey
          });
        }

        if (sub) {
          this.currentSubscription = sub;
          localStorage.setItem('tiffin_push_sub', JSON.stringify(sub));

          const activeRoom = (typeof SyncEngine !== 'undefined' && SyncEngine.roomCode) || 'default';
          const memberId = (typeof SyncEngine !== 'undefined' && SyncEngine.identity ? SyncEngine.identity : 'Anjan').toLowerCase();
          const memberName = (typeof SyncEngine !== 'undefined' && SyncEngine.identity) || 'Flatmate';

          fetch('/api/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roomCode: activeRoom,
              subscription: sub,
              memberId: memberId,
              memberName: memberName
            })
          }).catch(err => console.warn('[WebPush] Registration sync failed:', err));

          // Also exchange push subscription with room peers via sync broadcast
          if (typeof SyncEngine !== 'undefined' && typeof SyncEngine.broadcast === 'function') {
            SyncEngine.broadcast({
              type: 'push_sub_registered',
              roomCode: activeRoom,
              subscription: sub,
              memberId: memberId,
              memberName: memberName
            }).catch(() => {});
          }

          return sub;
        }
      } catch (err) {
        console.warn('[WebPush] Registration error:', err);
      }
      return null;
    },

    async sendWebPush(payload = {}) {
      const activeRoom = (typeof SyncEngine !== 'undefined' && SyncEngine.roomCode) || 'default';
      let mySub = this.currentSubscription;
      if (!mySub) {
        try {
          mySub = JSON.parse(localStorage.getItem('tiffin_push_sub') || 'null');
        } catch (e) {}
      }

      // Read peer subscriptions cached in localStorage
      let cachedSubs = [];
      try {
        const stored = JSON.parse(localStorage.getItem('tiffin_room_push_subs') || '{}');
        cachedSubs = Object.values(stored);
      } catch (e) {}

      const body = {
        roomCode: activeRoom,
        title: payload.title || 'Tiffin Tracker 🍲',
        body: payload.body || 'New meal update from flatmates!',
        tag: payload.tag || 'tiffin-alert',
        url: payload.url || './#view-poll',
        senderEndpoint: mySub ? mySub.endpoint : null,
        additionalSubscriptions: cachedSubs
      };

      try {
        await fetch('/api/send-push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      } catch (e) {
        console.warn('[WebPush] send-push request failed:', e);
      }
    },

    updateUI() {
      const btn = document.getElementById('pollNotificationBtn');
      const settingsBtn = document.getElementById('settingsNotificationBtn');
      const perm = this.getPermission();

      if (btn) {
        if (perm === 'granted') {
          btn.className = 'notification-status-chip';
          btn.title = 'Phone Notifications are enabled';
          btn.innerHTML = `<span class="pulse-dot"></span><span id="pollNotificationBtnText">Alerts Active</span>`;
        } else {
          btn.className = 'notification-chip-btn';
          btn.title = 'Tap to enable Phone Notification Bar Alerts';
          btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><span id="pollNotificationBtnText">Enable Alerts</span>`;
        }
      }

      if (settingsBtn) {
        settingsBtn.textContent = perm === 'granted' ? '✓ Phone Alerts Active (Tap to Test)' : 'Enable Phone Notification Bar Alerts';
      }
    },

    async requestPermission(showFeedback = true) {
      if (!this.isSupported()) {
        if (showFeedback) showToast('Notifications not supported by this browser.');
        return false;
      }

      try {
        const result = await Notification.requestPermission();
        this.updateUI();
        if (result === 'granted') {
          if (showFeedback) showToast('Phone alerts enabled! Sending test notification...');
          await this.send('Alerts Active', {
            body: 'You will receive phone alerts when a poll starts.',
            tag: 'tiffin-welcome'
          });
          // Register native Web Push subscription on Vercel backend
          await this.subscribeWebPush();
          if (appState && appState.activePoll && appState.activePoll.status === 'active') {
            PollReminderManager.start(appState.activePoll);
          }
          return true;
        } else if (result === 'denied' && showFeedback) {
          showToast('Notification permission was denied in browser settings.');
        }
      } catch (e) {
        console.warn('Error requesting notification permission', e);
      }
      return false;
    },

    async send(title, options = {}) {
      if (!this.isSupported() || Notification.permission !== 'granted') return;

      const defaultOpts = {
        icon: './icon.svg',
        badge: './icon.svg',
        vibrate: [250, 100, 250],
        tag: 'tiffin-alert',
        renotify: true,
        data: { url: window.location.href.split('#')[0] + '#view-poll' },
        ...options
      };

      // 1. Service Worker Notification (Primary for mobile Chrome / PWA / Android)
      // Wrapped in Promise.race with 1200ms timeout so it never hangs if SW is unready
      if ('serviceWorker' in navigator) {
        try {
          const reg = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((_, reject) => setTimeout(() => reject(new Error('SW ready timeout')), 1200))
          ]);
          if (reg && typeof reg.showNotification === 'function') {
            await reg.showNotification(title, defaultOpts);
            return;
          }
        } catch (swErr) {
          // SW timed out or not available, fallback to Desktop Notification constructor
        }
      }

      // 2. Desktop Browser Notification Fallback
      try {
        new Notification(title, defaultOpts);
      } catch (err) {
        console.warn('Desktop Notification constructor failed (expected on some mobile browsers):', err);
      }
    }
  };

  // Pleasant Web Audio alert chime for join requests & alerts
  function playJoinAlertChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // First pleasant chime tone (E5: 659.25Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.28, now + 0.04);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // Second tone (A5: 880Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.14);
      gain2.gain.setValueAtTime(0, now + 0.14);
      gain2.gain.linearRampToValueAtTime(0.32, now + 0.18);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.14);
      osc2.stop(now + 0.55);
    } catch (e) {
      // AudioContext could be blocked if no user interaction yet
    }
  }

  // Real-time floating in-app banner for Admin when flatmate knocks
  function showJoinRequestBanner(req) {
    if (!req) return;
    let banner = document.getElementById('joinRequestBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'joinRequestBanner';
      banner.className = 'join-request-banner';
      document.body.appendChild(banner);
    }

    const applicantName = req.name || 'New Member';
    const applicantPhone = req.phone ? `(${req.phone})` : '';

    banner.innerHTML = `
      <div class="join-banner-left">
        <span class="join-banner-icon">🔔</span>
        <div>
          <div class="join-banner-title"><strong>${escapeHtml(applicantName)}</strong> requested to join flat</div>
          <div class="join-banner-sub">${escapeHtml(applicantPhone)} • Room #${escapeHtml(req.roomCode || '')}</div>
        </div>
      </div>
      <div class="join-banner-actions">
        <button class="join-banner-admit-btn" id="bannerAdmitBtn">Admit (1-Tap)</button>
        <button class="join-banner-review-btn" id="bannerReviewBtn">Review</button>
        <button class="join-banner-close-btn" id="bannerCloseBtn" title="Dismiss">✕</button>
      </div>
    `;

    banner.classList.add('active');

    const admitBtn = banner.querySelector('#bannerAdmitBtn');
    if (admitBtn) {
      admitBtn.addEventListener('click', () => {
        triggerHaptic();
        RoomManager.approveRequest(req.id);
      });
    }

    const reviewBtn = banner.querySelector('#bannerReviewBtn');
    if (reviewBtn) {
      reviewBtn.addEventListener('click', () => {
        triggerHaptic();
        banner.classList.remove('active');
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) {
          settingsModal.classList.add('active');
          document.querySelectorAll('.sub-tab').forEach(t => {
            t.classList.toggle('active', t.getAttribute('data-subtab') === 'members');
          });
          document.querySelectorAll('.subtab-content').forEach(c => {
            c.classList.toggle('active', c.id === 'subtab-members');
          });
          RoomManager.renderSettingsMembersTab();
        }
      });
    }

    const closeBtn = banner.querySelector('#bannerCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        banner.classList.remove('active');
      });
    }

    setTimeout(() => {
      if (banner && banner.parentNode) {
        banner.classList.remove('active');
      }
    }, 14000);
  }

  // ==========================================================================
  // POLL 5-MINUTE RECURRING REMINDER MANAGER
  // ==========================================================================
  const PollReminderManager = {
    intervalId: null,
    REMINDER_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes

    hasUserVoted(poll) {
      if (!poll || !poll.votes) return false;
      const myRaw = (typeof SyncEngine !== 'undefined' && SyncEngine.identity ? SyncEngine.identity : '').trim().toLowerCase();
      if (!myRaw) return false;
      if (poll.votes[myRaw]) return true;
      if (poll.votes[myRaw.replace(/\s+/g, '_')]) return true;
      if (typeof ROOMMATES !== 'undefined' && Array.isArray(ROOMMATES)) {
        const found = ROOMMATES.find(r => (r.name && r.name.toLowerCase() === myRaw) || (r.id && r.id.toLowerCase() === myRaw));
        if (found) {
          if (poll.votes[found.id] || (found.name && poll.votes[found.name.toLowerCase()])) return true;
        }
      }
      return false;
    },

    start(poll) {
      if (!poll || poll.status !== 'active') {
        this.stop();
        return;
      }

      // If user has already voted, do not remind
      if (this.hasUserVoted(poll)) {
        this.stop();
        hidePollAlertBanner();
        return;
      }

      // Record baseline reminder timestamp if not present
      const pollKey = 'tiffin_poll_remind_' + poll.id;
      if (!localStorage.getItem(pollKey)) {
        localStorage.setItem(pollKey, Date.now().toString());
      }

      // Keep Service Worker informed for background notification dispatch
      try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'START_POLL_REMINDER',
            pollId: poll.id,
            mealSlot: poll.mealSlot,
            options: (poll.options || []).join(' vs '),
            day: poll.day
          });
        }
      } catch (e) {}

      // Keep client-side check running every 30 seconds
      if (!this.intervalId) {
        this.intervalId = setInterval(() => {
          this.checkAndRemind();
        }, 30000);
      }
    },

    checkAndRemind() {
      const poll = appState ? appState.activePoll : null;
      if (!poll || poll.status !== 'active') {
        this.stop();
        return;
      }

      if (this.hasUserVoted(poll)) {
        this.stop(poll.id);
        hidePollAlertBanner();
        return;
      }

      const pollKey = 'tiffin_poll_remind_' + poll.id;
      const lastReminded = parseInt(localStorage.getItem(pollKey) || '0', 10);
      const now = Date.now();

      if (now - lastReminded >= this.REMINDER_INTERVAL_MS) {
        localStorage.setItem(pollKey, now.toString());
        const meal = poll.mealSlot || 'Dinner';
        NotificationManager.send(`Poll Reminder: ${meal}`, {
          body: `Please cast your vote for ${meal}. Options: ${(poll.options || []).join(' vs ')}`,
          tag: 'poll-reminder-' + poll.id,
          renotify: true,
          vibrate: [300, 150, 300]
        });
        playJoinAlertChime();
        showPollAlertBanner(poll);
        showToast(`⏰ Reminder: Please vote in the ${meal} Poll!`);
      }
    },

    stop(pollId) {
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      if (pollId) {
        localStorage.removeItem('tiffin_poll_remind_' + pollId);
      } else if (appState && appState.activePoll) {
        localStorage.removeItem('tiffin_poll_remind_' + appState.activePoll.id);
      }

      try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'STOP_POLL_REMINDER'
          });
        }
      } catch (e) {}
    }
  };

  // Real-time floating in-app banner when a meal poll is active and user hasn't voted
  function showPollAlertBanner(poll) {
    if (!poll || poll.status !== 'active') return;
    if (PollReminderManager.hasUserVoted(poll)) {
      hidePollAlertBanner();
      return;
    }

    let banner = document.getElementById('pollAlertBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'pollAlertBanner';
      banner.className = 'poll-alert-banner';
      document.body.appendChild(banner);
    }

    const meal = poll.mealSlot || 'Dinner';
    const author = poll.author || 'Flatmate';
    const optionsText = (poll.options || []).join(' vs ');

    banner.innerHTML = `
      <div class="poll-banner-left">
        <span class="poll-banner-icon">🍲</span>
        <div class="poll-banner-text-group">
          <div class="poll-banner-title"><strong>New ${escapeHtml(meal)} Poll</strong> • By ${escapeHtml(author)}</div>
          <div class="poll-banner-sub">${escapeHtml(optionsText)}</div>
        </div>
      </div>
      <div class="poll-banner-actions">
        <button class="poll-banner-vote-btn" id="bannerVoteNowBtn">
          <span>Vote Now</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </button>
        <button class="poll-banner-close-btn" id="bannerPollCloseBtn" title="Dismiss">✕</button>
      </div>
    `;

    banner.classList.add('active');

    const voteBtn = banner.querySelector('#bannerVoteNowBtn');
    if (voteBtn) {
      voteBtn.addEventListener('click', () => {
        triggerHaptic();
        banner.classList.remove('active');
        // Switch to Poll view tab
        document.querySelectorAll('.nav-tab, .m-nav-tab').forEach(t => {
          t.classList.toggle('active', t.getAttribute('data-tab') === 'poll');
        });
        document.querySelectorAll('.view-panel').forEach(panel => {
          panel.classList.toggle('active', panel.id === 'view-poll');
        });
        renderPollView();
        const voteBox = document.getElementById('myVoteBox');
        if (voteBox) {
          voteBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }

    const closeBtn = banner.querySelector('#bannerPollCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        banner.classList.remove('active');
      });
    }
  }

  function hidePollAlertBanner() {
    const banner = document.getElementById('pollAlertBanner');
    if (banner) {
      banner.classList.remove('active');
    }
  }

  // Create lean, reliable sync snapshot (< 2KB) preventing NTFY attachment conversion
  function getCompactSyncState(state) {
    if (!state || !state.days) return null;
    const compactDays = {};
    for (let d = 1; d <= CONFIG.daysInMonth; d++) {
      const day = state.days[d];
      if (!day) continue;
      const hasSabzi = !!day.sabzi;
      const hasMeals = day.meals && Object.values(day.meals).some(m => m && (m.lunch || m.dinner));
      const hasTimestamps = day.mealTimestamps && Object.keys(day.mealTimestamps).length > 0;
      const hasAmul = day.amul && Object.values(day.amul).some(v => v > 0);

      if (hasSabzi || hasMeals || hasTimestamps || hasAmul) {
        compactDays[d] = {
          sabzi: day.sabzi || '',
          sabziUpdatedAt: day.sabziUpdatedAt || 0,
          meals: day.meals || {},
          mealTimestamps: day.mealTimestamps || {},
          amul: day.amul || {},
          amulTimestamps: day.amulTimestamps || {}
        };
      }
    }

    return {
      version: state.version || 4,
      year: state.year || currentYear,
      month: state.month || currentMonth,
      lastModified: state.lastModified || new Date().toISOString(),
      rates: state.rates || CONFIG.defaultRates,
      provider: state.provider || CONFIG.defaultProvider,
      days: compactDays,
      activePoll: state.activePoll || null
    };
  }

  // ==========================================================================
  // REAL-TIME MULTI-USER CLOUD SYNC ENGINE
  // ==========================================================================
  const SyncEngine = {
    roomCode: CONFIG.defaultRoom,
    identity: 'Anjan',
    eventSource: null,
    status: 'disconnected',
    processedMessageIds: new Set(),

    init() {
      // 1. Room code from URL parameter, hash or storage
      const urlParams = new URLSearchParams(window.location.search);
      const queryRoom = urlParams.get('room') || urlParams.get('join');
      const hashMatch = window.location.hash.match(/#room=([a-zA-Z0-9_-]+)/);
      const urlRoom = queryRoom || (hashMatch ? hashMatch[1] : null);

      if (urlRoom) {
        this.roomCode = urlRoom.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
        localStorage.setItem('tiffin_sync_room', this.roomCode);
      } else {
        const activeRoom = RoomManager.session?.roomCode || RoomManager.activeRoom?.code;
        if (activeRoom) {
          this.roomCode = activeRoom.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
        } else {
          this.roomCode = localStorage.getItem('tiffin_sync_room') || CONFIG.defaultRoom;
        }
      }

      // 2. Roommate Identity
      this.identity = localStorage.getItem('tiffin_my_identity') || RoomManager.session?.name || 'Anjan';
      updateIdentityUI(this.identity);

      // 3. Connect EventSource
      this.connect();

      // 4. Catch up poll
      this.catchUp();

      // 5. Periodic resilience catch-up (every 30s) to keep all devices synced even through mobile sleep
      if (this.resilienceTimer) clearInterval(this.resilienceTimer);
      this.resilienceTimer = setInterval(() => {
        if (document.visibilityState === 'visible') {
          this.catchUp();
        }
      }, 30000);

      // 6. Setup 5-minute Poll Reminder Check & In-App Banner
      if (appState && appState.activePoll && appState.activePoll.status === 'active') {
        if (!PollReminderManager.hasUserVoted(appState.activePoll)) {
          showPollAlertBanner(appState.activePoll);
          PollReminderManager.start(appState.activePoll);
        } else {
          hidePollAlertBanner();
          PollReminderManager.stop(appState.activePoll.id);
        }
      }

      // 7. Auto-ensure native Web Push subscription with Vercel backend
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        NotificationManager.subscribeWebPush();
      }
    },

    setRoomCode(newRoom) {
      if (!newRoom) return;
      const clean = newRoom.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      if (clean === this.roomCode) return;
      this.roomCode = clean;
      localStorage.setItem('tiffin_sync_room', this.roomCode);
      this.processedMessageIds.clear();

      if (this.eventSource) {
        try { this.eventSource.close(); } catch (e) {}
        this.eventSource = null;
      }

      this.connect();
      this.catchUp();
      NotificationManager.subscribeWebPush();
      showToast(`Switched to room #${this.roomCode}`);
    },

    setIdentity(name) {
      this.identity = name;
      localStorage.setItem('tiffin_my_identity', name);
      updateIdentityUI(name);

      if (appState && appState.activePoll && appState.activePoll.status === 'active') {
        if (PollReminderManager.hasUserVoted(appState.activePoll)) {
          PollReminderManager.stop(appState.activePoll.id);
          hidePollAlertBanner();
        } else {
          showPollAlertBanner(appState.activePoll);
          PollReminderManager.start(appState.activePoll);
        }
      }
    },

    updateStatusUI(status, label) {
      this.status = status;
      const btn = document.getElementById('liveSyncStatusBtn');
      const lbl = document.getElementById('syncStatusLabel');
      const modalTitle = document.getElementById('modalSyncStatusTitle');
      const modalDesc = document.getElementById('modalSyncStatusDesc');
      const roomInput = document.getElementById('roomCodeInput');

      if (btn) {
        btn.className = `sync-status-btn ${status}`;
        btn.title = `Cloud Sync: ${status}. Room: #${this.roomCode}. Tap for settings.`;
      }
      if (lbl) {
        lbl.textContent = label || (status === 'connected' ? 'Connected' : status === 'syncing' ? 'Syncing...' : 'Offline');
      }
      const settingsSync = document.getElementById('settingsSyncStatusText');
      if (settingsSync) {
        settingsSync.textContent = status === 'connected' ? `Cloud Sync: Connected (#${this.roomCode})` : status === 'syncing' ? 'Cloud Sync: Syncing...' : 'Cloud Sync: Offline';
      }
      if (modalTitle) {
        modalTitle.textContent = status === 'connected' ? `Connected (#${this.roomCode})` : status === 'syncing' ? 'Syncing with flatmates...' : 'Connecting to Cloud Room...';
      }
      if (modalDesc) {
        modalDesc.textContent = status === 'connected'
          ? `Connected in real-time to room #${this.roomCode}. Changes made on any phone appear instantly on all devices.`
          : `Establishing real-time connection to room #${this.roomCode}...`;
      }
      if (roomInput && document.activeElement !== roomInput) {
        roomInput.value = this.roomCode;
      }
    },

    connect() {
      if (this.eventSource) {
        try { this.eventSource.close(); } catch (e) {}
      }

      this.updateStatusUI('syncing', 'Connecting...');
      const url = `https://ntfy.sh/${encodeURIComponent(this.roomCode)}/sse`;

      try {
        this.eventSource = new EventSource(url);

        this.eventSource.onopen = () => {
          this.updateStatusUI('connected', 'Connected');
        };

        this.eventSource.onmessage = async (event) => {
          try {
            const raw = JSON.parse(event.data);
            if (raw.event === 'message') {
              if (this.processedMessageIds.has(raw.id)) return;
              this.processedMessageIds.add(raw.id);
              await this.processRawEvent(raw, false);
            }
          } catch (e) {
            console.warn('Sync parse error', e);
          }
        };

        this.eventSource.onerror = () => {
          this.updateStatusUI('offline', 'Reconnecting');
        };
      } catch (err) {
        console.warn('EventSource failed', err);
        this.updateStatusUI('offline', 'Offline');
      }
    },

    async catchUp() {
      try {
        const res = await fetch(`https://ntfy.sh/${encodeURIComponent(this.roomCode)}/json?poll=1&since=all`);
        if (!res.ok) return;
        const text = await res.text();
        const lines = text.trim().split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const raw = JSON.parse(line);
            if (raw.event === 'message' && !this.processedMessageIds.has(raw.id)) {
              this.processedMessageIds.add(raw.id);
              await this.processRawEvent(raw, true);
            }
          } catch (e) {}
        }
      } catch (e) {
        console.warn('Catch-up failed', e);
      }
    },

    async processRawEvent(raw, isCatchUp = false) {
      let payload = raw.message;
      if (raw.attachment && raw.attachment.url && (payload?.startsWith('You received a file:') || !payload || payload.startsWith('attachment'))) {
        try {
          const fileRes = await fetch(raw.attachment.url);
          if (fileRes.ok) {
            payload = await fileRes.text();
          }
        } catch (e) {}
      }
      if (payload) {
        this.handlePayload(payload, isCatchUp);
      }
    },

    async broadcast(action) {
      action.author = this.identity;
      action.timestamp = action.timestamp || Date.now();
      action.sourceId = this.getClientId();
      action.year = action.year || currentYear;
      action.month = action.month || currentMonth;

      const targetRoom = (action.roomCode || this.roomCode || CONFIG.defaultRoom)
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-');

      this.updateStatusUI('syncing', 'Syncing...');
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (action.type === 'join_request') {
          headers['Title'] = 'Flatmate Knocking! 🔔';
          headers['Priority'] = 'high';
          headers['Tags'] = 'bell,door';
        } else if (action.type === 'poll_created') {
          const meal = action.poll?.mealSlot || 'Dinner';
          headers['Title'] = `🍲 New ${meal} Poll!`;
          headers['Priority'] = 'high';
          headers['Tags'] = 'ballot_box,curry';
          headers['Click'] = window.location.href.split('#')[0] + '#view-poll';
          headers['Actions'] = `view, Vote Now, ${window.location.href.split('#')[0]}#view-poll`;
        } else if (action.type === 'poll_voted') {
          headers['Title'] = `🗳️ Vote Cast: ${action.author || 'Flatmate'}`;
          headers['Priority'] = 'default';
          headers['Tags'] = 'white_check_mark';
          headers['Click'] = window.location.href.split('#')[0] + '#view-poll';
        } else if (action.type === 'poll_finalized') {
          headers['Title'] = `🏆 Menu Decided: ${action.winner}`;
          headers['Priority'] = 'high';
          headers['Tags'] = 'trophy,curry';
          headers['Click'] = window.location.href.split('#')[0] + '#view-poll';
        }
        await fetch(`https://ntfy.sh/${encodeURIComponent(targetRoom)}`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(action)
        });

        // Trigger Native Web Push directly via Vercel serverless function to alert closed phones
        if (action.type === 'poll_created') {
          const meal = action.poll?.mealSlot || 'Dinner';
          NotificationManager.sendWebPush({
            title: `🍲 New ${meal} Poll!`,
            body: `${action.author || 'Flatmate'} created a poll! Tap to cast your vote.`,
            tag: 'poll-created-' + (action.poll?.id || Date.now()),
            url: window.location.href.split('#')[0] + '#view-poll'
          });
        } else if (action.type === 'poll_voted') {
          NotificationManager.sendWebPush({
            title: `🗳️ Vote Cast: ${action.author || 'Flatmate'}`,
            body: `${action.author || 'A flatmate'} just voted in the meal poll.`,
            tag: 'poll-vote',
            url: window.location.href.split('#')[0] + '#view-poll'
          });
        } else if (action.type === 'poll_finalized') {
          NotificationManager.sendWebPush({
            title: `🏆 Menu Decided: ${action.winner || 'Meal finalized'}`,
            body: `Decision locked in for ${action.mealSlot || 'today'}: ${action.winner}!`,
            tag: 'poll-final',
            url: window.location.href.split('#')[0] + '#view-poll'
          });
        } else if (action.type === 'poll_cancelled') {
          NotificationManager.sendWebPush({
            title: `🚫 Poll Cancelled`,
            body: `${action.author || 'Flatmate'} cancelled the active poll.`,
            tag: 'poll-cancel',
            url: window.location.href.split('#')[0] + '#view-poll'
          });
        } else if (action.type === 'join_request') {
          NotificationManager.sendWebPush({
            title: `Flatmate Knocking! 🔔`,
            body: `${action.author || 'Someone'} requested to join room #${targetRoom}`,
            tag: 'room-join',
            url: window.location.href.split('#')[0]
          });
        }

        setTimeout(() => {
          if (this.status === 'syncing') this.updateStatusUI('connected', 'Connected');
        }, 300);
      } catch (e) {
        console.warn('Broadcast failed', e);
        this.updateStatusUI('offline', 'Sync Error');
      }
    },

    async broadcastFullState(reason) {
      logActivity(this.identity, 'Broadcast Full Ledger', reason || 'Full cloud sync');
      await this.broadcast({
        type: 'room_meta_sync',
        roomCode: this.roomCode,
        roomData: RoomManager.activeRoom,
        state: getCompactSyncState(appState)
      });
      showToast('Broadcasted complete ledger to all flatmates');
    },

    handlePayload(rawPayload, isCatchUp = false) {
      let action;
      try {
        action = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
      } catch (e) {
        return;
      }

      // During live streaming, ignore self-echo to avoid redundant notifications/chimes.
      // During catch-up, process own actions so the chronological state is preserved.
      if (action.sourceId && action.sourceId === this.getClientId() && !isCatchUp) {
        return;
      }

      // If action belongs to a different month, persist silently in background (only for month-scoped data)
      const isGlobalAction = action.type && (
        action.type.startsWith('poll_') ||
        action.type.startsWith('room_') ||
        action.type.startsWith('member_') ||
        action.type.startsWith('join_') ||
        action.type.startsWith('push_')
      );
      if (!isGlobalAction && action.year && action.month && (action.year !== currentYear || action.month !== currentMonth)) {
        try {
          const otherState = loadStateForMonth(action.year, action.month);
          const msgTime = Number(action.timestamp || 0);
          if (action.type === 'meal_update' && otherState.days[action.day]) {
            if (!otherState.days[action.day].mealTimestamps) otherState.days[action.day].mealTimestamps = {};
            const key = `${action.person}_${action.slot}`;
            const existingTime = Number(otherState.days[action.day].mealTimestamps[key] || 0);
            if (!msgTime || !existingTime || msgTime >= existingTime) {
              otherState.days[action.day].meals[action.person][action.slot] = action.value;
              otherState.days[action.day].mealTimestamps[key] = msgTime || Date.now();
            }
          } else if (action.type === 'sabzi_update' && otherState.days[action.day]) {
            const existingTime = Number(otherState.days[action.day].sabziUpdatedAt || 0);
            if (!msgTime || !existingTime || msgTime >= existingTime) {
              otherState.days[action.day].sabzi = action.sabzi;
              otherState.days[action.day].sabziUpdatedAt = msgTime || Date.now();
            }
          } else if (action.type === 'amul_update' && otherState.days[action.day]) {
            if (!otherState.days[action.day].amul) otherState.days[action.day].amul = {};
            otherState.days[action.day].amul[action.person] = action.value;
          } else if (action.type === 'day_reset' && otherState.days[action.day]) {
            otherState.days[action.day].sabzi = '';
            ROOMMATES.forEach(r => {
              if (otherState.days[action.day].meals && otherState.days[action.day].meals[r.id]) {
                otherState.days[action.day].meals[r.id] = { lunch: '', dinner: '' };
              }
            });
          } else if (action.type === 'month_reset') {
            const cleanOther = getDefaultDataForMonth(action.year, action.month);
            cleanOther.rates = otherState.rates;
            cleanOther.provider = otherState.provider;
            cleanOther.amulMembers = otherState.amulMembers;
            saveStateForMonth(action.year, action.month, cleanOther);
            return;
          }
          saveStateForMonth(action.year, action.month, otherState);
        } catch (e) {}
        return;
      }

      let modified = false;

      if (action.type === 'meal_update') {
        const { day, person, slot, value, author, timestamp } = action;
        const msgTime = Number(timestamp || action.time || 0);

        if (appState.days && appState.days[day] && appState.days[day].meals && appState.days[day].meals[person]) {
          if (!appState.days[day].mealTimestamps) appState.days[day].mealTimestamps = {};
          const existingTime = Number(appState.days[day].mealTimestamps[`${person}_${slot}`] || 0);

          // Reject older stale updates
          if (msgTime && existingTime && msgTime < existingTime) {
            console.log(`[Sync] Stale meal_update ignored (${msgTime} < ${existingTime}) for ${person} ${slot}`);
            return;
          }

          const oldVal = appState.days[day].meals[person][slot];
          if (oldVal !== value) {
            appState.days[day].meals[person][slot] = value;
            appState.days[day].mealTimestamps[`${person}_${slot}`] = msgTime || Date.now();
            logActivity(author, 'Meal Update', `${capitalize(person)} ${slot}: ${oldVal || 'Off'} ➜ ${value || 'Off'} (Day ${day})`);
            modified = true;
            if (!isCatchUp) {
              showToast(`⚡ ${author} updated ${capitalize(person)}'s ${slot}: ${value || 'Off'}`);
            }
          } else if (msgTime && msgTime > existingTime) {
            appState.days[day].mealTimestamps[`${person}_${slot}`] = msgTime;
            modified = true;
          }
        }
      } else if (action.type === 'sabzi_update') {
        const { day, sabzi, author, timestamp } = action;
        const msgTime = Number(timestamp || action.time || 0);
        if (appState.days && appState.days[day]) {
          const existingTime = Number(appState.days[day].sabziUpdatedAt || 0);
          if (msgTime && existingTime && msgTime < existingTime) {
            console.log(`[Sync] Stale sabzi ignored (${msgTime} < ${existingTime})`);
            return;
          }
          if (appState.days[day].sabzi !== sabzi) {
            appState.days[day].sabzi = sabzi;
            appState.days[day].sabziUpdatedAt = msgTime || Date.now();
            logActivity(author, 'Sabzi Update', `Day ${day} dish set to "${sabzi}"`);
            modified = true;
            if (!isCatchUp) {
              showToast(`⚡ ${author} set dish to "${sabzi}"`);
            }
          }
        }
      } else if (action.type === 'bulk_dinner_half') {
        const { day, author, timestamp } = action;
        const msgTime = Number(timestamp || Date.now());
        if (appState.days && appState.days[day]) {
          if (!appState.days[day].mealTimestamps) appState.days[day].mealTimestamps = {};
          ROOMMATES.forEach(r => {
            if (appState.days[day].meals && appState.days[day].meals[r.id]) {
              appState.days[day].meals[r.id].dinner = 'Half';
              appState.days[day].mealTimestamps[`${r.id}_dinner`] = msgTime;
            }
          });
          logActivity(author, 'Bulk Dinner Half', `Marked all roommates Dinner Half for Day ${day}`);
          modified = true;
          if (!isCatchUp) {
            showToast(`⚡ ${author} marked all dinner Half`);
          }
        }
      } else if (action.type === 'amul_update') {
        const { day, person, value, author, timestamp } = action;
        const msgTime = Number(timestamp || 0);
        if (appState.days && appState.days[day]) {
          if (!appState.days[day].amul) appState.days[day].amul = {};
          if (!appState.days[day].amulTimestamps) appState.days[day].amulTimestamps = {};
          const existingTime = Number(appState.days[day].amulTimestamps[person] || 0);
          if (msgTime && existingTime && msgTime < existingTime) {
            return;
          }
          if (appState.days[day].amul[person] !== value) {
            appState.days[day].amul[person] = value;
            appState.days[day].amulTimestamps[person] = msgTime || Date.now();
            logActivity(author, 'Milk Update', `${capitalize(person)} milk packets: ${value} (Day ${day})`);
            modified = true;
          }
        }
      } else if (action.type === 'poll_created') {
        if (appState.activePoll && appState.activePoll.id !== action.poll.id) {
          appState.pollHistory = appState.pollHistory || [];
          const exists = appState.pollHistory.some(p => p.id === appState.activePoll.id);
          if (!exists) appState.pollHistory.unshift(appState.activePoll);
        }
        appState.activePoll = action.poll;
        logActivity(action.author, 'Created Poll', `${action.poll.mealSlot} Poll for Day ${action.poll.day}: ${action.poll.options.join(', ')}`);
        modified = true;

        const hasVoted = PollReminderManager.hasUserVoted(action.poll);
        const pollAlertKey = 'tiffin_notified_poll_' + action.poll.id;
        const alreadyNotified = sessionStorage.getItem(pollAlertKey);

        if (!hasVoted) {
          // Alert user if not already alerted during this session, or if live incoming
          if (!alreadyNotified || !isCatchUp) {
            sessionStorage.setItem(pollAlertKey, 'true');
            showToast(`🍲 New ${action.poll.mealSlot} Poll from ${action.author}! Tap to vote.`);
            playJoinAlertChime();
            if (navigator.vibrate) navigator.vibrate([250, 100, 250, 100, 350]);
            NotificationManager.send(`🍲 New ${action.poll.mealSlot || 'Meal'} Poll!`, {
              body: `Launched by ${action.author || 'Flatmate'}. Tap to choose your sabzi!`,
              tag: 'poll-' + action.poll.id,
              renotify: true
            });
            showPollAlertBanner(action.poll);
          }
          localStorage.setItem('tiffin_poll_remind_' + action.poll.id, Date.now().toString());
          PollReminderManager.start(action.poll);
        } else {
          hidePollAlertBanner();
          PollReminderManager.stop(action.poll.id);
        }
      } else if (action.type === 'poll_voted') {
        if (appState.activePoll && appState.activePoll.id === action.pollId) {
          if (!appState.activePoll.votes) appState.activePoll.votes = {};
          appState.activePoll.votes[action.roommateId] = {
            option: action.option,
            portion: action.portion,
            time: action.timestamp
          };
          logActivity(action.author, 'Cast Vote', `Voted "${action.option}" (${action.portion})`);
          modified = true;

          const myId = (SyncEngine.identity || '').toLowerCase();
          const hasMyVote = PollReminderManager.hasUserVoted(appState.activePoll);

          if (action.roommateId === myId || (action.author && action.author.toLowerCase() === myId)) {
            PollReminderManager.stop(action.pollId);
            hidePollAlertBanner();
          }

          if (!isCatchUp) {
            if (hasMyVote) {
              showToast(`${action.author} voted for ${action.option}`);
            } else {
              showToast(`🗳️ ${action.author} cast their vote in ${appState.activePoll.mealSlot} Poll! Tap to vote.`);
              playJoinAlertChime();
              if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
              NotificationManager.send(`${appState.activePoll.mealSlot || 'Meal'} Poll Update`, {
                body: `${action.author} voted! Don't forget to cast your choice.`,
                tag: 'poll-vote-' + action.pollId
              });
              showPollAlertBanner(appState.activePoll);
            }
          }
        }
      } else if (action.type === 'poll_finalized') {
        hidePollAlertBanner();
        if (appState.activePoll) {
          PollReminderManager.stop(appState.activePoll.id);
          appState.activePoll.status = 'finalized';
          appState.activePoll.winner = action.winner;

          appState.pollHistory = appState.pollHistory || [];
          const idx = appState.pollHistory.findIndex(p => p.id === appState.activePoll.id);
          if (idx >= 0) {
            appState.pollHistory[idx] = { ...appState.activePoll };
          } else {
            appState.pollHistory.unshift({ ...appState.activePoll });
          }
        }
        // Apply winner sabzi to ledger
        if (action.day && appState.days[action.day]) {
          appState.days[action.day].sabzi = action.winner;
          if (action.mealsApplied) {
            Object.entries(action.mealsApplied).forEach(([rId, portion]) => {
              const slot = (action.mealSlot || 'Dinner').toLowerCase();
              if (appState.days[action.day].meals[rId]) {
                appState.days[action.day].meals[rId][slot] = portion === 'Off' ? '' : portion;
              }
            });
          }
        }
        logActivity(action.author, 'Finalized Poll', `Winner dish: ${action.winner}`);
        modified = true;
        if (!isCatchUp) {
          playJoinAlertChime();
          showToast(`🏆 Poll Finalized: ${action.winner}`);
          NotificationManager.send(`Poll Finalized: ${action.winner}`, {
            body: `${action.mealSlot || 'Meal'} decided. Tap to view.`,
            tag: 'poll-winner-' + action.day,
            renotify: true
          });
        }
      } else if (action.type === 'poll_cancelled') {
        hidePollAlertBanner();
        if (appState.activePoll) {
          PollReminderManager.stop(appState.activePoll.id);
          const targetDay = action.day || appState.activePoll.day;
          const targetWinner = action.winner || appState.activePoll.winner;
          if (targetDay && appState.days[targetDay] && targetWinner && appState.days[targetDay].sabzi === targetWinner) {
            appState.days[targetDay].sabzi = '';
            appState.days[targetDay].sabziUpdatedAt = Date.now();
          }
          appState.activePoll = null;
          modified = true;
          if (!isCatchUp) showToast('Active poll was cancelled.');
        }
      } else if (action.type === 'poll_history_delete') {
        if (appState.pollHistory && action.pollId) {
          const toDelete = appState.pollHistory.find(p => p.id === action.pollId);
          const targetDay = action.day || (toDelete ? toDelete.day : null);
          const targetWinner = action.winner || (toDelete ? toDelete.winner : null);
          if (targetDay && appState.days[targetDay] && targetWinner && appState.days[targetDay].sabzi === targetWinner) {
            appState.days[targetDay].sabzi = '';
            appState.days[targetDay].sabziUpdatedAt = Date.now();
          }
          appState.pollHistory = appState.pollHistory.filter(p => p.id !== action.pollId);
          modified = true;
        }
      } else if (action.type === 'poll_history_clear') {
        appState.pollHistory = [];
        modified = true;
      } else if (action.type === 'amul_members_update') {
        if (Array.isArray(action.members) && action.members.length > 0) {
          appState.amulMembers = action.members;
          logActivity(action.author, 'Milk Members', `Updated Amul milk tracker members`);
          modified = true;
        }
      } else if (action.type === 'rates_updated') {
        appState.rates = action.rates;
        logActivity(action.author, 'Rates Updated', `Half: ₹${action.rates.half}, Full: ₹${action.rates.full}, Special: ₹${action.rates.special}`);
        modified = true;
        if (!isCatchUp) {
          showToast(`Meal rates updated by ${action.author}`);
        }
      } else if (action.type === 'day_reset') {
        const { day, author } = action;
        if (appState.days && appState.days[day]) {
          appState.days[day].sabzi = '';
          ROOMMATES.forEach(r => {
            if (appState.days[day].meals && appState.days[day].meals[r.id]) {
              appState.days[day].meals[r.id] = { lunch: '', dinner: '' };
            }
          });
          logActivity(author, 'Admin Action', `Reset meals for Day ${day}`);
          modified = true;
          if (!isCatchUp) {
            showToast(`⚡ ${author} reset Day ${day} meals`);
          }
        }
      } else if (action.type === 'month_reset') {
        const { year, month, author } = action;
        if (year === currentYear && month === currentMonth) {
          const cleanState = getDefaultDataForMonth(currentYear, currentMonth);
          cleanState.rates = { ...appState.rates };
          cleanState.provider = { ...appState.provider };
          cleanState.amulMembers = [...(appState.amulMembers || ['anjan', 'saurabh'])];
          appState = cleanState;
          logActivity(author, 'Admin Action', `Hard Reset: Erased month ledger for ${MONTH_NAMES[currentMonth - 1]} ${currentYear}`);
          modified = true;
          if (!isCatchUp) {
            showToast(`⚠️ Entire ledger for ${MONTH_NAMES[currentMonth - 1]} ${currentYear} reset by ${author}`);
          }
        }
      } else if (action.type === 'join_request') {
        const reqRoom = (action.roomCode || '').toString().toUpperCase().trim();
        const myActiveRoom = RoomManager.activeRoom;
        const mySession = RoomManager.session;
        const myCode = (myActiveRoom?.code || mySession?.roomCode || SyncEngine.roomCode || '').toString().toUpperCase().trim();
        const isAdmin = mySession?.role === 'admin' ||
                        (myActiveRoom && (
                          (mySession && myActiveRoom.adminPhone === mySession.phone) ||
                          (mySession && myActiveRoom.adminName === mySession.name) ||
                          (!mySession && myActiveRoom)
                        ));

        if (isAdmin && (reqRoom === myCode || !reqRoom || reqRoom === (SyncEngine.roomCode || '').toString().toUpperCase().trim())) {
          if (!RoomManager.activeRoom && myCode) {
            RoomManager.loadRoom(myCode);
          }
          if (RoomManager.activeRoom) {
            if (!RoomManager.activeRoom.pendingRequests) RoomManager.activeRoom.pendingRequests = [];
            const req = action.request || {};
            const reqName = (req.name || '').trim();
            const reqPhone = (req.phone || '').trim();

            const exists = (RoomManager.activeRoom.pendingRequests || []).some(p =>
              (reqPhone && p.phone === reqPhone) ||
              (reqName && p.name.toLowerCase() === reqName.toLowerCase())
            ) || (RoomManager.activeRoom.members || []).some(m =>
              (reqPhone && m.phone === reqPhone) ||
              (reqName && m.name.toLowerCase() === reqName.toLowerCase())
            );

            if (!exists && reqName) {
              RoomManager.activeRoom.pendingRequests.push(req);
              RoomManager.saveActiveRoom();
              RoomManager.updatePendingBadges();
              RoomManager.renderSettingsMembersTab();

              // Trigger pleasant alert chime and vibration
              playJoinAlertChime();
              if (navigator.vibrate) navigator.vibrate([250, 100, 250, 100, 350]);

              // Native push notification
              NotificationManager.send('Flatmate Knocking! 🔔', {
                body: `${reqName} ${reqPhone ? `(${reqPhone})` : ''} requested to join room #${RoomManager.activeRoom.code}. Tap to admit.`,
                tag: 'join-req-' + (req.id || Date.now()),
                renotify: true
              });

              // 1-Tap in-app top banner for instant admin action
              showJoinRequestBanner(req);
              showToast(`🔔 New join request from ${reqName}!`);
            }
          }
        }
      } else if (action.type === 'member_approved') {
        const targetRoom = (action.roomCode || '').toString().toUpperCase().trim();
        const myRoom = (RoomManager.session?.roomCode || SyncEngine.roomCode || '').toString().toUpperCase().trim();

        if (targetRoom === myRoom || !targetRoom || !myRoom) {
          if (RoomManager.session && RoomManager.session.status === 'pending') {
            const myPhone = (RoomManager.session.phone || '').trim();
            const myName = (RoomManager.session.name || '').trim().toLowerCase();
            const approvedPhone = (action.member?.phone || '').trim();
            const approvedName = (action.member?.name || '').trim().toLowerCase();

            if ((myPhone && approvedPhone && myPhone === approvedPhone) || (myName && approvedName && myName === approvedName)) {
              RoomManager.session.status = 'approved';
              RoomManager.session.role = 'member';
              localStorage.setItem('tiffin_user_session', JSON.stringify(RoomManager.session));
              RoomManager.loadRoom(targetRoom || myRoom);
              RoomManager.hideGateModal();
              renderAll();
              playJoinAlertChime();
              showToast('🎉 You have been admitted to the room by Admin! Welcome.');
              // Immediately request current room state
              SyncEngine.broadcast({
                type: 'request_room_sync',
                roomCode: targetRoom || myRoom,
                requesterName: action.member.name,
                requesterPhone: action.member.phone
              });
            }
          }
          if (RoomManager.activeRoom && action.member) {
            const exists = (RoomManager.activeRoom.members || []).some(m => m.id === action.member.id);
            if (!exists) {
              RoomManager.activeRoom.members.push(action.member);
              RoomManager.saveActiveRoom();
              ROOMMATES = RoomManager.activeRoom.members;
              RoomManager.renderSettingsMembersTab();
              modified = true;
            }
          }
        }
      } else if (action.type === 'member_joined') {
        const targetRoom = (action.roomCode || '').toString().toUpperCase().trim();
        const myRoom = (RoomManager.activeRoom?.code || RoomManager.session?.roomCode || SyncEngine.roomCode || '').toString().toUpperCase().trim();
        if ((targetRoom === myRoom || !targetRoom || !myRoom) && action.member) {
          if (!RoomManager.activeRoom) {
            RoomManager.activeRoom = {
              code: targetRoom || myRoom,
              name: 'My Flat',
              adminName: 'Admin',
              members: [],
              pendingRequests: []
            };
          }

          const exists = (RoomManager.activeRoom.members || []).some(m =>
            m.id === action.member.id ||
            m.name.toLowerCase() === action.member.name.toLowerCase()
          );

          if (!exists) {
            RoomManager.activeRoom.members.push(action.member);
            RoomManager.saveActiveRoom();
            ROOMMATES = RoomManager.activeRoom.members;

            // Ensure meal slots exist in appState for the new roommate
            if (appState && appState.days) {
              for (let d = 1; d <= CONFIG.daysInMonth; d++) {
                if (appState.days[d]) {
                  if (!appState.days[d].meals) appState.days[d].meals = {};
                  if (!appState.days[d].meals[action.member.id]) {
                    appState.days[d].meals[action.member.id] = { lunch: '', dinner: '' };
                  }
                }
              }
              saveStateToStorage(appState);
            }

            RoomManager.renderSettingsMembersTab();
            populateHeaderIdentityDropdown();
            renderAll();
          }

          // Trigger audio chime, toast & in-app banner for Admin & flatmates
          playJoinAlertChime();
          showToast(`🎉 ${action.member.name} joined the flat!`);
          RoomManager.showInAppJoinBanner(action.member.name, targetRoom || myRoom);

          NotificationManager.send('Flatmate Joined! 🍱', {
            body: `${action.member.name} joined #${targetRoom || myRoom}!`,
            tag: `joined_${action.member.id}_${Date.now()}`
          });

          logActivity(action.member.name, 'Member Joined', `${action.member.name} joined room #${targetRoom || myRoom}`);

          // Reply with full room metadata & ledger state so the new member gets everything
          if (RoomManager.session?.status === 'approved' || RoomManager.isAdmin()) {
            SyncEngine.broadcast({
              type: 'room_meta_sync',
              roomCode: targetRoom || myRoom,
              roomData: RoomManager.activeRoom,
              state: getCompactSyncState(appState)
            });
          }
        }
      } else if (action.type === 'member_added') {
        const targetRoom = (action.roomCode || '').toString().toUpperCase().trim();
        const myRoom = (RoomManager.activeRoom?.code || RoomManager.session?.roomCode || SyncEngine.roomCode || '').toString().toUpperCase().trim();
        if (targetRoom === myRoom || !targetRoom || !myRoom) {
          if (!RoomManager.activeRoom) {
            RoomManager.activeRoom = { code: targetRoom || myRoom, name: 'My Flat', adminName: 'Admin', members: [] };
          }
          if (action.member) {
            const exists = (RoomManager.activeRoom.members || []).some(m => m.id === action.member.id || m.name.toLowerCase() === action.member.name.toLowerCase());
            if (!exists) {
              RoomManager.activeRoom.members.push(action.member);
              RoomManager.saveActiveRoom();
              ROOMMATES = RoomManager.activeRoom.members;
              RoomManager.renderSettingsMembersTab();
              populateHeaderIdentityDropdown();
              modified = true;
            }
          }
        }
      } else if (action.type === 'member_kicked') {
        const targetRoom = (action.roomCode || '').toString().toUpperCase().trim();
        const myRoom = (RoomManager.activeRoom?.code || RoomManager.session?.roomCode || SyncEngine.roomCode || '').toString().toUpperCase().trim();
        if (targetRoom === myRoom) {
          const myId = RoomManager.sanitizeId(RoomManager.session?.name || '');
          const isMe = action.memberId === myId ||
                       (RoomManager.session && RoomManager.session.name.toLowerCase() === (action.memberName || '').toLowerCase());
          if (isMe) {
            alert('You have been removed from this flat by the Admin.');
            RoomManager.leaveRoom();
            return;
          }
          if (RoomManager.activeRoom) {
            RoomManager.activeRoom.members = (RoomManager.activeRoom.members || []).filter(m => m.id !== action.memberId);
            RoomManager.saveActiveRoom();
            ROOMMATES = RoomManager.activeRoom.members;
            RoomManager.renderSettingsMembersTab();
            populateHeaderIdentityDropdown();
            modified = true;
            showToast(`${action.memberName || 'A member'} was removed from the flat.`);
          }
        }
      } else if (action.type === 'request_room_sync') {
        const myRoomCode = RoomManager.activeRoom?.code || RoomManager.session?.roomCode;
        if (myRoomCode && myRoomCode.toUpperCase() === (action.roomCode || '').toUpperCase()) {
          if ((RoomManager.session?.status === 'approved' || RoomManager.isAdmin()) && RoomManager.activeRoom) {
            SyncEngine.broadcast({
              type: 'room_meta_sync',
              roomCode: myRoomCode,
              roomData: RoomManager.activeRoom,
              state: getCompactSyncState(appState)
            });
          }
        }
      } else if (action.type === 'room_meta_sync') {
        const myRoomCode = (RoomManager.activeRoom?.code || RoomManager.session?.roomCode || SyncEngine.roomCode || '').toString().toUpperCase().trim();
        const actionCode = (action.roomCode || '').toString().toUpperCase().trim();
        if (actionCode === myRoomCode || !myRoomCode || !actionCode) {
          if (action.roomData) {
            const current = RoomManager.activeRoom || {};
            // Merge members cleanly so nobody is ever dropped
            const memberMap = new Map();
            (current.members || []).forEach(m => memberMap.set(m.id, m));
            (action.roomData.members || []).forEach(m => {
              if (!memberMap.has(m.id)) {
                memberMap.set(m.id, m);
              } else {
                const existing = memberMap.get(m.id);
                memberMap.set(m.id, {
                  ...existing,
                  ...m,
                  role: (existing.role === 'admin' || m.role === 'admin') ? 'admin' : (m.role || existing.role || 'member')
                });
              }
            });

            if (RoomManager.session && RoomManager.session.name) {
              const myId = RoomManager.sanitizeId(RoomManager.session.name);
              if (!memberMap.has(myId)) {
                memberMap.set(myId, {
                  id: myId,
                  name: RoomManager.session.name,
                  phone: RoomManager.session.phone || '',
                  role: RoomManager.session.role || 'member',
                  avatarColor: '#00d26a'
                });
              }
            }

            const mergedMembers = Array.from(memberMap.values());
            RoomManager.activeRoom = {
              ...current,
              ...action.roomData,
              members: mergedMembers
            };
            RoomManager.saveActiveRoom();
            ROOMMATES = mergedMembers;

            if (action.roomData.adminPin) {
              CONFIG.adminPassword = action.roomData.adminPin;
            }
            RoomManager.updateHeaderRoomUI();
            RoomManager.renderSettingsMembersTab();
            populateHeaderIdentityDropdown();
          }

          // Ensure meal slots exist in appState for all roommates
          if (appState && appState.days) {
            for (let d = 1; d <= CONFIG.daysInMonth; d++) {
              if (appState.days[d]) {
                if (!appState.days[d].meals) appState.days[d].meals = {};
                ROOMMATES.forEach(r => {
                  if (!appState.days[d].meals[r.id]) {
                    appState.days[d].meals[r.id] = { lunch: '', dinner: '' };
                  }
                });
              }
            }
          }

          if (action.state && action.state.days) {
            const incomingDays = action.state.days;
            for (let d = 1; d <= CONFIG.daysInMonth; d++) {
              if (incomingDays[d] && appState.days[d]) {
                const incD = incomingDays[d];
                const locD = appState.days[d];

                // Merge sabzi with timestamp comparison
                const incSabziTime = Number(incD.sabziUpdatedAt || 0);
                const locSabziTime = Number(locD.sabziUpdatedAt || 0);
                if (incD.sabzi && (!locD.sabzi || incSabziTime >= locSabziTime)) {
                  locD.sabzi = incD.sabzi;
                  if (incSabziTime) locD.sabziUpdatedAt = incSabziTime;
                }

                // Merge meals per person per slot with timestamps
                const incMeals = incD.meals || {};
                const incMealTimes = incD.mealTimestamps || {};
                if (!locD.mealTimestamps) locD.mealTimestamps = {};

                Object.keys(incMeals).forEach(pId => {
                  if (!locD.meals[pId]) {
                    locD.meals[pId] = { lunch: '', dinner: '' };
                  }
                  ['lunch', 'dinner'].forEach(slot => {
                    const key = `${pId}_${slot}`;
                    const incT = Number(incMealTimes[key] || 0);
                    const locT = Number(locD.mealTimestamps[key] || 0);

                    if (incT > 0 && locT > 0) {
                      if (incT >= locT) {
                        locD.meals[pId][slot] = incMeals[pId][slot] || '';
                        locD.mealTimestamps[key] = incT;
                      }
                    } else if (incT > 0 && locT === 0) {
                      locD.meals[pId][slot] = incMeals[pId][slot] || '';
                      locD.mealTimestamps[key] = incT;
                    } else if (locT === 0 && !locD.meals[pId][slot] && incMeals[pId][slot]) {
                      // Initial baseline copy if never edited locally
                      locD.meals[pId][slot] = incMeals[pId][slot];
                    }
                  });
                });

                // Merge Amul milk
                if (incD.amul) {
                  if (!locD.amul) locD.amul = {};
                  if (!locD.amulTimestamps) locD.amulTimestamps = {};
                  const incAmulTimes = incD.amulTimestamps || {};
                  Object.keys(incD.amul).forEach(pId => {
                    const incT = Number(incAmulTimes[pId] || 0);
                    const locT = Number(locD.amulTimestamps[pId] || 0);
                    if (incT >= locT) {
                      locD.amul[pId] = incD.amul[pId];
                      if (incT) locD.amulTimestamps[pId] = incT;
                    }
                  });
                }
              }
            }
            if (action.state.rates && RoomManager.isAdmin() === false) {
              appState.rates = { ...appState.rates, ...action.state.rates };
            }
          }
          saveStateToStorage(appState);
          renderAll();
        }
      } else if (action.type === 'push_sub_registered') {
        if (action.subscription && action.subscription.endpoint) {
          try {
            const subs = JSON.parse(localStorage.getItem('tiffin_room_push_subs') || '{}');
            subs[action.subscription.endpoint] = {
              subscription: action.subscription,
              endpoint: action.subscription.endpoint,
              memberId: action.memberId || 'member',
              memberName: action.memberName || 'Flatmate',
              updatedAt: Date.now()
            };
            localStorage.setItem('tiffin_room_push_subs', JSON.stringify(subs));
          } catch (e) {}
        }
      }

      if (modified) {
        saveStateToStorage(appState);
        renderAll();
      }
    },

    setupPollReminder() {
      // Check every 5 minutes if there is an active poll the current user hasn't voted in
      setInterval(() => {
        if (appState.activePoll && appState.activePoll.status === 'active') {
          const myId = (this.identity || '').toLowerCase();
          const hasVoted = appState.activePoll.votes && appState.activePoll.votes[myId];
          if (!hasVoted) {
            showToast(`⏰ Reminder: Please vote in the ${appState.activePoll.mealSlot} Poll!`);
            triggerHaptic();
          }
        }
      }, 5 * 60 * 1000);
    },

    getClientId() {
      let id = sessionStorage.getItem('tiffin_client_id');
      if (!id) {
        id = 'client_' + Math.random().toString(36).substring(2, 9);
        sessionStorage.setItem('tiffin_client_id', id);
      }
      return id;
    }
  };

  // --- Calculation Helpers ---
  function getRates() {
    return appState.rates || CONFIG.defaultRates;
  }

  function getMealCost(val) {
    if (!val) return 0;
    const v = val.toLowerCase();
    const rates = getRates();
    if (v === 'half') return Number(rates.half) || 80;
    if (v === 'full') return Number(rates.full) || 110;
    if (v === 'special') return Number(rates.special) || 90;
    return 0;
  }

  function getRoommateDayCost(roommateId, dayNum) {
    const dayData = appState.days[dayNum];
    if (!dayData || !dayData.meals[roommateId]) return 0;
    const m = dayData.meals[roommateId];
    let total = 0;
    if (m.lunch) total += getMealCost(m.lunch);
    if (m.dinner) total += getMealCost(m.dinner);
    return total;
  }

  function getDayTotalCost(dayNum) {
    let sum = 0;
    ROOMMATES.forEach(r => {
      sum += getRoommateDayCost(r.id, dayNum);
    });
    return sum;
  }

  function getRoommateMonthlyStats(roommateId) {
    let halfCount = 0;
    let fullCount = 0;
    let specialCount = 0;
    let tiffinTotal = 0;
    const rates = getRates();

    for (let d = 1; d <= CONFIG.daysInMonth; d++) {
      const day = appState.days[d];
      if (!day) continue;
      const m = day.meals[roommateId];
      if (!m) continue;

      ['lunch', 'dinner'].forEach(slot => {
        const val = (m[slot] || '').toLowerCase();
        if (val === 'half') { halfCount++; tiffinTotal += Number(rates.half); }
        else if (val === 'full') { fullCount++; tiffinTotal += Number(rates.full); }
        else if (val === 'special') { specialCount++; tiffinTotal += Number(rates.special); }
      });
    }

    // Amul milk calculation
    let milkPackets = 0;
    for (let d = 1; d <= CONFIG.daysInMonth; d++) {
      const day = appState.days[d];
      if (day && day.amul && day.amul[roommateId]) {
        milkPackets += Number(day.amul[roommateId]) || 0;
      }
    }
    const milkTotal = milkPackets * (Number(rates.amulPacket) || 35);

    return {
      halfCount,
      fullCount,
      specialCount,
      totalMeals: halfCount + fullCount + specialCount,
      tiffinTotal,
      milkPackets,
      milkTotal,
      grandTotal: tiffinTotal
    };
  }

  function getFlatTotals() {
    let tiffinTotal = 0;
    let totalMeals = 0;
    let milkTotal = 0;

    ROOMMATES.forEach(r => {
      const stats = getRoommateMonthlyStats(r.id);
      tiffinTotal += stats.tiffinTotal;
      totalMeals += stats.totalMeals;
      milkTotal += stats.milkTotal;
    });

    return {
      tiffinTotal,
      totalMeals,
      milkTotal,
      combinedTotal: tiffinTotal + milkTotal
    };
  }

  // --- Creative Cartoon Headshot Avatar Generator ---
  function getCartoonAvatarSvg(nameOrId, size = 36) {
    const seed = String(nameOrId || 'user').toLowerCase();
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash << 5) - hash + seed.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % 8;
    const uid = Math.abs(hash).toString(36);

    const avatars = [
      // 0: Chef Chill (Toque hat, wink, rosy cheeks)
      `<defs><linearGradient id="av0_${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#10b981"/><stop offset="100%" stop-color="#047857"/></linearGradient></defs><circle cx="50" cy="50" r="48" fill="url(#av0_${uid})"/><circle cx="50" cy="58" r="26" fill="#fde68a"/><path d="M30 46 C25 32, 40 22, 50 26 C60 22, 75 32, 70 46 Z" fill="#ffffff"/><rect x="32" y="44" width="36" height="8" rx="2" fill="#e2e8f0"/><path d="M38 58 Q42 54 46 58" stroke="#1e293b" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="58" cy="57" r="2.5" fill="#1e293b"/><circle cx="36" cy="63" r="4" fill="#f87171" opacity="0.6"/><circle cx="64" cy="63" r="4" fill="#f87171" opacity="0.6"/><path d="M44 64 Q50 72 56 64" stroke="#1e293b" stroke-width="2.5" fill="#f43f5e" stroke-linecap="round"/>`,

      // 1: Cool Dude (Sunglasses & Pompadour)
      `<defs><linearGradient id="av1_${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#06b6d4"/><stop offset="100%" stop-color="#0e7490"/></linearGradient></defs><circle cx="50" cy="50" r="48" fill="url(#av1_${uid})"/><circle cx="50" cy="56" r="26" fill="#fed7aa"/><path d="M26 48 C24 30, 48 20, 68 28 C76 34, 76 46, 74 48 C68 40, 52 38, 26 48 Z" fill="#1e293b"/><rect x="32" y="50" width="16" height="11" rx="3" fill="#0f172a"/><rect x="52" y="50" width="16" height="11" rx="3" fill="#0f172a"/><line x1="48" y1="54" x2="52" y2="54" stroke="#0f172a" stroke-width="2.5"/><line x1="34" y1="52" x2="40" y2="58" stroke="#ffffff" stroke-width="1.5" opacity="0.7"/><line x1="54" y1="52" x2="60" y2="58" stroke="#ffffff" stroke-width="1.5" opacity="0.7"/><path d="M46 68 Q56 70 58 64" stroke="#1e293b" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,

      // 2: Nerd Specs (Freckles & circular glasses)
      `<defs><linearGradient id="av2_${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#a855f7"/><stop offset="100%" stop-color="#6b21a8"/></linearGradient></defs><circle cx="50" cy="50" r="48" fill="url(#av2_${uid})"/><path d="M24 48 C22 28, 44 24, 52 24 C64 24, 76 30, 76 48 Z" fill="#f97316"/><circle cx="50" cy="57" r="25" fill="#fde68a"/><path d="M32 40 Q40 48 48 40 Q56 48 64 40" stroke="#f97316" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="39" cy="56" r="9" stroke="#1e293b" stroke-width="2.5" fill="#ffffff" opacity="0.9"/><circle cx="61" cy="56" r="9" stroke="#1e293b" stroke-width="2.5" fill="#ffffff" opacity="0.9"/><line x1="48" y1="56" x2="52" y2="56" stroke="#1e293b" stroke-width="2.5"/><circle cx="40" cy="56" r="3" fill="#1e293b"/><circle cx="62" cy="56" r="3" fill="#1e293b"/><circle cx="34" cy="68" r="1.5" fill="#ea580c"/><circle cx="66" cy="68" r="1.5" fill="#ea580c"/><path d="M43 70 Q50 77 57 70 Z" fill="#ffffff" stroke="#1e293b" stroke-width="2"/>`,

      // 3: Beanie Bro (Hipster beanie & cozy beard)
      `<defs><linearGradient id="av3_${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#b45309"/></linearGradient></defs><circle cx="50" cy="50" r="48" fill="url(#av3_${uid})"/><circle cx="50" cy="58" r="26" fill="#fed7aa"/><path d="M26 48 C26 26, 74 26, 74 48 Z" fill="#e11d48"/><rect x="24" y="44" width="52" height="8" rx="3" fill="#be123c"/><path d="M36 56 Q41 53 46 56" stroke="#1e293b" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M54 56 Q59 53 64 56" stroke="#1e293b" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M40 66 Q50 63 60 66 Q55 74 50 74 Q45 74 40 66 Z" fill="#451a03"/><path d="M45 76 Q50 79 55 76" stroke="#1e293b" stroke-width="2" fill="none" stroke-linecap="round"/>`,

      // 4: Silly Winker (Tongue Out & Cyan Hair)
      `<defs><linearGradient id="av4_${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ec4899"/><stop offset="100%" stop-color="#be185d"/></linearGradient></defs><circle cx="50" cy="50" r="48" fill="url(#av4_${uid})"/><path d="M26 44 L32 26 L42 36 L50 22 L58 36 L68 26 L74 44 Z" fill="#06b6d4"/><circle cx="50" cy="58" r="25" fill="#fde68a"/><path d="M35 56 L44 56 L37 60" stroke="#1e293b" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="61" cy="56" r="4" fill="#1e293b"/><circle cx="62" cy="54" r="1.5" fill="#ffffff"/><circle cx="34" cy="64" r="4" fill="#fb7185" opacity="0.6"/><circle cx="66" cy="64" r="4" fill="#fb7185" opacity="0.6"/><path d="M42 66 Q50 74 58 66" stroke="#1e293b" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M48 69 C48 76, 56 76, 56 69 Z" fill="#f43f5e"/>`,

      // 5: Gentle Monocle (Curled Mustache & Monocle)
      `<defs><linearGradient id="av5_${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#1d4ed8"/></linearGradient></defs><circle cx="50" cy="50" r="48" fill="url(#av5_${uid})"/><path d="M26 46 C26 28, 50 24, 74 36 C74 48, 70 48, 26 46 Z" fill="#1e293b"/><circle cx="50" cy="58" r="26" fill="#fed7aa"/><circle cx="60" cy="54" r="7" stroke="#fbbf24" stroke-width="2" fill="none"/><path d="M67 55 Q72 65 70 75" stroke="#fbbf24" stroke-width="1.2" fill="none"/><circle cx="39" cy="54" r="2.5" fill="#1e293b"/><circle cx="60" cy="54" r="2.5" fill="#1e293b"/><path d="M34 64 Q42 61 50 66 Q58 61 66 64 Q68 60 62 60 Q50 62 50 66 Q50 62 38 60 Q32 60 34 64 Z" fill="#0f172a"/>`,

      // 6: Panda Munch (Cute Panda Head)
      `<defs><linearGradient id="av6_${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#14b8a6"/><stop offset="100%" stop-color="#0f766e"/></linearGradient></defs><circle cx="50" cy="50" r="48" fill="url(#av6_${uid})"/><circle cx="28" cy="34" r="10" fill="#1e293b"/><circle cx="72" cy="34" r="10" fill="#1e293b"/><circle cx="50" cy="56" r="27" fill="#ffffff"/><ellipse cx="38" cy="52" rx="7" ry="9" fill="#1e293b" transform="rotate(-15 38 52)"/><ellipse cx="62" cy="52" rx="7" ry="9" fill="#1e293b" transform="rotate(15 62 52)"/><circle cx="39" cy="51" r="2.5" fill="#ffffff"/><circle cx="61" cy="51" r="2.5" fill="#ffffff"/><ellipse cx="50" cy="62" rx="3.5" ry="2.5" fill="#1e293b"/><path d="M46 66 Q50 69 54 66" stroke="#1e293b" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="31" cy="62" r="4" fill="#fda4af" opacity="0.7"/><circle cx="69" cy="62" r="4" fill="#fda4af" opacity="0.7"/>`,

      // 7: Cat Chef (Anime Tabby with Bowtie)
      `<defs><linearGradient id="av7_${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f43f5e"/><stop offset="100%" stop-color="#be123c"/></linearGradient></defs><circle cx="50" cy="50" r="48" fill="url(#av7_${uid})"/><polygon points="25,44 32,24 45,36" fill="#f97316"/><polygon points="28,40 33,28 41,36" fill="#fecdd3"/><polygon points="75,44 68,24 55,36" fill="#f97316"/><polygon points="72,40 67,28 59,36" fill="#fecdd3"/><circle cx="50" cy="56" r="26" fill="#fb923c"/><path d="M36 53 L41 49 L46 53" stroke="#ffffff" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M54 53 L59 49 L64 53" stroke="#ffffff" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="24" y1="58" x2="33" y2="59" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/><line x1="24" y1="63" x2="34" y2="62" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/><line x1="76" y1="58" x2="67" y2="59" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/><line x1="76" y1="63" x2="66" y2="62" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/><polygon points="48,60 52,60 50,62" fill="#be123c"/><path d="M44 64 Q47 67 50 64 Q53 67 56 64" stroke="#ffffff" stroke-width="2" fill="none" stroke-linecap="round"/><polygon points="44,78 56,78 50,82" fill="#10b981"/><polygon points="44,86 56,86 50,82" fill="#10b981"/><circle cx="50" cy="82" r="2" fill="#facc15"/>`
    ];

    return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" class="cartoon-avatar-svg" style="display:block; border-radius:50%; flex-shrink:0;">${avatars[idx]}</svg>`;
  }

  // --- Rendering UI Modules ---

  function updateIdentityUI(name) {
    const headerSelect = document.getElementById('headerUserIdentitySelect');
    const settingsSelect = document.getElementById('settingsIdentitySelect');
    const onboardingSelect = document.getElementById('onboardingNameSelect');
    const myVoteLabel = document.getElementById('myVoteIdentityLabel');
    const userAvatarDot = document.querySelector('.user-avatar-dot');

    const displayName = name || 'Anjan';

    if (headerSelect && headerSelect.value !== displayName) {
      headerSelect.value = displayName;
    }
    if (settingsSelect) settingsSelect.value = displayName;
    if (onboardingSelect) onboardingSelect.value = displayName;
    if (myVoteLabel) myVoteLabel.textContent = displayName;
    if (userAvatarDot) {
      userAvatarDot.innerHTML = getCartoonAvatarSvg(displayName, 22);
    }
  }

  function populateHeaderIdentityDropdown() {
    const select = document.getElementById('headerUserIdentitySelect');
    if (!select) return;

    const currentVal = SyncEngine.identity || (ROOMMATES[0] ? ROOMMATES[0].name : 'Anjan');
    select.innerHTML = '';

    ROOMMATES.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.name;
      opt.textContent = r.name;
      select.appendChild(opt);
    });

    const addOpt = document.createElement('option');
    addOpt.value = '__add_member__';
    addOpt.textContent = '+ Add Member';
    select.appendChild(addOpt);

    select.value = currentVal;
  }

  function handleAddNewMember() {
    const raw = prompt('Enter new flatmate / roommate name:');
    if (!raw || !raw.trim()) {
      populateHeaderIdentityDropdown();
      return;
    }
    const cleanName = raw.trim();
    const existing = ROOMMATES.find(r => r.name.toLowerCase() === cleanName.toLowerCase());
    if (existing) {
      SyncEngine.setIdentity(existing.name);
      populateHeaderIdentityDropdown();
      showToast(`Switched active profile to ${existing.name}`);
      return;
    }

    const newId = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '') || `user_${Date.now()}`;
    const avatarPalette = ['#00d26a', '#00d4ff', '#a78bfa', '#ff3b5c', '#ffb800', '#10b981', '#38bdf8', '#f43f5e', '#ec4899', '#8b5cf6'];
    const avatarColor = avatarPalette[ROOMMATES.length % avatarPalette.length];

    const newMember = {
      id: newId,
      name: cleanName,
      slots: ['lunch', 'dinner'],
      avatarColor: avatarColor
    };

    ROOMMATES.push(newMember);
    try {
      localStorage.setItem('tiffin_custom_roommates', JSON.stringify(ROOMMATES));
    } catch (e) {}

    // Ensure member exists in all days of current month ledger
    if (appState && appState.days) {
      for (let d = 1; d <= CONFIG.daysInMonth; d++) {
        if (appState.days[d]) {
          if (!appState.days[d].meals) appState.days[d].meals = {};
          if (!appState.days[d].meals[newId]) {
            appState.days[d].meals[newId] = { lunch: '', dinner: '' };
          }
        }
      }
      saveStateToStorage(appState);
      persistAndBroadcast({
        type: 'member_added',
        member: newMember
      });
    }

    // Reset UPI roommate dropdown so new member is included
    const upiSelect = document.getElementById('upiRoommateSelect');
    if (upiSelect) upiSelect.innerHTML = '';

    SyncEngine.setIdentity(cleanName);
    populateHeaderIdentityDropdown();
    setupSheetFilterControls();
    renderAll();
    showToast(`Added ${cleanName} to Tiffin Tracker!`);
  }

  function setupHeaderIdentityControls() {
    const select = document.getElementById('headerUserIdentitySelect');
    if (!select) return;

    populateHeaderIdentityDropdown();

    select.addEventListener('change', (e) => {
      triggerHaptic();
      if (e.target.value === '__add_member__') {
        handleAddNewMember();
      } else {
        SyncEngine.setIdentity(e.target.value);
        showToast(`Switched active profile to ${e.target.value}`);
      }
    });
  }

  // 1. Daily Logger Render
  function renderDailyLogger() {
    const dayData = appState.days[selectedDay];
    if (!dayData) return;

    // Header date info
    const dayTitle = document.getElementById('currentDayTitle');
    const daySummary = document.getElementById('daySummarySubtitle');
    const dayTagPill = document.getElementById('dayTagPill');
    const sabziInput = document.getElementById('sabziInput');
    const jumpLabel = document.getElementById('jumpTodayLabel');

    const dateObj = new Date(currentYear, currentMonth - 1, selectedDay);
    const dayOfWeek = DAY_NAMES[dateObj.getDay()];
    const monthShort = MONTH_SHORTS[currentMonth - 1];
    const monthName = MONTH_NAMES[currentMonth - 1];
    const isRealToday = (now.getFullYear() === currentYear && (now.getMonth() + 1) === currentMonth && selectedDay === now.getDate());

    if (dayTitle) dayTitle.textContent = `${dayOfWeek}, ${selectedDay} ${monthShort}`;
    if (dayTagPill) {
      dayTagPill.style.display = isRealToday ? 'inline-flex' : 'none';
    }
    if (jumpLabel) {
      const realTodayDay = now.getDate();
      const realTodayMonth = MONTH_SHORTS[now.getMonth()];
      jumpLabel.textContent = (now.getFullYear() === currentYear && (now.getMonth() + 1) === currentMonth)
        ? `Jump to Today (Day ${realTodayDay})`
        : `Jump to Today (${realTodayMonth} ${realTodayDay})`;
    }

    const dayCost = getDayTotalCost(selectedDay);
    let dayMealsCount = 0;
    ROOMMATES.forEach(r => {
      const m = dayData.meals[r.id];
      if (m.lunch) dayMealsCount++;
      if (m.dinner) dayMealsCount++;
    });

    if (daySummary) {
      daySummary.textContent = `${dayMealsCount} meal${dayMealsCount === 1 ? '' : 's'} logged • ₹${dayCost}`;
    }

    // Sabzi / Menu Note UI (Banner vs Input)
    const sabziBanner = document.getElementById('sabziDisplayBanner');
    const sabziDishSpan = document.getElementById('sabziDisplayDish');
    const sabziInputRow = document.getElementById('sabziInputRow');

    const hasSabzi = !!(dayData.sabzi && dayData.sabzi.trim());
    if (hasSabzi) {
      if (sabziDishSpan) sabziDishSpan.textContent = dayData.sabzi;
      if (sabziBanner) sabziBanner.style.display = 'flex';
      if (sabziInputRow && document.activeElement !== sabziInput) sabziInputRow.style.display = 'none';
    } else {
      if (sabziBanner) sabziBanner.style.display = 'none';
      if (sabziInputRow) sabziInputRow.style.display = 'flex';
    }

    if (sabziInput && document.activeElement !== sabziInput) {
      sabziInput.value = dayData.sabzi || '';
    }

    // Populate Date Dropdown if empty
    const select = document.getElementById('daySelectInput');
    if (select && select.options.length === 0) {
      populateDateSelectors();
    }
    if (select) select.value = selectedDay;

    // Roommate Cards Grid (Immediately visible, no off-screen push)
    const container = document.getElementById('roommatesLoggerGrid');
    if (!container) return;
    container.innerHTML = '';

    if (ROOMMATES.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align:center; padding:32px 16px; margin:16px 0;">
          <div style="font-size:2rem; margin-bottom:8px;">👥</div>
          <h3 style="font-size:1.1rem; color:var(--text-main); margin-bottom:6px;">No Roommates in this Room</h3>
          <p style="font-size:0.88rem; color:var(--text-muted); margin-bottom:16px;">Add flatmates or share your room invite link to start logging meals.</p>
          <button id="emptyStateAddMemberBtn" class="primary-btn glow-btn btn-sm" style="margin:0 auto;">
            <span>+ Add Roommates</span>
          </button>
        </div>
      `;
      const btn = document.getElementById('emptyStateAddMemberBtn');
      if (btn) {
        btn.addEventListener('click', () => {
          const settingsBtn = document.getElementById('headerSettingsBtn');
          if (settingsBtn) settingsBtn.click();
        });
      }
      return;
    }

    const rates = getRates();

    ROOMMATES.forEach(r => {
      const m = dayData.meals[r.id] || { lunch: '', dinner: '' };
      const individualCost = getRoommateDayCost(r.id, selectedDay);
      const initials = (r.name || 'RM').slice(0, 2).toUpperCase();

      const card = document.createElement('div');
      card.className = 'roommate-card';

      const renderSlot = (slotName, currentVal) => {
        return `
          <div class="meal-slot-group">
            <div class="meal-slot-label-row">
              <span class="slot-label">${slotName}</span>
              <span class="slot-current-badge">${currentVal || 'Off'}</span>
            </div>
            <div class="segment-toggle">
              <button class="seg-btn ${!currentVal ? 'active off' : ''}" data-person="${r.id}" data-slot="${slotName}" data-val="">
                <span>Off</span>
                <span class="seg-price">₹0</span>
              </button>
              <button class="seg-btn ${currentVal === 'Half' ? 'active half' : ''}" data-person="${r.id}" data-slot="${slotName}" data-val="Half">
                <span>Half</span>
                <span class="seg-price">₹${rates.half}</span>
              </button>
              <button class="seg-btn ${currentVal === 'Full' ? 'active full' : ''}" data-person="${r.id}" data-slot="${slotName}" data-val="Full">
                <span>Full</span>
                <span class="seg-price">₹${rates.full}</span>
              </button>
              <button class="seg-btn ${currentVal === 'Special' ? 'active special' : ''}" data-person="${r.id}" data-slot="${slotName}" data-val="Special">
                <span>Special</span>
                <span class="seg-price">₹${rates.special}</span>
              </button>
            </div>
          </div>
        `;
      };

      card.innerHTML = `
        <div class="roommate-card-header">
          <div class="roommate-info">
            <div class="roommate-avatar" style="overflow:hidden; display:flex; align-items:center; justify-content:center; background:none;">
              ${getCartoonAvatarSvg(r.id || r.name, 34)}
            </div>
            <div class="roommate-name">${escapeHtml(r.name)}</div>
          </div>
          <div class="roommate-day-cost">
            <span class="day-cost-val">₹${individualCost}</span>
          </div>
        </div>
        ${renderSlot('Lunch', m.lunch)}
        ${renderSlot('Dinner', m.dinner)}
      `;

      container.appendChild(card);
    });

    // Attach click events on toggle buttons
    container.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        triggerHaptic();
        const person = btn.getAttribute('data-person');
        const slot = btn.getAttribute('data-slot').toLowerCase();
        const val = btn.getAttribute('data-val');
        const timestamp = Date.now();

        if (!appState.days[selectedDay].mealTimestamps) {
          appState.days[selectedDay].mealTimestamps = {};
        }
        appState.days[selectedDay].mealTimestamps[`${person}_${slot}`] = timestamp;
        appState.days[selectedDay].meals[person][slot] = val;

        logActivity(SyncEngine.identity, 'Logged Meal', `${capitalize(person)} ${slot}: ${val || 'Off'}`);
        persistAndBroadcast({
          type: 'meal_update',
          year: currentYear,
          month: currentMonth,
          day: selectedDay,
          person: person,
          slot: slot,
          value: val,
          timestamp: timestamp
        });
      });
    });
  }

  // --- Tiffin Supplier WhatsApp Order Text Generator ---
  function generateSupplierOrderText(poll, winningDish, mealsApplied) {
    const halfNames = [];
    const fullNames = [];
    const specialNames = [];

    ROOMMATES.forEach(r => {
      let portion = mealsApplied ? mealsApplied[r.id] : null;
      if (!portion && poll && poll.votes && poll.votes[r.id]) {
        portion = poll.votes[r.id].portion;
      }
      if (!portion || portion === 'Off' || portion === 'No') return;

      // Remove "Sir" from names as requested
      const cleanName = (r.name || '').replace(/\bSir\b/gi, '').trim();
      if (portion === 'Half') halfNames.push(cleanName);
      else if (portion === 'Full') fullNames.push(cleanName);
      else if (portion === 'Special') specialNames.push(cleanName);
    });

    const groups = [];
    if (halfNames.length > 0) groups.push({ type: 'Half', names: halfNames });
    if (fullNames.length > 0) groups.push({ type: 'Full', names: fullNames });
    if (specialNames.length > 0) groups.push({ type: 'Special', names: specialNames });

    if (groups.length === 0) {
      return `No tiffin needed today (${winningDish || ''}).`;
    }

    // Sort by count descending so main group comes first
    groups.sort((a, b) => b.names.length - a.names.length);

    const mainGroup = groups[0];
    const otherGroups = groups.slice(1);

    let msg = '';

    // Primary group
    if (mainGroup.names.length === 1) {
      msg += `${mainGroup.type} for ${mainGroup.names[0]}\n`;
    } else {
      msg += `${mainGroup.type} tiffin for ${mainGroup.names.length}\n`;
      msg += `${mainGroup.names.join(' ')}\n`;
    }

    // Sabzi name
    const dish = winningDish || (poll ? poll.winner : '') || '';
    if (dish) {
      msg += `${dish}\n`;
    }

    // Secondary group(s)
    otherGroups.forEach(g => {
      msg += `\n`;
      if (g.names.length === 1) {
        msg += `${g.type} for ${g.names[0]}`;
      } else {
        msg += `${g.type} tiffin for ${g.names.length}\n`;
        msg += `${g.names.join(' ')}`;
      }
    });

    return msg.trim();
  }

  // 2. Menu Voting Poll Render
  function renderPollView() {
    NotificationManager.updateUI();

    const pollCardTitle = document.getElementById('pollCardTitle');
    const pollStatusBadge = document.getElementById('pollStatusBadge');
    const activePollContainer = document.getElementById('activePollContainer');
    const createPollContainer = document.getElementById('createPollContainer');

    const poll = appState.activePoll;

    // Populate Poll Date dropdown in create form
    const pollDaySelect = document.getElementById('pollDaySelect');
    if (pollDaySelect && pollDaySelect.options.length === 0) {
      for (let d = 1; d <= CONFIG.daysInMonth; d++) {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = `Day ${d}`;
        pollDaySelect.appendChild(opt);
      }
      pollDaySelect.value = selectedDay;
    }

    if (!poll || poll.status === 'finalized') {
      if (pollStatusBadge) {
        pollStatusBadge.className = 'badge-pill';
        pollStatusBadge.textContent = poll && poll.status === 'finalized' ? 'Poll Finalized' : 'No Active Poll';
      }
      if (activePollContainer) activePollContainer.style.display = 'none';
      if (createPollContainer) createPollContainer.style.display = 'block';
    } else {
      // Active Poll is Running
      if (pollStatusBadge) {
        pollStatusBadge.className = 'badge-pill today-pill';
        pollStatusBadge.textContent = 'Active Poll';
      }
      if (activePollContainer) activePollContainer.style.display = 'block';
      if (createPollContainer) createPollContainer.style.display = 'none';

      // Set Poll texts
      const mealTag = document.getElementById('pollMealTag');
      const questionText = document.getElementById('pollQuestionText');
      const metaText = document.getElementById('pollMetaText');

      if (mealTag) mealTag.textContent = `${(poll.mealSlot || 'DINNER').toUpperCase()} POLL (DAY ${poll.day})`;
      if (questionText) questionText.textContent = `What should we cook for ${poll.mealSlot || 'Dinner'}?`;
      if (metaText) metaText.textContent = `Launched by ${poll.author || 'Flatmate'} • Live across all phones`;

      const myRaw = (SyncEngine.identity || 'anjan').trim().toLowerCase();
      let myVote = null;
      if (poll.votes) {
        if (poll.votes[myRaw]) myVote = poll.votes[myRaw];
        else if (poll.votes[myRaw.replace(/\s+/g, '_')]) myVote = poll.votes[myRaw.replace(/\s+/g, '_')];
        else if (typeof ROOMMATES !== 'undefined' && Array.isArray(ROOMMATES)) {
          const found = ROOMMATES.find(r => (r.name && r.name.toLowerCase() === myRaw) || (r.id && r.id.toLowerCase() === myRaw));
          if (found) {
            myVote = poll.votes[found.id] || (found.name && poll.votes[found.name.toLowerCase()]);
          }
        }
      }
      const hasVoted = !!myVote;

      if (hasVoted) {
        hidePollAlertBanner();
      } else {
        showPollAlertBanner(poll);
      }

      const blindNotice = document.getElementById('pollBlindNotice');
      const myVoteBox = document.getElementById('myVoteBox');
      const myVotedSummary = document.getElementById('myVotedSummaryBox');
      const myVotedChoiceText = document.getElementById('myVotedChoiceText');
      const myVoteIdentityLabel = document.getElementById('myVoteIdentityLabel');
      const pollResultsTray = document.getElementById('pollResultsTray');
      const votersBreakdownCard = document.getElementById('votersBreakdownCard');
      const finalizeActions = document.getElementById('pollFinalizeActions');

      if (myVoteIdentityLabel) myVoteIdentityLabel.textContent = SyncEngine.identity || 'You';

      // Blind Voting Enforcement
      if (!hasVoted) {
        if (blindNotice) blindNotice.style.display = 'flex';
        if (myVoteBox) myVoteBox.style.display = 'block';
        if (myVotedSummary) myVotedSummary.style.display = 'none';
        if (pollResultsTray) pollResultsTray.style.display = 'none';
        if (votersBreakdownCard) votersBreakdownCard.style.display = 'none';
        if (finalizeActions) finalizeActions.style.display = 'none';
      } else {
        if (blindNotice) blindNotice.style.display = 'none';
        if (myVoteBox) myVoteBox.style.display = 'none';
        if (myVotedSummary) {
          myVotedSummary.style.display = 'block';
          if (myVotedChoiceText) {
            const portionText = myVote.portion === 'No' ? 'No Tiffin' : myVote.portion;
            const dishText = (myVote.portion === 'No' && (!myVote.option || myVote.option === 'No Tiffin')) ? 'Opted out' : escapeHtml(myVote.option);
            myVotedChoiceText.textContent = `You voted: ${dishText} • ${portionText}`;
          }
        }
        if (pollResultsTray) pollResultsTray.style.display = 'block';
        if (votersBreakdownCard) votersBreakdownCard.style.display = 'block';
        if (finalizeActions) finalizeActions.style.display = 'block';
      }

      // Radio Options for Current User to Vote
      const radioGrid = document.getElementById('pollOptionsRadioGrid');
      if (radioGrid) {
        radioGrid.innerHTML = '';
        const currentVoteOption = myVote ? myVote.option : null;

        poll.options.forEach((optText) => {
          const isSelected = currentVoteOption === optText;
          const label = document.createElement('label');
          label.className = `poll-radio-label ${isSelected ? 'selected' : ''}`;
          label.innerHTML = `
            <input type="radio" name="pollDishChoice" value="${escapeHtml(optText)}" ${isSelected ? 'checked' : ''}>
            <strong>${escapeHtml(optText)}</strong>
          `;
          label.addEventListener('click', () => {
            radioGrid.querySelectorAll('.poll-radio-label').forEach(l => l.classList.remove('selected'));
            label.classList.add('selected');
          });
          radioGrid.appendChild(label);
        });
      }

      // Set portion buttons active state
      const currentPortion = myVote ? myVote.portion : 'Half';
      document.querySelectorAll('#pollPortionToggle .seg-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-portion') === currentPortion);
      });

      // Live Tally Progress Bars
      const resultsContainer = document.getElementById('pollResultsBars');
      if (resultsContainer) {
        resultsContainer.innerHTML = '';
        const votes = poll.votes || {};
        const totalVotesCast = Object.keys(votes).length;

        const tally = {};
        poll.options.forEach(opt => tally[opt] = 0);
        Object.values(votes).forEach(v => {
          if (tally[v.option] !== undefined) tally[v.option]++;
        });

        poll.options.forEach(opt => {
          const count = tally[opt] || 0;
          const pct = totalVotesCast > 0 ? ((count / totalVotesCast) * 100).toFixed(0) : 0;

          const barItem = document.createElement('div');
          barItem.className = 'poll-bar-item';
          barItem.innerHTML = `
            <div class="poll-bar-header">
              <span>${escapeHtml(opt)}</span>
              <span>${count} vote${count === 1 ? '' : 's'} (${pct}%)</span>
            </div>
            <div class="poll-bar-track">
              <div class="poll-bar-fill" style="width: ${pct}%"></div>
            </div>
          `;
          resultsContainer.appendChild(barItem);
        });
      }

      // Who Voted for What Breakdown
      const chipsWrap = document.getElementById('votersChipsWrap');
      const votersCountLabel = document.getElementById('votersCountLabel');
      if (chipsWrap && poll.votes) {
        chipsWrap.innerHTML = '';
        const votes = poll.votes || {};
        const count = Object.keys(votes).length;
        if (votersCountLabel) votersCountLabel.textContent = `${count} / ${ROOMMATES.length} Voted`;

        ROOMMATES.forEach(r => {
          const v = votes[r.id] || (r.name && votes[r.name.toLowerCase()]) || votes[(r.id || '').replace(/_/g, ' ')];
          const chip = document.createElement('div');
          chip.className = 'voter-chip';
          if (v) {
            const portionDisp = v.portion === 'No' ? 'No Tiffin' : v.portion;
            const choiceDisp = (v.portion === 'No' && (!v.option || v.option === 'No Tiffin'))
              ? 'No Tiffin'
              : `${escapeHtml(v.option)} (${portionDisp})`;
            chip.innerHTML = `<span>✓</span> <strong>${r.name}:</strong> <span>${choiceDisp}</span>`;
            chip.style.borderColor = 'rgba(16, 185, 129, 0.4)';
          } else {
            chip.innerHTML = `<span style="opacity:0.5">○</span> <span style="opacity:0.7">${r.name}: Pending</span>`;
            chip.style.opacity = '0.6';
          }
          chipsWrap.appendChild(chip);
        });
      }
    }

    // --- Render Previous Polls Archive Section ---
    const prevCard = document.getElementById('previousPollsCard');
    const prevListContainer = document.getElementById('previousPollsList');
    const prevCountBadge = document.getElementById('prevPollsCountBadge');
    const clearAllBtn = document.getElementById('clearAllPrevPollsBtn');
    const pollHistory = appState.pollHistory || [];

    if (prevCard) {
      prevCard.style.display = pollHistory.length > 0 ? 'block' : 'none';
    }

    if (prevCountBadge) {
      prevCountBadge.textContent = `${pollHistory.length} Saved`;
    }

    if (clearAllBtn) {
      clearAllBtn.style.display = pollHistory.length > 0 ? 'inline-block' : 'none';
    }

    if (prevListContainer) {
      prevListContainer.innerHTML = '';
      pollHistory.forEach(pastPoll => {
        const card = document.createElement('div');
        card.className = 'previous-poll-card-item';

        const votes = pastPoll.votes || {};
        const totalVotes = Object.keys(votes).length;
        const dateStr = `Day ${pastPoll.day || '?'}`;
        const slotStr = (pastPoll.mealSlot || 'Dinner').toUpperCase();

        const tally = {};
        (pastPoll.options || []).forEach(opt => tally[opt] = 0);
        Object.values(votes).forEach(v => {
          if (v.portion !== 'No' && tally[v.option] !== undefined) {
            tally[v.option]++;
          }
        });

        let optionsBarsHtml = '';
        (pastPoll.options || []).forEach(opt => {
          const count = tally[opt] || 0;
          const pct = totalVotes > 0 ? ((count / totalVotes) * 100).toFixed(0) : 0;
          const isWinner = pastPoll.winner === opt;
          optionsBarsHtml += `
            <div class="prev-opt-bar-row">
              <div class="prev-opt-text-row">
                <span>${escapeHtml(opt)}</span>
                <span>${count} (${pct}%)</span>
              </div>
              <div class="prev-opt-progress-track">
                <div class="prev-opt-progress-bar ${isWinner ? 'winner' : ''}" style="width: ${pct}%"></div>
              </div>
            </div>
          `;
        });

        let votersChipsHtml = '';
        ROOMMATES.forEach(r => {
          const v = votes[r.id];
          if (v) {
            const portionDisp = v.portion === 'No' ? 'No Tiffin' : v.portion;
            const choiceDisp = (v.portion === 'No' && (!v.option || v.option === 'No Tiffin'))
              ? 'No Tiffin'
              : `${escapeHtml(v.option)} (${portionDisp})`;
            votersChipsHtml += `<span class="prev-voter-chip"><strong>${r.name}:</strong> ${choiceDisp}</span>`;
          }
        });

        card.innerHTML = `
          <div class="prev-poll-top-row" style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
            <div style="flex:1;">
              <div class="prev-poll-tag-wrap">
                <span class="poll-tag" style="font-size:0.65rem;">${slotStr} • ${dateStr}</span>
                ${pastPoll.winner ? `<span class="prev-winner-badge">✓ Winner: ${escapeHtml(pastPoll.winner)}</span>` : ''}
              </div>
              <h4 class="prev-poll-title">${pastPoll.options ? pastPoll.options.join(' vs ') : 'Poll'}</h4>
              <p class="prev-poll-meta">By ${pastPoll.author || 'Flatmate'} • ${totalVotes} / ${ROOMMATES.length} voted</p>
            </div>
            <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
              ${pastPoll.winner ? `<button class="pill-btn-ghost btn-xs resend-past-poll-btn" data-poll-id="${pastPoll.id}" title="Forward order to cook" style="color:var(--wa-green); font-size:0.75rem; padding:3px 8px; border:1px solid rgba(37,211,102,0.3);">Forward</button>` : ''}
              <button class="pill-btn-ghost btn-xs text-muted delete-single-poll-btn" data-poll-id="${pastPoll.id}" title="Delete this old poll" style="font-size:0.75rem; padding:3px 8px; border:1px solid rgba(255,255,255,0.08);">Delete</button>
            </div>
          </div>
          <div class="prev-poll-options-summary">
            ${optionsBarsHtml}
          </div>
          ${votersChipsHtml ? `<div class="prev-voters-list">${votersChipsHtml}</div>` : ''}
        `;

        card.querySelector('.resend-past-poll-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          const provider = appState.provider || CONFIG.defaultProvider;
          const msg = generateSupplierOrderText(pastPoll, pastPoll.winner, null);
          copyToClipboard(msg);
          showToast(`Order copied for ${provider.name || 'cook'}!`);
          const phoneParam = provider.phone ? `&phone=${encodeURIComponent(provider.phone.replace(/[^0-9]/g, ''))}` : '';
          const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}${phoneParam}`;
          setTimeout(() => {
            window.open(waUrl, '_blank');
          }, 300);
        });

        card.querySelector('.delete-single-poll-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          const pid = pastPoll.id;
          const pollToDelete = (appState.pollHistory || []).find(p => p.id === pid);
          if (pollToDelete && pollToDelete.day && appState.days[pollToDelete.day]) {
            if (pollToDelete.winner && appState.days[pollToDelete.day].sabzi === pollToDelete.winner) {
              appState.days[pollToDelete.day].sabzi = '';
              appState.days[pollToDelete.day].sabziUpdatedAt = Date.now();
            }
          }
          appState.pollHistory = (appState.pollHistory || []).filter(p => p.id !== pid);
          persistAndBroadcast({
            type: 'poll_history_delete',
            pollId: pid,
            day: pollToDelete ? pollToDelete.day : null,
            winner: pollToDelete ? pollToDelete.winner : null
          });
          showToast('Poll deleted & sabji removed from Logger tab.');
          renderPollView();
          renderDailyLogger();
          renderMasterSheet();
        });

        prevListContainer.appendChild(card);
      });
    }
  }

  // 3. Master Sheet Matrix Render
  function renderMasterSheet() {
    const thead = document.getElementById('masterSheetHead');
    const tbody = document.getElementById('masterSheetBody');
    const tfoot = document.getElementById('masterSheetFooter');
    if (!tbody || !tfoot) return;

    const searchTerm = (document.getElementById('sheetSearchInput')?.value || '').toLowerCase().trim();
    tbody.innerHTML = '';
    const rates = getRates();
    const grandFlatTotal = getFlatTotals().tiffinTotal;

    const isAll = (activeSheetFilter === 'all');
    const activePerson = !isAll ? ROOMMATES.find(x => x.id === activeSheetFilter) : null;
    // Render Table Header dynamically
    if (thead) {
      if (isAll) {
        if (ROOMMATES.length === 0) {
          thead.innerHTML = `
            <tr class="header-group-row">
              <th class="th-sticky th-date"><div class="td-sticky-cell-content">Date</div></th>
              <th class="th-sticky th-menu"><div class="td-sticky-cell-content">Sabzi / Note</div></th>
              <th class="th-day-total">Day Total</th>
            </tr>
            <tr class="header-sub-row">
              <th class="th-sticky th-date-sub"><div class="td-sticky-cell-content">${CONFIG.daysInMonth} Days</div></th>
              <th class="th-sticky th-menu-sub"><div class="td-sticky-cell-content">Dish</div></th>
              <th>Amount</th>
            </tr>
          `;
        } else {
          const personHeaders = ROOMMATES.map(r => `
            <th colspan="2" class="th-person" style="background:${r.avatarColor || '#00d26a'}; color:#ffffff">${escapeHtml(r.name)}</th>
          `).join('');
          const slotHeaders = ROOMMATES.map(() => `<th>Lunch</th><th>Dinner</th>`).join('');

          thead.innerHTML = `
            <tr class="header-group-row">
              <th class="th-sticky th-date"><div class="td-sticky-cell-content">Date</div></th>
              <th class="th-sticky th-menu"><div class="td-sticky-cell-content">Sabzi / Note</div></th>
              ${personHeaders}
              <th class="th-day-total">Day Total</th>
            </tr>
            <tr class="header-sub-row">
              <th class="th-sticky th-date-sub"><div class="td-sticky-cell-content">${CONFIG.daysInMonth} Days</div></th>
              <th class="th-sticky th-menu-sub"><div class="td-sticky-cell-content">Dish</div></th>
              ${slotHeaders}
              <th>Amount</th>
            </tr>
          `;
        }
      } else if (activePerson) {
        thead.innerHTML = `
          <tr class="header-group-row">
            <th class="th-sticky th-date"><div class="td-sticky-cell-content">Date</div></th>
            <th class="th-sticky th-menu"><div class="td-sticky-cell-content">Sabzi / Note</div></th>
            <th colspan="2" class="th-person" style="background:${activePerson.avatarColor || '#00d26a'}; color:#ffffff">${escapeHtml(activePerson.name)}</th>
            <th class="th-day-total">Day Total</th>
          </tr>
          <tr class="header-sub-row">
            <th class="th-sticky th-date-sub"><div class="td-sticky-cell-content">${CONFIG.daysInMonth} Days</div></th>
            <th class="th-sticky th-menu-sub"><div class="td-sticky-cell-content">Dish</div></th>
            <th>Lunch</th><th>Dinner</th>
            <th>Amount</th>
          </tr>
        `;
      }
    }

    if (ROOMMATES.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align:center; padding:32px 16px; color:var(--text-muted);">
            No roommates in this room yet. Add members in <strong>Settings &gt; Room &amp; Members</strong>.
          </td>
        </tr>
      `;
      tfoot.innerHTML = '';
      return;
    }

    for (let d = 1; d <= CONFIG.daysInMonth; d++) {
      const dayData = appState.days[d];
      if (!dayData) continue;

      if (searchTerm) {
        const matchesDate = dayData.dateFormatted.toLowerCase().includes(searchTerm);
        const matchesSabzi = (dayData.sabzi || '').toLowerCase().includes(searchTerm);
        if (!matchesDate && !matchesSabzi) continue;
      }

      const isToday = (now.getFullYear() === currentYear && (now.getMonth() + 1) === currentMonth && d === now.getDate());
      const tr = document.createElement('tr');
      if (isToday) tr.classList.add('row-today');

      const dayTotal = getDayTotalCost(d);

      // Helper to generate interactive cell (Lunch / Dinner with Half, Full, Special, Off)
      const makeCell = (person, slot) => {
        const val = dayData.meals?.[person]?.[slot] || '';
        let valClass = 'val-off';
        let displayVal = '-';
        if (val === 'Half') { valClass = 'val-half'; displayVal = `H (₹${rates.half})`; }
        else if (val === 'Full') { valClass = 'val-full'; displayVal = `F (₹${rates.full})`; }
        else if (val === 'Special') { valClass = 'val-special'; displayVal = `Sp (₹${rates.special})`; }

        return `<td class="cell-interactive ${valClass}" data-day="${d}" data-person="${person}" data-slot="${slot}" title="Click to cycle meal for ${person}">${displayVal}</td>`;
      };

      if (isAll) {
        let memberCells = '';
        ROOMMATES.forEach(r => {
          memberCells += makeCell(r.id, 'lunch') + makeCell(r.id, 'dinner');
        });

        tr.innerHTML = `
          <td class="td-sticky-date" title="${dayData.dateFormatted}">
            <div class="td-sticky-cell-content">${dayData.dayOfWeek.slice(0, 3)}, ${d} ${MONTH_SHORTS[currentMonth - 1]}</div>
          </td>
          <td class="td-sticky-menu" data-day="${d}" title="${dayData.sabzi ? escapeHtml(dayData.sabzi) : 'Click to edit sabzi'}">
            <div class="td-sticky-cell-content">${dayData.sabzi ? escapeHtml(dayData.sabzi) : '<span style="opacity:0.35">+ Edit</span>'}</div>
          </td>
          ${memberCells}
          <td style="font-weight:700; font-family:var(--font-mono); color:${dayTotal > 0 ? 'var(--emerald)' : 'var(--text-dim)'}">
            ₹${dayTotal}
          </td>
        `;
      } else if (activePerson) {
        tr.innerHTML = `
          <td class="td-sticky-date" title="${dayData.dateFormatted}">
            <div class="td-sticky-cell-content">${dayData.dayOfWeek.slice(0, 3)}, ${d} ${MONTH_SHORTS[currentMonth - 1]}</div>
          </td>
          <td class="td-sticky-menu" data-day="${d}" title="${dayData.sabzi ? escapeHtml(dayData.sabzi) : 'Click to edit sabzi'}">
            <div class="td-sticky-cell-content">${dayData.sabzi ? escapeHtml(dayData.sabzi) : '<span style="opacity:0.35">+ Edit</span>'}</div>
          </td>
          ${makeCell(activePerson.id, 'lunch')}
          ${makeCell(activePerson.id, 'dinner')}
          <td style="font-weight:700; font-family:var(--font-mono); color:${dayTotal > 0 ? 'var(--emerald)' : 'var(--text-dim)'}">
            ₹${dayTotal}
          </td>
        `;
      }

      tbody.appendChild(tr);
    }

    // Attach Cell Click Event to Cycle Meal: Off -> Half -> Full -> Special -> Off
    tbody.querySelectorAll('.cell-interactive').forEach(cell => {
      cell.addEventListener('click', () => {
        triggerHaptic();
        const d = parseInt(cell.getAttribute('data-day'));
        const person = cell.getAttribute('data-person');
        const slot = cell.getAttribute('data-slot');

        if (!appState.days[d].meals) appState.days[d].meals = {};
        if (!appState.days[d].meals[person]) appState.days[d].meals[person] = { lunch: '', dinner: '' };

        const curVal = appState.days[d].meals[person][slot] || '';
        let nextVal = '';
        if (!curVal) nextVal = 'Half';
        else if (curVal === 'Half') nextVal = 'Full';
        else if (curVal === 'Full') nextVal = 'Special';
        else nextVal = '';

        const timestamp = Date.now();
        if (!appState.days[d].mealTimestamps) {
          appState.days[d].mealTimestamps = {};
        }
        appState.days[d].mealTimestamps[`${person}_${slot}`] = timestamp;
        appState.days[d].meals[person][slot] = nextVal;

        logActivity(SyncEngine.identity, 'Meal Update', `${capitalize(person)} ${slot}: ${nextVal || 'Off'} (Day ${d})`);
        persistAndBroadcast({
          type: 'meal_update',
          year: currentYear,
          month: currentMonth,
          day: d,
          person: person,
          slot: slot,
          value: nextVal,
          timestamp: timestamp
        });
      });
    });

    // Editable Sabzi in Sheet Tab
    tbody.querySelectorAll('.td-sticky-menu').forEach(menuCell => {
      menuCell.addEventListener('click', () => {
        triggerHaptic();
        const d = parseInt(menuCell.getAttribute('data-day'));
        const currentSabzi = appState.days[d].sabzi || '';
        const newDish = prompt(`Enter Sabzi / Dish for ${d} ${MONTH_NAMES[currentMonth - 1]}:`, currentSabzi);
        if (newDish !== null) {
          const timestamp = Date.now();
          appState.days[d].sabzi = newDish.trim();
          appState.days[d].sabziUpdatedAt = timestamp;
          logActivity(SyncEngine.identity, 'Updated Sabzi from Sheet', `Day ${d}: "${newDish.trim()}"`);
          persistAndBroadcast({
            type: 'sabzi_update',
            year: currentYear,
            month: currentMonth,
            day: d,
            sabzi: newDish.trim(),
            timestamp: timestamp
          });
          showToast(`Updated dish for ${d} ${MONTH_SHORTS[currentMonth - 1]}`);
        }
      });
    });

    // Master Sheet Footer Totals
    if (isAll) {
      const memberFooters = ROOMMATES.map(r => {
        const stats = getRoommateMonthlyStats(r.id);
        return `<td colspan="2">₹${stats.tiffinTotal}</td>`;
      }).join('');

      tfoot.innerHTML = `
        <tr>
          <td class="td-sticky-date" style="font-weight:800; color:var(--text-main);"><div class="td-sticky-cell-content">Total</div></td>
          <td class="td-sticky-menu"><div class="td-sticky-cell-content">—</div></td>
          ${memberFooters}
          <td style="font-size:1rem; color:var(--emerald);">₹${grandFlatTotal}</td>
        </tr>
      `;
    } else if (activePerson) {
      const pStats = getRoommateMonthlyStats(activePerson.id);
      tfoot.innerHTML = `
        <tr>
          <td class="td-sticky-date" style="font-weight:800; color:var(--text-main);"><div class="td-sticky-cell-content">Total</div></td>
          <td class="td-sticky-menu"><div class="td-sticky-cell-content">—</div></td>
          <td colspan="2" style="font-size:0.95rem; font-weight:800; color:var(--accent-light);">₹${pStats.tiffinTotal}</td>
          <td style="font-size:1rem; color:var(--emerald);">₹${grandFlatTotal}</td>
        </tr>
      `;
    }
  }

  // 4. Analytics & Split Render
  function renderAnalytics() {
    const flatTotals = getFlatTotals();
    const rates = getRates();

    const statExpense = document.getElementById('statsTotalExpense');
    const statMeals = document.getElementById('statsTotalMeals');
    const splitRatesSub = document.getElementById('splitRatesSubtitle');

    if (statExpense) statExpense.textContent = `₹${flatTotals.tiffinTotal}`;
    if (statMeals) statMeals.textContent = `${flatTotals.totalMeals} total meals in ${MONTH_NAMES[currentMonth - 1]}`;
    if (splitRatesSub) splitRatesSub.textContent = `${MONTH_NAMES[currentMonth - 1]} ${currentYear} • Live Rates: Half ₹${rates.half} • Full ₹${rates.full} • Special ₹${rates.special}`;

    // Roommate Expense Split Bars (Relative Scale: Highest Spender at 100%)
    const list = document.getElementById('roommateSplitBarsList');
    if (!list) return;
    list.innerHTML = '';

    // Calculate stats for all roommates and find max spend
    const roommateStats = ROOMMATES.map(r => {
      const stats = getRoommateMonthlyStats(r.id);
      const shareOfTotal = flatTotals.tiffinTotal > 0 ? ((stats.tiffinTotal / flatTotals.tiffinTotal) * 100).toFixed(1) : 0;
      return { r, stats, shareOfTotal };
    });

    const maxSpend = Math.max(...roommateStats.map(item => item.stats.tiffinTotal), 1);

    roommateStats.forEach(({ r, stats, shareOfTotal }) => {
      // Relative scale: highest spender gets 100%, others scale relatively
      const relativePct = stats.tiffinTotal > 0 ? Math.min(100, Math.max(10, Math.round((stats.tiffinTotal / maxSpend) * 100))) : 0;

      const item = document.createElement('div');
      item.className = 'split-row-item';
      item.innerHTML = `
        <div class="split-row-header">
          <div class="split-person-details">
            <div class="roommate-avatar" style="width:30px; height:30px; overflow:hidden; display:flex; align-items:center; justify-content:center; background:none;">${getCartoonAvatarSvg(r.id || r.name, 30)}</div>
            <strong style="font-size:0.95rem">${r.name}</strong>
          </div>
          <div class="split-amount-wrap">
            <span class="split-share-pct" title="${shareOfTotal}% of flat total">${relativePct}%</span>
            <span class="split-cost">₹${stats.tiffinTotal}</span>
          </div>
        </div>
        <div class="split-bar-track">
          <div class="split-bar-fill" style="width:${relativePct}%; background:${r.avatarColor}"></div>
        </div>
        <div class="split-actions-sub">
          <span>${stats.halfCount} Half (₹${stats.halfCount * rates.half}) • ${stats.fullCount} Full (₹${stats.fullCount * rates.full})${stats.specialCount ? ` • ${stats.specialCount} Special (₹${stats.specialCount * rates.special})` : ''}</span>
          <span style="font-family:var(--font-mono); font-weight:700;">${stats.totalMeals} Meals</span>
        </div>
      `;

      list.appendChild(item);
    });

    // Popular Dishes Counter
    const dishCounts = {};
    for (let d = 1; d <= CONFIG.daysInMonth; d++) {
      const sabzi = (appState.days[d]?.sabzi || '').trim();
      if (sabzi) {
        dishCounts[sabzi] = (dishCounts[sabzi] || 0) + 1;
      }
    }

    const dishesGrid = document.getElementById('popularDishesGrid');
    if (dishesGrid) {
      dishesGrid.innerHTML = '';
      const sortedDishes = Object.entries(dishCounts).sort((a, b) => b[1] - a[1]);
      if (sortedDishes.length === 0) {
        dishesGrid.innerHTML = '<p class="helper-text">No sabzis recorded yet. Start logging dishes in Daily Logger!</p>';
      } else {
        sortedDishes.forEach(([dish, count]) => {
          const tile = document.createElement('div');
          tile.className = 'dish-tile';
          tile.innerHTML = `
            <span class="dish-tile-name">${escapeHtml(dish)}</span>
            <span class="dish-tile-count">${count} day${count === 1 ? '' : 's'} cooked</span>
          `;
          dishesGrid.appendChild(tile);
        });
      }
    }
  }

  // 5. UPI Direct Settlement Render
  function renderUpiSettlement() {
    const roommateSelect = document.getElementById('upiRoommateSelect');
    if (!roommateSelect) return;

    if (roommateSelect.options.length === 0) {
      ROOMMATES.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.name;
        roommateSelect.appendChild(opt);
      });
      roommateSelect.value = selectedUpiRoommate;
    }

    const provider = appState.provider || CONFIG.defaultProvider;

    // Display cook details
    const nameDisplay = document.getElementById('upiCookNameDisplay');
    const vpaDisplay = document.getElementById('upiCookVpaDisplay');
    const phoneDisplay = document.getElementById('upiCookPhoneDisplay');
    if (nameDisplay) nameDisplay.textContent = provider.name;
    if (vpaDisplay) vpaDisplay.textContent = provider.upi;
    if (phoneDisplay) phoneDisplay.textContent = provider.phone ? `Mobile: ${provider.phone}` : 'Tiffin & Mess Provider';

    const roommateObj = ROOMMATES.find(r => r.id === selectedUpiRoommate) || ROOMMATES[0];
    const stats = getRoommateMonthlyStats(roommateObj.id);
    const amountToPay = (customUpiAmount !== null) ? customUpiAmount : stats.tiffinTotal;

    const displayAmount = document.getElementById('upiDisplayAmount');
    if (displayAmount) displayAmount.textContent = amountToPay;

    const amountNote = document.getElementById('upiAmountNote');
    if (amountNote) {
      amountNote.textContent = customUpiAmount !== null 
        ? `Custom payment entered for ${roommateObj.name}`
        : `${roommateObj.name}'s ${MONTH_NAMES[currentMonth - 1]} bill (${stats.totalMeals} meals)`;
    }

    // Dynamic UPI Deep Link
    const note = encodeURIComponent(`Tiffin Payment - ${roommateObj.name} (${MONTH_SHORTS[currentMonth - 1]} ${currentYear})`);
    const upiUri = `upi://pay?pa=${encodeURIComponent(provider.upi)}&pn=${encodeURIComponent(provider.name)}&am=${amountToPay}&tn=${note}&cu=INR`;

    const payLink = document.getElementById('upiDirectPayLink');
    if (payLink) payLink.href = upiUri;

    // Dynamic QR Code Rendering
    const qrContainer = document.getElementById('upiQrCodeContainer');
    if (qrContainer && window.QRCode) {
      try {
        const svg = window.QRCode.generateSVG(upiUri, {
          size: 190,
          margin: 1,
          color: '#090e17',
          background: '#ffffff'
        });
        qrContainer.innerHTML = svg;
      } catch (err) {
        qrContainer.innerHTML = `<span style="font-size:0.75rem; color:#f43f5e">QR code generator error</span>`;
      }
    }
  }

  // 6. Amul Milk Tracker Render
  function renderAmulTracker() {
    const dayData = appState.days[selectedDay];
    if (!dayData) return;

    if (!appState.amulMembers || !Array.isArray(appState.amulMembers) || appState.amulMembers.length === 0) {
      appState.amulMembers = ['anjan', 'saurabh'];
    }
    const members = appState.amulMembers;

    const rates = getRates();
    const amulBadge = document.getElementById('amulPriceBadge');
    if (amulBadge) amulBadge.textContent = `₹${rates.amulPacket || 35} / packet`;

    const amulDayLabel = document.getElementById('amulCurrentDayLabel');
    if (amulDayLabel) amulDayLabel.textContent = dayData.dateShort;

    const formatRupees = (val) => (val % 1 === 0 ? `₹${val}` : `₹${val.toFixed(1)}`);
    const formatPkts = (val) => (val % 1 === 0 ? `${val} pkt` : `${val.toFixed(1)} pkt`);

    // 1. Relative Bar Graph (Replacing old summary cards)
    let grandTotalPackets = 0;
    let grandTotalCost = 0;

    const memberStatsList = members.map(personId => {
      const stats = getRoommateMonthlyStats(personId);
      grandTotalPackets += stats.milkPackets;
      grandTotalCost += stats.milkTotal;
      const roommateObj = ROOMMATES.find(r => r.id === personId) || {
        id: personId,
        name: capitalize(personId),
        avatarColor: '#00d4ff'
      };
      return { personId, r: roommateObj, stats };
    });

    const maxMilkCost = Math.max(...memberStatsList.map(item => item.stats.milkTotal), 1);

    const amulBarsList = document.getElementById('amulSplitBarsList');
    if (amulBarsList) {
      amulBarsList.innerHTML = '';
      memberStatsList.forEach(({ personId, r, stats }) => {
        const relativePct = stats.milkTotal > 0 ? Math.min(100, Math.max(10, Math.round((stats.milkTotal / maxMilkCost) * 100))) : 0;
        const initials = r.name.slice(0, 2).toUpperCase();

        const item = document.createElement('div');
        item.className = 'split-row-item';
        item.innerHTML = `
          <div class="split-row-header">
            <div class="split-person-details">
              <div class="roommate-avatar" style="width:30px; height:30px; overflow:hidden; display:flex; align-items:center; justify-content:center; background:none;">${getCartoonAvatarSvg(personId || r.name, 30)}</div>
              <strong style="font-size:0.95rem">${escapeHtml(r.name)}</strong>
              ${members.length > 1 ? `<button class="amul-remove-btn" data-person="${personId}" title="Remove ${escapeHtml(r.name)} from Amul Tracker" style="margin-left:8px; cursor:pointer; background:none; border:none; color:var(--text-dim); font-size:0.8rem; line-height:1; padding:2px 4px;">✕</button>` : ''}
            </div>
            <div class="split-amount-wrap">
              <span class="split-share-pct">${relativePct}%</span>
              <span class="split-cost">${formatRupees(stats.milkTotal)}</span>
            </div>
          </div>
          <div class="split-bar-track">
            <div class="split-bar-fill" style="width:${relativePct}%; background:${r.avatarColor}"></div>
          </div>
          <div class="split-actions-sub">
            <span>${stats.milkPackets} packet${stats.milkPackets === 1 ? '' : 's'} (${stats.milkPackets} × ₹${rates.amulPacket || 35})</span>
            <span style="font-family:var(--font-mono); font-weight:700;">${formatRupees(stats.milkTotal)}</span>
          </div>
        `;
        amulBarsList.appendChild(item);
      });
    }

    // 2. Dynamic Daily Quick Logging Grid
    const dailyGrid = document.getElementById('amulOptionsGrid');
    if (dailyGrid) {
      dailyGrid.innerHTML = '';
      members.forEach(personId => {
        const displayName = capitalize(ROOMMATES.find(r => r.id === personId)?.name || personId);
        const curVal = Number(dayData.amul?.[personId]) || 0;

        const box = document.createElement('div');
        box.className = 'amul-person-box';
        box.innerHTML = `
          <div class="amul-person-header">
            <span class="stepper-name">${escapeHtml(displayName)}</span>
            <span class="amul-current-selected">${curVal ? `${curVal} pkt` : '0 pkt'}</span>
          </div>
          <div class="amul-pill-group" data-person="${personId}">
            <button class="amul-pill-btn ${curVal === 0 ? 'active' : ''}" data-qty="0">Off</button>
            <button class="amul-pill-btn ${curVal === 0.5 ? 'active' : ''}" data-qty="0.5">0.5</button>
            <button class="amul-pill-btn ${curVal === 1 ? 'active' : ''}" data-qty="1">1</button>
            <button class="amul-pill-btn ${curVal === 2 ? 'active' : ''}" data-qty="2">2</button>
          </div>
        `;
        dailyGrid.appendChild(box);
      });
    }

    // 3. Dynamic Table Header
    const theadRow = document.getElementById('amulTableHeadRow');
    if (theadRow) {
      theadRow.innerHTML = `<th class="th-sticky">Date</th>`;
      members.forEach(personId => {
        const displayName = capitalize(ROOMMATES.find(r => r.id === personId)?.name || personId);
        const th = document.createElement('th');
        th.textContent = `${displayName} (Pkt)`;
        theadRow.appendChild(th);
      });
      const thTotal = document.createElement('th');
      thTotal.textContent = 'Day Total';
      theadRow.appendChild(thTotal);
    }

    // 4. Dynamic Table Body
    const tbody = document.getElementById('amulTableBody');
    if (tbody) {
      tbody.innerHTML = '';
      const pktRate = Number(rates.amulPacket) || 35;

      for (let d = 1; d <= CONFIG.daysInMonth; d++) {
        const dData = appState.days[d];
        let dayTotalPkts = 0;

        const tr = document.createElement('tr');
        if (d === selectedDay) tr.style.backgroundColor = 'rgba(6, 182, 212, 0.12)';

        let cellsHtml = `<td class="td-sticky-date">${dData.dateShort}</td>`;

        members.forEach(personId => {
          const pkt = Number(dData?.amul?.[personId]) || 0;
          dayTotalPkts += pkt;
          cellsHtml += `
            <td class="cell-interactive ${pkt > 0 ? 'val-special' : 'val-off'} cell-amul-interactive" data-day="${d}" data-person="${personId}" title="Click to cycle: Off -> 0.5 -> 1 -> 2 -> Off">
              ${pkt ? `${pkt} pkt` : '-'}
            </td>
          `;
        });

        const dayCost = dayTotalPkts * pktRate;
        cellsHtml += `
          <td style="font-family:var(--font-mono); font-weight:700; color:${dayCost > 0 ? 'var(--cyan)' : 'var(--text-dim)'}">
            ${dayCost > 0 ? formatRupees(dayCost) : '-'}
          </td>
        `;

        tr.innerHTML = cellsHtml;
        tbody.appendChild(tr);
      }

      // 5. Dynamic Table Footer (Contributions visible at bottom of table)
      const tfoot = document.getElementById('amulTableFooter');
      if (tfoot) {
        let pktsRowHtml = `<td class="td-sticky-date" style="font-weight:700;">Total Pkts</td>`;
        let costRowHtml = `<td class="td-sticky-date" style="font-weight:800; border-top:1px dashed rgba(255,255,255,0.15); color:var(--text-main);">Total Bill</td>`;

        members.forEach(personId => {
          const stats = getRoommateMonthlyStats(personId);
          pktsRowHtml += `<td style="font-family:var(--font-mono); font-weight:700;">${stats.milkPackets} pkt</td>`;
          costRowHtml += `<td style="font-family:var(--font-mono); font-weight:800; color:var(--cyan); border-top:1px dashed rgba(255,255,255,0.15);">${formatRupees(stats.milkTotal)}</td>`;
        });

        pktsRowHtml += `<td style="font-family:var(--font-mono); font-weight:800; color:var(--text-main);">${grandTotalPackets} pkt</td>`;
        costRowHtml += `<td style="font-family:var(--font-mono); font-weight:800; color:var(--emerald); border-top:1px dashed rgba(255,255,255,0.15);">${formatRupees(grandTotalCost)}</td>`;

        tfoot.innerHTML = `<tr>${pktsRowHtml}</tr><tr>${costRowHtml}</tr>`;
      }

      // Cell Click to Cycle: 0 -> 0.5 -> 1 -> 2 -> 0
      tbody.querySelectorAll('.cell-amul-interactive').forEach(cell => {
        cell.addEventListener('click', () => {
          triggerHaptic();
          const d = parseInt(cell.getAttribute('data-day'));
          const p = cell.getAttribute('data-person');
          const cur = Number(appState.days[d]?.amul?.[p]) || 0;
          let next = 0;
          if (cur === 0) next = 0.5;
          else if (cur === 0.5) next = 1;
          else if (cur === 1) next = 2;
          else next = 0;

          if (!appState.days[d].amul) appState.days[d].amul = {};
          appState.days[d].amul[p] = next;
          logActivity(SyncEngine.identity, 'Milk Packets', `${capitalize(p)}: ${next} pkt (Day ${d})`);
          persistAndBroadcast({
            type: 'amul_update',
            year: currentYear,
            month: currentMonth,
            day: d,
            person: p,
            value: next
          });
          renderAmulTracker();
        });
      });
    }
  }

  // 7. Share & WhatsApp Summary Generation
  function generateWhatsAppSummaryText() {
    const totals = getFlatTotals();
    const rates = getRates();
    const provider = appState.provider || CONFIG.defaultProvider;
    const mNameUpper = MONTH_NAMES[currentMonth - 1].toUpperCase();

    let text = `🍛 *TIFFIN EXPENSE SUMMARY - ${mNameUpper} ${currentYear}*\n`;
    text += `Flat Tiffin Ledger • Cook: ${provider.name}\n`;
    text += `Rate: Half ₹${rates.half} | Full ₹${rates.full} | Special ₹${rates.special}\n`;
    text += `──────────────────────\n`;

    ROOMMATES.forEach(r => {
      const stats = getRoommateMonthlyStats(r.id);
      text += `*${r.name}*: ₹${stats.tiffinTotal}\n`;
      text += `  └ ${stats.halfCount} Half, ${stats.fullCount} Full${stats.specialCount ? `, ${stats.specialCount} Special` : ''} (${stats.totalMeals} meals)\n`;
    });

    text += `──────────────────────\n`;
    text += `💰 *TOTAL EXPENSE: ₹${totals.tiffinTotal}* (${totals.totalMeals} meals)\n`;
    text += `👩‍🍳 *UPI Payee:* ${provider.name}\n`;
    text += `📲 *UPI ID:* \`${provider.upi}\`\n\n`;
    text += `Please settle directly via UPI with your name in note!`;

    return text;
  }

  function renderExportView() {
    const shareUrlInput = document.getElementById('shareUrlDisplay');
    if (shareUrlInput) {
      const baseUrl = window.location.href.split('#')[0];
      shareUrlInput.value = `${baseUrl}#room=${SyncEngine.roomCode}`;
    }

    const waPre = document.getElementById('waSummaryText');
    if (waPre) {
      waPre.textContent = generateWhatsAppSummaryText();
    }
  }

  function renderAuditLog() {
    const container = document.getElementById('auditLogList');
    if (!container) return;
    container.innerHTML = '';

    const logs = appState.auditLog || [];
    if (logs.length === 0) {
      container.innerHTML = '<p class="helper-text">No activity recorded yet.</p>';
      return;
    }

    logs.slice(0, 50).forEach(log => {
      const item = document.createElement('div');
      item.className = 'audit-log-item';
      item.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="audit-author">${escapeHtml(log.author)}</span>
          <span class="audit-time">${escapeHtml(log.timeFormatted || '')}</span>
        </div>
        <div style="font-weight:600; color:var(--text-main); font-size:0.75rem;">${escapeHtml(log.action)}</div>
        <div style="color:var(--text-muted); font-size:0.7rem;">${escapeHtml(log.details)}</div>
      `;
      container.appendChild(item);
    });
  }

  // Master Render Coordinator
  function renderAll() {
    renderDailyLogger();
    renderPollView();
    renderMasterSheet();
    renderAnalytics();
    renderUpiSettlement();
    renderAmulTracker();
    renderExportView();
    renderAuditLog();
  }

  // ==========================================================================
  // UI INTERACTIVITY & EVENT HANDLERS
  // ==========================================================================

  function switchTab(target) {
    document.querySelectorAll('.nav-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-tab') === target);
    });
    document.querySelectorAll('.m-nav-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-tab') === target);
    });
    document.querySelectorAll('.view-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `view-${target}`);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleUrlHash() {
    const raw = (window.location.hash || '').replace('#', '').trim();
    if (!raw) return;
    if (raw === 'month-modal') {
      const modal = document.getElementById('monthPickerModal');
      if (modal) {
        modalDisplayedYear = currentYear;
        const yearDisplay = document.getElementById('pickerYearVal');
        const monthsGrid = document.getElementById('monthsPickerGrid');
        if (yearDisplay) yearDisplay.textContent = modalDisplayedYear;
        if (monthsGrid) {
          monthsGrid.innerHTML = '';
          MONTH_SHORTS.forEach((shortName, idx) => {
            const mNum = idx + 1;
            const btn = document.createElement('button');
            btn.className = 'month-select-btn';
            if (modalDisplayedYear === currentYear && mNum === currentMonth) btn.classList.add('active');
            btn.textContent = shortName;
            btn.addEventListener('click', () => {
              triggerHaptic();
              switchMonth(modalDisplayedYear, mNum);
              modal.classList.remove('active');
            });
            monthsGrid.appendChild(btn);
          });
        }
        modal.classList.add('active');
      }
      return;
    }
    const clean = raw.replace('view-', '');
    if (['logger', 'poll', 'sheet', 'split', 'upi', 'amul'].includes(clean)) {
      switchTab(clean);
    }
  }

  function setupNavigation() {
    const tabs = document.querySelectorAll('.nav-tab, .m-nav-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        triggerHaptic();
        const target = tab.getAttribute('data-tab');
        switchTab(target);
      });
    });

    window.addEventListener('hashchange', handleUrlHash);
    handleUrlHash();

    // Header poll quick button
    const headerPollBtn = document.getElementById('headerPollBtn');
    if (headerPollBtn) {
      headerPollBtn.addEventListener('click', () => {
        triggerHaptic();
        const pollTab = document.querySelector('.nav-tab[data-tab="poll"]') || document.querySelector('.m-nav-tab[data-tab="poll"]');
        if (pollTab) pollTab.click();
      });
    }

    // Logger poll quick button
    const openPollQuickBtn = document.getElementById('openPollQuickBtn');
    if (openPollQuickBtn) {
      openPollQuickBtn.addEventListener('click', () => {
        triggerHaptic();
        const pollTab = document.querySelector('.nav-tab[data-tab="poll"]') || document.querySelector('.m-nav-tab[data-tab="poll"]');
        if (pollTab) pollTab.click();
      });
    }
  }

  function setupDateControls() {
    const prevBtn = document.getElementById('prevDayBtn');
    const nextBtn = document.getElementById('nextDayBtn');
    const jumpTodayBtn = document.getElementById('jumpTodayBtn');
    const daySelect = document.getElementById('daySelectInput');
    const sheetJumpTodayBtn = document.getElementById('sheetJumpTodayBtn');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        triggerHaptic();
        if (selectedDay > 1) {
          selectedDay--;
          renderAll();
        } else {
          // Rollover to previous month's last day
          let prevY = currentYear;
          let prevM = currentMonth - 1;
          if (prevM < 1) { prevM = 12; prevY--; }
          switchMonth(prevY, prevM);
          selectedDay = CONFIG.daysInMonth;
          renderAll();
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        triggerHaptic();
        if (selectedDay < CONFIG.daysInMonth) {
          selectedDay++;
          renderAll();
        } else {
          // Rollover to next month's Day 1
          let nextY = currentYear;
          let nextM = currentMonth + 1;
          if (nextM > 12) { nextM = 1; nextY++; }
          switchMonth(nextY, nextM);
          selectedDay = 1;
          renderAll();
        }
      });
    }

    if (jumpTodayBtn) {
      jumpTodayBtn.addEventListener('click', () => {
        triggerHaptic();
        const d = new Date();
        const realY = d.getFullYear();
        const realM = d.getMonth() + 1;
        if (currentYear !== realY || currentMonth !== realM) {
          switchMonth(realY, realM);
        } else {
          selectedDay = CONFIG.todayDay;
          renderAll();
        }
        showToast(`Jumped to Today (Day ${d.getDate()} ${MONTH_SHORTS[realM - 1]})`);
      });
    }

    if (sheetJumpTodayBtn) {
      sheetJumpTodayBtn.addEventListener('click', () => {
        triggerHaptic();
        const d = new Date();
        const realY = d.getFullYear();
        const realM = d.getMonth() + 1;
        if (currentYear !== realY || currentMonth !== realM) {
          switchMonth(realY, realM);
        } else {
          selectedDay = CONFIG.todayDay;
          renderAll();
        }
        const row = document.querySelector('.row-today');
        if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }

    if (daySelect) {
      daySelect.addEventListener('change', (e) => {
        selectedDay = parseInt(e.target.value);
        renderAll();
      });
    }
  }

  function setupSabziControls() {
    const sabziInput = document.getElementById('sabziInput');
    const clearBtn = document.getElementById('clearSabziBtn');

    let debounceTimer = null;
    if (sabziInput) {
      sabziInput.addEventListener('input', (e) => {
        const timestamp = Date.now();
        appState.days[selectedDay].sabzi = e.target.value;
        appState.days[selectedDay].sabziUpdatedAt = timestamp;
        saveStateToStorage(appState);
        renderMasterSheet();

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          logActivity(SyncEngine.identity, 'Sabzi Update', `Day ${selectedDay} dish set to "${e.target.value}"`);
          SyncEngine.broadcast({
            type: 'sabzi_update',
            year: currentYear,
            month: currentMonth,
            day: selectedDay,
            sabzi: e.target.value,
            timestamp: timestamp
          });
        }, 400);
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        triggerHaptic();
        const timestamp = Date.now();
        appState.days[selectedDay].sabzi = '';
        appState.days[selectedDay].sabziUpdatedAt = timestamp;
        if (sabziInput) sabziInput.value = '';
        renderDailyLogger();
        renderMasterSheet();
        logActivity(SyncEngine.identity, 'Cleared Sabzi', `Day ${selectedDay}`);
        persistAndBroadcast({
          type: 'sabzi_update',
          year: currentYear,
          month: currentMonth,
          day: selectedDay,
          sabzi: '',
          timestamp: timestamp
        });
      });
    }

    // Change / Edit dish button on banner
    const editBannerBtn = document.getElementById('editSabziBannerBtn');
    if (editBannerBtn) {
      editBannerBtn.addEventListener('click', () => {
        triggerHaptic();
        const banner = document.getElementById('sabziDisplayBanner');
        const inputRow = document.getElementById('sabziInputRow');
        if (banner) banner.style.display = 'none';
        if (inputRow) inputRow.style.display = 'flex';
        if (sabziInput) sabziInput.focus();
      });
    }
  }

  function setupFastActions() {
    const clearTodayBtn = document.getElementById('clearTodayMealsBtn');

    if (clearTodayBtn) {
      clearTodayBtn.addEventListener('click', () => {
        triggerHaptic();
        requireAdminPassword(() => {
          const timestamp = Date.now();
          appState.days[selectedDay].sabzi = '';
          appState.days[selectedDay].sabziUpdatedAt = timestamp;
          if (!appState.days[selectedDay].mealTimestamps) {
            appState.days[selectedDay].mealTimestamps = {};
          }
          ROOMMATES.forEach(r => {
            if (appState.days[selectedDay].meals && appState.days[selectedDay].meals[r.id]) {
              appState.days[selectedDay].meals[r.id] = { lunch: '', dinner: '' };
              appState.days[selectedDay].mealTimestamps[`${r.id}_lunch`] = timestamp;
              appState.days[selectedDay].mealTimestamps[`${r.id}_dinner`] = timestamp;
            }
          });
          logActivity(SyncEngine.identity, 'Admin Action', `Reset meals for Day ${selectedDay}`);
          persistAndBroadcast({
            type: 'day_reset',
            year: currentYear,
            month: currentMonth,
            day: selectedDay,
            timestamp: timestamp
          });
          showToast(`Meals for Day ${selectedDay} reset to Off`);
        });
      });
    }

    function handleMonthReset() {
      triggerHaptic();
      requireAdminPassword(() => {
        const cleanState = getDefaultDataForMonth(currentYear, currentMonth);
        cleanState.rates = { ...appState.rates };
        cleanState.provider = { ...appState.provider };
        cleanState.amulMembers = [...(appState.amulMembers || ['anjan', 'saurabh'])];
        appState = cleanState;

        logActivity(SyncEngine.identity, 'Admin Action', `Hard Reset: Erased month ledger for ${MONTH_NAMES[currentMonth - 1]} ${currentYear}`);
        persistAndBroadcast({
          type: 'month_reset',
          year: currentYear,
          month: currentMonth
        });
        showToast(`💥 Month ledger for ${MONTH_NAMES[currentMonth - 1]} ${currentYear} has been reset!`);
      });
    }

    const settingsResetMonthBtn = document.getElementById('settingsResetMonthBtn');
    if (settingsResetMonthBtn) {
      settingsResetMonthBtn.addEventListener('click', () => {
        const modal = document.getElementById('settingsModal');
        if (modal) modal.classList.remove('active');
        handleMonthReset();
      });
    }
  }

  // --- Voting Poll Interaction ---
  function setupPollControls() {
    const addOptBtn = document.getElementById('addPollOptionBtn');
    const optContainer = document.getElementById('pollOptionInputsContainer');
    const launchPollBtn = document.getElementById('launchPollBtn');
    const submitVoteBtn = document.getElementById('submitVoteBtn');
    const changeVoteBtn = document.getElementById('changeVoteBtn');
    const finalizePollBtn = document.getElementById('finalizePollBtn');
    const portionButtons = document.querySelectorAll('#pollPortionToggle .seg-btn');

    let selectedPortion = 'Half';

    portionButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        portionButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedPortion = btn.getAttribute('data-portion');
      });
    });

    if (changeVoteBtn) {
      changeVoteBtn.addEventListener('click', () => {
        triggerHaptic();
        const myVoteBox = document.getElementById('myVoteBox');
        const myVotedSummary = document.getElementById('myVotedSummaryBox');
        if (myVoteBox) myVoteBox.style.display = 'block';
        if (myVotedSummary) myVotedSummary.style.display = 'none';
      });
    }

    if (addOptBtn && optContainer) {
      addOptBtn.addEventListener('click', () => {
        triggerHaptic();
        const inputCount = optContainer.querySelectorAll('input').length + 1;
        const newInput = document.createElement('input');
        newInput.type = 'text';
        newInput.className = 'text-input poll-opt-input';
        newInput.placeholder = `Option ${inputCount}`;
        optContainer.appendChild(newInput);
        newInput.focus();
      });
    }

    if (launchPollBtn) {
      launchPollBtn.addEventListener('click', () => {
        triggerHaptic();
        const day = parseInt(document.getElementById('pollDaySelect')?.value || selectedDay);
        const slot = document.getElementById('pollMealSlotSelect')?.value || 'Dinner';
        const inputs = document.querySelectorAll('.poll-opt-input');

        const options = [];
        inputs.forEach(inp => {
          const val = inp.value.trim();
          if (val) options.push(val);
        });

        if (options.length < 2) {
          alert('Please enter at least 2 sabzi options for the poll.');
          return;
        }

        const newPoll = {
          id: 'poll_' + Date.now(),
          day: day,
          mealSlot: slot,
          author: SyncEngine.identity,
          createdTime: Date.now(),
          status: 'active',
          options: options,
          votes: {},
          winner: null
        };

        if (appState.activePoll && appState.activePoll.id !== newPoll.id) {
          appState.pollHistory = appState.pollHistory || [];
          const exists = appState.pollHistory.some(p => p.id === appState.activePoll.id);
          if (!exists) appState.pollHistory.unshift(appState.activePoll);
        }

        appState.activePoll = newPoll;
        logActivity(SyncEngine.identity, 'Created Poll', `${slot} poll for Day ${day}: ${options.join(', ')}`);
        persistAndBroadcast({
          type: 'poll_created',
          poll: newPoll
        });
        showToast('Poll launched to flatmates!');
        sessionStorage.setItem('tiffin_notified_poll_' + newPoll.id, 'true');
        hidePollAlertBanner();
        localStorage.setItem('tiffin_poll_remind_' + newPoll.id, Date.now().toString());
        PollReminderManager.start(newPoll);
        renderPollView();
      });
    }

    const pollNotifBtn = document.getElementById('pollNotificationBtn');
    if (pollNotifBtn) {
      pollNotifBtn.addEventListener('click', () => {
        triggerHaptic();
        NotificationManager.requestPermission(true);
      });
    }

    const settingsNotifBtn = document.getElementById('settingsNotificationBtn');
    if (settingsNotifBtn) {
      settingsNotifBtn.addEventListener('click', () => {
        triggerHaptic();
        NotificationManager.requestPermission(true);
      });
    }

    const resetActivePollBtn = document.getElementById('resetActivePollBtn');
    if (resetActivePollBtn) {
      resetActivePollBtn.addEventListener('click', () => {
        if (!appState.activePoll) return;
        if (confirm('Menu shifted? This will cancel the current poll and clear its sabji so you can launch a new one.')) {
          triggerHaptic();
          const oldPoll = appState.activePoll;
          PollReminderManager.stop(oldPoll.id);
          oldPoll.status = 'cancelled';
          if (oldPoll.day && appState.days[oldPoll.day]) {
            if (oldPoll.winner && appState.days[oldPoll.day].sabzi === oldPoll.winner) {
              appState.days[oldPoll.day].sabzi = '';
              appState.days[oldPoll.day].sabziUpdatedAt = Date.now();
            }
          }
          appState.pollHistory = appState.pollHistory || [];
          appState.pollHistory.unshift({ ...oldPoll });
          appState.activePoll = null;

          persistAndBroadcast({
            type: 'poll_cancelled',
            pollId: oldPoll.id,
            day: oldPoll.day,
            winner: oldPoll.winner
          });
          showToast('Active poll cancelled & sabji reset.');
          renderPollView();
          renderDailyLogger();
          renderMasterSheet();
        }
      });
    }

    const clearAllPrevPollsBtn = document.getElementById('clearAllPrevPollsBtn');
    if (clearAllPrevPollsBtn) {
      clearAllPrevPollsBtn.addEventListener('click', () => {
        if (!appState.pollHistory || appState.pollHistory.length === 0) return;
        if (confirm('Delete all previous polls?')) {
          triggerHaptic();
          appState.pollHistory = [];
          persistAndBroadcast({ type: 'poll_history_clear' });
          showToast('All previous polls deleted.');
          renderPollView();
        }
      });
    }

    if (submitVoteBtn) {
      submitVoteBtn.addEventListener('click', () => {
        triggerHaptic();
        if (!appState.activePoll || appState.activePoll.status !== 'active') return;

        const activePortionBtn = document.querySelector('#pollPortionToggle .seg-btn.active');
        const portionChoice = activePortionBtn ? activePortionBtn.getAttribute('data-portion') : selectedPortion;

        const selectedRadio = document.querySelector('input[name="pollDishChoice"]:checked');
        if (portionChoice !== 'No' && !selectedRadio) {
          alert('Please select a sabzi option to submit your vote!');
          return;
        }

        const dishChoice = selectedRadio ? selectedRadio.value : 'No Tiffin';
        const myName = SyncEngine.identity || 'Anjan';
        const myId = myName.trim().toLowerCase();
        const foundMember = (typeof ROOMMATES !== 'undefined' && Array.isArray(ROOMMATES))
          ? ROOMMATES.find(r => (r.name && r.name.toLowerCase() === myId) || (r.id && r.id.toLowerCase() === myId))
          : null;
        const resolvedId = foundMember ? foundMember.id : myId;

        if (!appState.activePoll.votes) appState.activePoll.votes = {};
        const voteObj = {
          option: dishChoice,
          portion: portionChoice,
          time: Date.now(),
          voterName: myName
        };
        appState.activePoll.votes[resolvedId] = voteObj;
        if (resolvedId !== myId) {
          appState.activePoll.votes[myId] = voteObj;
        }

        logActivity(SyncEngine.identity, 'Voted', `Voted "${dishChoice}" (${portionChoice === 'No' ? 'No Tiffin' : portionChoice}) in ${appState.activePoll.mealSlot} Poll`);
        persistAndBroadcast({
          type: 'poll_voted',
          pollId: appState.activePoll.id,
          roommateId: resolvedId,
          option: dishChoice,
          portion: portionChoice
        });
        PollReminderManager.stop(appState.activePoll.id);
        hidePollAlertBanner();
        showToast(`Vote submitted! 5-min poll reminders stopped.`);
        renderPollView();
      });
    }

    if (finalizePollBtn) {
      finalizePollBtn.addEventListener('click', () => {
        triggerHaptic();
        const poll = appState.activePoll;
        if (!poll) return;

        const votes = poll.votes || {};
        if (Object.keys(votes).length === 0) {
          alert('No votes have been cast in this poll yet.');
          return;
        }

        // Count votes and find winner
        const tally = {};
        poll.options.forEach(opt => tally[opt] = 0);
        Object.values(votes).forEach(v => {
          if (v.portion !== 'No' && tally[v.option] !== undefined) {
            tally[v.option]++;
          }
        });

        let winningDish = poll.options[0];
        let maxVotes = -1;
        Object.entries(tally).forEach(([dish, count]) => {
          if (count > maxVotes) {
            maxVotes = count;
            winningDish = dish;
          }
        });

        // Apply winning sabzi to selected day
        appState.days[poll.day].sabzi = winningDish;

        // Apply each roommate's chosen portion
        const slotKey = (poll.mealSlot || 'Dinner').toLowerCase();
        const mealsApplied = {};

        ROOMMATES.forEach(r => {
          const voterData = votes[r.id];
          const portion = voterData ? voterData.portion : 'Off';
          mealsApplied[r.id] = (portion === 'No') ? 'Off' : portion;
          appState.days[poll.day].meals[r.id][slotKey] = (portion === 'Off' || portion === 'No') ? '' : portion;
        });

        poll.status = 'finalized';
        poll.winner = winningDish;

        appState.pollHistory = appState.pollHistory || [];
        const existingIdx = appState.pollHistory.findIndex(p => p.id === poll.id);
        if (existingIdx >= 0) {
          appState.pollHistory[existingIdx] = { ...poll };
        } else {
          appState.pollHistory.unshift({ ...poll });
        }

        PollReminderManager.stop(poll.id);
        logActivity(SyncEngine.identity, 'Finalized Poll', `Winner: ${winningDish} (${maxVotes > 0 ? maxVotes : 0} votes)`);
        persistAndBroadcast({
          type: 'poll_finalized',
          day: poll.day,
          mealSlot: poll.mealSlot,
          winner: winningDish,
          mealsApplied: mealsApplied
        });

        NotificationManager.send(`Poll Finalized`, {
          body: `${poll.mealSlot || 'Meal'} menu decided. Tap to view.`,
          tag: 'poll-winner-' + poll.day,
          renotify: true
        });

        // Generate WhatsApp Order Message for Tiffin Supplier
        const provider = appState.provider || CONFIG.defaultProvider;
        const waOrder = generateSupplierOrderText(poll, winningDish, mealsApplied);

        // Copy and open WhatsApp
        copyToClipboard(waOrder);
        showToast(`Order copied for ${provider.name || 'cook'}!`);
        renderPollView();
        renderDailyLogger();
        renderMasterSheet();

        const phoneParam = provider.phone ? `&phone=${encodeURIComponent(provider.phone.replace(/[^0-9]/g, ''))}` : '';
        const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(waOrder)}${phoneParam}`;
        setTimeout(() => {
          window.open(waUrl, '_blank');
        }, 300);
      });
    }
  }

  function setupUpiControls() {
    const select = document.getElementById('upiRoommateSelect');
    const copyUpiId = document.getElementById('cookUpiIdCopy');
    const copyLinkBtn = document.getElementById('copyUpiLinkBtn');
    const editCustomBtn = document.getElementById('editCustomAmountBtn');

    if (select) {
      select.addEventListener('change', (e) => {
        selectedUpiRoommate = e.target.value;
        customUpiAmount = null;
        renderUpiSettlement();
      });
    }

    if (copyUpiId) {
      copyUpiId.addEventListener('click', () => {
        triggerHaptic();
        const provider = appState.provider || CONFIG.defaultProvider;
        copyToClipboard(provider.upi);
        showToast(`Copied UPI ID: ${provider.upi}`);
      });
    }

    if (copyLinkBtn) {
      copyLinkBtn.addEventListener('click', () => {
        triggerHaptic();
        const payLink = document.getElementById('upiDirectPayLink');
        if (payLink) {
          copyToClipboard(payLink.href);
          showToast('Copied direct UPI payment link');
        }
      });
    }

    if (editCustomBtn) {
      editCustomBtn.addEventListener('click', () => {
        const val = prompt('Enter custom amount in ₹:', document.getElementById('upiDisplayAmount').textContent);
        if (val !== null && !isNaN(val) && Number(val) >= 0) {
          customUpiAmount = Math.round(Number(val));
          renderUpiSettlement();
          showToast(`Custom amount set to ₹${customUpiAmount}`);
        }
      });
    }
  }

  function setupAmulControls() {
    // 1. Delegated click on pill buttons
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.amul-pill-btn');
      if (!btn) return;
      triggerHaptic();

      const group = btn.closest('.amul-pill-group');
      if (!group) return;
      const person = group.getAttribute('data-person');
      const targetQty = parseFloat(btn.getAttribute('data-qty'));
      const cur = Number(appState.days[selectedDay]?.amul?.[person]) || 0;
      const nextVal = (targetQty === cur && targetQty !== 0) ? 0 : targetQty;

      const timestamp = Date.now();
      if (!appState.days[selectedDay].amul) {
        appState.days[selectedDay].amul = {};
      }
      if (!appState.days[selectedDay].amulTimestamps) {
        appState.days[selectedDay].amulTimestamps = {};
      }
      appState.days[selectedDay].amul[person] = nextVal;
      appState.days[selectedDay].amulTimestamps[person] = timestamp;
      logActivity(SyncEngine.identity, 'Milk Packets', `${capitalize(person)}: ${nextVal} pkt (Day ${selectedDay})`);
      persistAndBroadcast({
        type: 'amul_update',
        year: currentYear,
        month: currentMonth,
        day: selectedDay,
        person: person,
        value: nextVal,
        timestamp: timestamp
      });
      renderAmulTracker();
    });

    // 2. Remove Member from Amul Tracker
    document.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.amul-remove-btn');
      if (!removeBtn) return;
      triggerHaptic();
      const personId = removeBtn.getAttribute('data-person');
      if (!personId) return;

      if ((appState.amulMembers || []).length <= 1) {
        showToast('At least 1 member must remain in Amul tracker.');
        return;
      }

      appState.amulMembers = (appState.amulMembers || []).filter(p => p !== personId);
      logActivity(SyncEngine.identity, 'Milk Tracker', `Removed ${capitalize(personId)} from Amul Tracker`);
      persistAndBroadcast({
        type: 'amul_members_update',
        members: appState.amulMembers
      });
      showToast(`Removed ${capitalize(personId)} from milk tracker`);
      renderAmulTracker();
    });

    // 3. Add Member Modal controls
    const addMemberBtn = document.getElementById('addAmulMemberBtn');
    const modal = document.getElementById('addAmulMemberModal');
    const closeBtn = document.getElementById('closeAddAmulMemberBtn');
    const memberSelect = document.getElementById('amulMemberSelect');
    const customGroup = document.getElementById('amulCustomNameGroup');
    const customInput = document.getElementById('amulCustomNameInput');
    const confirmBtn = document.getElementById('confirmAddAmulMemberBtn');

    if (addMemberBtn && modal && memberSelect) {
      addMemberBtn.addEventListener('click', () => {
        triggerHaptic();
        const currentMembers = appState.amulMembers || ['anjan', 'saurabh'];
        memberSelect.innerHTML = '';

        ROOMMATES.forEach(r => {
          if (!currentMembers.includes(r.id)) {
            const opt = document.createElement('option');
            opt.value = r.id;
            opt.textContent = r.name;
            memberSelect.appendChild(opt);
          }
        });

        const customOpt = document.createElement('option');
        customOpt.value = 'custom';
        customOpt.textContent = '+ Add Custom Name...';
        memberSelect.appendChild(customOpt);

        if (customGroup) customGroup.style.display = memberSelect.value === 'custom' ? 'block' : 'none';
        if (customInput) customInput.value = '';

        modal.classList.add('active');
      });

      memberSelect.addEventListener('change', () => {
        if (customGroup) {
          customGroup.style.display = memberSelect.value === 'custom' ? 'block' : 'none';
          if (memberSelect.value === 'custom' && customInput) customInput.focus();
        }
      });

      if (closeBtn) {
        closeBtn.addEventListener('click', () => modal.classList.remove('active'));
      }

      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });

      if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
          triggerHaptic();
          let newId = memberSelect.value;
          let displayName = '';

          if (newId === 'custom') {
            const typed = (customInput ? customInput.value : '').trim();
            if (!typed) {
              alert('Please enter a member name');
              return;
            }
            newId = typed.toLowerCase().replace(/[^a-z0-9]/g, '');
            displayName = typed;
          } else {
            displayName = ROOMMATES.find(r => r.id === newId)?.name || newId;
          }

          if (!newId) return;

          if (!appState.amulMembers) appState.amulMembers = ['anjan', 'saurabh'];
          if (appState.amulMembers.includes(newId)) {
            showToast('Member already in Amul tracker');
            modal.classList.remove('active');
            return;
          }

          appState.amulMembers.push(newId);
          logActivity(SyncEngine.identity, 'Added Milk Member', `Added ${displayName} to Amul Tracker`);
          persistAndBroadcast({
            type: 'amul_members_update',
            members: appState.amulMembers
          });
          modal.classList.remove('active');
          showToast(`Added ${displayName} to Amul Milk Tracker!`);
          renderAmulTracker();
        });
      }
    }
  }

  // --- Sheet Column Filter Controls ---
  function setupSheetFilterControls() {
    const chipsContainer = document.getElementById('sheetFilterChips');
    if (chipsContainer) {
      chipsContainer.innerHTML = `
        <button class="sheet-filter-btn ${activeSheetFilter === 'all' ? 'active' : ''}" data-filter="all">All Flatmates</button>
        ${ROOMMATES.map(r => `<button class="sheet-filter-btn ${activeSheetFilter === r.id ? 'active' : ''}" data-filter="${r.id}">${r.name}</button>`).join('')}
      `;
    }
    const filterBtns = document.querySelectorAll('#sheetFilterChips .sheet-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        triggerHaptic();
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeSheetFilter = btn.getAttribute('data-filter');
        renderMasterSheet();
      });
    });
  }

  // --- Month & Year Picker Controls ---
  let modalDisplayedYear = currentYear;

  function setupMonthControls() {
    const prevBtn = document.getElementById('headerPrevMonthBtn');
    const nextBtn = document.getElementById('headerNextMonthBtn');
    const pickerBtn = document.getElementById('headerMonthPickerBtn');
    const dateStripPickerBtn = document.getElementById('dateStripMonthPickerBtn');
    const sheetPrevBtn = document.getElementById('sheetPrevMonthBtn');
    const sheetNextBtn = document.getElementById('sheetNextMonthBtn');
    const sheetPickerBtn = document.getElementById('sheetMonthPickerBtn');
    const modal = document.getElementById('monthPickerModal');
    const closeBtn = document.getElementById('closeMonthPickerBtn');
    const prevYearBtn = document.getElementById('pickerPrevYearBtn');
    const nextYearBtn = document.getElementById('pickerNextYearBtn');
    const yearDisplay = document.getElementById('pickerYearVal');
    const monthsGrid = document.getElementById('monthsPickerGrid');
    const jumpCurrentBtn = document.getElementById('jumpCurrentRealMonthBtn');

    const handlePrevMonth = () => {
      triggerHaptic();
      let y = currentYear;
      let m = currentMonth - 1;
      if (m < 1) { m = 12; y--; }
      switchMonth(y, m);
    };

    const handleNextMonth = () => {
      triggerHaptic();
      let y = currentYear;
      let m = currentMonth + 1;
      if (m > 12) { m = 1; y++; }
      switchMonth(y, m);
    };

    if (prevBtn) prevBtn.addEventListener('click', handlePrevMonth);
    if (nextBtn) nextBtn.addEventListener('click', handleNextMonth);
    if (sheetPrevBtn) sheetPrevBtn.addEventListener('click', handlePrevMonth);
    if (sheetNextBtn) sheetNextBtn.addEventListener('click', handleNextMonth);

    function renderMonthPickerGrid() {
      if (!yearDisplay || !monthsGrid) return;
      yearDisplay.textContent = modalDisplayedYear;
      monthsGrid.innerHTML = '';

      MONTH_SHORTS.forEach((shortName, idx) => {
        const mNum = idx + 1;
        const btn = document.createElement('button');
        btn.className = 'month-select-btn';
        if (modalDisplayedYear === currentYear && mNum === currentMonth) {
          btn.classList.add('active');
        }
        btn.textContent = shortName;
        btn.addEventListener('click', () => {
          triggerHaptic();
          switchMonth(modalDisplayedYear, mNum);
          if (modal) modal.classList.remove('active');
        });
        monthsGrid.appendChild(btn);
      });
    }

    const openMonthPicker = () => {
      triggerHaptic();
      modalDisplayedYear = currentYear;
      renderMonthPickerGrid();
      if (modal) modal.classList.add('active');
    };

    if (pickerBtn && modal) pickerBtn.addEventListener('click', openMonthPicker);
    if (dateStripPickerBtn && modal) dateStripPickerBtn.addEventListener('click', openMonthPicker);
    if (sheetPickerBtn && modal) sheetPickerBtn.addEventListener('click', openMonthPicker);

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
      });
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });
    }

    if (prevYearBtn) {
      prevYearBtn.addEventListener('click', () => {
        triggerHaptic();
        modalDisplayedYear--;
        renderMonthPickerGrid();
      });
    }

    if (nextYearBtn) {
      nextYearBtn.addEventListener('click', () => {
        triggerHaptic();
        modalDisplayedYear++;
        renderMonthPickerGrid();
      });
    }

    if (jumpCurrentBtn) {
      jumpCurrentBtn.addEventListener('click', () => {
        triggerHaptic();
        const d = new Date();
        switchMonth(d.getFullYear(), d.getMonth() + 1);
        if (modal) modal.classList.remove('active');
      });
    }
  }

  // --- Settings & Pricing Modal Setup ---
  function setupSettingsControls() {
    const settingsBtn = document.getElementById('headerSettingsBtn');
    const modal = document.getElementById('settingsModal');
    const closeBtn = document.getElementById('closeSettingsBtn');
    const subTabs = document.querySelectorAll('.sub-tab');

    if (settingsBtn && modal) {
      settingsBtn.addEventListener('click', () => {
        triggerHaptic();
        loadSettingsValues();
        renderAuditLog();
        modal.classList.add('active');
      });
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
      });
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });
    }

    subTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        triggerHaptic();
        const target = tab.getAttribute('data-subtab');
        subTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.subtab-content').forEach(c => {
          c.classList.toggle('active', c.id === `subtab-${target}`);
        });
      });
    });

    // Save Pricing Rates (Only Admin can change)
    const saveRatesBtn = document.getElementById('saveRatesBtn');
    if (saveRatesBtn) {
      saveRatesBtn.addEventListener('click', () => {
        triggerHaptic();
        if (!RoomManager.isAdmin()) {
          showToast('Permission denied: Only Flat Admin can change meal rates.');
          return;
        }

        const half = Number(document.getElementById('rateHalfInput')?.value) || 80;
        const full = Number(document.getElementById('rateFullInput')?.value) || 110;
        const special = Number(document.getElementById('rateSpecialInput')?.value) || 90;
        const amul = Number(document.getElementById('rateAmulInput')?.value) || 35;

        appState.rates = { half, full, special, amulPacket: amul };
        logActivity(SyncEngine.identity, 'Updated Rates', `Half: ₹${half}, Full: ₹${full}, Special: ₹${special}, Milk: ₹${amul}`);
        persistAndBroadcast({
          type: 'rates_updated',
          rates: appState.rates
        });
        showToast('Pricing rates updated & ledger recalculated!');
      });
    }

    // Save Provider Details
    const saveProviderBtn = document.getElementById('saveProviderBtn');
    if (saveProviderBtn) {
      saveProviderBtn.addEventListener('click', () => {
        triggerHaptic();
        const name = document.getElementById('providerNameInput')?.value.trim() || 'Sandhya Tiwari';
        const upi = document.getElementById('providerUpiInput')?.value.trim() || 'sandhyatiwari0205@oksbi';
        const phone = document.getElementById('providerPhoneInput')?.value.trim() || '';

        appState.provider = { name, upi, phone };
        logActivity(SyncEngine.identity, 'Updated Provider', `Payee: ${name} (${upi})`);
        persistAndBroadcast({
          type: 'full_sync',
          state: appState,
          reason: 'Updated provider details'
        });
        showToast('Tiffin provider details updated!');
      });
    }

    // Switch Identity from Settings
    const settingsIdentitySelect = document.getElementById('settingsIdentitySelect');
    if (settingsIdentitySelect) {
      settingsIdentitySelect.addEventListener('change', (e) => {
        triggerHaptic();
        SyncEngine.setIdentity(e.target.value);
        showToast(`You are now logging as ${e.target.value}`);
      });
    }


    // Clear Audit Log
    const clearAuditLogBtn = document.getElementById('clearAuditLogBtn');
    if (clearAuditLogBtn) {
      clearAuditLogBtn.addEventListener('click', () => {
        requireAdminPassword(() => {
          appState.auditLog = [];
          saveStateToStorage(appState);
          renderAuditLog();
          showToast('Audit log cleared');
        });
      });
    }

    // Open Walkthrough from Settings
    const openWalkthroughBtn = document.getElementById('openWalkthroughBtn');
    if (openWalkthroughBtn) {
      openWalkthroughBtn.addEventListener('click', () => {
        triggerHaptic();
        if (modal) modal.classList.remove('active');
        const onbModal = document.getElementById('onboardingModal');
        if (onbModal) onbModal.classList.add('active');
      });
    }

    // Force App Update & Cache Purge
    const forceUpdateBtn = document.getElementById('forceUpdateAppBtn');
    if (forceUpdateBtn) {
      forceUpdateBtn.addEventListener('click', async () => {
        triggerHaptic();
        showToast('Purging offline cache & fetching newest version...', 'info');
        try {
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
          }
          if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (let reg of regs) {
              await reg.unregister();
            }
          }
        } catch (err) {
          console.warn('Cache purge error:', err);
        }
        setTimeout(() => {
          window.location.reload(true);
        }, 400);
      });
    }
  }

  function loadSettingsValues() {
    const rates = getRates();
    const provider = appState.provider || CONFIG.defaultProvider;

    const rHalf = document.getElementById('rateHalfInput');
    const rFull = document.getElementById('rateFullInput');
    const rSpec = document.getElementById('rateSpecialInput');
    const rAmul = document.getElementById('rateAmulInput');
    const saveRatesBtn = document.getElementById('saveRatesBtn');
    const lockNotice = document.getElementById('pricingAdminLockNotice');
    const adminNameSpan = document.getElementById('pricingAdminNameDisplay');

    if (rHalf) rHalf.value = rates.half;
    if (rFull) rFull.value = rates.full;
    if (rSpec) rSpec.value = rates.special;
    if (rAmul) rAmul.value = rates.amulPacket;

    // Admin permissions check: only admin can modify meal rates
    const isAdmin = RoomManager.isAdmin();
    const adminName = RoomManager.activeRoom?.adminName || 'Admin';

    [rHalf, rFull, rSpec, rAmul].forEach(inp => {
      if (inp) {
        inp.disabled = !isAdmin;
        inp.classList.toggle('rate-input-locked', !isAdmin);
      }
    });

    if (lockNotice) {
      lockNotice.style.display = isAdmin ? 'none' : 'flex';
      if (adminNameSpan) adminNameSpan.textContent = adminName;
    }
    if (saveRatesBtn) {
      saveRatesBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    }

    const pName = document.getElementById('providerNameInput');
    const pUpi = document.getElementById('providerUpiInput');
    const pPhone = document.getElementById('providerPhoneInput');

    if (pName) pName.value = provider.name;
    if (pUpi) pUpi.value = provider.upi;
    if (pPhone) pPhone.value = provider.phone || '';

    const idSelect = document.getElementById('settingsIdentitySelect');
    if (idSelect) {
      idSelect.innerHTML = '';
      ROOMMATES.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.name;
        opt.textContent = r.name;
        idSelect.appendChild(opt);
      });
      idSelect.value = SyncEngine.identity || (ROOMMATES[0] ? ROOMMATES[0].name : 'Anjan');
    }
  }

  // --- Password Prompt Modal ("Flower") ---
  function requireAdminPassword(onSuccess) {
    pendingPasswordCallback = onSuccess;
    const modal = document.getElementById('passwordPromptModal');
    const input = document.getElementById('adminPasswordInput');
    const err = document.getElementById('passwordErrorMsg');

    if (input) input.value = '';
    if (err) err.style.display = 'none';
    if (modal) modal.classList.add('active');
    if (input) setTimeout(() => input.focus(), 200);
  }

  function setupPasswordPromptControls() {
    const modal = document.getElementById('passwordPromptModal');
    const closeBtn = document.getElementById('closePasswordPromptBtn');
    const confirmBtn = document.getElementById('confirmPasswordBtn');
    const input = document.getElementById('adminPasswordInput');
    const err = document.getElementById('passwordErrorMsg');

    const handleConfirm = () => {
      const entered = (input?.value || '').trim();
      if (entered === CONFIG.adminPassword) {
        if (modal) modal.classList.remove('active');
        if (pendingPasswordCallback) {
          pendingPasswordCallback();
          pendingPasswordCallback = null;
        }
      } else {
        if (err) err.style.display = 'block';
        triggerHaptic();
      }
    };

    if (confirmBtn) confirmBtn.addEventListener('click', handleConfirm);
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleConfirm();
      });
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        pendingPasswordCallback = null;
      });
    }
  }

  // --- Room & Multi-Tenant Group Access Manager ---
  const RoomManager = {
    session: null,
    activeRoom: null,

    isAdmin() {
      if (this.session?.role === 'admin') return true;
      if (this.activeRoom) {
        if (this.session && this.activeRoom.adminPhone && this.session.phone && this.activeRoom.adminPhone === this.session.phone) return true;
        if (this.session && this.activeRoom.adminName && this.session.name && this.activeRoom.adminName.toLowerCase() === this.session.name.toLowerCase()) return true;
        if (!this.session) return true; // Single-device flat creator
      }
      return false;
    },

    showInAppJoinBanner(memberName, roomCode) {
      const banner = document.getElementById('adminJoinNoticeBanner');
      const title = document.getElementById('adminJoinNoticeTitle');
      const desc = document.getElementById('adminJoinNoticeDesc');
      const viewBtn = document.getElementById('adminJoinViewMembersBtn');
      const dismissBtn = document.getElementById('adminJoinDismissBtn');

      if (!banner) return;
      if (title) title.textContent = `${memberName} Joined Flat! 🍱`;
      if (desc) desc.textContent = `${memberName} has joined #${roomCode || 'flat'} and is now active on the ledger.`;
      banner.style.display = 'flex';

      if (viewBtn) {
        viewBtn.onclick = () => {
          triggerHaptic();
          banner.style.display = 'none';
          const settingsBtn = document.getElementById('headerSettingsBtn');
          if (settingsBtn) settingsBtn.click();
          const tab = document.querySelector('.sub-tab[data-subtab="members"]');
          if (tab) tab.click();
        };
      }
      if (dismissBtn) {
        dismissBtn.onclick = () => {
          triggerHaptic();
          banner.style.display = 'none';
        };
      }
    },

    init() {
      // 1. Check existing session
      try {
        const rawSession = localStorage.getItem('tiffin_user_session');
        if (rawSession) {
          this.session = JSON.parse(rawSession);
        }
      } catch (e) {}

      // 2. Check room code and credentials in URL query or hash
      const urlParams = new URLSearchParams(window.location.search);
      const urlRoom = urlParams.get('room') || urlParams.get('join') || (window.location.hash.startsWith('#room=') ? window.location.hash.slice(6) : null);
      const urlPin = urlParams.get('pin');
      const urlPhone = urlParams.get('phone');
      const urlName = urlParams.get('name');

      if (urlRoom && urlPin) {
        // Direct multi-device 1-click sync link (e.g. mobile to PC)
        const cleanRoom = urlRoom.toUpperCase().trim();
        this.enterRoom(cleanRoom, urlPhone || '', urlPin, urlName || 'Admin', true);
        try {
          window.history.replaceState(null, '', window.location.pathname);
        } catch (e) {}
        this.updateHeaderRoomUI();
        return;
      }

      if (urlRoom) {
        const cleanCode = urlRoom.toUpperCase().trim();
        // If user already had a session for a DIFFERENT room, reset so they join this new flat
        if (this.session && this.session.roomCode && this.session.roomCode.toUpperCase() !== cleanCode) {
          this.session = null;
          localStorage.removeItem('tiffin_user_session');
          this.activeRoom = null;
          ROOMMATES = [];
        }

        const codeInput = document.getElementById('gateRoomCode');
        if (codeInput) codeInput.value = cleanCode;

        const banner = document.getElementById('gateInviteBanner');
        const codeSpan = document.getElementById('gateInviteRoomCode');
        if (banner && codeSpan) {
          codeSpan.textContent = cleanCode;
          banner.style.display = 'flex';
        }

        // Connect SyncEngine immediately to this room code
        SyncEngine.setRoomCode(cleanCode);
      }

      // 3. Load active room data or show Gate
      if (this.session && this.session.roomCode) {
        this.loadRoom(this.session.roomCode);
        if (this.session.status === 'approved') {
          this.hideGateModal();
          setTimeout(() => showStartupWelcomePrompt(), 600);
        }
      } else {
        // Default to Join Flat tab for both new visitors and invite link recipients
        this.showGateModal('join');
      }

      this.updateHeaderRoomUI();
    },

    loadRoom(roomCode) {
      const codeKey = roomCode.toUpperCase().trim();
      let roomData = null;
      try {
        const raw = localStorage.getItem(`tiffin_room_${codeKey}`);
        if (raw) roomData = JSON.parse(raw);
      } catch (e) {}

      if (!roomData) {
        roomData = {
          code: codeKey,
          name: this.session?.groupName || 'My Flat',
          adminName: this.session?.role === 'admin' ? this.session.name : 'Admin',
          adminPhone: this.session?.role === 'admin' ? this.session.phone : '',
          adminPin: CONFIG.adminPassword || 'Flower',
          createdAt: new Date().toISOString(),
          members: [],
          pendingRequests: []
        };
      }

      this.activeRoom = roomData;
      SyncEngine.setRoomCode(codeKey);

      // Synchronize ROOMMATES
      if (roomData.members && roomData.members.length > 0) {
        ROOMMATES = roomData.members;
      } else if (this.session && this.session.status === 'approved') {
        const adminMember = {
          id: this.sanitizeId(this.session.name),
          name: this.session.name,
          phone: this.session.phone,
          role: this.session.role || 'admin',
          avatarColor: '#00d26a'
        };
        roomData.members = [adminMember];
        ROOMMATES = [adminMember];
        this.saveActiveRoom();
      }

      // Reload ledger state for this room
      appState = loadStateForMonth(currentYear, currentMonth);

      // Ensure all members have meal slots in appState
      if (appState && appState.days) {
        for (let d = 1; d <= CONFIG.daysInMonth; d++) {
          if (appState.days[d]) {
            if (!appState.days[d].meals) appState.days[d].meals = {};
            ROOMMATES.forEach(r => {
              if (!appState.days[d].meals[r.id]) {
                appState.days[d].meals[r.id] = { lunch: '', dinner: '' };
              }
            });
          }
        }
      }

      if (roomData.adminPin) {
        CONFIG.adminPassword = roomData.adminPin;
      }

      if (this.session && this.session.name) {
        SyncEngine.setIdentity(this.session.name);
      }

      this.updateHeaderRoomUI();
      this.updatePendingBadges();
      this.renderSettingsMembersTab();
      populateHeaderIdentityDropdown();
    },

    saveActiveRoom() {
      if (!this.activeRoom) return;
      try {
        localStorage.setItem(`tiffin_room_${this.activeRoom.code}`, JSON.stringify(this.activeRoom));
      } catch (e) {}
    },

    createRoom(adminName, adminPhone, groupName, adminPin) {
      const codeSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const roomCode = `TF-${codeSuffix}`;
      const cleanName = adminName.trim();
      const cleanPhone = adminPhone.trim();
      const cleanGroup = groupName.trim() || 'My Flat';
      const cleanPin = adminPin.trim() || 'Flower';

      const adminMember = {
        id: this.sanitizeId(cleanName),
        name: cleanName,
        phone: cleanPhone,
        role: 'admin',
        avatarColor: '#00d26a'
      };

      this.activeRoom = {
        code: roomCode,
        name: cleanGroup,
        adminName: cleanName,
        adminPhone: cleanPhone,
        adminPin: cleanPin,
        createdAt: new Date().toISOString(),
        members: [adminMember],
        pendingRequests: []
      };

      this.session = {
        name: cleanName,
        phone: cleanPhone,
        role: 'admin',
        groupName: cleanGroup,
        roomCode: roomCode,
        status: 'approved'
      };

      localStorage.setItem('tiffin_user_session', JSON.stringify(this.session));
      this.saveActiveRoom();

      ROOMMATES = [adminMember];
      CONFIG.adminPassword = cleanPin;

      SyncEngine.setRoomCode(roomCode);
      SyncEngine.setIdentity(cleanName);

      this.hideGateModal();
      this.updateHeaderRoomUI();
      this.updatePendingBadges();
      this.renderSettingsMembersTab();
      populateHeaderIdentityDropdown();

      // Refresh default month data
      appState = getDefaultDataForMonth(currentYear, currentMonth);
      saveStateToStorage(appState);
      renderAll();

      // Immediately broadcast full room metadata so new members can sync instantly
      SyncEngine.broadcast({
        type: 'room_meta_sync',
        roomCode: roomCode,
        roomData: this.activeRoom,
        state: getCompactSyncState(appState)
      });

      showToast(`Group "${cleanGroup}" created! Room Code: ${roomCode}`);
      setTimeout(() => showStartupWelcomePrompt(), 500);
    },

    enterRoom(roomCode, phone, pin, name, isDirectSync = false) {
      const cleanCode = (roomCode || '').toUpperCase().trim();
      const cleanPhone = (phone || '').trim();
      const cleanPin = (pin || '').trim();
      const cleanName = (name || '').trim();

      if (!cleanCode) {
        alert('Please enter a valid Room Code.');
        return false;
      }

      let targetRoom = null;
      try {
        const raw = localStorage.getItem(`tiffin_room_${cleanCode}`);
        if (raw) targetRoom = JSON.parse(raw);
      } catch (e) {}

      // Case 1: Entering with Admin Security PIN (Multi-device Admin login, e.g. Phone to PC)
      if (cleanPin) {
        if (targetRoom && targetRoom.adminPin && targetRoom.adminPin !== cleanPin) {
          alert('Incorrect Admin Security PIN for this room.');
          return false;
        }

        const adminName = cleanName || targetRoom?.adminName || 'Admin';
        const adminPhone = cleanPhone || targetRoom?.adminPhone || '';

        this.session = {
          name: adminName,
          phone: adminPhone,
          role: 'admin',
          groupName: targetRoom?.name || 'My Flat',
          roomCode: cleanCode,
          status: 'approved'
        };
        localStorage.setItem('tiffin_user_session', JSON.stringify(this.session));

        CONFIG.adminPassword = cleanPin;
        if (!targetRoom) {
          targetRoom = {
            code: cleanCode,
            name: 'My Flat',
            adminName: adminName,
            adminPhone: adminPhone,
            adminPin: cleanPin,
            createdAt: new Date().toISOString(),
            members: [{ id: this.sanitizeId(adminName), name: adminName, phone: adminPhone, role: 'admin', avatarColor: '#00d26a' }],
            pendingRequests: []
          };
        } else {
          targetRoom.adminPin = cleanPin;
        }

        this.activeRoom = targetRoom;
        this.saveActiveRoom();
        this.loadRoom(cleanCode);
        this.hideGateModal();

        persistAndBroadcast({
          type: 'request_room_sync',
          roomCode: cleanCode,
          requesterName: adminName,
          requesterPhone: adminPhone
        });

        showToast(isDirectSync ? `Synced and connected to room #${cleanCode}!` : `Logged into room #${cleanCode} as Admin!`);
        renderAll();
        setTimeout(() => showStartupWelcomePrompt(), 500);
        return true;
      }

      // Case 2: Roommate entering with mobile / name
      if (targetRoom && targetRoom.members && targetRoom.members.length > 0) {
        const matchedMember = targetRoom.members.find(m =>
          (cleanPhone && m.phone === cleanPhone) ||
          (cleanName && m.name.toLowerCase() === cleanName.toLowerCase())
        );

        if (matchedMember) {
          this.session = {
            name: matchedMember.name,
            phone: matchedMember.phone || cleanPhone,
            role: matchedMember.role || 'member',
            groupName: targetRoom.name || 'My Flat',
            roomCode: cleanCode,
            status: 'approved'
          };
          localStorage.setItem('tiffin_user_session', JSON.stringify(this.session));
          this.loadRoom(cleanCode);
          this.hideGateModal();

          persistAndBroadcast({
            type: 'request_room_sync',
            roomCode: cleanCode,
            requesterName: matchedMember.name,
            requesterPhone: matchedMember.phone
          });

          showToast(`Welcome back, ${matchedMember.name}!`);
          renderAll();
          setTimeout(() => showStartupWelcomePrompt(), 500);
          return true;
        }
      }

      // Case 3: Flatmate instant join with Room Code & Name (No waiting / No roadblocks)
      if (!cleanName) {
        alert('Please enter your name to join this flat, or enter Admin PIN if you manage this room.');
        return false;
      }

      const avatarColors = ['#00d4ff', '#a78bfa', '#ff3b5c', '#ffb800', '#10b981', '#38bdf8', '#f43f5e', '#ec4899'];
      let memberIndex = targetRoom?.members?.length || 0;
      let baseId = this.sanitizeId(cleanName);
      let memberId = baseId;
      let counter = 2;
      if (targetRoom && targetRoom.members) {
        while (targetRoom.members.some(m => m.id === memberId)) {
          memberId = `${baseId}_${counter++}`;
        }
      }

      const newMember = {
        id: memberId,
        name: cleanName,
        phone: cleanPhone || '',
        role: 'member',
        avatarColor: avatarColors[memberIndex % avatarColors.length],
        joinedAt: new Date().toISOString()
      };

      if (!targetRoom) {
        targetRoom = {
          code: cleanCode,
          name: 'My Flat',
          adminName: 'Admin',
          adminPhone: '',
          adminPin: '',
          createdAt: new Date().toISOString(),
          members: [newMember],
          pendingRequests: []
        };
      } else {
        if (!targetRoom.members) targetRoom.members = [];
        const exists = targetRoom.members.some(m => m.id === newMember.id || m.name.toLowerCase() === newMember.name.toLowerCase());
        if (!exists) {
          targetRoom.members.push(newMember);
        }
      }

      this.activeRoom = targetRoom;
      this.saveActiveRoom();

      this.session = {
        name: cleanName,
        phone: cleanPhone,
        role: 'member',
        groupName: targetRoom.name || 'My Flat',
        roomCode: cleanCode,
        status: 'approved'
      };
      localStorage.setItem('tiffin_user_session', JSON.stringify(this.session));

      ROOMMATES = targetRoom.members;

      // Initialize meal slots in appState for this new member
      if (appState && appState.days) {
        for (let d = 1; d <= CONFIG.daysInMonth; d++) {
          if (appState.days[d]) {
            if (!appState.days[d].meals) appState.days[d].meals = {};
            ROOMMATES.forEach(r => {
              if (!appState.days[d].meals[r.id]) {
                appState.days[d].meals[r.id] = { lunch: '', dinner: '' };
              }
            });
          }
        }
        saveStateToStorage(appState);
      }

      SyncEngine.setRoomCode(cleanCode);
      SyncEngine.setIdentity(cleanName);

      // Broadcast member joined and ask for current room sync
      SyncEngine.broadcast({
        type: 'member_joined',
        roomCode: cleanCode,
        member: newMember
      });
      SyncEngine.broadcast({
        type: 'request_room_sync',
        roomCode: cleanCode,
        requesterName: cleanName,
        requesterPhone: cleanPhone
      });

      this.hideGateModal();
      this.updateHeaderRoomUI();
      this.renderSettingsMembersTab();
      populateHeaderIdentityDropdown();
      renderAll();

      showToast(`🎉 Joined flat #${cleanCode}! Welcome, ${cleanName}.`);
      setTimeout(() => showStartupWelcomePrompt(), 500);
      return true;
    },

    leaveRoom() {
      const settingsModal = document.getElementById('settingsModal');
      if (settingsModal) settingsModal.classList.remove('active');
      localStorage.removeItem('tiffin_user_session');
      this.session = null;
      this.activeRoom = null;
      ROOMMATES = [];
      this.showGateModal('join');
      this.updateHeaderRoomUI();
      this.renderSettingsMembersTab();
      renderAll();
      showToast('Switched flat. Enter a Room Code or create a new flat.');
    },

    approveRequest(reqId) {
      const isAdmin = this.session?.role === 'admin' ||
                      (this.activeRoom && (
                        (this.session && this.activeRoom.adminPhone === this.session.phone) ||
                        (this.session && this.activeRoom.adminName === this.session.name) ||
                        (!this.session && this.activeRoom)
                      ));
      if (!this.activeRoom || !isAdmin) {
        showToast('Only Admin can approve join requests.');
        return;
      }

      const reqIndex = (this.activeRoom.pendingRequests || []).findIndex(p => p.id === reqId);
      if (reqIndex === -1) return;

      const req = this.activeRoom.pendingRequests[reqIndex];
      this.activeRoom.pendingRequests.splice(reqIndex, 1);

      const avatarColors = ['#00d4ff', '#a78bfa', '#ff3b5c', '#ffb800', '#10b981', '#38bdf8', '#f43f5e', '#ec4899'];
      const avatarColor = avatarColors[this.activeRoom.members.length % avatarColors.length];

      let baseId = this.sanitizeId(req.name);
      let memberId = baseId;
      let counter = 2;
      while ((this.activeRoom.members || []).some(m => m.id === memberId)) {
        memberId = `${baseId}_${counter++}`;
      }

      const newMember = {
        id: memberId,
        name: req.name,
        phone: req.phone || '',
        role: 'member',
        avatarColor: avatarColor,
        joinedAt: new Date().toISOString()
      };

      this.activeRoom.members.push(newMember);
      this.saveActiveRoom();
      ROOMMATES = this.activeRoom.members;

      if (appState && appState.days) {
        for (let d = 1; d <= CONFIG.daysInMonth; d++) {
          if (appState.days[d]) {
            if (!appState.days[d].meals) appState.days[d].meals = {};
            if (!appState.days[d].meals[newMember.id]) {
              appState.days[d].meals[newMember.id] = { lunch: '', dinner: '' };
            }
          }
        }
        saveStateToStorage(appState);
      }

      SyncEngine.broadcast({
        type: 'member_approved',
        roomCode: this.activeRoom.code,
        member: newMember
      });

      this.updatePendingBadges();
      this.renderSettingsMembersTab();
      renderAll();
      showToast(`Approved ${newMember.name}! Added to flat.`);

      // Dismiss in-app join banner if open
      const banner = document.getElementById('joinRequestBanner');
      if (banner) banner.remove();
    },

    declineRequest(reqId) {
      if (!this.activeRoom || this.session?.role !== 'admin') return;
      this.activeRoom.pendingRequests = (this.activeRoom.pendingRequests || []).filter(p => p.id !== reqId);
      this.saveActiveRoom();
      this.updatePendingBadges();
      this.renderSettingsMembersTab();
      showToast('Join request declined.');
    },

    addMemberDirectly(name, phone) {
      if (!this.activeRoom) return;
      const cleanName = (name || '').trim();
      const cleanPhone = (phone || '').trim();
      if (!cleanName) return;

      const avatarColors = ['#00d4ff', '#a78bfa', '#ff3b5c', '#ffb800', '#10b981', '#38bdf8', '#f43f5e', '#ec4899'];
      const avatarColor = avatarColors[this.activeRoom.members.length % avatarColors.length];

      const newMember = {
        id: this.sanitizeId(cleanName),
        name: cleanName,
        phone: cleanPhone,
        role: 'member',
        avatarColor: avatarColor,
        joinedAt: new Date().toISOString()
      };

      this.activeRoom.members.push(newMember);
      this.saveActiveRoom();
      ROOMMATES = this.activeRoom.members;

      if (appState && appState.days) {
        for (let d = 1; d <= CONFIG.daysInMonth; d++) {
          if (appState.days[d]) {
            if (!appState.days[d].meals) appState.days[d].meals = {};
            if (!appState.days[d].meals[newMember.id]) {
              appState.days[d].meals[newMember.id] = { lunch: '', dinner: '' };
            }
          }
        }
        saveStateToStorage(appState);
      }

      persistAndBroadcast({
        type: 'member_added',
        roomCode: this.activeRoom.code,
        member: newMember
      });

      this.renderSettingsMembersTab();
      renderAll();
      showToast(`Added ${cleanName} to room!`);
    },

    removeMember(memberId) {
      const isAdmin = this.isAdmin();
      if (!this.activeRoom || !isAdmin) {
        showToast('Only Admin can kick members.');
        return;
      }
      const target = this.activeRoom.members.find(m => m.id === memberId);
      if (!target) return;
      if (target.role === 'admin') {
        alert('Cannot kick the room Admin.');
        return;
      }

      if (!confirm(`Are you sure you want to kick ${target.name} from this flat? They will be removed immediately.`)) return;

      this.activeRoom.members = this.activeRoom.members.filter(m => m.id !== memberId);
      this.saveActiveRoom();
      ROOMMATES = this.activeRoom.members;

      // Broadcast kick to all connected devices in the room
      SyncEngine.broadcast({
        type: 'member_kicked',
        roomCode: this.activeRoom.code,
        memberId: memberId,
        memberName: target.name
      });

      this.renderSettingsMembersTab();
      populateHeaderIdentityDropdown();
      renderAll();
      showToast(`Kicked ${target.name} from flat.`);
    },

    updateHeaderRoomUI() {
      const codePill = document.getElementById('headerRoomCodeText');
      const pill = document.getElementById('headerRoomPill');
      const settingsRoomName = document.getElementById('settingsRoomNameDisplay');
      const settingsRoomCode = document.getElementById('settingsRoomCodeTag');

      const roomCode = this.activeRoom?.code || this.session?.roomCode || 'ROOM';
      const roomName = this.activeRoom?.name || this.session?.groupName || 'My Flat';

      if (codePill) codePill.textContent = `#${roomCode}`;
      if (pill) pill.setAttribute('title', `Active Group: ${roomName} (#${roomCode})`);
      if (settingsRoomName) settingsRoomName.textContent = roomName;
      if (settingsRoomCode) settingsRoomCode.textContent = `#${roomCode}`;
    },

    updatePendingBadges() {
      const pendingCount = (this.activeRoom?.pendingRequests || []).length;
      const isAdmin = this.isAdmin();

      const headerPendingBtn = document.getElementById('headerPendingBtn');
      const headerPendingText = document.getElementById('headerPendingCountText');
      const sidebarBadge = document.getElementById('sidebarPendingBadge');
      const sectionCount = document.getElementById('pendingSectionCount');
      const sectionContainer = document.getElementById('pendingRequestsContainer');

      if (headerPendingBtn) {
        if (isAdmin && pendingCount > 0) {
          headerPendingBtn.style.display = 'inline-flex';
          if (headerPendingText) headerPendingText.textContent = `${pendingCount} Request${pendingCount === 1 ? '' : 's'}`;
        } else {
          headerPendingBtn.style.display = 'none';
        }
      }

      if (sidebarBadge) {
        if (isAdmin && pendingCount > 0) {
          sidebarBadge.style.display = 'inline-block';
          sidebarBadge.textContent = pendingCount;
        } else {
          sidebarBadge.style.display = 'none';
        }
      }

      if (sectionCount) sectionCount.textContent = pendingCount;
      if (sectionContainer) {
        sectionContainer.style.display = (isAdmin && pendingCount > 0) ? 'block' : 'none';
      }
    },

    renderSettingsMembersTab() {
      const listContainer = document.getElementById('settingsMembersList');
      const countDisplay = document.getElementById('roommatesCountDisplay');
      const pendingList = document.getElementById('pendingRoommatesList');

      if (countDisplay) countDisplay.textContent = ROOMMATES.length;

      // 1. Pending Requests (Admin view)
      if (pendingList && this.activeRoom) {
        pendingList.innerHTML = '';
        const requests = this.activeRoom.pendingRequests || [];
        if (requests.length === 0) {
          pendingList.innerHTML = `<div style="font-size:0.82rem; color:var(--text-muted); padding:6px 0;">No pending requests.</div>`;
        } else {
          requests.forEach(req => {
            const card = document.createElement('div');
            card.className = 'pending-roommate-card';
            card.innerHTML = `
              <div>
                <strong style="font-size:0.88rem; color:var(--text-primary);">${escapeHtml(req.name)}</strong>
                <span style="font-size:0.78rem; color:var(--text-muted); display:block;">${escapeHtml(req.phone)}</span>
              </div>
              <div class="pending-roommate-actions">
                <button class="btn-approve" data-id="${req.id}">Approve</button>
                <button class="btn-decline" data-id="${req.id}">Decline</button>
              </div>
            `;
            pendingList.appendChild(card);
          });

          pendingList.querySelectorAll('.btn-approve').forEach(btn => {
            btn.addEventListener('click', () => {
              triggerHaptic();
              this.approveRequest(btn.getAttribute('data-id'));
            });
          });

          pendingList.querySelectorAll('.btn-decline').forEach(btn => {
            btn.addEventListener('click', () => {
              triggerHaptic();
              this.declineRequest(btn.getAttribute('data-id'));
            });
          });
        }
      }

      // 2. Active Roommates
      if (listContainer) {
        listContainer.innerHTML = '';
        if (ROOMMATES.length === 0) {
          listContainer.innerHTML = `<div style="font-size:0.82rem; color:var(--text-muted); padding:8px 0;">No roommates added yet.</div>`;
          return;
        }

        ROOMMATES.forEach(r => {
          const card = document.createElement('div');
          card.className = 'member-mgmt-card';
          const isUserAdmin = r.role === 'admin';
          const canDelete = (this.isAdmin() && !isUserAdmin);

          card.innerHTML = `
            <div class="member-mgmt-info">
              <div class="member-mini-avatar">
                ${getCartoonAvatarSvg(r.id || r.name, 38)}
              </div>
              <div>
                <strong style="font-size:0.88rem; color:var(--text-primary);">${escapeHtml(r.name)}</strong>
                ${isUserAdmin ? '<span class="badge-admin-tag">ADMIN</span>' : ''}
                ${r.phone ? `<span style="display:block; font-size:0.75rem; color:var(--text-muted);">${escapeHtml(r.phone)}</span>` : ''}
              </div>
            </div>
            ${canDelete ? `<button class="kick-member-btn remove-member-btn" data-id="${r.id}" title="Kick member from flat">Kick</button>` : ''}
          `;
          listContainer.appendChild(card);
        });

        listContainer.querySelectorAll('.remove-member-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            triggerHaptic();
            this.removeMember(btn.getAttribute('data-id'));
          });
        });
      }
    },

    showGateModal(defaultTab = 'join') {
      const modal = document.getElementById('roomAccessModal');
      const createTabBtn = document.getElementById('tabCreateRoomBtn');
      const joinTabBtn = document.getElementById('tabJoinRoomBtn');
      const createForm = document.getElementById('createRoomForm');
      const joinForm = document.getElementById('joinRoomForm');

      if (!modal) return;
      document.body.classList.add('gate-active');
      modal.classList.add('active');

      if (defaultTab === 'create') {
        createTabBtn?.classList.add('active');
        joinTabBtn?.classList.remove('active');
        if (createForm) createForm.style.display = 'block';
        if (joinForm) joinForm.style.display = 'none';
      } else {
        joinTabBtn?.classList.add('active');
        createTabBtn?.classList.remove('active');
        if (joinForm) joinForm.style.display = 'block';
        if (createForm) createForm.style.display = 'none';
      }
    },

    hideGateModal() {
      const modal = document.getElementById('roomAccessModal');
      if (modal) modal.classList.remove('active');
      document.body.classList.remove('gate-active');
    },

    sanitizeId(name) {
      return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '') || `user_${Date.now()}`;
    }
  };

  // --- Printable Invoice Generator ---
  function openInvoiceModal() {
    triggerHaptic();
    const modal = document.getElementById('invoiceModal');
    const container = document.getElementById('invoicePrintableArea');
    if (!modal || !container) return;

    const rates = getRates();
    const provider = appState.provider || CONFIG.defaultProvider;
    const totals = getFlatTotals();
    const room = RoomManager.activeRoom || { name: 'My Flat', code: SyncEngine.roomCode || 'ROOM' };
    const monthName = MONTH_NAMES[currentMonth - 1];
    const invoiceNum = `INV-${currentYear}${String(currentMonth).padStart(2, '0')}-${room.code}`;
    const invoiceDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    let memberRows = '';
    ROOMMATES.forEach((r, idx) => {
      const stats = getRoommateMonthlyStats(r.id);
      const combinedMemberDue = stats.tiffinTotal + stats.milkTotal;
      memberRows += `
        <tr>
          <td style="text-align:center; font-weight:600;">${idx + 1}</td>
          <td>
            <strong>${escapeHtml(r.name)}</strong>
            ${r.phone ? `<div style="font-size:0.75rem; color:#64748b;">${escapeHtml(r.phone)}</div>` : ''}
          </td>
          <td>${stats.halfCount} Half, ${stats.fullCount} Full${stats.specialCount ? `, ${stats.specialCount} Sp` : ''}</td>
          <td style="text-align:center; font-weight:700;">${stats.totalMeals}</td>
          <td style="text-align:right; font-family:monospace; font-weight:700;">₹${stats.tiffinTotal}</td>
          <td style="text-align:right; font-family:monospace;">${stats.milkPackets > 0 ? `${stats.milkPackets} pkt (₹${stats.milkTotal})` : '—'}</td>
          <td style="text-align:right; font-family:monospace; font-weight:800; color:#166534;">₹${combinedMemberDue}</td>
        </tr>
      `;
    });

    if (ROOMMATES.length === 0) {
      memberRows = `<tr><td colspan="7" style="text-align:center; padding:18px; color:#64748b;">No flatmates added in this room yet.</td></tr>`;
    }

    container.innerHTML = `
      <div class="inv-header">
        <div>
          <h2 class="inv-brand-title">🍛 TIFFIN EXPENSE STATEMENT</h2>
          <div style="font-size:0.95rem; font-weight:700; color:#334155; margin-top:2px;">
            ${escapeHtml(room.name)} <span style="font-family:monospace; background:#f1f5f9; padding:2px 6px; border-radius:4px;">#${escapeHtml(room.code)}</span>
          </div>
          <div style="font-size:0.8rem; color:#64748b; margin-top:4px;">Shared Mess &amp; Tiffin Ledger</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:1.1rem; font-weight:900; color:#0f172a; text-transform:uppercase;">${monthName} ${currentYear}</div>
          <div class="inv-meta-table" style="margin-top:4px;">
            <div><strong>Invoice:</strong> ${invoiceNum}</div>
            <div><strong>Date:</strong> ${invoiceDate}</div>
            <div style="margin-top:4px;"><span style="background:#fef3c7; color:#92400e; font-weight:700; font-size:0.75rem; padding:2px 8px; border-radius:999px;">PAYABLE STATEMENT</span></div>
          </div>
        </div>
      </div>

      <div class="inv-party-grid">
        <div class="inv-party-box">
          <strong>Billed To (Flat Group)</strong>
          <div style="font-size:1rem; font-weight:700; color:#0f172a;">${escapeHtml(room.name)}</div>
          <div style="font-size:0.85rem; color:#475569; margin-top:2px;">Admin: ${escapeHtml(room.adminName || 'Admin')} ${room.adminPhone ? `(${escapeHtml(room.adminPhone)})` : ''}</div>
          <div style="font-size:0.82rem; color:#64748b; margin-top:4px;">Total Flatmates: ${ROOMMATES.length}</div>
        </div>
        <div class="inv-party-box">
          <strong>Payable To (Tiffin Provider)</strong>
          <div style="font-size:1rem; font-weight:700; color:#0f172a;">${escapeHtml(provider.name || 'Tiffin Provider')}</div>
          <div style="font-size:0.85rem; color:#475569; margin-top:2px;">Mobile: ${escapeHtml(provider.phone || 'Not configured')}</div>
          <div style="font-size:0.85rem; color:#0f172a; margin-top:4px; font-weight:600;">UPI ID: <span style="font-family:monospace; color:#2563eb;">${escapeHtml(provider.upi || 'Not configured')}</span></div>
        </div>
      </div>

      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; margin-bottom:16px; font-size:0.82rem; display:flex; flex-wrap:wrap; gap:16px; justify-content:space-between;">
        <span><strong>Rate Breakdown:</strong></span>
        <span>Half Meal: <strong>₹${rates.half}</strong></span>
        <span>Full Meal: <strong>₹${rates.full}</strong></span>
        <span>Special Meal: <strong>₹${rates.special}</strong></span>
        <span>Amul Milk: <strong>₹${rates.amulPacket || 35}/pkt</strong></span>
      </div>

      <table class="inv-table">
        <thead>
          <tr>
            <th style="width:36px; text-align:center;">#</th>
            <th>Member Name</th>
            <th>Meal Breakdown</th>
            <th style="text-align:center;">Total Meals</th>
            <th style="text-align:right;">Tiffin (₹)</th>
            <th style="text-align:right;">Milk (₹)</th>
            <th style="text-align:right;">Total Due (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${memberRows}
        </tbody>
        <tfoot>
          <tr style="background:#f1f5f9; font-weight:800; font-size:0.92rem;">
            <td colspan="3" style="text-align:right;">Grand Totals:</td>
            <td style="text-align:center;">${totals.totalMeals}</td>
            <td style="text-align:right; font-family:monospace;">₹${totals.tiffinTotal}</td>
            <td style="text-align:right; font-family:monospace;">₹${totals.milkTotal}</td>
            <td style="text-align:right; font-family:monospace; color:#166534; font-size:1.05rem;">₹${totals.combinedTotal}</td>
          </tr>
        </tfoot>
      </table>

      <div class="inv-summary-box">
        <div>
          <div style="font-size:0.85rem; color:#15803d; font-weight:700; text-transform:uppercase;">Direct Settlement Instructions</div>
          <div style="font-size:0.88rem; color:#334155; margin-top:4px;">
            Flatmates can pay directly via UPI to <strong>${escapeHtml(provider.upi || 'provider')}</strong> with their name in the payment remark.
          </div>
        </div>
        <div style="text-align:right;">
          <span style="font-size:0.8rem; color:#64748b; font-weight:700; text-transform:uppercase;">Total Flat Due</span>
          <div class="inv-grand-total">₹${totals.combinedTotal}</div>
        </div>
      </div>

      <div style="margin-top:20px; text-align:center; font-size:0.75rem; color:#94a3b8; border-top:1px dashed #cbd5e1; padding-top:12px;">
        Generated via Tiffin Tracker • Open Source Mess Ledger
      </div>
    `;

    modal.classList.add('active');
  }

  // --- Room Access & Gate Event Controls ---
  function setupRoomAccessControls() {
    const tabCreateBtn = document.getElementById('tabCreateRoomBtn');
    const tabJoinBtn = document.getElementById('tabJoinRoomBtn');
    const createForm = document.getElementById('createRoomForm');
    const joinForm = document.getElementById('joinRoomForm');
    const headerPendingBtn = document.getElementById('headerPendingBtn');
    const addRoommateBtn = document.getElementById('addRoommateBtn');
    const changeAdminPinBtn = document.getElementById('changeAdminPinBtn');

    if (tabCreateBtn) {
      tabCreateBtn.addEventListener('click', () => {
        triggerHaptic();
        tabCreateBtn.classList.add('active');
        tabJoinBtn?.classList.remove('active');
        if (createForm) createForm.style.display = 'block';
        if (joinForm) joinForm.style.display = 'none';
      });
    }

    if (tabJoinBtn) {
      tabJoinBtn.addEventListener('click', () => {
        triggerHaptic();
        tabJoinBtn.classList.add('active');
        tabCreateBtn?.classList.remove('active');
        if (joinForm) joinForm.style.display = 'block';
        if (createForm) createForm.style.display = 'none';
      });
    }

    if (createForm) {
      createForm.addEventListener('submit', (e) => {
        e.preventDefault();
        triggerHaptic();
        const name = document.getElementById('gateAdminName')?.value || '';
        const phone = document.getElementById('gateAdminPhone')?.value || '';
        const group = document.getElementById('gateGroupName')?.value || 'My Flat';
        const pin = document.getElementById('gateAdminPin')?.value || 'Flower';

        if (!name.trim()) {
          alert('Please enter your name.');
          return;
        }
        RoomManager.createRoom(name, phone, group, pin);
      });
    }

    if (joinForm) {
      joinForm.addEventListener('submit', (e) => {
        e.preventDefault();
        triggerHaptic();
        const code = document.getElementById('gateRoomCode')?.value || '';
        const phone = document.getElementById('gateUserPhone')?.value || '';
        const pin = document.getElementById('gateLoginPin')?.value || '';
        const name = document.getElementById('gateUserName')?.value || '';

        if (!code.trim()) {
          alert('Please enter the Room Code.');
          return;
        }
        RoomManager.enterRoom(code, phone, pin, name);
      });

      const loginPinInput = document.getElementById('gateLoginPin');
      const joinSubmitText = document.getElementById('gateJoinSubmitText');
      if (loginPinInput && joinSubmitText) {
        loginPinInput.addEventListener('input', () => {
          if (loginPinInput.value.trim().length > 0) {
            joinSubmitText.textContent = 'Admin Login';
          } else {
            joinSubmitText.textContent = 'Join Flat';
          }
        });
      }
    }

    const toggleAdminPinBtn = document.getElementById('toggleAdminPinBtn');
    const adminPinCollapse = document.getElementById('gateAdminPinCollapse');
    if (toggleAdminPinBtn && adminPinCollapse) {
      toggleAdminPinBtn.addEventListener('click', () => {
        triggerHaptic();
        const isHidden = adminPinCollapse.style.display === 'none' || !adminPinCollapse.style.display;
        adminPinCollapse.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
          document.getElementById('gateLoginPin')?.focus();
        }
      });
    }

    const shareWhatsAppBtn = document.getElementById('shareWhatsAppBtn');
    if (shareWhatsAppBtn) {
      shareWhatsAppBtn.addEventListener('click', () => {
        triggerHaptic();
        const roomCode = RoomManager.activeRoom?.code || SyncEngine.roomCode || 'ROOM';
        const roomName = RoomManager.activeRoom?.name || 'our flat';
        const baseUrl = window.location.origin + window.location.pathname.replace(/\/index\.html$/, '');
        const inviteUrl = `${baseUrl}?room=${encodeURIComponent(roomCode)}`;
        const message = `Hey! Join ${roomName}'s meal tracker on Tiffin Tracker:\n${inviteUrl}\n\n1-tap instant meal logging, monthly mess bills & auto expense split!`;
        const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
        window.open(waUrl, '_blank');
      });
    }

    const switchRoomBtn = document.getElementById('switchRoomBtn');
    if (switchRoomBtn) {
      switchRoomBtn.addEventListener('click', () => {
        triggerHaptic();
        if (confirm('Switch flat or log out? You can rejoin anytime with your Room Code.')) {
          RoomManager.leaveRoom();
        }
      });
    }

    if (headerPendingBtn) {
      headerPendingBtn.addEventListener('click', () => {
        triggerHaptic();
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) {
          settingsModal.classList.add('active');
          document.querySelectorAll('.sub-tab').forEach(t => {
            t.classList.toggle('active', t.getAttribute('data-subtab') === 'members');
          });
          document.querySelectorAll('.subtab-content').forEach(c => {
            c.classList.toggle('active', c.id === 'subtab-members');
          });
          RoomManager.renderSettingsMembersTab();
        }
      });
    }

    if (addRoommateBtn) {
      addRoommateBtn.addEventListener('click', () => {
        triggerHaptic();
        const name = prompt('Enter flatmate name:');
        if (name && name.trim()) {
          const phone = prompt('Enter flatmate mobile number (optional):') || '';
          RoomManager.addMemberDirectly(name.trim(), phone.trim());
        }
      });
    }

    if (changeAdminPinBtn) {
      changeAdminPinBtn.addEventListener('click', () => {
        triggerHaptic();
        requireAdminPassword(() => {
          const newPin = prompt('Enter new Admin Security PIN:');
          if (newPin && newPin.trim()) {
            CONFIG.adminPassword = newPin.trim();
            if (RoomManager.activeRoom) {
              RoomManager.activeRoom.adminPin = newPin.trim();
              RoomManager.saveActiveRoom();
            }
            showToast('Admin security PIN updated!');
          }
        });
      });
    }

    const adminJoinViewBtn = document.getElementById('adminJoinViewMembersBtn');
    const adminJoinDismissBtn = document.getElementById('adminJoinDismissBtn');
    const adminJoinBanner = document.getElementById('adminJoinNoticeBanner');

    if (adminJoinViewBtn) {
      adminJoinViewBtn.addEventListener('click', () => {
        triggerHaptic();
        if (adminJoinBanner) adminJoinBanner.style.display = 'none';
        const settingsBtn = document.getElementById('headerSettingsBtn');
        if (settingsBtn) settingsBtn.click();
        const tab = document.querySelector('.sub-tab[data-subtab="members"]');
        if (tab) tab.click();
      });
    }

    if (adminJoinDismissBtn) {
      adminJoinDismissBtn.addEventListener('click', () => {
        triggerHaptic();
        if (adminJoinBanner) adminJoinBanner.style.display = 'none';
      });
    }
  }

  // --- Invoice Modal Controls ---
  function setupInvoiceModalControls() {
    const modal = document.getElementById('invoiceModal');
    const closeBtn = document.getElementById('closeInvoiceModalBtn');
    const printBtn = document.getElementById('invoicePrintActionBtn');

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
      });
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });
    }

    if (printBtn) {
      printBtn.addEventListener('click', () => {
        triggerHaptic();
        window.print();
      });
    }
  }

  // --- Startup Notification Permission & Welcome Dialog ---
  function showStartupWelcomePrompt() {
    if (localStorage.getItem('tiffin_welcome_greeted')) return;
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      localStorage.setItem('tiffin_welcome_greeted', 'true');
      return;
    }

    const modal = document.getElementById('notificationPromptModal');
    const title = document.getElementById('welcomeModalTitle');
    const sub = document.getElementById('welcomeModalSub');

    const groupName = RoomManager.activeRoom?.name || RoomManager.session?.groupName || 'Tiffin Tracker';
    if (title) title.textContent = `Welcome to ${groupName}! 🎉`;
    if (sub) sub.textContent = `Turn on notifications so you get alerted when flatmates schedule meal polls or update dinner menus.`;

    if (modal) {
      modal.classList.add('active');
    }
  }

  function setupNotificationStartupPrompt() {
    const modal = document.getElementById('notificationPromptModal');
    const allowBtn = document.getElementById('allowStartNotificationBtn');
    const dismissBtn = document.getElementById('dismissStartNotificationBtn');

    if (allowBtn) {
      allowBtn.addEventListener('click', async () => {
        triggerHaptic();
        localStorage.setItem('tiffin_welcome_greeted', 'true');
        modal?.classList.remove('active');
        try {
          const granted = await NotificationManager.requestPermission(true);
          if (granted) {
            showToast('🔔 Phone alerts enabled! You will be notified of meal polls.');
          } else {
            showToast('Notification permission dismissed.');
          }
        } catch (e) {}
      });
    }

    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        triggerHaptic();
        localStorage.setItem('tiffin_welcome_greeted', 'true');
        modal?.classList.remove('active');
      });
    }
  }

  // --- Cloud Sync & Room Controls ---
  function setupCloudSyncControls() {
    const statusBtn = document.getElementById('liveSyncStatusBtn');
    const modal = document.getElementById('cloudSyncModal');
    const closeBtn = document.getElementById('closeCloudSyncBtn');
    const roomInput = document.getElementById('roomCodeInput');
    const saveRoomBtn = document.getElementById('saveRoomCodeBtn');
    const forceSyncBtn = document.getElementById('forceSyncCloudBtn');
    const copyRoomLinkBtn = document.getElementById('copyRoomShareLinkBtn');

    if (statusBtn && modal) {
      statusBtn.addEventListener('click', () => {
        triggerHaptic();
        SyncEngine.updateStatusUI(SyncEngine.status);
        modal.classList.add('active');
      });
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
      });
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });
    }

    if (saveRoomBtn && roomInput) {
      saveRoomBtn.addEventListener('click', () => {
        triggerHaptic();
        if (roomInput.value.trim()) {
          SyncEngine.setRoomCode(roomInput.value);
        }
      });
    }

    if (forceSyncBtn) {
      forceSyncBtn.addEventListener('click', () => {
        triggerHaptic();
        SyncEngine.broadcastFullState('Manual broadcast');
      });
    }

    if (copyRoomLinkBtn) {
      copyRoomLinkBtn.addEventListener('click', () => {
        triggerHaptic();
        const baseUrl = window.location.href.split('#')[0];
        const link = `${baseUrl}#room=${SyncEngine.roomCode}`;
        copyToClipboard(link);
        showToast(`Copied room link (#${SyncEngine.roomCode})!`);
      });
    }
  }

  // --- Export & Sharing ---
  function setupExportAndSharing() {
    const headerShareBtn = document.getElementById('headerShareBtn');
    const copyShareUrlBtn = document.getElementById('copyShareUrlBtn');
    const copyWaSummaryBtn = document.getElementById('copyWaSummaryBtn');
    const sendDirectWaBtn = document.getElementById('sendDirectWaBtn');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const printInvoiceBtn = document.getElementById('printInvoiceBtn');
    const backupJsonBtn = document.getElementById('backupJsonBtn');
    const importInput = document.getElementById('importJsonInput');
    const resetBtn = document.getElementById('resetToDefaultBtn');

    const copyShare = () => {
      triggerHaptic();
      const input = document.getElementById('shareUrlDisplay');
      if (input) {
        copyToClipboard(input.value);
        showToast(`Copied share link (#${SyncEngine.roomCode})`);
      }
    };

    if (headerShareBtn) headerShareBtn.addEventListener('click', copyShare);
    if (copyShareUrlBtn) copyShareUrlBtn.addEventListener('click', copyShare);

    if (copyWaSummaryBtn) {
      copyWaSummaryBtn.addEventListener('click', () => {
        triggerHaptic();
        copyToClipboard(generateWhatsAppSummaryText());
        showToast('WhatsApp summary copied to clipboard');
      });
    }

    if (sendDirectWaBtn) {
      sendDirectWaBtn.addEventListener('click', () => {
        triggerHaptic();
        const text = encodeURIComponent(generateWhatsAppSummaryText());
        window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
      });
    }

    // Settings Modal Share & Export Buttons
    const settingsShareLink = document.getElementById('settingsShareLinkBtn');
    if (settingsShareLink) settingsShareLink.addEventListener('click', copyShare);

    const settingsShareWA = document.getElementById('settingsShareWhatsAppBtn');
    if (settingsShareWA) {
      settingsShareWA.addEventListener('click', () => {
        triggerHaptic();
        const text = encodeURIComponent(generateWhatsAppSummaryText());
        window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
      });
    }

    const settingsExportCsv = document.getElementById('settingsExportCsvBtn');
    if (settingsExportCsv) settingsExportCsv.addEventListener('click', downloadCsvExport);

    const settingsPrintInv = document.getElementById('settingsPrintInvoiceBtn');
    if (settingsPrintInv) {
      settingsPrintInv.addEventListener('click', () => {
        openInvoiceModal();
      });
    }

    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', downloadCsvExport);
    }

    if (printInvoiceBtn) {
      printInvoiceBtn.addEventListener('click', () => {
        openInvoiceModal();
      });
    }

    if (backupJsonBtn) {
      backupJsonBtn.addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState, null, 2));
        const a = document.createElement('a');
        a.setAttribute('href', dataStr);
        a.setAttribute('download', `Tiffin_Ledger_Backup_${new Date().toISOString().slice(0, 10)}.json`);
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast('Backup JSON downloaded');
      });
    }

    if (importInput) {
      importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const imported = JSON.parse(event.target.result);
            if (imported && imported.days) {
              appState = imported;
              logActivity(SyncEngine.identity, 'Restored Backup', 'Loaded JSON backup');
              persistAndBroadcast({
                type: 'full_sync',
                state: appState,
                reason: 'Imported backup JSON'
              });
              showToast('Ledger successfully restored from JSON!');
            }
          } catch (err) {
            alert('Invalid backup JSON file.');
          }
        };
        reader.readAsText(file);
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        requireAdminPassword(() => {
          appState = getDefaultDataForMonth(currentYear, currentMonth);
          selectedDay = CONFIG.todayDay;
          logActivity(SyncEngine.identity, 'Admin Action', 'Reset ledger to default starting data');
          persistAndBroadcast({
            type: 'full_sync',
            state: appState,
            reason: 'Reset to default data'
          });
          renderAll();
          showToast('Ledger reset to default');
        });
      });
    }
  }

  function downloadCsvExport() {
    triggerHaptic();
    const rates = getRates();
    const provider = appState.provider || CONFIG.defaultProvider;
    const totals = getFlatTotals();
    const room = RoomManager.activeRoom || { name: 'My Flat', code: SyncEngine.roomCode || 'ROOM' };
    const monthName = MONTH_NAMES[currentMonth - 1];

    let csv = "\uFEFF"; // UTF-8 BOM for Excel
    csv += "TIFFIN TRACKER - MONTHLY EXPENSE REPORT\n";
    csv += `Month,${monthName} ${currentYear}\n`;
    csv += `Group / Room,"${room.name.replace(/"/g, '""')} (#${room.code})"\n`;
    csv += `Tiffin Provider,"${(provider.name || 'Not configured').replace(/"/g, '""')} (UPI: ${(provider.upi || 'Not configured').replace(/"/g, '""')})"\n`;
    csv += `Rates Snapshot,"Half: Rs.${rates.half}, Full: Rs.${rates.full}, Special: Rs.${rates.special}, Milk: Rs.${rates.amulPacket || 35}"\n\n`;

    // Section 1: Roommate Summary Table
    csv += "MEMBER MONTHLY SUMMARY\n";
    csv += "#,Name,Phone,Half Meals,Full Meals,Special Meals,Total Meals,Tiffin Cost (Rs),Milk Packets,Milk Cost (Rs),Total Payable (Rs)\n";

    ROOMMATES.forEach((r, idx) => {
      const stats = getRoommateMonthlyStats(r.id);
      const combinedDue = stats.tiffinTotal + stats.milkTotal;
      csv += `${idx + 1},"${r.name.replace(/"/g, '""')}","${r.phone || ''}",${stats.halfCount},${stats.fullCount},${stats.specialCount},${stats.totalMeals},${stats.tiffinTotal},${stats.milkPackets},${stats.milkTotal},${combinedDue}\n`;
    });

    csv += `TOTALS,,,,,,${totals.totalMeals},${totals.tiffinTotal},,${totals.milkTotal},${totals.combinedTotal}\n\n`;

    // Section 2: Daily Attendance Matrix
    csv += "DAILY ATTENDANCE & MEAL MATRIX\n";
    let headerRow = "Date,Day,Dish / Sabzi";
    ROOMMATES.forEach(r => {
      headerRow += `,"${r.name.replace(/"/g, '""')} Lunch","${r.name.replace(/"/g, '""')} Dinner"`;
    });
    headerRow += ",Day Total (Rs)\n";
    csv += headerRow;

    for (let d = 1; d <= CONFIG.daysInMonth; d++) {
      const day = appState.days[d];
      if (!day) continue;
      const dayCost = getDayTotalCost(d);
      let row = `"${day.dateFormatted}","${day.dayOfWeek}","${(day.sabzi || '').replace(/"/g, '""')}"`;

      ROOMMATES.forEach(r => {
        const m = day.meals?.[r.id] || { lunch: '', dinner: '' };
        row += `,"${m.lunch || ''}","${m.dinner || ''}"`;
      });

      row += `,${dayCost}\n`;
      csv += row;
    }

    // Daily Matrix Footer
    let footerRow = "TOTAL,,,";
    ROOMMATES.forEach(r => {
      const stats = getRoommateMonthlyStats(r.id);
      footerRow += `,"Rs.${stats.tiffinTotal}",`;
    });
    footerRow += `,"Rs.${totals.tiffinTotal}"\n`;
    csv += footerRow;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Tiffin_Expense_${room.code}_${MONTH_SHORTS[currentMonth - 1]}_${currentYear}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('Downloaded detailed Tiffin Expense CSV!');
  }

  function setupTheme() {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('tiffin_theme', 'dark');
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('tiffin_theme', 'dark');
  }

  // --- Utility Helpers ---
  function showToast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.2s ease';
      setTimeout(() => toast.remove(), 250);
    }, 2500);
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
  }

  function triggerHaptic() {
    if (navigator.vibrate) {
      try { navigator.vibrate(25); } catch (e) {}
    }
  }

  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });

      navigator.serviceWorker.register('sw.js?v=' + APP_VERSION)
        .then((reg) => {
          // Immediately query server for sw.js byte-difference
          reg.update().catch(() => {});

          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  showToast('App updated to latest version! Reloading...', 'success');
                  setTimeout(() => {
                    if (!refreshing) {
                      refreshing = true;
                      window.location.reload();
                    }
                  }, 800);
                }
              });
            }
          });
        })
        .catch(err => console.log('Service Worker registration skipped:', err));

      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'NAVIGATE_TAB' && event.data.tab) {
          const target = event.data.tab;
          document.querySelectorAll('.nav-tab, .m-nav-tab').forEach(t => {
            t.classList.toggle('active', t.getAttribute('data-tab') === target);
          });
          document.querySelectorAll('.view-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === `view-${target}`);
          });
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    }
  }

  // Initialize App on DOM Ready
  document.addEventListener('DOMContentLoaded', () => {
    setupTheme();
    setupNavigation();
    setupMonthControls();
    setupSheetFilterControls();
    setupDateControls();
    setupSabziControls();
    setupFastActions();
    setupPollControls();
    setupUpiControls();
    setupAmulControls();
    setupSettingsControls();
    setupHeaderIdentityControls();
    setupPasswordPromptControls();
    setupCloudSyncControls();
    setupExportAndSharing();
    setupRoomAccessControls();
    setupInvoiceModalControls();
    registerServiceWorker();

    // Initialize Room & Multi-Tenant Access Gate
    RoomManager.init();

    updateMonthUI();
    populateDateSelectors();

    // Initialize notification status and startup permission prompt
    NotificationManager.updateUI();
    setupNotificationStartupPrompt();

    // Start Real-Time Cloud Sync Engine
    SyncEngine.init();

    // Check active poll reminders on startup
    if (appState && appState.activePoll && appState.activePoll.status === 'active') {
      PollReminderManager.start(appState.activePoll);
    }

    // Check reminders & catch up sync when user returns to app
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        SyncEngine.catchUp();
        if (RoomManager.activeRoom?.code) {
          SyncEngine.broadcast({
            type: 'request_room_sync',
            roomCode: RoomManager.activeRoom.code,
            requesterName: RoomManager.session?.name || 'Peer'
          });
        }
        if (appState && appState.activePoll && appState.activePoll.status === 'active') {
          PollReminderManager.checkAndRemind();
        }
      }
    });

    // Initial Full Render
    renderAll();
  });

})();
