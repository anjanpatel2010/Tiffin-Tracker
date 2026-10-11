/**
 * October Tiffin Expense Tracker - Core Application Logic
 * Mobile-First, Real-Time Cloud Sync, Voting Poll, Configurable Pricing & Audit Log
 */

(function () {
  'use strict';

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

  // Active Month & Year (Defaults to October 2026 for existing ledger)
  let currentYear = 2026;
  let currentMonth = 10; // 1-indexed (10 = October)

  const now = new Date();
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
    defaultRoom: 'flat-oct-2026-tiffin',
    defaultRates: {
      half: 80,
      full: 110,
      special: 90, // Alok Special (5 Roti, Sabji and Dal)
      amulPacket: 35
    },
    defaultProvider: {
      name: 'Sandhya Tiwari',
      upi: 'sandhyatiwari0205@oksbi',
      phone: '+91 98765 43210'
    }
  };

  const ROOMMATES = [
    { id: 'anjan', name: 'Anjan', slots: ['lunch', 'dinner'], avatarColor: '#0284c7' },
    { id: 'saurabh', name: 'Saurabh', slots: ['lunch', 'dinner'], avatarColor: '#0ea5e9' },
    { id: 'alok', name: 'Alok', slots: ['lunch', 'dinner'], hasSpecial: true, avatarColor: '#8b5cf6' },
    { id: 'rohit', name: 'Rohit', slots: ['lunch', 'dinner'], avatarColor: '#ec4899' },
    { id: 'salman', name: 'Salman', slots: ['lunch', 'dinner'], avatarColor: '#f59e0b' },
    { id: 'chetan', name: 'Chetan', slots: ['lunch', 'dinner'], avatarColor: '#10b981' },
    { id: 'hitesh', name: 'Hitesh', slots: ['lunch', 'dinner'], avatarColor: '#06b6d4' }
  ];

  function getStorageKey(year, month) {
    if (year === 2026 && month === 10) return 'tiffin_tracker_oct2026_data_v3';
    return `tiffin_tracker_ledger_${year}_${month}`;
  }

  // Generate blank month dataset (with verified baseline data for Oct 2026)
  function getDefaultDataForMonth(year, month) {
    const daysInM = getDaysInMonth(year, month);
    const monthName = MONTH_NAMES[month - 1];
    const monthShort = MONTH_SHORTS[month - 1].slice(0, 3);
    const days = {};

    for (let d = 1; d <= daysInM; d++) {
      const dateObj = new Date(year, month - 1, d);
      const dayOfWeek = DAY_NAMES[dateObj.getDay()];

      days[d] = {
        day: d,
        dayOfWeek: dayOfWeek,
        dateFormatted: `${dayOfWeek}, ${d} ${monthName}, ${year}`,
        dateShort: `${d} ${monthShort}`,
        sabzi: '',
        meals: {
          anjan: { lunch: '', dinner: '' },
          saurabh: { lunch: '', dinner: '' },
          alok: { lunch: '', dinner: '', lunchSpecial: '', dinnerSpecial: '' },
          rohit: { lunch: '', dinner: '' },
          salman: { lunch: '', dinner: '' },
          chetan: { lunch: '', dinner: '' },
          hitesh: { lunch: '', dinner: '' }
        },
        amul: {
          anjan: 0,
          saurabh: 0
        }
      };
    }

    // Seed October 2026 historical verified records
    if (year === 2026 && month === 10) {
      if (days[5]) {
        days[5].sabzi = 'Bhindi';
        days[5].meals.anjan.dinner = 'Half';
        days[5].meals.alok.dinner = 'Half';
        days[5].meals.rohit.dinner = 'Half';
        days[5].meals.chetan.dinner = 'Half';
        days[5].amul.anjan = 1;
        days[5].amul.saurabh = 1;
      }
      if (days[6]) {
        days[6].sabzi = 'Tinde';
        days[6].meals.anjan.dinner = 'Half';
        days[6].meals.saurabh.dinner = 'Half';
        days[6].meals.alok.dinner = 'Half';
        days[6].meals.rohit.dinner = 'Half';
        days[6].amul.anjan = 1;
        days[6].amul.saurabh = 1;
      }
    }

    const rates = (typeof appState !== 'undefined' && appState?.rates) ? { ...appState.rates } : { ...CONFIG.defaultRates };
    const provider = (typeof appState !== 'undefined' && appState?.provider) ? { ...appState.provider } : { ...CONFIG.defaultProvider };

    return {
      version: 3,
      year: year,
      month: month,
      lastModified: new Date().toISOString(),
      rates: rates,
      provider: provider,
      days: days,
      activePoll: null,
      auditLog: [
        {
          id: 'log_init_' + year + '_' + month,
          timestamp: Date.now(),
          timeFormatted: formatLogTime(Date.now()),
          author: 'System',
          action: 'Ledger Initialized',
          details: `Initialized ledger for ${monthName} ${year}.`
        }
      ]
    };
  }

  function loadStateForMonth(year, month) {
    // 1. Try URL hash state for Oct 2026 initial import
    if (year === 2026 && month === 10 && window.location.hash && window.location.hash.startsWith('#data=')) {
      try {
        const encoded = window.location.hash.slice(6);
        const jsonStr = decodeURIComponent(atob(encoded));
        const parsed = JSON.parse(jsonStr);
        if (parsed && parsed.days) {
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
  let appState = loadState();
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
    const monthText = document.getElementById('headerMonthText');
    const sheetTitle = document.getElementById('sheetMatrixTitle');
    const sheetDaysSub = document.getElementById('sheetDaysSubLabel');
    const amulTitle = document.getElementById('amulSectionTitle');

    const mName = MONTH_NAMES[currentMonth - 1];
    const mShort = MONTH_SHORTS[currentMonth - 1];

    if (monthText) monthText.textContent = `${mShort} ${currentYear}`;
    if (sheetTitle) sheetTitle.textContent = `${mName} ${currentYear} Master Matrix`;
    if (sheetDaysSub) sheetDaysSub.textContent = `${CONFIG.daysInMonth} Days`;
    if (amulTitle) amulTitle.textContent = `${mName} Amul Milk Tracker`;
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
        opt.textContent = `${d} ${MONTH_SHORTS[currentMonth - 1]} (${dayName})`;
        sel.appendChild(opt);
      }
      sel.value = selectedDay;
    };

    fillSelect(daySelect);
    fillSelect(pollDaySelect);
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
      // 1. Room code from URL or storage
      const hashMatch = window.location.hash.match(/#room=([a-zA-Z0-9_-]+)/);
      if (hashMatch && hashMatch[1]) {
        this.roomCode = hashMatch[1];
        localStorage.setItem('tiffin_sync_room', this.roomCode);
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      } else {
        this.roomCode = localStorage.getItem('tiffin_sync_room') || CONFIG.defaultRoom;
      }

      // 2. Roommate Identity
      this.identity = localStorage.getItem('tiffin_my_identity') || 'Anjan';
      updateIdentityUI(this.identity);

      // 3. Connect EventSource
      this.connect();

      // 4. Catch up poll
      this.catchUp();

      // 5. Setup 5-minute Poll Reminder Check
      this.setupPollReminder();
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
      showToast(`Switched to room #${this.roomCode}`);
    },

    setIdentity(name) {
      this.identity = name;
      localStorage.setItem('tiffin_my_identity', name);
      updateIdentityUI(name);
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
        btn.title = `Live Cloud Sync: ${status}. Room: #${this.roomCode}. Tap for settings.`;
      }
      if (lbl) {
        lbl.textContent = label || (status === 'connected' ? 'Live Sync' : status === 'syncing' ? 'Syncing...' : 'Offline');
      }
      const settingsSync = document.getElementById('settingsSyncStatusText');
      if (settingsSync) {
        settingsSync.textContent = status === 'connected' ? `Cloud Sync: Connected & Live (#${this.roomCode})` : status === 'syncing' ? 'Cloud Sync: Syncing...' : 'Cloud Sync: Offline';
      }
      if (modalTitle) {
        modalTitle.textContent = status === 'connected' ? `Live Sync Active (#${this.roomCode})` : status === 'syncing' ? 'Syncing with flatmates...' : 'Connecting to Live Cloud...';
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
          this.updateStatusUI('connected', 'Live Sync');
        };

        this.eventSource.onmessage = (event) => {
          try {
            const raw = JSON.parse(event.data);
            if (raw.event === 'message' && raw.message) {
              if (this.processedMessageIds.has(raw.id)) return;
              this.processedMessageIds.add(raw.id);
              this.handlePayload(raw.message);
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
            if (raw.event === 'message' && raw.message && !this.processedMessageIds.has(raw.id)) {
              this.processedMessageIds.add(raw.id);
              this.handlePayload(raw.message, true);
            }
          } catch (e) {}
        }
      } catch (e) {
        console.warn('Catch-up failed', e);
      }
    },

    async broadcast(action) {
      action.author = this.identity;
      action.timestamp = Date.now();
      action.sourceId = this.getClientId();
      action.year = action.year || currentYear;
      action.month = action.month || currentMonth;

      this.updateStatusUI('syncing', 'Syncing...');
      try {
        await fetch(`https://ntfy.sh/${encodeURIComponent(this.roomCode)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action)
        });
        setTimeout(() => {
          if (this.status === 'syncing') this.updateStatusUI('connected', 'Live Sync');
        }, 300);
      } catch (e) {
        console.warn('Broadcast failed', e);
        this.updateStatusUI('offline', 'Sync Error');
      }
    },

    async broadcastFullState(reason) {
      logActivity(this.identity, 'Broadcast Full Ledger', reason || 'Full cloud sync');
      await this.broadcast({
        type: 'full_sync',
        reason: reason || 'Manual broadcast',
        year: currentYear,
        month: currentMonth,
        state: appState
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

      if (action.sourceId && action.sourceId === this.getClientId()) {
        return; // Ignore self-echo
      }

      // If action belongs to a different month, persist silently in background
      if (action.year && action.month && (action.year !== currentYear || action.month !== currentMonth)) {
        try {
          const otherState = loadStateForMonth(action.year, action.month);
          if (action.type === 'meal_update' && otherState.days[action.day]) {
            otherState.days[action.day].meals[action.person][action.slot] = action.value;
          } else if (action.type === 'sabzi_update' && otherState.days[action.day]) {
            otherState.days[action.day].sabzi = action.sabzi;
          } else if (action.type === 'amul_update' && otherState.days[action.day]) {
            if (!otherState.days[action.day].amul) otherState.days[action.day].amul = { anjan: 0, saurabh: 0 };
            otherState.days[action.day].amul[action.person] = action.value;
          }
          saveStateForMonth(action.year, action.month, otherState);
        } catch (e) {}
        return;
      }

      let modified = false;

      if (action.type === 'meal_update') {
        const { day, person, slot, value, author } = action;
        if (appState.days[day] && appState.days[day].meals[person]) {
          const oldVal = appState.days[day].meals[person][slot];
          appState.days[day].meals[person][slot] = value;
          logActivity(author, 'Meal Update', `${capitalize(person)} ${slot}: ${oldVal || 'Off'} ➜ ${value || 'Off'} (Day ${day})`);
          modified = true;
          if (!isCatchUp) {
            showToast(`⚡ ${author} updated ${capitalize(person)}'s ${slot}: ${value || 'Off'}`);
          }
        }
      } else if (action.type === 'sabzi_update') {
        const { day, sabzi, author } = action;
        if (appState.days[day]) {
          appState.days[day].sabzi = sabzi;
          logActivity(author, 'Sabzi Update', `Day ${day} dish set to "${sabzi}"`);
          modified = true;
          if (!isCatchUp) {
            showToast(`⚡ ${author} set dish to "${sabzi}"`);
          }
        }
      } else if (action.type === 'bulk_dinner_half') {
        const { day, author } = action;
        if (appState.days[day]) {
          ROOMMATES.forEach(r => {
            appState.days[day].meals[r.id].dinner = 'Half';
          });
          logActivity(author, 'Bulk Dinner Half', `Marked all roommates Dinner Half for Day ${day}`);
          modified = true;
          if (!isCatchUp) {
            showToast(`⚡ ${author} marked all dinner Half`);
          }
        }
      } else if (action.type === 'amul_update') {
        const { day, person, value, author } = action;
        if (appState.days[day]) {
          if (!appState.days[day].amul) appState.days[day].amul = { anjan: 0, saurabh: 0 };
          appState.days[day].amul[person] = value;
          logActivity(author, 'Milk Update', `${capitalize(person)} milk packets: ${value} (Day ${day})`);
          modified = true;
        }
      } else if (action.type === 'poll_created') {
        appState.activePoll = action.poll;
        logActivity(action.author, 'Created Poll', `${action.poll.mealSlot} Poll for ${action.poll.day} Oct: ${action.poll.options.join(', ')}`);
        modified = true;
        if (!isCatchUp) {
          showToast(`🗳️ New ${action.poll.mealSlot} Poll from ${action.author}! Tap to vote.`);
          triggerHaptic();
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
          if (!isCatchUp) {
            const myId = (SyncEngine.identity || '').toLowerCase();
            const hasMyVote = !!(appState.activePoll.votes && appState.activePoll.votes[myId]);
            if (hasMyVote) {
              showToast(`🗳️ ${action.author} voted for ${action.option}`);
            } else {
              showToast(`🗳️ ${action.author} cast their vote!`);
            }
          }
        }
      } else if (action.type === 'poll_finalized') {
        if (appState.activePoll) {
          appState.activePoll.status = 'finalized';
          appState.activePoll.winner = action.winner;
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
          showToast(`✅ Poll Finalized: Winner is ${action.winner}!`);
        }
      } else if (action.type === 'rates_updated') {
        appState.rates = action.rates;
        logActivity(action.author, 'Rates Updated', `Half: ₹${action.rates.half}, Full: ₹${action.rates.full}, Special: ₹${action.rates.special}`);
        modified = true;
        if (!isCatchUp) {
          showToast(`💰 Meal rates updated by ${action.author}`);
        }
      } else if (action.type === 'full_sync' && action.state) {
        if (action.state.days) {
          appState = action.state;
          modified = true;
          if (!isCatchUp) {
            showToast(`⚡ Ledger synchronized from ${action.author}`);
          }
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

  // --- Rendering UI Modules ---

  function updateIdentityUI(name) {
    const headerName = document.getElementById('headerIdentityName');
    const settingsSelect = document.getElementById('settingsIdentitySelect');
    const onboardingSelect = document.getElementById('onboardingNameSelect');
    const myVoteLabel = document.getElementById('myVoteIdentityLabel');

    if (headerName) headerName.textContent = name;
    if (settingsSelect) settingsSelect.value = name;
    if (onboardingSelect) onboardingSelect.value = name;
    if (myVoteLabel) myVoteLabel.textContent = name;
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

    if (dayTitle) dayTitle.textContent = dayData.dateFormatted;
    if (dayTagPill) {
      dayTagPill.style.display = (selectedDay === CONFIG.todayDay) ? 'inline-flex' : 'none';
    }
    if (jumpLabel) {
      jumpLabel.textContent = `Jump to Today (${MONTH_SHORTS[currentMonth - 1]} ${CONFIG.todayDay})`;
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

    const rates = getRates();

    ROOMMATES.forEach(r => {
      const m = dayData.meals[r.id] || { lunch: '', dinner: '' };
      const individualCost = getRoommateDayCost(r.id, selectedDay);
      const initials = r.name.slice(0, 2).toUpperCase();

      const card = document.createElement('div');
      card.className = 'roommate-card';

      // Special button for Alok with "5 Roti, Sabji and Dal" subtitle
      const renderSlot = (slotName, currentVal) => {
        let specialBtnHtml = '';
        if (r.hasSpecial) {
          specialBtnHtml = `
            <button class="seg-btn ${currentVal === 'Special' ? 'active special' : ''}" data-person="${r.id}" data-slot="${slotName}" data-val="Special">
              <span>Special</span>
              <span class="seg-price">₹${rates.special}</span>
              <span class="seg-desc">5 Roti, Sabji and Dal</span>
            </button>
          `;
        }

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
              ${specialBtnHtml}
            </div>
          </div>
        `;
      };

      card.innerHTML = `
        <div class="roommate-card-header">
          <div class="roommate-info">
            <div class="roommate-avatar" style="background:${r.avatarColor}">${initials}</div>
            <div class="roommate-name">${r.name}</div>
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

        appState.days[selectedDay].meals[person][slot] = val;
        logActivity(SyncEngine.identity, 'Logged Meal', `${capitalize(person)} ${slot}: ${val || 'Off'}`);
        persistAndBroadcast({
          type: 'meal_update',
          day: selectedDay,
          person: person,
          slot: slot,
          value: val
        });
      });
    });
  }

  // 2. Menu Voting Poll Render
  function renderPollView() {
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
        opt.textContent = `${d} Oct`;
        pollDaySelect.appendChild(opt);
      }
      pollDaySelect.value = selectedDay;
    }

    if (!poll || poll.status === 'finalized') {
      if (pollStatusBadge) {
        pollStatusBadge.className = 'badge-pill';
        pollStatusBadge.textContent = poll && poll.status === 'finalized' ? 'Last Poll Finalized' : 'No Active Poll';
      }
      if (activePollContainer) activePollContainer.style.display = 'none';
      if (createPollContainer) createPollContainer.style.display = 'block';
      return;
    }

    // Active Poll is Running
    if (pollStatusBadge) {
      pollStatusBadge.className = 'badge-pill today-pill';
      pollStatusBadge.textContent = 'Active Poll 🟢';
    }
    if (activePollContainer) activePollContainer.style.display = 'block';
    if (createPollContainer) createPollContainer.style.display = 'none';

    // Set Poll texts
    const mealTag = document.getElementById('pollMealTag');
    const questionText = document.getElementById('pollQuestionText');
    const metaText = document.getElementById('pollMetaText');

    if (mealTag) mealTag.textContent = `${(poll.mealSlot || 'DINNER').toUpperCase()} POLL (${poll.day} OCT)`;
    if (questionText) questionText.textContent = `What should we cook for ${poll.mealSlot || 'Dinner'}?`;
    if (metaText) metaText.textContent = `Launched by ${poll.author || 'Flatmate'} • Live across all phones`;

    const myId = (SyncEngine.identity || 'anjan').toLowerCase();
    const myVote = (poll.votes && poll.votes[myId]) ? poll.votes[myId] : null;
    const hasVoted = !!myVote;

    const blindNotice = document.getElementById('pollBlindNotice');
    const myVoteBox = document.getElementById('myVoteBox');
    const myVotedSummary = document.getElementById('myVotedSummaryBox');
    const myVotedChoiceText = document.getElementById('myVotedChoiceText');
    const myVoteIdentityLabel = document.getElementById('myVoteIdentityLabel');
    const pollResultsTray = document.getElementById('pollResultsTray');
    const votersBreakdownCard = document.getElementById('votersBreakdownCard');
    const finalizeActions = document.getElementById('pollFinalizeActions');

    if (myVoteIdentityLabel) myVoteIdentityLabel.textContent = SyncEngine.identity || 'You';

    // Blind Voting Enforcement:
    // If user hasn't voted yet, hide the results, tally, and others' choices!
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

      poll.options.forEach((optText, idx) => {
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

      // Count votes per option
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
        const v = votes[r.id];
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
        thead.innerHTML = `
          <tr class="header-group-row">
            <th class="th-sticky th-date">Date</th>
            <th class="th-sticky th-menu">Sabzi / Note</th>
            <th colspan="2" class="th-person">Anjan</th>
            <th colspan="2" class="th-person">Saurabh</th>
            <th colspan="3" class="th-person">Alok</th>
            <th colspan="2" class="th-person">Rohit</th>
            <th colspan="2" class="th-person">Salman</th>
            <th colspan="2" class="th-person">Chetan</th>
            <th colspan="2" class="th-person">Hitesh</th>
            <th class="th-day-total">Day Total</th>
          </tr>
          <tr class="header-sub-row">
            <th class="th-sticky th-date-sub">${CONFIG.daysInMonth} Days</th>
            <th class="th-sticky th-menu-sub">Dish</th>
            <th>Lunch</th><th>Dinner</th>
            <th>Lunch</th><th>Dinner</th>
            <th>Lunch</th><th>Dinner</th><th>Special</th>
            <th>Lunch</th><th>Dinner</th>
            <th>Lunch</th><th>Dinner</th>
            <th>Lunch</th><th>Dinner</th>
            <th>Lunch</th><th>Dinner</th>
            <th>Amount</th>
          </tr>
        `;
      } else if (activePerson) {
        const colSpan = activePerson.hasSpecial ? 3 : 2;
        thead.innerHTML = `
          <tr class="header-group-row">
            <th class="th-sticky th-date">Date</th>
            <th class="th-sticky th-menu">Sabzi / Note</th>
            <th colspan="${colSpan}" class="th-person" style="background:${activePerson.avatarColor}; color:#ffffff">${activePerson.name}</th>
            <th class="th-day-total">Day Total</th>
          </tr>
          <tr class="header-sub-row">
            <th class="th-sticky th-date-sub">${CONFIG.daysInMonth} Days</th>
            <th class="th-sticky th-menu-sub">Dish</th>
            <th>Lunch</th><th>Dinner</th>${activePerson.hasSpecial ? '<th>Special</th>' : ''}
            <th>Amount</th>
          </tr>
        `;
      }
    }

    for (let d = 1; d <= CONFIG.daysInMonth; d++) {
      const dayData = appState.days[d];
      if (!dayData) continue;

      if (searchTerm) {
        const matchesDate = dayData.dateFormatted.toLowerCase().includes(searchTerm);
        const matchesSabzi = (dayData.sabzi || '').toLowerCase().includes(searchTerm);
        if (!matchesDate && !matchesSabzi) continue;
      }

      const isToday = (d === CONFIG.todayDay);
      const tr = document.createElement('tr');
      if (isToday) tr.classList.add('row-today');

      const dayTotal = getDayTotalCost(d);

      // Helper to generate interactive cell
      const makeCell = (person, slot) => {
        const val = dayData.meals[person][slot] || '';
        let valClass = 'val-off';
        let displayVal = '-';
        if (val === 'Half') { valClass = 'val-half'; displayVal = `H (₹${rates.half})`; }
        else if (val === 'Full') { valClass = 'val-full'; displayVal = `F (₹${rates.full})`; }
        else if (val === 'Special') { valClass = 'val-special'; displayVal = `Sp (₹${rates.special})`; }

        return `<td class="cell-interactive ${valClass}" data-day="${d}" data-person="${person}" data-slot="${slot}" title="Click to cycle meal for ${person}">${displayVal}</td>`;
      };

      if (isAll) {
        tr.innerHTML = `
          <td class="td-sticky-date" title="${dayData.dateFormatted}">
            ${dayData.dayOfWeek.slice(0, 3)}, ${d} ${MONTH_SHORTS[currentMonth - 1]}
          </td>
          <td class="td-sticky-menu" data-day="${d}" title="Click to edit sabzi">
            ${dayData.sabzi ? escapeHtml(dayData.sabzi) : '<span style="opacity:0.35">+ Edit</span>'}
          </td>
          <!-- Anjan -->
          ${makeCell('anjan', 'lunch')}
          ${makeCell('anjan', 'dinner')}
          <!-- Saurabh -->
          ${makeCell('saurabh', 'lunch')}
          ${makeCell('saurabh', 'dinner')}
          <!-- Alok -->
          ${makeCell('alok', 'lunch')}
          ${makeCell('alok', 'dinner')}
          <td class="cell-interactive ${dayData.meals.alok.dinner === 'Special' ? 'val-special' : 'val-off'}" data-day="${d}" data-person="alok" data-slot="special">
            ${dayData.meals.alok.dinner === 'Special' || dayData.meals.alok.lunch === 'Special' ? `Sp (₹${rates.special})` : '-'}
          </td>
          <!-- Rohit -->
          ${makeCell('rohit', 'lunch')}
          ${makeCell('rohit', 'dinner')}
          <!-- Salman -->
          ${makeCell('salman', 'lunch')}
          ${makeCell('salman', 'dinner')}
          <!-- Chetan -->
          ${makeCell('chetan', 'lunch')}
          ${makeCell('chetan', 'dinner')}
          <!-- Hitesh -->
          ${makeCell('hitesh', 'lunch')}
          ${makeCell('hitesh', 'dinner')}
          <!-- Day Total -->
          <td style="font-weight:700; font-family:var(--font-mono); color:${dayTotal > 0 ? 'var(--emerald)' : 'var(--text-dim)'}">
            ₹${dayTotal}
          </td>
        `;
      } else if (activePerson) {
        tr.innerHTML = `
          <td class="td-sticky-date" title="${dayData.dateFormatted}">
            ${dayData.dayOfWeek.slice(0, 3)}, ${d} ${MONTH_SHORTS[currentMonth - 1]}
          </td>
          <td class="td-sticky-menu" data-day="${d}" title="Click to edit sabzi">
            ${dayData.sabzi ? escapeHtml(dayData.sabzi) : '<span style="opacity:0.35">+ Edit</span>'}
          </td>
          ${makeCell(activePerson.id, 'lunch')}
          ${makeCell(activePerson.id, 'dinner')}
          ${activePerson.hasSpecial ? `
            <td class="cell-interactive ${dayData.meals.alok.dinner === 'Special' || dayData.meals.alok.lunch === 'Special' ? 'val-special' : 'val-off'}" data-day="${d}" data-person="alok" data-slot="special">
              ${dayData.meals.alok.dinner === 'Special' || dayData.meals.alok.lunch === 'Special' ? `Sp (₹${rates.special})` : '-'}
            </td>
          ` : ''}
          <td style="font-weight:700; font-family:var(--font-mono); color:${dayTotal > 0 ? 'var(--emerald)' : 'var(--text-dim)'}">
            ₹${dayTotal}
          </td>
        `;
      }

      tbody.appendChild(tr);
    }

    // Attach Cell Click Event to Cycle Meal
    tbody.querySelectorAll('.cell-interactive').forEach(cell => {
      cell.addEventListener('click', () => {
        triggerHaptic();
        const d = parseInt(cell.getAttribute('data-day'));
        const person = cell.getAttribute('data-person');
        const slot = cell.getAttribute('data-slot');

        if (slot === 'special') {
          // Toggle special for Alok's dinner
          const curVal = appState.days[d].meals.alok.dinner;
          const nextVal = (curVal === 'Special') ? '' : 'Special';
          appState.days[d].meals.alok.dinner = nextVal;
          logActivity(SyncEngine.identity, 'Meal Update', `Alok Dinner: ${nextVal || 'Off'} (Day ${d})`);
          persistAndBroadcast({
            type: 'meal_update',
            year: currentYear,
            month: currentMonth,
            day: d,
            person: 'alok',
            slot: 'dinner',
            value: nextVal
          });
          return;
        }

        const curVal = appState.days[d].meals[person][slot] || '';
        let nextVal = '';
        if (person === 'alok') {
          // Cycle for Alok: Off -> Half -> Full -> Special -> Off
          if (!curVal) nextVal = 'Half';
          else if (curVal === 'Half') nextVal = 'Full';
          else if (curVal === 'Full') nextVal = 'Special';
          else nextVal = '';
        } else {
          // Cycle for others: Off -> Half -> Full -> Off
          if (!curVal) nextVal = 'Half';
          else if (curVal === 'Half') nextVal = 'Full';
          else nextVal = '';
        }

        appState.days[d].meals[person][slot] = nextVal;
        logActivity(SyncEngine.identity, 'Meal Update', `${capitalize(person)} ${slot}: ${nextVal || 'Off'} (Day ${d})`);
        persistAndBroadcast({
          type: 'meal_update',
          year: currentYear,
          month: currentMonth,
          day: d,
          person: person,
          slot: slot,
          value: nextVal
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
          appState.days[d].sabzi = newDish.trim();
          logActivity(SyncEngine.identity, 'Updated Sabzi from Sheet', `Day ${d}: "${newDish.trim()}"`);
          persistAndBroadcast({
            type: 'sabzi_update',
            year: currentYear,
            month: currentMonth,
            day: d,
            sabzi: newDish.trim()
          });
          showToast(`Updated dish for ${d} ${MONTH_SHORTS[currentMonth - 1]}`);
        }
      });
    });

    // Master Sheet Footer Totals
    if (isAll) {
      const anjanTotal = getRoommateMonthlyStats('anjan').tiffinTotal;
      const saurabhTotal = getRoommateMonthlyStats('saurabh').tiffinTotal;
      const alokTotal = getRoommateMonthlyStats('alok').tiffinTotal;
      const rohitTotal = getRoommateMonthlyStats('rohit').tiffinTotal;
      const salmanTotal = getRoommateMonthlyStats('salman').tiffinTotal;
      const chetanTotal = getRoommateMonthlyStats('chetan').tiffinTotal;
      const hiteshTotal = getRoommateMonthlyStats('hitesh').tiffinTotal;

      tfoot.innerHTML = `
        <tr>
          <td class="td-sticky-date" style="font-weight:800; color:var(--text-main);">Total</td>
          <td class="td-sticky-menu">—</td>
          <td colspan="2">₹${anjanTotal}</td>
          <td colspan="2">₹${saurabhTotal}</td>
          <td colspan="3">₹${alokTotal}</td>
          <td colspan="2">₹${rohitTotal}</td>
          <td colspan="2">₹${salmanTotal}</td>
          <td colspan="2">₹${chetanTotal}</td>
          <td colspan="2">₹${hiteshTotal}</td>
          <td style="font-size:1rem; color:var(--emerald);">₹${grandFlatTotal}</td>
        </tr>
      `;
    } else if (activePerson) {
      const pStats = getRoommateMonthlyStats(activePerson.id);
      const colSpan = activePerson.hasSpecial ? 3 : 2;
      tfoot.innerHTML = `
        <tr>
          <td class="td-sticky-date" style="font-weight:800; color:var(--text-main);">Total</td>
          <td class="td-sticky-menu">—</td>
          <td colspan="${colSpan}" style="font-size:0.95rem; font-weight:800; color:var(--accent-light);">₹${pStats.tiffinTotal}</td>
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
    if (statMeals) statMeals.textContent = `${flatTotals.totalMeals} total meals served in October`;
    if (splitRatesSub) splitRatesSub.textContent = `Rates: Half ₹${rates.half} • Full ₹${rates.full} • Special ₹${rates.special}`;

    // Roommate Expense Split Bars
    const list = document.getElementById('roommateSplitBarsList');
    if (!list) return;
    list.innerHTML = '';

    ROOMMATES.forEach(r => {
      const stats = getRoommateMonthlyStats(r.id);
      const pct = flatTotals.tiffinTotal > 0 ? ((stats.tiffinTotal / flatTotals.tiffinTotal) * 100).toFixed(1) : 0;

      const item = document.createElement('div');
      item.className = 'split-row-item';
      item.innerHTML = `
        <div class="split-row-header">
          <div class="split-person-details">
            <div class="roommate-avatar" style="width:28px; height:28px; font-size:0.75rem; background:${r.avatarColor}">${r.name.slice(0, 2)}</div>
            <strong style="font-size:0.95rem">${r.name}</strong>
          </div>
          <div class="split-amount-wrap">
            <span class="split-share-pct">${pct}%</span>
            <span class="split-cost">₹${stats.tiffinTotal}</span>
          </div>
        </div>
        <div class="split-bar-track">
          <div class="split-bar-fill" style="width:${pct}%; background:${r.avatarColor}"></div>
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
        : `${roommateObj.name}'s October bill (${stats.totalMeals} meals)`;
    }

    // Dynamic UPI Deep Link
    const note = encodeURIComponent(`October Tiffin - ${roommateObj.name}`);
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

    const rates = getRates();
    const amulBadge = document.getElementById('amulPriceBadge');
    if (amulBadge) amulBadge.textContent = `₹${rates.amulPacket || 35} / packet`;

    const amulDayLabel = document.getElementById('amulCurrentDayLabel');
    if (amulDayLabel) amulDayLabel.textContent = dayData.dateShort;

    const anjanDayPkt = Number(dayData.amul?.anjan) || 0;
    const saurabhDayPkt = Number(dayData.amul?.saurabh) || 0;

    const dayAnjanVal = document.getElementById('amulDayAnjanVal');
    const daySaurabhVal = document.getElementById('amulDaySaurabhVal');
    if (dayAnjanVal) dayAnjanVal.textContent = anjanDayPkt ? `${anjanDayPkt} pkt` : '0 pkt';
    if (daySaurabhVal) daySaurabhVal.textContent = saurabhDayPkt ? `${saurabhDayPkt} pkt` : '0 pkt';

    // Highlight active pills in dedicated Amul tab
    document.querySelectorAll('#view-amul .amul-pill-group').forEach(group => {
      const p = group.getAttribute('data-person');
      const curVal = Number(dayData.amul?.[p]) || 0;
      group.querySelectorAll('.amul-pill-btn').forEach(b => {
        const qty = parseFloat(b.getAttribute('data-qty'));
        b.classList.toggle('active', qty === curVal);
      });
    });

    // Monthly totals
    const anjanStats = getRoommateMonthlyStats('anjan');
    const saurabhStats = getRoommateMonthlyStats('saurabh');
    const totalMilkPackets = anjanStats.milkPackets + saurabhStats.milkPackets;
    const grandMilkCost = anjanStats.milkTotal + saurabhStats.milkTotal;

    const formatRupees = (val) => (val % 1 === 0 ? `₹${val}` : `₹${val.toFixed(1)}`);
    const formatPkts = (val) => (val % 1 === 0 ? `${val} packets` : `${val.toFixed(1)} packets`);

    const elAnjanTot = document.getElementById('amulAnjanTotal');
    const elAnjanPkts = document.getElementById('amulAnjanPackets');
    const elSaurabhTot = document.getElementById('amulSaurabhTotal');
    const elSaurabhPkts = document.getElementById('amulSaurabhPackets');
    const elGrandTot = document.getElementById('amulGrandTotal');
    const elGrandPkts = document.getElementById('amulTotalPackets');

    if (elAnjanTot) elAnjanTot.textContent = formatRupees(anjanStats.milkTotal);
    if (elAnjanPkts) elAnjanPkts.textContent = formatPkts(anjanStats.milkPackets);
    if (elSaurabhTot) elSaurabhTot.textContent = formatRupees(saurabhStats.milkTotal);
    if (elSaurabhPkts) elSaurabhPkts.textContent = formatPkts(saurabhStats.milkPackets);
    if (elGrandTot) elGrandTot.textContent = formatRupees(grandMilkCost);
    if (elGrandPkts) elGrandPkts.textContent = formatPkts(totalMilkPackets);

    // Table
    const tbody = document.getElementById('amulTableBody');
    if (tbody) {
      tbody.innerHTML = '';
      for (let d = 1; d <= CONFIG.daysInMonth; d++) {
        const dData = appState.days[d];
        const anjanPkt = Number(dData?.amul?.anjan) || 0;
        const saurabhPkt = Number(dData?.amul?.saurabh) || 0;
        const dayCost = (anjanPkt + saurabhPkt) * (Number(rates.amulPacket) || 35);

        const tr = document.createElement('tr');
        if (d === selectedDay) tr.style.backgroundColor = 'rgba(6, 182, 212, 0.12)';
        tr.innerHTML = `
          <td class="td-sticky-date">${dData.dateShort}</td>
          <td class="cell-interactive ${anjanPkt > 0 ? 'val-special' : 'val-off'} cell-amul-interactive" data-day="${d}" data-person="anjan" title="Click to cycle: Off -> 0.5 -> 1 -> 2 -> Off">
            ${anjanPkt ? `${anjanPkt} pkt` : '-'}
          </td>
          <td class="cell-interactive ${saurabhPkt > 0 ? 'val-special' : 'val-off'} cell-amul-interactive" data-day="${d}" data-person="saurabh" title="Click to cycle: Off -> 0.5 -> 1 -> 2 -> Off">
            ${saurabhPkt ? `${saurabhPkt} pkt` : '-'}
          </td>
          <td style="font-family:var(--font-mono); font-weight:700; color:${dayCost > 0 ? 'var(--cyan)' : 'var(--text-dim)'}">
            ${dayCost > 0 ? formatRupees(dayCost) : '-'}
          </td>
        `;
        tbody.appendChild(tr);
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

          if (!appState.days[d].amul) appState.days[d].amul = { anjan: 0, saurabh: 0 };
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

    let text = `🍛 *${mNameUpper} ${currentYear} TIFFIN EXPENSE SUMMARY*\n`;
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

  function setupNavigation() {
    const tabs = document.querySelectorAll('.nav-tab, .m-nav-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        triggerHaptic();
        const target = tab.getAttribute('data-tab');

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
      });
    });

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
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        triggerHaptic();
        if (selectedDay < CONFIG.daysInMonth) {
          selectedDay++;
          renderAll();
        }
      });
    }

    if (jumpTodayBtn) {
      jumpTodayBtn.addEventListener('click', () => {
        triggerHaptic();
        selectedDay = CONFIG.todayDay;
        renderAll();
        showToast(`Jumped to Today (Oct ${CONFIG.todayDay})`);
      });
    }

    if (sheetJumpTodayBtn) {
      sheetJumpTodayBtn.addEventListener('click', () => {
        triggerHaptic();
        selectedDay = CONFIG.todayDay;
        renderAll();
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
        appState.days[selectedDay].sabzi = e.target.value;
        saveStateToStorage(appState);
        renderMasterSheet();

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          logActivity(SyncEngine.identity, 'Sabzi Update', `Day ${selectedDay} dish set to "${e.target.value}"`);
          SyncEngine.broadcast({
            type: 'sabzi_update',
            day: selectedDay,
            sabzi: e.target.value
          });
        }, 500);
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        triggerHaptic();
        appState.days[selectedDay].sabzi = '';
        if (sabziInput) sabziInput.value = '';
        renderDailyLogger();
        renderMasterSheet();
        logActivity(SyncEngine.identity, 'Cleared Sabzi', `Day ${selectedDay}`);
        persistAndBroadcast({
          type: 'sabzi_update',
          day: selectedDay,
          sabzi: ''
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
          appState.days[selectedDay].sabzi = '';
          ROOMMATES.forEach(r => {
            appState.days[selectedDay].meals[r.id] = { lunch: '', dinner: '' };
          });
          logActivity(SyncEngine.identity, 'Admin Action', `Reset meals for Day ${selectedDay}`);
          persistAndBroadcast({
            type: 'full_sync',
            state: appState,
            reason: `Reset day ${selectedDay}`
          });
          showToast(`Meals for ${selectedDay} Oct reset to Off`);
        });
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

        appState.activePoll = newPoll;
        logActivity(SyncEngine.identity, 'Created Poll', `${slot} poll for ${day} Oct: ${options.join(', ')}`);
        persistAndBroadcast({
          type: 'poll_created',
          poll: newPoll
        });
        showToast('🚀 Poll launched to all roommates!');
        renderPollView();
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
        const myId = (SyncEngine.identity || 'Anjan').toLowerCase();

        if (!appState.activePoll.votes) appState.activePoll.votes = {};
        appState.activePoll.votes[myId] = {
          option: dishChoice,
          portion: portionChoice,
          time: Date.now()
        };

        logActivity(SyncEngine.identity, 'Voted', `Voted "${dishChoice}" (${portionChoice === 'No' ? 'No Tiffin' : portionChoice}) in ${appState.activePoll.mealSlot} Poll`);
        persistAndBroadcast({
          type: 'poll_voted',
          pollId: appState.activePoll.id,
          roommateId: myId,
          option: dishChoice,
          portion: portionChoice
        });
        showToast(`Vote submitted! Live results unlocked 🔓`);
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

        // Count votes and find winner (only count dish preferences where portion != 'No' and dish is valid)
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

        // Apply each roommate's chosen portion (or default Off)
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

        logActivity(SyncEngine.identity, 'Finalized Poll', `Winner: ${winningDish} (${maxVotes > 0 ? maxVotes : 0} votes)`);
        persistAndBroadcast({
          type: 'poll_finalized',
          day: poll.day,
          mealSlot: poll.mealSlot,
          winner: winningDish,
          mealsApplied: mealsApplied
        });

        // Generate WhatsApp Order Message
        const rates = getRates();
        const provider = appState.provider || CONFIG.defaultProvider;

        let waOrder = `🍲 *TIFFIN ORDER - ${poll.day} OCT (${(poll.mealSlot || 'DINNER').toUpperCase()})*\n`;
        waOrder += `Cook: ${provider.name}\n`;
        waOrder += `Selected Sabzi: *${winningDish}*\n`;
        waOrder += `────────────────────\n`;

        let halfCount = 0, fullCount = 0, specCount = 0, noCount = 0;
        ROOMMATES.forEach(r => {
          const p = mealsApplied[r.id];
          if (p === 'Half') halfCount++;
          else if (p === 'Full') fullCount++;
          else if (p === 'Special') specCount++;
          else noCount++;

          let displayStatus = p;
          if (p === 'Special') displayStatus = 'Special (5 Roti, Sabji, Dal)';
          else if (p === 'Off') displayStatus = 'No Tiffin (Off)';

          waOrder += `• ${r.name}: ${displayStatus}\n`;
        });

        waOrder += `────────────────────\n`;
        const countSummary = [];
        if (halfCount) countSummary.push(`${halfCount} Half`);
        if (fullCount) countSummary.push(`${fullCount} Full`);
        if (specCount) countSummary.push(`${specCount} Special`);
        if (noCount) countSummary.push(`${noCount} Off`);
        waOrder += `*Total Order:* ${countSummary.join(', ')}\n\n`;
        waOrder += `Please prepare as per count. Thank you!`;

        // Copy and open WhatsApp
        copyToClipboard(waOrder);
        showToast(`Copied order message for ${provider.name}!`);
        renderPollView();
        renderDailyLogger();
        renderMasterSheet();

        const phoneParam = provider.phone ? `&phone=${encodeURIComponent(provider.phone.replace(/[^0-9]/g, ''))}` : '';
        const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(waOrder)}${phoneParam}`;
        setTimeout(() => {
          window.open(waUrl, '_blank');
        }, 400);
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

      if (!appState.days[selectedDay].amul) {
        appState.days[selectedDay].amul = { anjan: 0, saurabh: 0 };
      }
      appState.days[selectedDay].amul[person] = nextVal;
      logActivity(SyncEngine.identity, 'Milk Packets', `${capitalize(person)}: ${nextVal} pkt (Day ${selectedDay})`);
      persistAndBroadcast({
        type: 'amul_update',
        year: currentYear,
        month: currentMonth,
        day: selectedDay,
        person: person,
        value: nextVal
      });
    });
  }

  // --- Sheet Column Filter Controls ---
  function setupSheetFilterControls() {
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
    const modal = document.getElementById('monthPickerModal');
    const closeBtn = document.getElementById('closeMonthPickerBtn');
    const prevYearBtn = document.getElementById('pickerPrevYearBtn');
    const nextYearBtn = document.getElementById('pickerNextYearBtn');
    const yearDisplay = document.getElementById('pickerYearVal');
    const monthsGrid = document.getElementById('monthsPickerGrid');
    const jumpCurrentBtn = document.getElementById('jumpCurrentRealMonthBtn');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        triggerHaptic();
        let y = currentYear;
        let m = currentMonth - 1;
        if (m < 1) { m = 12; y--; }
        switchMonth(y, m);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        triggerHaptic();
        let y = currentYear;
        let m = currentMonth + 1;
        if (m > 12) { m = 1; y++; }
        switchMonth(y, m);
      });
    }

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

    if (pickerBtn && modal) {
      pickerBtn.addEventListener('click', () => {
        triggerHaptic();
        modalDisplayedYear = currentYear;
        renderMonthPickerGrid();
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

    // Save Pricing Rates
    const saveRatesBtn = document.getElementById('saveRatesBtn');
    if (saveRatesBtn) {
      saveRatesBtn.addEventListener('click', () => {
        triggerHaptic();
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

    // Identity Pill in Header
    const headerIdentityPill = document.getElementById('headerUserIdentityPill');
    if (headerIdentityPill && modal) {
      headerIdentityPill.addEventListener('click', () => {
        triggerHaptic();
        loadSettingsValues();
        modal.classList.add('active');
        const idTab = document.querySelector('.sub-tab[data-subtab="identity"]');
        if (idTab) idTab.click();
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

    if (rHalf) rHalf.value = rates.half;
    if (rFull) rFull.value = rates.full;
    if (rSpec) rSpec.value = rates.special;
    if (rAmul) rAmul.value = rates.amulPacket;

    const pName = document.getElementById('providerNameInput');
    const pUpi = document.getElementById('providerUpiInput');
    const pPhone = document.getElementById('providerPhoneInput');

    if (pName) pName.value = provider.name;
    if (pUpi) pUpi.value = provider.upi;
    if (pPhone) pPhone.value = provider.phone || '';

    const idSelect = document.getElementById('settingsIdentitySelect');
    if (idSelect) idSelect.value = SyncEngine.identity;
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

  // --- Onboarding / First Visit Walkthrough ---
  function setupOnboarding() {
    const modal = document.getElementById('onboardingModal');
    const finishBtn = document.getElementById('finishOnboardingBtn');
    const select = document.getElementById('onboardingNameSelect');

    const hasOnboarded = localStorage.getItem('tiffin_onboarded_v2');
    if (!hasOnboarded && modal) {
      modal.classList.add('active');
    }

    if (finishBtn && modal) {
      finishBtn.addEventListener('click', () => {
        triggerHaptic();
        const chosen = select?.value || 'Anjan';
        SyncEngine.setIdentity(chosen);
        localStorage.setItem('tiffin_onboarded_v2', 'true');
        modal.classList.remove('active');
        showToast(`Welcome ${chosen}! You are ready to log meals.`);
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
        showToast(`Copied Live Sync link for Room #${SyncEngine.roomCode}!`);
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
        showToast(`Copied Live Sync link (Room #${SyncEngine.roomCode})`);
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
        window.print();
      });
    }

    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', downloadCsvExport);
    }

    if (printInvoiceBtn) {
      printInvoiceBtn.addEventListener('click', () => {
        window.print();
      });
    }

    if (backupJsonBtn) {
      backupJsonBtn.addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState, null, 2));
        const a = document.createElement('a');
        a.setAttribute('href', dataStr);
        a.setAttribute('download', `October_Tiffin_Backup_${new Date().toISOString().slice(0, 10)}.json`);
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
          appState = getDefaultData();
          selectedDay = CONFIG.todayDay;
          logActivity(SyncEngine.identity, 'Admin Action', 'Reset ledger to default starting data');
          persistAndBroadcast({
            type: 'full_sync',
            state: appState,
            reason: 'Reset to default data'
          });
          showToast('Ledger reset to default');
        });
      });
    }
  }

  function downloadCsvExport() {
    triggerHaptic();
    let csv = "Date,Day,Sabzi / Note,Anjan Lunch,Anjan Dinner,Saurabh Lunch,Saurabh Dinner,Alok Lunch,Alok Dinner,Rohit Lunch,Rohit Dinner,Salman Lunch,Salman Dinner,Chetan Lunch,Chetan Dinner,Hitesh Lunch,Hitesh Dinner,Day Total (Rs)\n";

    for (let d = 1; d <= CONFIG.daysInMonth; d++) {
      const day = appState.days[d];
      const m = day.meals;
      const dayCost = getDayTotalCost(d);
      const row = [
        `"${day.dateFormatted}"`,
        day.dayOfWeek,
        `"${(day.sabzi || '').replace(/"/g, '""')}"`,
        m.anjan.lunch || '', m.anjan.dinner || '',
        m.saurabh.lunch || '', m.saurabh.dinner || '',
        m.alok.lunch || '', m.alok.dinner || '',
        m.rohit.lunch || '', m.rohit.dinner || '',
        m.salman.lunch || '', m.salman.dinner || '',
        m.chetan.lunch || '', m.chetan.dinner || '',
        m.hitesh.lunch || '', m.hitesh.dinner || '',
        dayCost
      ];
      csv += row.join(",") + "\n";
    }

    // Footer Totals Row
    csv += "\nTotal,,,₹" + getRoommateMonthlyStats('anjan').tiffinTotal + ",,₹" +
      getRoommateMonthlyStats('saurabh').tiffinTotal + ",,₹" +
      getRoommateMonthlyStats('alok').tiffinTotal + ",,₹" +
      getRoommateMonthlyStats('rohit').tiffinTotal + ",,₹" +
      getRoommateMonthlyStats('salman').tiffinTotal + ",,₹" +
      getRoommateMonthlyStats('chetan').tiffinTotal + ",,₹" +
      getRoommateMonthlyStats('hitesh').tiffinTotal + ",₹" +
      getFlatTotals().tiffinTotal + "\n";

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `October_2026_Tiffin_Expense.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('Downloaded October 2026 CSV');
  }

  function setupTheme() {
    const savedTheme = localStorage.getItem('tiffin_theme') || 'dark';
    applyTheme(savedTheme);

    const darkBtn = document.getElementById('themeDarkBtn');
    const lightBtn = document.getElementById('themeLightBtn');
    const toggleBtn = document.getElementById('themeToggleBtn');

    if (darkBtn) {
      darkBtn.addEventListener('click', () => {
        triggerHaptic();
        applyTheme('dark');
        showToast('Switched to Dark Theme');
      });
    }

    if (lightBtn) {
      lightBtn.addEventListener('click', () => {
        triggerHaptic();
        applyTheme('light');
        showToast('Switched to Light Theme');
      });
    }

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        triggerHaptic();
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
      });
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('tiffin_theme', theme);

    const darkBtn = document.getElementById('themeDarkBtn');
    const lightBtn = document.getElementById('themeLightBtn');
    if (darkBtn) darkBtn.classList.toggle('active', theme === 'dark');
    if (lightBtn) lightBtn.classList.toggle('active', theme === 'light');
  }

  // --- Utility Helpers ---
  function showToast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>⚡</span><span>${escapeHtml(message)}</span>`;
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

      navigator.serviceWorker.register('sw.js')
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
    setupPasswordPromptControls();
    setupCloudSyncControls();
    setupExportAndSharing();
    setupOnboarding();
    registerServiceWorker();

    updateMonthUI();
    populateDateSelectors();

    // Start Real-Time Cloud Sync Engine
    SyncEngine.init();

    // Initial Full Render
    renderAll();
  });

})();
