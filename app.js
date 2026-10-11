/**
 * October Tiffin Expense Tracker - Core Application Logic
 * Mobile-First, Real-Time Cloud Sync, Voting Poll, Configurable Pricing & Audit Log
 */

(function () {
  'use strict';

  // --- Dynamic Date Initialization ---
  const now = new Date();
  const isCurrentMonthOctober = (now.getMonth() === 9); // Month 9 = October in JS
  const dynamicToday = isCurrentMonthOctober ? Math.min(Math.max(now.getDate(), 1), 31) : (now.getDate() <= 31 ? now.getDate() : 1);

  // --- Configuration & Constants ---
  const CONFIG = {
    year: 2026,
    month: 10, // October
    daysInMonth: 31,
    todayDay: dynamicToday,
    adminPassword: 'Flower',
    storageKey: 'tiffin_tracker_oct2026_data_v3',
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

  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Default initial ledger dataset seeded with actual data from Oct 26.html & Amul.html
  function getDefaultData() {
    const days = {};
    for (let d = 1; d <= CONFIG.daysInMonth; d++) {
      const dateObj = new Date(CONFIG.year, CONFIG.month - 1, d);
      const dayOfWeek = DAY_NAMES[dateObj.getDay()];

      days[d] = {
        day: d,
        dayOfWeek: dayOfWeek,
        dateFormatted: `${dayOfWeek}, ${d} October, ${CONFIG.year}`,
        dateShort: `${d} Oct`,
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

    // Oct 5 entries from Oct 26.html & Amul.html
    days[5].sabzi = 'Bhindi';
    days[5].meals.anjan.dinner = 'Half';
    days[5].meals.alok.dinner = 'Half';
    days[5].meals.rohit.dinner = 'Half';
    days[5].meals.chetan.dinner = 'Half';
    days[5].amul.anjan = 1;
    days[5].amul.saurabh = 1;

    // Oct 6 entries from Oct 26.html & Amul.html
    days[6].sabzi = 'Tinde';
    days[6].meals.anjan.dinner = 'Half';
    days[6].meals.saurabh.dinner = 'Half';
    days[6].meals.alok.dinner = 'Half';
    days[6].meals.rohit.dinner = 'Half';
    days[6].amul.anjan = 1;
    days[6].amul.saurabh = 1;

    return {
      version: 3,
      lastModified: new Date().toISOString(),
      rates: { ...CONFIG.defaultRates },
      provider: { ...CONFIG.defaultProvider },
      days: days,
      activePoll: null,
      auditLog: [
        {
          id: 'log_init',
          timestamp: Date.now(),
          timeFormatted: formatLogTime(Date.now()),
          author: 'System',
          action: 'Ledger Initialized',
          details: 'Initialized October 2026 ledger with verified baseline data.'
        }
      ]
    };
  }

  // Application State
  let appState = loadState();
  let selectedDay = CONFIG.todayDay;
  let selectedUpiRoommate = 'anjan';
  let customUpiAmount = null;
  let pendingPasswordCallback = null;

  // Load state from localStorage or URL hash or fallback to default
  function loadState() {
    // 1. Try URL hash state
    if (window.location.hash && window.location.hash.startsWith('#data=')) {
      try {
        const encoded = window.location.hash.slice(6);
        const jsonStr = decodeURIComponent(atob(encoded));
        const parsed = JSON.parse(jsonStr);
        if (parsed && parsed.days) {
          saveStateToStorage(parsed);
          return parsed;
        }
      } catch (err) {
        console.warn('Could not parse shared state from URL hash', err);
      }
    }

    // 2. Try localStorage
    try {
      const stored = localStorage.getItem(CONFIG.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.days) {
          // Merge defaults if new fields missing
          parsed.rates = { ...CONFIG.defaultRates, ...(parsed.rates || {}) };
          parsed.provider = { ...CONFIG.defaultProvider, ...(parsed.provider || {}) };
          if (!parsed.auditLog) parsed.auditLog = [];
          return parsed;
        }
      }
    } catch (e) {
      console.warn('localStorage error', e);
    }

    // 3. Fallback to default
    return getDefaultData();
  }

  function saveStateToStorage(stateObj) {
    stateObj.lastModified = new Date().toISOString();
    try {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(stateObj));
    } catch (e) {
      console.warn('Storage quota exceeded', e);
    }
  }

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
    if (appState.auditLog.length > 250) appState.auditLog.pop(); // Keep last 250
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
            showToast(`🗳️ ${action.author} voted for ${action.option}`);
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
      jumpLabel.textContent = `Jump to Today (Oct ${CONFIG.todayDay})`;
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

    if (sabziInput && document.activeElement !== sabziInput) {
      sabziInput.value = dayData.sabzi || '';
    }

    // Populate Date Dropdown if empty
    const select = document.getElementById('daySelectInput');
    if (select && select.options.length === 0) {
      for (let d = 1; d <= CONFIG.daysInMonth; d++) {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = `${d} Oct (${DAY_NAMES[new Date(CONFIG.year, CONFIG.month - 1, d).getDay()].slice(0, 3)})`;
        select.appendChild(opt);
      }
    }
    if (select) select.value = selectedDay;

    // Roommate Cards Grid
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

    // Radio Options for Current User to Vote
    const radioGrid = document.getElementById('pollOptionsRadioGrid');
    if (radioGrid) {
      radioGrid.innerHTML = '';
      const myId = (SyncEngine.identity || 'anjan').toLowerCase();
      const currentVote = (poll.votes && poll.votes[myId]) ? poll.votes[myId].option : null;

      poll.options.forEach((optText, idx) => {
        const isSelected = currentVote === optText;
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
          chip.innerHTML = `<span>✓</span> <strong>${r.name}:</strong> <span>${escapeHtml(v.option)} (${v.portion})</span>`;
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
    const tbody = document.getElementById('masterSheetBody');
    const tfoot = document.getElementById('masterSheetFooter');
    if (!tbody || !tfoot) return;

    const searchTerm = (document.getElementById('sheetSearchInput')?.value || '').toLowerCase().trim();
    tbody.innerHTML = '';
    const rates = getRates();

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

      tr.innerHTML = `
        <td class="td-sticky-date" title="${dayData.dateFormatted}">
          ${dayData.dayOfWeek.slice(0, 3)}, ${d} Oct
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
        const newDish = prompt(`Enter Sabzi / Dish for ${d} October:`, currentSabzi);
        if (newDish !== null) {
          appState.days[d].sabzi = newDish.trim();
          logActivity(SyncEngine.identity, 'Updated Sabzi from Sheet', `Day ${d}: "${newDish.trim()}"`);
          persistAndBroadcast({
            type: 'sabzi_update',
            day: d,
            sabzi: newDish.trim()
          });
          showToast(`Updated dish for ${d} Oct`);
        }
      });
    });

    // Master Sheet Footer Totals
    const anjanTotal = getRoommateMonthlyStats('anjan').tiffinTotal;
    const saurabhTotal = getRoommateMonthlyStats('saurabh').tiffinTotal;
    const alokTotal = getRoommateMonthlyStats('alok').tiffinTotal;
    const rohitTotal = getRoommateMonthlyStats('rohit').tiffinTotal;
    const salmanTotal = getRoommateMonthlyStats('salman').tiffinTotal;
    const chetanTotal = getRoommateMonthlyStats('chetan').tiffinTotal;
    const hiteshTotal = getRoommateMonthlyStats('hitesh').tiffinTotal;
    const grandFlatTotal = getFlatTotals().tiffinTotal;

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

    const dayAnjanVal = document.getElementById('amulDayAnjanVal');
    const daySaurabhVal = document.getElementById('amulDaySaurabhVal');
    if (dayAnjanVal) dayAnjanVal.textContent = dayData.amul?.anjan || 0;
    if (daySaurabhVal) daySaurabhVal.textContent = dayData.amul?.saurabh || 0;

    // Monthly totals
    const anjanStats = getRoommateMonthlyStats('anjan');
    const saurabhStats = getRoommateMonthlyStats('saurabh');
    const totalMilkPackets = anjanStats.milkPackets + saurabhStats.milkPackets;
    const grandMilkCost = anjanStats.milkTotal + saurabhStats.milkTotal;

    const elAnjanTot = document.getElementById('amulAnjanTotal');
    const elAnjanPkts = document.getElementById('amulAnjanPackets');
    const elSaurabhTot = document.getElementById('amulSaurabhTotal');
    const elSaurabhPkts = document.getElementById('amulSaurabhPackets');
    const elGrandTot = document.getElementById('amulGrandTotal');
    const elGrandPkts = document.getElementById('amulTotalPackets');

    if (elAnjanTot) elAnjanTot.textContent = `₹${anjanStats.milkTotal}`;
    if (elAnjanPkts) elAnjanPkts.textContent = `${anjanStats.milkPackets} packets`;
    if (elSaurabhTot) elSaurabhTot.textContent = `₹${saurabhStats.milkTotal}`;
    if (elSaurabhPkts) elSaurabhPkts.textContent = `${saurabhStats.milkPackets} packets`;
    if (elGrandTot) elGrandTot.textContent = `₹${grandMilkCost}`;
    if (elGrandPkts) elGrandPkts.textContent = `${totalMilkPackets} packets`;

    // Table
    const tbody = document.getElementById('amulTableBody');
    if (tbody) {
      tbody.innerHTML = '';
      for (let d = 1; d <= CONFIG.daysInMonth; d++) {
        const dData = appState.days[d];
        const anjanPkt = dData?.amul?.anjan || 0;
        const saurabhPkt = dData?.amul?.saurabh || 0;
        const dayCost = (anjanPkt + saurabhPkt) * (Number(rates.amulPacket) || 35);

        const tr = document.createElement('tr');
        if (d === selectedDay) tr.style.backgroundColor = 'rgba(6, 182, 212, 0.12)';
        tr.innerHTML = `
          <td class="td-sticky-date">${dData.dateShort}</td>
          <td>${anjanPkt || '-'}</td>
          <td>${saurabhPkt || '-'}</td>
          <td style="font-family:var(--font-mono); font-weight:700; color:${dayCost > 0 ? 'var(--cyan)' : 'var(--text-dim)'}">
            ${dayCost > 0 ? `₹${dayCost}` : '-'}
          </td>
        `;
        tbody.appendChild(tr);
      }
    }
  }

  // 7. Share & WhatsApp Summary Generation
  function generateWhatsAppSummaryText() {
    const totals = getFlatTotals();
    const rates = getRates();
    const provider = appState.provider || CONFIG.defaultProvider;

    let text = `🍛 *OCTOBER 2026 TIFFIN EXPENSE SUMMARY*\n`;
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
        logActivity(SyncEngine.identity, 'Cleared Sabzi', `Day ${selectedDay}`);
        persistAndBroadcast({
          type: 'sabzi_update',
          day: selectedDay,
          sabzi: ''
        });
      });
    }
  }

  function setupFastActions() {
    const markAllDinnerHalfBtn = document.getElementById('markAllDinnerHalfBtn');
    const clearTodayBtn = document.getElementById('clearTodayMealsBtn');

    if (markAllDinnerHalfBtn) {
      markAllDinnerHalfBtn.addEventListener('click', () => {
        triggerHaptic();
        ROOMMATES.forEach(r => {
          appState.days[selectedDay].meals[r.id].dinner = 'Half';
        });
        logActivity(SyncEngine.identity, 'Bulk Action', `Marked Dinner Half for all on Day ${selectedDay}`);
        persistAndBroadcast({
          type: 'bulk_dinner_half',
          day: selectedDay
        });
        showToast('Marked dinner Half for all roommates');
      });
    }

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
      });
    }

    if (submitVoteBtn) {
      submitVoteBtn.addEventListener('click', () => {
        triggerHaptic();
        if (!appState.activePoll || appState.activePoll.status !== 'active') return;

        const selectedRadio = document.querySelector('input[name="pollDishChoice"]:checked');
        if (!selectedRadio) {
          alert('Please select a sabzi option to vote!');
          return;
        }

        const dishChoice = selectedRadio.value;
        const myId = (SyncEngine.identity || 'Anjan').toLowerCase();

        if (!appState.activePoll.votes) appState.activePoll.votes = {};
        appState.activePoll.votes[myId] = {
          option: dishChoice,
          portion: selectedPortion,
          time: Date.now()
        };

        logActivity(SyncEngine.identity, 'Voted', `Voted "${dishChoice}" (${selectedPortion}) in ${appState.activePoll.mealSlot} Poll`);
        persistAndBroadcast({
          type: 'poll_voted',
          pollId: appState.activePoll.id,
          roommateId: myId,
          option: dishChoice,
          portion: selectedPortion
        });
        showToast(`Vote submitted for ${dishChoice} (${selectedPortion})!`);
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
          if (tally[v.option] !== undefined) tally[v.option]++;
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
          mealsApplied[r.id] = portion;
          appState.days[poll.day].meals[r.id][slotKey] = (portion === 'Off') ? '' : portion;
        });

        poll.status = 'finalized';
        poll.winner = winningDish;

        logActivity(SyncEngine.identity, 'Finalized Poll', `Winner: ${winningDish} (${maxVotes} votes)`);
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
        waOrder += `Selected Sabzi: *${winningDish}* (${maxVotes} votes)\n`;
        waOrder += `────────────────────\n`;

        let halfCount = 0, fullCount = 0, specCount = 0;
        ROOMMATES.forEach(r => {
          const p = mealsApplied[r.id];
          if (p === 'Half') halfCount++;
          else if (p === 'Full') fullCount++;
          else if (p === 'Special') specCount++;
          waOrder += `• ${r.name}: ${p === 'Special' ? 'Special (5 Roti, Sabji, Dal)' : p}\n`;
        });

        waOrder += `────────────────────\n`;
        waOrder += `*Total Order:* ${halfCount} Half, ${fullCount} Full${specCount ? `, ${specCount} Special` : ''}\n\n`;
        waOrder += `Please prepare as per count. Thank you!`;

        // Copy and open WhatsApp
        copyToClipboard(waOrder);
        showToast(`Copied order message for ${provider.name}!`);

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
    const stepperBtns = document.querySelectorAll('.step-btn');
    stepperBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        triggerHaptic();
        const person = btn.getAttribute('data-person');
        const delta = parseInt(btn.getAttribute('data-delta'));
        const cur = appState.days[selectedDay].amul?.[person] || 0;
        const nextVal = Math.max(0, cur + delta);
        if (!appState.days[selectedDay].amul) {
          appState.days[selectedDay].amul = { anjan: 0, saurabh: 0 };
        }
        appState.days[selectedDay].amul[person] = nextVal;
        logActivity(SyncEngine.identity, 'Milk Stepper', `${capitalize(person)}: ${nextVal} packets (Day ${selectedDay})`);
        persistAndBroadcast({
          type: 'amul_update',
          day: selectedDay,
          person: person,
          value: nextVal
        });
      });
    });
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
    const toggleBtn = document.getElementById('themeToggleBtn');
    const savedTheme = localStorage.getItem('tiffin_theme') || 
      (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

    document.documentElement.setAttribute('data-theme', savedTheme);

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        triggerHaptic();
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('tiffin_theme', next);
      });
    }
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
      navigator.serviceWorker.register('sw.js')
        .catch(err => console.log('Service Worker skipped:', err));
    }
  }

  // Initialize App on DOM Ready
  document.addEventListener('DOMContentLoaded', () => {
    setupTheme();
    setupNavigation();
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

    // Start Real-Time Cloud Sync Engine
    SyncEngine.init();

    // Initial Full Render
    renderAll();
  });

})();
