/**
 * Tiffin Tracker - Firebase Cloud Realtime Engine & Cloud Messaging
 * Unified real-time cloud sync for Room Data, Ledger, and Native FCM Push Tokens.
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

        // Enable offline persistence if available
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

        // Auto-subscribe to active room
        const initialRoom = (typeof getActiveRoomCode === 'function' ? getActiveRoomCode() : null) ||
                            localStorage.getItem('tiffin_sync_room');
        if (initialRoom) {
          this.subscribeRoom(initialRoom);
        }

        // Check if an FCM token was saved locally
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

    getCleanRoom(code) {
      const c = code || currentRoomCode || (typeof RoomManager !== 'undefined' && RoomManager?.activeRoom?.code) || localStorage.getItem('tiffin_sync_room');
      return c ? c.toString().trim().toUpperCase() : null;
    },

    subscribeRoom(roomCode) {
      if (!this.isAvailable || !db) return;
      const cleanCode = this.getCleanRoom(roomCode);
      if (!cleanCode) return;
      if (activeUnsubscribe && currentRoomCode === cleanCode) return;

      if (activeUnsubscribe) {
        try { activeUnsubscribe(); } catch (e) {}
        activeUnsubscribe = null;
      }

      currentRoomCode = cleanCode;
      console.log(`[FirebaseSync] Subscribing to real-time room: ${cleanCode}`);

      try {
        const roomRef = db.collection('rooms').doc(cleanCode);

        activeUnsubscribe = roomRef.onSnapshot((doc) => {
          if (!doc.exists) {
            console.log(`[FirebaseSync] Room document ${cleanCode} does not exist in cloud yet.`);
            return;
          }

          const data = doc.data() || {};
          let modified = false;

          // 1. Synchronize Room Data & Members
          if (data.roomData && typeof RoomManager !== 'undefined') {
            const current = RoomManager.activeRoom || {};
            const cloudMembers = Array.isArray(data.roomData.members) ? data.roomData.members : [];
            const combined = [...(current.members || []), ...cloudMembers];
            const deduplicated = RoomManager.deduplicateMembers(combined, data.roomData.adminName || current.adminName);

            // Synchronize session role & guarantee local user is never stripped
            if (RoomManager.session && RoomManager.session.name) {
              let matchedSessionMember = RoomManager.findMatchingMember(deduplicated, {
                name: RoomManager.session.name,
                phone: RoomManager.session.phone
              });
              if (!matchedSessionMember) {
                // Keep local user in deduplicated array so they are not kicked out
                const localMember = {
                  id: RoomManager.sanitizeId(RoomManager.session.name),
                  name: RoomManager.session.name,
                  phone: RoomManager.session.phone || '',
                  role: RoomManager.session.role || 'member',
                  avatarColor: '#00d4ff',
                  joinedAt: new Date().toISOString()
                };
                deduplicated.push(localMember);
                matchedSessionMember = localMember;
                // Re-save to cloud so other flatmates also see this user
                setTimeout(() => {
                  if (FirebaseSync.isAvailable && cleanCode) {
                    FirebaseSync.saveRoomData(cleanCode, RoomManager.activeRoom);
                  }
                }, 500);
              }
              RoomManager.session.status = 'approved';
              if (matchedSessionMember) {
                RoomManager.session.role = matchedSessionMember.role || RoomManager.session.role || 'member';
                RoomManager.session.name = matchedSessionMember.name;
                if (matchedSessionMember.phone && !RoomManager.session.phone) {
                  RoomManager.session.phone = matchedSessionMember.phone;
                }
                localStorage.setItem('tiffin_user_session', JSON.stringify(RoomManager.session));
              }
            }

            RoomManager.activeRoom = {
              ...current,
              ...data.roomData,
              members: deduplicated
            };
            RoomManager.cleanupAdminDuplicates(RoomManager.activeRoom);
            RoomManager.saveActiveRoom();
            if (typeof ROOMMATES !== 'undefined') {
              ROOMMATES = RoomManager.activeRoom.members;
            }

            // Ensure appState.days has meal entries for all roommates so renders never fail
            if (typeof appState !== 'undefined' && appState && appState.days) {
              for (let d = 1; d <= (CONFIG.daysInMonth || 31); d++) {
                if (appState.days[d]) {
                  if (!appState.days[d].meals) appState.days[d].meals = {};
                  ROOMMATES.forEach(r => {
                    if (!appState.days[d].meals[r.id]) {
                      appState.days[d].meals[r.id] = { lunch: '', dinner: '' };
                    }
                  });
                }
              }
              if (typeof saveStateToStorage === 'function') {
                saveStateToStorage(appState);
              }
            }

            RoomManager.updateHeaderRoomUI();
            RoomManager.renderSettingsMembersTab();
            if (typeof updateIdentityUI === 'function') {
              updateIdentityUI(RoomManager.session?.name || (typeof SyncEngine !== 'undefined' ? SyncEngine.identity : ''));
            }
            modified = true;
          }

          // 2. Synchronize Ledger State (Days, Meals, Sabzi, Amul)
          if (data.state && data.state.days && appState && appState.days) {
            const incomingDays = data.state.days;
            for (let d = 1; d <= (CONFIG.daysInMonth || 31); d++) {
              if (incomingDays[d] && appState.days[d]) {
                const incD = incomingDays[d];
                const locD = appState.days[d];

                // Merge sabzi with timestamp
                const incSabziT = Number(incD.sabziUpdatedAt || 0);
                const locSabziT = Number(locD.sabziUpdatedAt || 0);
                if (incSabziT > locSabziT) {
                  locD.sabzi = (incD.sabzi || '').trim();
                  locD.sabziUpdatedAt = incSabziT;
                  modified = true;
                }

                // Merge meals
                const incMeals = incD.meals || {};
                const incTimes = incD.mealTimestamps || {};
                if (!locD.mealTimestamps) locD.mealTimestamps = {};

                Object.keys(incMeals).forEach(pId => {
                  if (!locD.meals[pId]) locD.meals[pId] = { lunch: '', dinner: '' };
                  ['lunch', 'dinner'].forEach(slot => {
                    const key = `${pId}_${slot}`;
                    const incT = Number(incTimes[key] || 0);
                    const locT = Number(locD.mealTimestamps[key] || 0);
                    if (incT > locT) {
                      locD.meals[pId][slot] = incMeals[pId][slot] || '';
                      locD.mealTimestamps[key] = incT;
                      modified = true;
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
                      modified = true;
                    }
                  });
                }
              }
            }
          }

          if (modified) {
            if (typeof saveStateToStorage === 'function') {
              saveStateToStorage(appState);
            }
            if (typeof renderAll === 'function') {
              renderAll();
            }
          }
        }, (err) => {
          console.warn('[FirebaseSync] Listener error:', err);
        });
      } catch (err) {
        console.warn('[FirebaseSync] Subscription failed:', err);
      }
    },

    get db() {
      return db;
    },

    async joinRoom(roomCode, newMember, adminPin) {
      if (!this.isAvailable || !db) {
        return { success: false, error: 'Cloud sync is currently offline. Please check your internet.' };
      }
      const cleanCode = this.getCleanRoom(roomCode);
      if (!cleanCode) {
        return { success: false, error: 'Invalid room code.' };
      }

      try {
        const roomRef = db.collection('rooms').doc(cleanCode);
        const doc = await roomRef.get();
        if (!doc.exists) {
          return { success: false, notFound: true, error: `Room #${cleanCode} was not found. Please verify the 4-digit code.` };
        }

        const data = doc.data() || {};
        const roomData = data.roomData || { code: cleanCode, name: 'My Flat', adminName: 'Admin', members: [] };
        const state = data.state || null;

        // Check Admin PIN if logging in as Admin
        if (adminPin) {
          if (roomData.adminPin && roomData.adminPin !== adminPin) {
            return { success: false, error: 'Incorrect Admin Security PIN for this flat.' };
          }
        }

        // Add member to roomData.members if not already present
        const members = Array.isArray(roomData.members) ? roomData.members : [];
        const existing = typeof RoomManager !== 'undefined'
          ? RoomManager.findMatchingMember(members, newMember)
          : members.find(m => (m.name || '').toLowerCase() === (newMember.name || '').toLowerCase());

        let finalMember = existing;
        if (!existing) {
          members.push(newMember);
          finalMember = newMember;
        } else {
          if (!existing.phone && newMember.phone) existing.phone = newMember.phone;
          if (adminPin) existing.role = 'admin';
        }

        const deduplicated = typeof RoomManager !== 'undefined'
          ? RoomManager.deduplicateMembers(members, roomData.adminName)
          : members;

        roomData.members = deduplicated;

        // Save updated room members to Firestore without overwriting ledger state
        await roomRef.set({
          roomData: roomData,
          lastUpdated: Date.now()
        }, { merge: true });

        console.log(`[FirebaseSync] Successfully joined room #${cleanCode} as ${finalMember.name}`);

        return {
          success: true,
          roomData: roomData,
          state: state,
          member: finalMember
        };
      } catch (err) {
        console.error('[FirebaseSync] joinRoom error:', err);
        return { success: false, error: 'Failed to join room: ' + (err.message || 'Network error') };
      }
    },

    async saveRoomData(roomCode, roomData) {
      if (!this.isAvailable || !db || !roomData) return;
      const cleanCode = this.getCleanRoom(roomCode);
      try {
        await db.collection('rooms').doc(cleanCode).set({
          roomData: roomData,
          lastUpdated: Date.now()
        }, { merge: true });
      } catch (err) {
        console.warn('[FirebaseSync] saveRoomData error:', err);
      }
    },

    async saveLedgerState(roomCode, state) {
      if (!this.isAvailable || !db || !state) return;
      const cleanCode = this.getCleanRoom(roomCode);
      try {
        const compact = (typeof getCompactSyncState === 'function') ? getCompactSyncState(state) : state;
        await db.collection('rooms').doc(cleanCode).set({
          state: compact,
          lastUpdated: Date.now()
        }, { merge: true });
      } catch (err) {
        console.warn('[FirebaseSync] saveLedgerState error:', err);
      }
    },

    async registerFcmToken(token) {
      if (!this.isAvailable || !db || !token) return;
      const roomCode = this.getCleanRoom();
      const myId = (typeof RoomManager !== 'undefined' && RoomManager.session?.name)
        ? RoomManager.sanitizeId(RoomManager.session.name)
        : 'member';

      try {
        const updatePayload = {
          fcmTokens: {
            [myId]: {
              token: token,
              updatedAt: Date.now()
            }
          }
        };
        // Also support flattened key for direct queries
        updatePayload[`fcmTokens.${myId}`] = {
          token: token,
          updatedAt: Date.now()
        };
        await db.collection('rooms').doc(roomCode).set(updatePayload, { merge: true });
        console.log(`[FirebaseSync] FCM push token registered in Firestore for ${myId}`);
      } catch (err) {
        console.warn('[FirebaseSync] registerFcmToken error:', err);
      }
    },

    /**
     * Enqueue a push notification in Firestore for this room.
     * The secure backend (Firebase Cloud Function or server script) automatically
     * reads this queue and delivers real FCM push notifications to all flatmates.
     */
    async sendRoomNotification({ title, body, tag = 'tiffin-alert', data = {} }) {
      if (!this.isAvailable || !db) return false;
      const roomCode = this.getCleanRoom();
      const myId = (typeof RoomManager !== 'undefined' && RoomManager.session?.name)
        ? RoomManager.sanitizeId(RoomManager.session.name)
        : 'member';
      const myName = (typeof RoomManager !== 'undefined' && RoomManager.session?.name)
        ? RoomManager.session.name
        : 'Flatmate';

      try {
        await db.collection('rooms').doc(roomCode).collection('notifications').add({
          title: title || 'Tiffin Tracker',
          body: body || 'New update in your flat mess',
          tag: tag,
          senderId: myId,
          senderName: myName,
          data: data,
          dispatched: false,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log(`[FirebaseSync] Enqueued notification for room #${roomCode}: "${title}"`);
        return true;
      } catch (err) {
        console.warn('[FirebaseSync] sendRoomNotification error:', err);
        return false;
      }
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
