/**
 * Tiffin Tracker - Unified Firebase Cloud Realtime Engine & Cloud Messaging
 * Single Source of Truth for Room Lifecycle, Ledger, and Native FCM Push Tokens.
 */
(function () {
  'use strict';

  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCWFma4diWKudEBVPT4D4nQAxfo0L2CtGs",
    authDomain: "tiffin-tracker-a91db.firebaseapp.com",
    projectId: "tiffin-tracker-a91db",
    storageBucket: "tiffin-tracker-a91db.firebasestorage.app",
    messagingSenderId: "805212210681",
    appId: "1:805212210681:web:6cb8e12767a4a04d3d2928",
    measurementId: "G-RWNQTC3N08"
  };

  let db = null;
  let activeUnsubscribe = null;
  let currentRoomCode = null;

  const FirebaseSync = {
    isAvailable: false,
    status: 'disconnected',
    listeners: [],
    latestSnapshot: null,

    init() {
      try {
        if (typeof firebase === 'undefined') {
          console.warn('[FirebaseSync] Firebase SDK not found in window');
          return false;
        }

        if (!firebase.apps || firebase.apps.length === 0) {
          firebase.initializeApp(FIREBASE_CONFIG);
        }

        db = firebase.firestore();

        // Enable offline persistence
        try {
          db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
            if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
              console.warn('[FirebaseSync] Persistence warning:', err);
            }
          });
        } catch (e) {}

        this.isAvailable = true;
        this.status = 'connected';
        console.log('[FirebaseSync] Cloud Firestore initialized successfully.');

        // Auto-subscribe to active room if session exists
        const initialRoom = this.getCleanRoom();
        if (initialRoom) {
          this.subscribeRoom(initialRoom);
        }

        // Register cached FCM token if present
        const cachedToken = localStorage.getItem('tiffin_fcm_token');
        if (cachedToken) {
          this.registerFcmToken(cachedToken);
        }

        return true;
      } catch (err) {
        console.warn('[FirebaseSync] Initialization failed:', err);
        this.isAvailable = false;
        this.status = 'error';
        return false;
      }
    },

    get db() {
      return db;
    },

    getCleanRoom(code) {
      if (code) return String(code).trim().toUpperCase();
      if (currentRoomCode) return currentRoomCode;
      try {
        const sessionRaw = localStorage.getItem('tiffin_session') || localStorage.getItem('tiffin_user_session');
        if (sessionRaw) {
          const s = JSON.parse(sessionRaw);
          if (s && s.roomCode) return String(s.roomCode).trim().toUpperCase();
        }
        const applicantRaw = localStorage.getItem('tiffin_applicant') || localStorage.getItem('tiffin_pending_join_req');
        if (applicantRaw) {
          const a = JSON.parse(applicantRaw);
          if (a && a.roomCode) return String(a.roomCode).trim().toUpperCase();
        }
      } catch (e) {}
      const stored = localStorage.getItem('tiffin_sync_room');
      return stored ? String(stored).trim().toUpperCase() : null;
    },

    unsubscribeRoom() {
      if (activeUnsubscribe) {
        try { activeUnsubscribe(); } catch (e) {}
        activeUnsubscribe = null;
      }
      currentRoomCode = null;
      this.latestSnapshot = null;
      console.log('[FirebaseSync] Unsubscribed from real-time room updates.');
    },

    subscribeRoom(roomCode) {
      if (!this.isAvailable || !db) return;
      const cleanCode = this.getCleanRoom(roomCode);
      if (!cleanCode) return;

      // If already subscribed, still force a fresh server fetch to guarantee zero stale cache
      if (activeUnsubscribe && currentRoomCode === cleanCode) {
        this.fetchRoomFromServer(cleanCode);
        return;
      }

      this.unsubscribeRoom();
      currentRoomCode = cleanCode;
      console.log(`[FirebaseSync] Subscribing to real-time room: #${cleanCode}`);

      // Immediately fetch from server in parallel so we never wait on IndexedDB or offline cache
      this.fetchRoomFromServer(cleanCode);

      try {
        const roomRef = db.collection('rooms').doc(cleanCode);

        activeUnsubscribe = roomRef.onSnapshot((doc) => {
          if (!doc.exists) {
            console.log(`[FirebaseSync] Room document #${cleanCode} does not exist in cloud.`);
            this.latestSnapshot = null;
            this.notifySubscribers({ _roomDeleted: true, roomCode: cleanCode });
            return;
          }

          const data = doc.data() || {};
          this.latestSnapshot = data;
          this.notifySubscribers(data);
        }, (err) => {
          console.warn('[FirebaseSync] Snapshot listener error:', err);
          // If onSnapshot encounters issues, fall back to direct HTTPS REST fetch
          this.fetchRoomFromServer(cleanCode);
        });
      } catch (err) {
        console.warn('[FirebaseSync] Subscription failed:', err);
        this.fetchRoomFromServer(cleanCode);
      }
    },

    /**
     * Unpack Firestore REST API structured values into clean JavaScript objects
     */
    unpackFirestoreValue(val) {
      if (!val || typeof val !== 'object') return val;
      if ('stringValue' in val) return val.stringValue;
      if ('booleanValue' in val) return val.booleanValue;
      if ('integerValue' in val) return parseInt(val.integerValue, 10);
      if ('doubleValue' in val) return parseFloat(val.doubleValue);
      if ('timestampValue' in val) return val.timestampValue;
      if ('nullValue' in val) return null;
      if ('mapValue' in val) return this.unpackFirestoreFields(val.mapValue.fields || {});
      if ('arrayValue' in val) return (val.arrayValue.values || []).map(v => this.unpackFirestoreValue(v));
      return val;
    },

    unpackFirestoreFields(fields) {
      if (!fields || typeof fields !== 'object') return {};
      const res = {};
      for (const k of Object.keys(fields)) {
        res[k] = this.unpackFirestoreValue(fields[k]);
      }
      return res;
    },

    /**
     * Pack standard JavaScript values into Firestore REST API structured JSON
     */
    packFirestoreValue(val) {
      if (val === null || val === undefined) return { nullValue: null };
      if (typeof val === 'boolean') return { booleanValue: val };
      if (typeof val === 'number') {
        if (!Number.isFinite(val)) return { integerValue: '0' };
        if (Number.isInteger(val)) return { integerValue: String(val) };
        return { doubleValue: val };
      }
      if (typeof val === 'string') return { stringValue: val };
      if (Array.isArray(val)) {
        return {
          arrayValue: {
            values: val.filter(v => v !== undefined).map(v => this.packFirestoreValue(v))
          }
        };
      }
      if (typeof val === 'object') {
        return {
          mapValue: {
            fields: this.packFirestoreFields(val)
          }
        };
      }
      return { stringValue: String(val) };
    },

    packFirestoreFields(obj) {
      if (!obj || typeof obj !== 'object') return {};
      const fields = {};
      for (const k of Object.keys(obj)) {
        if (obj[k] !== undefined) {
          fields[k] = this.packFirestoreValue(obj[k]);
        }
      }
      return fields;
    },

    // --- Identity Matching & Roster Sanitation Helpers ---
    _normalizePhone(p) {
      return (p || '').toString().replace(/\D/g, '').slice(-10);
    },

    _normalizeName(n) {
      return (n || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
    },

    _matchesCandidate(m, candidate) {
      if (!m || !candidate) return false;
      if (candidate.id && m.id && String(candidate.id).trim() === String(m.id).trim()) return true;
      const cPhone = this._normalizePhone(candidate.phone);
      const mPhone = this._normalizePhone(m.phone);
      if (cPhone.length >= 10 && mPhone.length >= 10 && cPhone === mPhone) return true;
      const cName = this._normalizeName(candidate.name);
      const mName = this._normalizeName(m.name);
      if (cName && mName && cName === mName) return true;
      return false;
    },

    _sanitizeId(name) {
      return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '') || `user_${Date.now()}`;
    },

    _getDocBaseUrl(cleanCode) {
      return `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/rooms/${encodeURIComponent(cleanCode)}`;
    },

    async _restGetRoom(cleanCode) {
      const url = `${this._getDocBaseUrl(cleanCode)}?key=${FIREBASE_CONFIG.apiKey}`;
      const resp = await fetch(url);
      if (resp.status === 404) {
        return { exists: false, data: null, updateTime: null };
      }
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`HTTP ${resp.status}: ${errText || resp.statusText}`);
      }
      const json = await resp.json();
      return {
        exists: true,
        data: this.unpackFirestoreFields(json.fields || {}),
        updateTime: json.updateTime || null
      };
    },

    async _restExecuteMutation(cleanCode, mutatorFn) {
      const maxRetries = 4;
      let lastErr = null;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const current = await this._restGetRoom(cleanCode);
        const mutation = mutatorFn(current.exists ? current.data : null, {
          exists: current.exists,
          usingRest: true
        });

        if (!mutation || mutation.abort) {
          return mutation ? mutation.result : { success: false, error: 'Aborted' };
        }

        if (mutation.deleteDoc) {
          if (!current.exists) {
            return mutation.result || { success: true, dissolved: true };
          }
          const delUrl = `${this._getDocBaseUrl(cleanCode)}?key=${FIREBASE_CONFIG.apiKey}` +
            (current.updateTime ? `&currentDocument.updateTime=${encodeURIComponent(current.updateTime)}` : '');
          const delResp = await fetch(delUrl, { method: 'DELETE' });
          if (delResp.ok || delResp.status === 404) {
            return mutation.result || { success: true, dissolved: true };
          }
          if (delResp.status === 400 || delResp.status === 409) {
            lastErr = new Error('Concurrent document change detected during delete, retrying');
            continue;
          }
          throw new Error(`REST delete failed (${delResp.status})`);
        }

        const payload = { ...(mutation.payload || {}) };
        if (Array.isArray(mutation.deleteFcmIds) && mutation.deleteFcmIds.length > 0 && current.exists && current.data) {
          const nextFcmTokens = { ...(current.data.fcmTokens || {}) };
          let modifiedFcm = false;
          mutation.deleteFcmIds.forEach(fid => {
            if (fid && Object.prototype.hasOwnProperty.call(nextFcmTokens, fid)) {
              delete nextFcmTokens[fid];
              modifiedFcm = true;
            }
          });
          if (modifiedFcm) {
            payload.fcmTokens = nextFcmTokens;
          }
        }

        const maskParams = Object.keys(payload)
          .map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
          .join('&');
        const precondition = current.exists && current.updateTime
          ? `&currentDocument.updateTime=${encodeURIComponent(current.updateTime)}`
          : '&currentDocument.exists=false';

        const patchUrl = `${this._getDocBaseUrl(cleanCode)}?key=${FIREBASE_CONFIG.apiKey}&${maskParams}${precondition}`;
        const patchResp = await fetch(patchUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: this.packFirestoreFields(payload)
          })
        });

        if (patchResp.ok) {
          const updatedJson = await patchResp.json().catch(() => null);
          const mergedLatest = updatedJson && updatedJson.fields
            ? this.unpackFirestoreFields(updatedJson.fields)
            : { ...(current.data || {}), ...payload };
          this.latestSnapshot = mergedLatest;
          return mutation.result;
        }

        if (patchResp.status === 400 || patchResp.status === 409) {
          lastErr = new Error(`Optimistic lock conflict (HTTP ${patchResp.status}), retrying...`);
          continue;
        }
        const errBody = await patchResp.text().catch(() => '');
        throw new Error(`REST patch failed (${patchResp.status}): ${errBody}`);
      }

      throw lastErr || new Error('Failed to commit room update after concurrency retries');
    },

    /**
     * Execute an atomic room document mutation using Firestore SDK Transaction
     * with automatic 8s timeout + HTTPS REST optimistic-concurrency fallback.
     * Guarantees changes reach live Cloud Firestore instead of sitting in offline cache.
     */
    async runRoomMutation(roomCode, mutatorFn) {
      const cleanCode = this.getCleanRoom(roomCode);
      if (!cleanCode) return { success: false, error: 'Invalid room code.' };

      // 1. Try Firestore SDK Transaction first (with strict timeout so WebView never hangs)
      if (this.isAvailable && db) {
        try {
          const roomRef = db.collection('rooms').doc(cleanCode);
          let timeoutId = null;
          const txPromise = db.runTransaction(async (transaction) => {
            const doc = await transaction.get(roomRef);
            const currentData = doc.exists ? (doc.data() || {}) : null;
            const mutation = mutatorFn(currentData, { exists: doc.exists, usingRest: false });

            if (!mutation || mutation.abort) {
              return mutation ? mutation.result : { success: false, error: 'Aborted' };
            }

            if (mutation.deleteDoc) {
              if (doc.exists) transaction.delete(roomRef);
              return mutation.result || { success: true, dissolved: true };
            }

            const sdkPayload = { ...(mutation.payload || {}) };
            if (doc.exists && Array.isArray(mutation.deleteFcmIds) && mutation.deleteFcmIds.length > 0 && currentData && currentData.fcmTokens) {
              mutation.deleteFcmIds.forEach(fid => {
                if (fid && currentData.fcmTokens[fid]) {
                  sdkPayload[`fcmTokens.${fid}`] = firebase.firestore.FieldValue.delete();
                }
              });
              // FieldValue.delete() requires transaction.update when using dotted paths
              transaction.update(roomRef, sdkPayload);
            } else {
              transaction.set(roomRef, sdkPayload, { merge: true });
            }

            return {
              ...mutation.result,
              _committedDoc: mutation.deleteDoc ? null : { ...(currentData || {}), ...(mutation.payload || {}) }
            };
          });

          const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Firestore transaction timeout')), 8000);
          });

          const txResult = await Promise.race([txPromise, timeoutPromise]).finally(() => {
            if (timeoutId) clearTimeout(timeoutId);
          });

          if (txResult && '_committedDoc' in txResult) {
            if (txResult._committedDoc) {
              this.latestSnapshot = txResult._committedDoc;
            }
            delete txResult._committedDoc;
          }
          return txResult;
        } catch (sdkErr) {
          console.warn('[FirebaseSync] SDK runTransaction failed/timed out, using HTTPS REST optimistic concurrency:', sdkErr.message || sdkErr);
        }
      }

      // 2. Direct HTTPS REST API Optimistic Concurrency Fallback
      return await this._restExecuteMutation(cleanCode, mutatorFn);
    },

    /**
     * Forcefully fetch latest room document directly from Firestore server or REST API
     * (bypasses stale offline IndexedDB snapshots)
     */
    async fetchRoomFromServer(roomCode) {
      const cleanCode = this.getCleanRoom(roomCode);
      if (!cleanCode) return null;

      // 1. Try Firestore SDK directly from server
      if (this.isAvailable && db) {
        try {
          const doc = await db.collection('rooms').doc(cleanCode).get({ source: 'server' });
          if (!doc.exists) {
            this.latestSnapshot = null;
            const deletedMarker = { _roomDeleted: true, roomCode: cleanCode };
            this.notifySubscribers(deletedMarker);
            return deletedMarker;
          }
          const data = doc.data() || {};
          this.latestSnapshot = data;
          this.notifySubscribers(data);
          return data;
        } catch (sdkErr) {
          console.warn('[FirebaseSync] Direct SDK server fetch failed, trying HTTPS REST fallback:', sdkErr.message || sdkErr);
        }
      }

      // 2. Fallback to HTTPS REST API (Always reaches cloud and bypasses local cache)
      try {
        const res = await this._restGetRoom(cleanCode);
        if (!res.exists) {
          this.latestSnapshot = null;
          const deletedMarker = { _roomDeleted: true, roomCode: cleanCode };
          this.notifySubscribers(deletedMarker);
          return deletedMarker;
        }
        const data = res.data || {};
        this.latestSnapshot = data;
        this.notifySubscribers(data);
        return data;
      } catch (restErr) {
        console.warn('[FirebaseSync] HTTPS REST API fallback failed:', restErr.message || restErr);
      }

      return null;
    },

    onRoomDataChange(callback) {
      if (typeof callback !== 'function') return;
      this.listeners.push(callback);
      if (this.latestSnapshot) {
        try {
          callback(this.latestSnapshot);
        } catch (e) {
          console.error('[FirebaseSync] Initial snapshot callback error:', e);
        }
      }
    },

    notifySubscribers(data) {
      this.listeners.forEach((callback) => {
        try {
          callback(data);
        } catch (e) {
          console.error('[FirebaseSync] Listener callback error:', e);
        }
      });
      if (typeof window.handleCloudSyncUpdate === 'function' && !this.listeners.includes(window.handleCloudSyncUpdate)) {
        try {
          window.handleCloudSyncUpdate(data);
        } catch (e) {
          console.error('[FirebaseSync] window.handleCloudSyncUpdate error:', e);
        }
      }
    },

    /**
     * Create a brand new flat room atomically (prevents accidental 4-digit code collision)
     */
    async createRoom(roomData, initialState, year, month) {
      if (!roomData || !roomData.code) {
        return { success: false, error: 'Invalid room payload.' };
      }
      const cleanCode = this.getCleanRoom(roomData.code);
      const monthKey = `${year || new Date().getFullYear()}_${month || (new Date().getMonth() + 1)}`;

      try {
        return await this.runRoomMutation(cleanCode, (existingData, meta) => {
          if (meta.exists) {
            return {
              abort: true,
              result: { success: false, collision: true, error: `Room #${cleanCode} already exists.` }
            };
          }

          const finalRoomData = {
            ...roomData,
            code: cleanCode,
            membershipVersion: 1,
            leftMembers: [],
            kickedMembers: []
          };

          return {
            payload: {
              roomData: finalRoomData,
              state: initialState,
              months: { [monthKey]: initialState },
              lastUpdated: Date.now()
            },
            result: {
              success: true,
              roomData: finalRoomData
            }
          };
        });
      } catch (err) {
        console.error('[FirebaseSync] createRoom error:', err);
        return { success: false, error: 'Failed to create room in cloud: ' + (err.message || 'Network error') };
      }
    },

    /**
     * Join Room Workflow (Transactional, handles rejoins from leftMembers, blocks kickedMembers, protects Admin)
     */
    async joinRoom(roomCode, candidate, adminPin) {
      const cleanCode = this.getCleanRoom(roomCode);
      if (!cleanCode) return { success: false, error: 'Invalid room code.' };

      try {
        const res = await this.runRoomMutation(cleanCode, (data, meta) => {
          if (!meta.exists || !data || !data.roomData) {
            return {
              abort: true,
              result: { success: false, notFound: true, error: `Flat #${cleanCode} was not found. Please verify the 4-digit code.` }
            };
          }

          const roomData = { ...data.roomData };
          const now = new Date();
          const currentMonthKey = `${now.getFullYear()}_${now.getMonth() + 1}`;
          const roomState = (data.months && data.months[currentMonthKey]) ? data.months[currentMonthKey] : (data.state || null);
          const allMonths = data.months || null;

          let members = Array.isArray(roomData.members) ? roomData.members.map(m => ({ ...m })) : [];
          let leftMembers = Array.isArray(roomData.leftMembers) ? roomData.leftMembers.map(m => ({ ...m })) : [];
          const kickedMembers = Array.isArray(roomData.kickedMembers) ? roomData.kickedMembers : [];

          let joinedMember = null;
          const cleanPin = (adminPin || '').trim();

          // 1. Admin PIN Verification (if PIN provided)
          if (cleanPin) {
            if (!roomData.adminPin || String(roomData.adminPin).trim() !== cleanPin) {
              return { abort: true, result: { success: false, error: 'Incorrect Admin Security PIN for this flat.' } };
            }

            let adminMember = members.find(m => m.role === 'admin' || (roomData.adminId && m.id === roomData.adminId));
            if (adminMember) {
              // Ensure if candidate gave phone/name they aren't corrupting another admin's record unless it's blank
              if (candidate.phone && !adminMember.phone) adminMember.phone = candidate.phone;
              adminMember.role = 'admin';
              joinedMember = adminMember;
            } else {
              // No active admin currently in members (rare recovery case)
              const cleanName = (candidate.name || roomData.adminName || 'Admin').trim();
              adminMember = {
                id: candidate.id || roomData.adminId || ('m_' + this._sanitizeId(cleanName) + '_' + Date.now().toString().slice(-4)),
                name: cleanName,
                phone: candidate.phone || roomData.adminPhone || '',
                role: 'admin',
                avatarColor: '#00d26a',
                joinedAt: now.toISOString()
              };
              members.unshift(adminMember);
              roomData.adminId = adminMember.id;
              roomData.adminName = adminMember.name;
              roomData.adminPhone = adminMember.phone;
              leftMembers = leftMembers.filter(lm => !this._matchesCandidate(lm, adminMember));
              joinedMember = adminMember;
            }
          } else {
            // 2. Regular Member Join (WITHOUT Admin PIN)
            // A. Strict Kicked Blacklist Check
            if (kickedMembers.some(km => this._matchesCandidate(km, candidate))) {
              return {
                abort: true,
                result: { success: false, error: 'You have been removed from this flat by the Admin. You cannot rejoin.' }
              };
            }

            // B. Prevent regular member from logging into active Admin profile without PIN
            const currentAdmin = members.find(m => m.role === 'admin' || (roomData.adminId && m.id === roomData.adminId));
            if (currentAdmin && this._matchesCandidate(currentAdmin, candidate)) {
              return {
                abort: true,
                result: {
                  success: false,
                  error: `The profile "${currentAdmin.name}" is the current Flat Admin. Tap "Managing this flat? Enter Admin PIN" to log in as Admin, or enter your own name.`
                }
              };
            }

            // C. Check if already an active regular member (login on new device / reinstall)
            const existingActive = members.find(m => m.role !== 'admin' && this._matchesCandidate(m, candidate));
            if (existingActive) {
              if (candidate.phone && !existingActive.phone) existingActive.phone = candidate.phone;
              existingActive.role = 'member';
              joinedMember = existingActive;
            } else {
              // D. Check if previously left voluntarily -> restore their canonical ID so past meals remain intact, with role='member'
              const previouslyLeft = leftMembers.find(lm => this._matchesCandidate(lm, candidate));
              leftMembers = leftMembers.filter(lm => !this._matchesCandidate(lm, candidate));

              const avatarColors = ['#00d4ff', '#a78bfa', '#ff3b5c', '#ffb800', '#10b981', '#38bdf8', '#f43f5e', '#ec4899'];
              const avatarColor = candidate.avatarColor || avatarColors[members.length % avatarColors.length];
              const resolvedId = (previouslyLeft && previouslyLeft.id)
                ? previouslyLeft.id
                : (candidate.id || ('m_' + this._sanitizeId(candidate.name) + '_' + Date.now().toString().slice(-4)));

              const newMember = {
                id: resolvedId,
                name: candidate.name,
                phone: candidate.phone || (previouslyLeft?.phone || ''),
                role: 'member',
                avatarColor: avatarColor,
                joinedAt: now.toISOString()
              };
              members.push(newMember);
              joinedMember = newMember;
            }
          }

          roomData.members = members;
          roomData.leftMembers = leftMembers;
          roomData.kickedMembers = kickedMembers;
          roomData.membershipVersion = (Number(roomData.membershipVersion) || 1) + 1;

          return {
            payload: {
              roomData: roomData,
              lastUpdated: Date.now()
            },
            result: {
              success: true,
              roomData: roomData,
              state: roomState,
              months: allMonths,
              member: joinedMember
            }
          };
        });

        if (res && res.success && res.member) {
          console.log(`[FirebaseSync] Joined #${cleanCode} atomically: ${res.member.name} (${res.member.id})`);
          this.sendRoomNotification({
            roomCode: cleanCode,
            title: 'Flatmate Joined! 🍱',
            body: `${res.member.name} joined room #${cleanCode}!`,
            tag: `join-${res.member.id}`,
            data: {
              roomCode: cleanCode,
              memberName: res.member.name,
              memberId: res.member.id,
              type: 'member_joined'
            }
          });
        }

        return res;
      } catch (err) {
        console.error('[FirebaseSync] joinRoom error:', err);
        return { success: false, error: 'Failed to connect: ' + (err.message || 'Network error') };
      }
    },

    /**
     * Stubs for legacy approval calls (no-ops for backwards compatibility)
     */
    async approvePendingRequest() { return { success: true }; },
    async declinePendingRequest() { return { success: true }; },
    async cancelJoinRequest() { return { success: true }; },

    /**
     * Admin: Add Member Directly (Atomic & handles clearing previous left/kicked status)
     */
    async addMemberToRoom(roomCode, newMember) {
      const cleanCode = this.getCleanRoom(roomCode);
      if (!cleanCode || !newMember || !newMember.name) {
        return { success: false, error: 'Invalid member details.' };
      }

      try {
        return await this.runRoomMutation(cleanCode, (data, meta) => {
          if (!meta.exists || !data || !data.roomData) {
            return { abort: true, result: { success: false, error: 'Flat not found.' } };
          }

          const roomData = { ...data.roomData };
          const members = Array.isArray(roomData.members) ? roomData.members.map(m => ({ ...m })) : [];
          let leftMembers = Array.isArray(roomData.leftMembers) ? [...roomData.leftMembers] : [];
          let kickedMembers = Array.isArray(roomData.kickedMembers) ? [...roomData.kickedMembers] : [];

          const existing = members.find(m => this._matchesCandidate(m, newMember));
          if (existing) {
            return { abort: true, result: { success: true, member: existing, roomData: roomData, alreadyExists: true } };
          }

          // Clear from tombstones if Admin is explicitly re-adding them
          const prevLeft = leftMembers.find(lm => this._matchesCandidate(lm, newMember));
          const prevKicked = kickedMembers.find(km => this._matchesCandidate(km, newMember));
          leftMembers = leftMembers.filter(lm => !this._matchesCandidate(lm, newMember));
          kickedMembers = kickedMembers.filter(km => !this._matchesCandidate(km, newMember));

          const added = {
            ...newMember,
            id: prevLeft?.id || prevKicked?.id || newMember.id,
            role: 'member',
            joinedAt: new Date().toISOString()
          };
          members.push(added);

          roomData.members = members;
          roomData.leftMembers = leftMembers;
          roomData.kickedMembers = kickedMembers;
          roomData.membershipVersion = (Number(roomData.membershipVersion) || 1) + 1;

          return {
            payload: {
              roomData: roomData,
              lastUpdated: Date.now()
            },
            result: {
              success: true,
              member: added,
              roomData: roomData
            }
          };
        });
      } catch (err) {
        console.error('[FirebaseSync] addMemberToRoom error:', err);
        return { success: false, error: err.message || 'Network error' };
      }
    },

    /**
     * Admin: Remove/Kick Member from Flat (Atomic & Immediate)
     */
    async removeMemberFromRoom(roomCode, targetInfo) {
      const cleanCode = this.getCleanRoom(roomCode);
      if (!cleanCode || !targetInfo) return { success: false, error: 'Invalid request.' };

      const candidate = (typeof targetInfo === 'object') ? targetInfo : { id: String(targetInfo) };

      try {
        const res = await this.runRoomMutation(cleanCode, (data, meta) => {
          if (!meta.exists || !data || !data.roomData) {
            return { abort: true, result: { success: false, error: 'Flat not found.' } };
          }

          const roomData = { ...data.roomData };
          const members = Array.isArray(roomData.members) ? roomData.members.map(m => ({ ...m })) : [];

          const matches = members.filter(m => this._matchesCandidate(m, candidate));
          const target = matches[0];

          if (matches.some(m => m.role === 'admin' || (roomData.adminId && m.id === roomData.adminId))) {
            return { abort: true, result: { success: false, error: 'Cannot kick the room Admin.' } };
          }

          const remainingMembers = members.filter(m => !this._matchesCandidate(m, candidate));
          let kickedMembers = Array.isArray(roomData.kickedMembers) ? [...roomData.kickedMembers] : [];
          let leftMembers = Array.isArray(roomData.leftMembers) ? [...roomData.leftMembers] : [];

          kickedMembers = kickedMembers.filter(km => !this._matchesCandidate(km, candidate));
          leftMembers = leftMembers.filter(lm => !this._matchesCandidate(lm, candidate));

          kickedMembers.push({
            id: target?.id || candidate.id || '',
            name: target?.name || candidate.name || 'Member',
            phone: target?.phone || candidate.phone || '',
            kickedAt: Date.now()
          });

          roomData.members = remainingMembers;
          roomData.kickedMembers = kickedMembers;
          roomData.leftMembers = leftMembers;
          roomData.membershipVersion = (Number(roomData.membershipVersion) || 1) + 1;

          const fcmIds = Array.from(new Set([...matches.map(m => m.id), candidate.id].filter(Boolean)));

          return {
            payload: {
              roomData: roomData,
              lastUpdated: Date.now()
            },
            deleteFcmIds: fcmIds,
            result: {
              success: true,
              roomData: roomData,
              removedMember: target || candidate
            }
          };
        });

        if (res && res.success) {
          const target = res.removedMember;
          console.log(`[FirebaseSync] Kicked member ${target?.name || candidate.id} from #${cleanCode}`);
          this.sendRoomNotification({
            roomCode: cleanCode,
            title: 'Member Removed 👋',
            body: `${target?.name || 'A member'} was removed from the flat by Admin.`,
            tag: `kick-${target?.id || candidate.id}`,
            data: {
              roomCode: cleanCode,
              memberId: target?.id || candidate.id || '',
              memberName: target?.name || '',
              type: 'member_kicked'
            }
          });
        }

        return res;
      } catch (err) {
        console.error('[FirebaseSync] removeMemberFromRoom error:', err);
        return { success: false, error: err.message || 'Network error' };
      }
    },

    /**
     * Member / Admin: Leave Room cleanly with robust matching, leftMembers tombstone, and atomic Admin succession
     */
    async leaveRoom(roomCode, memberInfo) {
      if (!roomCode) return { success: false, error: 'Missing room code.' };
      const cleanCode = this.getCleanRoom(roomCode);
      const candidate = (typeof memberInfo === 'object' && memberInfo)
        ? memberInfo
        : { id: String(memberInfo || '') };

      try {
        const result = await this.runRoomMutation(cleanCode, (data, meta) => {
          if (!meta.exists || !data || !data.roomData) {
            return { abort: true, result: { success: true, dissolved: true } };
          }

          const roomData = { ...data.roomData };
          const members = Array.isArray(roomData.members) ? roomData.members.map(m => ({ ...m })) : [];

          const leavingMatches = members.filter(m => this._matchesCandidate(m, candidate));
          const leavingMember = leavingMatches[0] || {
            id: candidate.id || '',
            name: candidate.name || 'Flatmate',
            phone: candidate.phone || '',
            role: 'member'
          };

          const remainingMembers = members.filter(m => !this._matchesCandidate(m, candidate));
          const currentAdminId = roomData.adminId || members.find(m => m.role === 'admin')?.id;

          const isLeavingAdmin = Boolean(
            leavingMatches.some(m => m.role === 'admin' || (currentAdminId && m.id === currentAdminId)) ||
            (currentAdminId && candidate.id && candidate.id === currentAdminId) ||
            (roomData.adminPhone && this._normalizePhone(candidate.phone).length >= 10 &&
             this._normalizePhone(roomData.adminPhone) === this._normalizePhone(candidate.phone)) ||
            (roomData.adminName && this._normalizeName(candidate.name) &&
             this._normalizeName(roomData.adminName) === this._normalizeName(candidate.name) &&
             !remainingMembers.some(m => m.role === 'admin'))
          );

          // CASE 1: Last member leaves -> Dissolve room permanently
          if (remainingMembers.length === 0) {
            return {
              deleteDoc: true,
              result: { success: true, dissolved: true, leavingMember }
            };
          }

          let newAdmin = null;

          // CASE 2: Leaving user was the Admin -> Promote most senior remaining member cleanly
          if (isLeavingAdmin) {
            remainingMembers.sort((a, b) => {
              const tA = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
              const tB = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
              return tA - tB;
            });

            newAdmin = remainingMembers[0];
            remainingMembers.forEach((m, idx) => {
              m.role = (idx === 0) ? 'admin' : 'member';
            });

            roomData.adminId = newAdmin.id;
            roomData.adminName = newAdmin.name;
            roomData.adminPhone = newAdmin.phone || '';
            roomData.adminPinNeedsReset = true;
            roomData.newAdminId = newAdmin.id;
          }

          // Record in leftMembers tombstone so stale clients can NEVER resurrect them
          let leftMembers = Array.isArray(roomData.leftMembers) ? [...roomData.leftMembers] : [];
          leftMembers = leftMembers.filter(lm => !this._matchesCandidate(lm, leavingMember) && !this._matchesCandidate(lm, candidate));
          leftMembers.push({
            id: leavingMember.id || candidate.id || '',
            name: leavingMember.name || candidate.name || 'Flatmate',
            phone: leavingMember.phone || candidate.phone || '',
            leftAt: Date.now()
          });

          roomData.members = remainingMembers;
          roomData.leftMembers = leftMembers;
          roomData.membershipVersion = (Number(roomData.membershipVersion) || 1) + 1;

          const fcmIds = Array.from(new Set([...leavingMatches.map(m => m.id), candidate.id].filter(Boolean)));

          return {
            payload: {
              roomData: roomData,
              lastUpdated: Date.now()
            },
            deleteFcmIds: fcmIds,
            result: {
              success: true,
              dissolved: false,
              promotedAdmin: newAdmin,
              remainingMembers: remainingMembers,
              leavingMember: leavingMember,
              roomData: roomData
            }
          };
        });

        if (result && result.success && !result.dissolved) {
          const leftName = result.leavingMember?.name || candidate.name || 'A flatmate';
          this.sendRoomNotification({
            roomCode: cleanCode,
            title: 'Flatmate Left 👋',
            body: `${leftName} left the flat.`,
            tag: `leave-${result.leavingMember?.id || candidate.id || 'member'}`,
            data: {
              roomCode: cleanCode,
              memberId: result.leavingMember?.id || candidate.id || '',
              memberName: leftName,
              type: 'member_left'
            }
          });

          if (result.promotedAdmin) {
            this.sendRoomNotification({
              roomCode: cleanCode,
              title: `👑 New Flat Admin: ${result.promotedAdmin.name}`,
              body: `${result.promotedAdmin.name} is now the Flat Admin.`,
              tag: `admin-promoted-${result.promotedAdmin.id}`,
              data: {
                roomCode: cleanCode,
                newAdminId: result.promotedAdmin.id,
                type: 'admin_promoted'
              }
            });
          }
        }

        if (result && result.success) {
          this.unsubscribeRoom();
        }
        return result;
      } catch (err) {
        console.error('[FirebaseSync] leaveRoom error:', err);
        return { success: false, error: err.message || 'Network error while leaving room.' };
      }
    },

    /**
     * Update Admin Security PIN cleanly (SDK + REST fallback)
     */
    async updateAdminPin(roomCode, newPin) {
      if (!roomCode || !newPin) return { success: false, error: 'Missing PIN.' };
      const cleanCode = this.getCleanRoom(roomCode);

      try {
        return await this.runRoomMutation(cleanCode, (data, meta) => {
          if (!meta.exists || !data || !data.roomData) {
            return { abort: true, result: { success: false, error: 'Room not found.' } };
          }
          const roomData = { ...data.roomData };
          roomData.adminPin = String(newPin).trim();
          roomData.adminPinNeedsReset = false;
          delete roomData.newAdminId;

          return {
            payload: {
              roomData: roomData,
              lastUpdated: Date.now()
            },
            result: { success: true, roomData }
          };
        });
      } catch (err) {
        console.error('[FirebaseSync] updateAdminPin error:', err);
        return { success: false, error: err.message };
      }
    },

    /**
     * Transfer Admin Role manually to another member atomically
     */
    async transferAdminRole(roomCode, targetMemberId) {
      if (!roomCode || !targetMemberId) return { success: false, error: 'Invalid target member.' };
      const cleanCode = this.getCleanRoom(roomCode);

      try {
        const res = await this.runRoomMutation(cleanCode, (data, meta) => {
          if (!meta.exists || !data || !data.roomData) {
            return { abort: true, result: { success: false, error: 'Room not found.' } };
          }
          const roomData = { ...data.roomData };
          const members = Array.isArray(roomData.members) ? roomData.members.map(m => ({ ...m })) : [];

          let promotedMember = null;
          members.forEach(m => {
            if (m.id === targetMemberId) {
              m.role = 'admin';
              promotedMember = m;
            } else {
              m.role = 'member';
            }
          });

          if (!promotedMember) {
            return { abort: true, result: { success: false, error: 'Target member not found in flat.' } };
          }

          roomData.adminId = promotedMember.id;
          roomData.adminName = promotedMember.name;
          roomData.adminPhone = promotedMember.phone || '';
          roomData.adminPinNeedsReset = true;
          roomData.newAdminId = promotedMember.id;
          roomData.members = members;
          roomData.membershipVersion = (Number(roomData.membershipVersion) || 1) + 1;

          return {
            payload: {
              roomData: roomData,
              lastUpdated: Date.now()
            },
            result: { success: true, targetMember: promotedMember, roomData }
          };
        });

        if (res && res.success && res.targetMember) {
          this.sendRoomNotification({
            roomCode: cleanCode,
            title: `👑 New Flat Admin: ${res.targetMember.name}`,
            body: `${res.targetMember.name} has been appointed Flat Admin.`,
            tag: `admin-promoted-${res.targetMember.id}`,
            data: {
              roomCode: cleanCode,
              newAdminId: res.targetMember.id,
              type: 'admin_promoted'
            }
          });
        }

        return res;
      } catch (err) {
        console.error('[FirebaseSync] transferAdminRole error:', err);
        return { success: false, error: err.message };
      }
    },

    /**
     * Update non-membership room metadata (flat name, settings) without risking stale member overwrites
     */
    async updateRoomMetadata(roomCode, metadataPatch) {
      if (!roomCode || !metadataPatch) return { success: false };
      const cleanCode = this.getCleanRoom(roomCode);

      try {
        return await this.runRoomMutation(cleanCode, (data, meta) => {
          if (!meta.exists || !data || !data.roomData) {
            return { abort: true, result: { success: false } };
          }
          const roomData = { ...data.roomData, ...metadataPatch };
          return {
            payload: {
              roomData: roomData,
              lastUpdated: Date.now()
            },
            result: { success: true, roomData }
          };
        });
      } catch (err) {
        console.warn('[FirebaseSync] updateRoomMetadata error:', err);
        return { success: false, error: err.message };
      }
    },

    async saveRoomData(roomCode, roomData) {
      // Safe metadata/roster sync respecting leftMembers and kickedMembers tombstones
      if (!roomData) return;
      const cleanCode = this.getCleanRoom(roomCode);
      if (!cleanCode) return;

      try {
        await this.runRoomMutation(cleanCode, (existingData, meta) => {
          if (!meta.exists) {
            return {
              payload: {
                roomData: {
                  ...roomData,
                  membershipVersion: roomData.membershipVersion || 1,
                  leftMembers: roomData.leftMembers || [],
                  kickedMembers: roomData.kickedMembers || []
                },
                lastUpdated: Date.now()
              },
              result: { success: true }
            };
          }

          const currentData = existingData.roomData || {};
          const incomingVersion = Number(roomData.membershipVersion || 0);
          const currentVersion = Number(currentData.membershipVersion || 0);

          // If cloud has a newer membershipVersion, NEVER overwrite cloud's authoritative roster!
          if (currentVersion > incomingVersion && currentVersion > 0) {
            const safeMetaOnly = {
              ...currentData,
              name: roomData.name || currentData.name,
              requireApproval: roomData.requireApproval !== undefined ? roomData.requireApproval : currentData.requireApproval
            };
            return {
              payload: { roomData: safeMetaOnly, lastUpdated: Date.now() },
              result: { success: true }
            };
          }

          const currentMembers = Array.isArray(currentData.members) ? currentData.members : [];
          const currentKicked = Array.isArray(currentData.kickedMembers) ? currentData.kickedMembers : [];
          const currentLeft = Array.isArray(currentData.leftMembers) ? currentData.leftMembers : [];
          const incomingKicked = Array.isArray(roomData.kickedMembers) ? roomData.kickedMembers : [];
          const incomingLeft = Array.isArray(roomData.leftMembers) ? roomData.leftMembers : [];

          const mergedKickedMap = new Map();
          [...currentKicked, ...incomingKicked].forEach(km => {
            if (km && (km.id || km.name)) mergedKickedMap.set(km.id || this._normalizeName(km.name), km);
          });
          const mergedKicked = Array.from(mergedKickedMap.values());

          const mergedLeftMap = new Map();
          [...currentLeft, ...incomingLeft].forEach(lm => {
            if (lm && (lm.id || lm.name)) mergedLeftMap.set(lm.id || this._normalizeName(lm.name), lm);
          });
          const mergedLeft = Array.from(mergedLeftMap.values());

          const memberMap = new Map();
          currentMembers.forEach(m => { if (m && m.id) memberMap.set(m.id, m); });
          (Array.isArray(roomData.members) ? roomData.members : []).forEach(m => {
            if (m && m.id) memberMap.set(m.id, { ...(memberMap.get(m.id) || {}), ...m });
          });

          const mergedMembers = Array.from(memberMap.values()).filter(m => {
            if (!m) return false;
            if (mergedKicked.some(km => this._matchesCandidate(m, km))) return false;
            const leftRec = mergedLeft.find(lm => this._matchesCandidate(m, lm));
            if (leftRec) {
              const joinedTs = m.joinedAt ? new Date(m.joinedAt).getTime() : 0;
              if (Number(leftRec.leftAt || 0) >= joinedTs) return false;
            }
            return true;
          });

          const nextRoomData = {
            ...currentData,
            ...roomData,
            members: mergedMembers,
            kickedMembers: mergedKicked,
            leftMembers: mergedLeft
          };

          return {
            payload: { roomData: nextRoomData, lastUpdated: Date.now() },
            result: { success: true }
          };
        });
      } catch (err) {
        console.warn('[FirebaseSync] saveRoomData error:', err);
      }
    },

    async saveLedgerState(roomCode, state) {
      if (!this.isAvailable || !db || !state) return;
      const cleanCode = this.getCleanRoom(roomCode);
      if (!cleanCode) return;
      try {
        const compactFn = (typeof getCompactSyncState === 'function')
          ? getCompactSyncState
          : (typeof window !== 'undefined' && typeof window.getCompactSyncState === 'function')
            ? window.getCompactSyncState
            : null;
        const compact = compactFn ? compactFn(state) : state;
        const year = compact.year || state.year || (new Date()).getFullYear();
        const month = compact.month || state.month || ((new Date()).getMonth() + 1);
        const monthKey = `${year}_${month}`;

        const roomRef = db.collection('rooms').doc(cleanCode);

        await db.runTransaction(async (transaction) => {
          const doc = await transaction.get(roomRef);
          if (!doc.exists) {
            transaction.set(roomRef, {
              state: compact,
              months: { [monthKey]: compact },
              lastUpdated: Date.now()
            }, { merge: true });
            return;
          }

          const data = doc.data() || {};
          const existingMonth = (data.months && data.months[monthKey])
            ? data.months[monthKey]
            : (data.state?.year === year && data.state?.month === month ? data.state : null);
          const existingDays = existingMonth?.days || {};

          // Deep merge days: incoming empty values MUST NEVER overwrite existing non-empty values
          const mergedDays = { ...existingDays };
          const incomingDays = compact.days || {};

          for (const dKey in incomingDays) {
            const incD = incomingDays[dKey];
            const exD = existingDays[dKey] || {};

            if (!mergedDays[dKey]) {
              mergedDays[dKey] = incD;
              continue;
            }

            // Sabzi merge
            const incSabzi = (incD.sabzi || '').trim();
            const exSabzi = (exD.sabzi || '').trim();
            const incSabziT = Number(incD.sabziUpdatedAt || 0);
            const exSabziT = Number(exD.sabziUpdatedAt || 0);

            let finalSabzi = exSabzi;
            let finalSabziT = exSabziT;

            if (incSabziT > exSabziT) {
              finalSabzi = incSabzi;
              finalSabziT = incSabziT;
            } else if (!exSabzi && incSabzi) {
              finalSabzi = incSabzi;
              finalSabziT = incSabziT || Date.now();
            }

            // Meals merge
            const incMeals = incD.meals || {};
            const exMeals = exD.meals || {};
            const incTimes = incD.mealTimestamps || {};
            const exTimes = exD.mealTimestamps || {};

            const finalMeals = { ...exMeals };
            const finalTimes = { ...exTimes };

            const allPIds = new Set([...Object.keys(exMeals), ...Object.keys(incMeals)]);
            allPIds.forEach(pId => {
              if (!finalMeals[pId]) finalMeals[pId] = { lunch: '', dinner: '' };
              const incM = incMeals[pId] || { lunch: '', dinner: '' };
              const exM = exMeals[pId] || { lunch: '', dinner: '' };

              ['lunch', 'dinner'].forEach(slot => {
                const k = `${pId}_${slot}`;
                const incVal = incM[slot] || '';
                const exVal = exM[slot] || '';
                const incT = Number(incTimes[k] || 0);
                const exT = Number(exTimes[k] || 0);

                if (incT > exT) {
                  finalMeals[pId][slot] = incVal;
                  finalTimes[k] = incT;
                } else if (incT > 0 && exT === 0) {
                  finalMeals[pId][slot] = incVal;
                  finalTimes[k] = incT;
                } else if (exT > 0 && incT === 0) {
                  finalMeals[pId][slot] = exVal;
                  finalTimes[k] = exT;
                } else {
                  // Timestamps equal or zero: PRESERVE POPULATED VALUE
                  if (incVal) {
                    finalMeals[pId][slot] = incVal;
                  } else if (exVal) {
                    finalMeals[pId][slot] = exVal;
                  }
                }
              });
            });

            // Amul merge
            const incAmul = incD.amul || {};
            const exAmul = exD.amul || {};
            const incAmulT = incD.amulTimestamps || {};
            const exAmulT = exD.amulTimestamps || {};
            const finalAmul = { ...exAmul };
            const finalAmulT = { ...exAmulT };

            const allAmulIds = new Set([...Object.keys(exAmul), ...Object.keys(incAmul)]);
            allAmulIds.forEach(pId => {
              const incT = Number(incAmulT[pId] || 0);
              const exT = Number(exAmulT[pId] || 0);
              if (incT >= exT && incAmul[pId] !== undefined) {
                finalAmul[pId] = incAmul[pId];
                if (incT) finalAmulT[pId] = incT;
              } else if (exAmul[pId] !== undefined) {
                finalAmul[pId] = exAmul[pId];
              }
            });

            mergedDays[dKey] = {
              ...exD,
              ...incD,
              sabzi: finalSabzi,
              sabziUpdatedAt: finalSabziT,
              meals: finalMeals,
              mealTimestamps: finalTimes,
              amul: finalAmul,
              amulTimestamps: finalAmulT
            };
          }

          const mergedCompact = {
            ...compact,
            days: mergedDays
          };

          const payload = {
            state: mergedCompact,
            lastUpdated: Date.now()
          };
          payload[`months.${monthKey}`] = mergedCompact;

          transaction.set(roomRef, payload, { merge: true });
        });
      } catch (err) {
        console.warn('[FirebaseSync] saveLedgerState error:', err);
      }
    },

    async registerFcmToken(token) {
      const cleanToken = (token || localStorage.getItem('tiffin_fcm_token') || '').trim();
      if (!this.isAvailable || !db || !cleanToken) return;
      const roomCode = this.getCleanRoom();
      if (!roomCode) {
        console.log('[FirebaseSync] FCM token cached, waiting for active flat to bind.');
        return;
      }

      let myId = 'member';
      let myName = 'Flatmate';
      try {
        const sessionRaw = localStorage.getItem('tiffin_session') || localStorage.getItem('tiffin_user_session');
        if (sessionRaw) {
          const s = JSON.parse(sessionRaw);
          if (s) {
            myId = s.memberId || s.id || (s.name ? s.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_') : 'member');
            myName = s.name || 'Flatmate';
          }
        }
        if (typeof SyncEngine !== 'undefined' && SyncEngine.identity && myName === 'Flatmate') {
          myName = SyncEngine.identity;
          if (myId === 'member') myId = SyncEngine.identity.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
        }
      } catch (e) {}

      try {
        const tokenObj = {
          token: cleanToken,
          platform: 'android',
          memberId: myId,
          memberName: myName,
          updatedAt: Date.now()
        };

        await db.collection('rooms').doc(roomCode).set({
          fcmTokens: {
            [myId]: tokenObj
          }
        }, { merge: true });

        console.log(`[FirebaseSync] FCM push token registered for ${myName} (${myId}) in #${roomCode}`);
      } catch (err) {
        console.warn('[FirebaseSync] registerFcmToken error:', err);
      }
    },

    /**
     * Dispatch an autonomous FCM HTTP v1 push notification to all flatmates in this room.
     * Uses FcmDispatcher to deliver directly via Google Play Services (even when recipients are killed/closed).
     * Also records in Firestore collection rooms/{roomCode}/notifications for auditing.
     */
    async sendRoomNotification({ title, body, tag = 'tiffin-alert', data = {}, roomCode = null }) {
      const targetRoom = this.getCleanRoom(roomCode) ||
                         (data && data.roomCode ? String(data.roomCode).trim().toUpperCase() : null) ||
                         currentRoomCode ||
                         (localStorage.getItem('tiffin_sync_room') ? String(localStorage.getItem('tiffin_sync_room')).trim().toUpperCase() : null);

      if (!targetRoom) {
        console.warn('[FirebaseSync] sendRoomNotification aborted: No room code specified.');
        return false;
      }

      let myId = 'member';
      let myName = 'Flatmate';
      try {
        const sessionRaw = localStorage.getItem('tiffin_session') || localStorage.getItem('tiffin_user_session');
        if (sessionRaw) {
          const s = JSON.parse(sessionRaw);
          if (s) {
            myId = s.memberId || s.id || (s.name ? s.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_') : 'member');
            myName = s.name || 'Flatmate';
          }
        }
        if (typeof SyncEngine !== 'undefined' && SyncEngine.identity && myName === 'Flatmate') {
          myName = SyncEngine.identity;
          if (myId === 'member') myId = SyncEngine.identity.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
        }
      } catch (e) {}

      const ownToken = localStorage.getItem('tiffin_fcm_token');
      const payloadData = {
        title: title || 'Tiffin Tracker 🍲',
        body: body || 'New update in your flat mess',
        roomCode: String(targetRoom),
        tag: tag,
        senderId: myId,
        senderName: myName,
        timestamp: String(Date.now()),
        ...Object.fromEntries(
          Object.entries(data || {}).map(([k, v]) => [k, String(v)])
        )
      };

      // 1. Autonomous Direct FCM Dispatch to Google FCM Servers
      if (typeof FcmDispatcher !== 'undefined' && typeof FcmDispatcher.sendToRoom === 'function') {
        FcmDispatcher.sendToRoom(targetRoom, title, body, payloadData, ownToken).catch(dispErr => {
          console.warn('[FirebaseSync] FcmDispatcher error:', dispErr);
        });
      }

      // 2. Persist in Firestore notifications collection (audit trail + server fallback)
      if (this.isAvailable && db) {
        try {
          const notifDoc = {
            title: title || 'Tiffin Tracker 🍲',
            body: body || 'New update in your flat mess',
            tag: tag,
            senderId: myId,
            senderName: myName,
            roomCode: String(targetRoom),
            data: payloadData,
            dispatched: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          };
          await db.collection('rooms').doc(targetRoom).collection('notifications').add(notifDoc);
          console.log(`[FirebaseSync] Dispatched FCM push & recorded in Firestore for #${targetRoom}: "${title}"`);
          return true;
        } catch (dbErr) {
          console.warn('[FirebaseSync] Firestore notification write warning:', dbErr);
        }
      }

      return true;
    }
  };

  window.FirebaseSync = FirebaseSync;

  // Initialize on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => FirebaseSync.init());
  } else {
    FirebaseSync.init();
  }
})();
