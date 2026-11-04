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
            const combined = [...(current.members || []), ...(data.roomData.members || [])];
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
                }, 1000);
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

            RoomManager.updateHeaderRoomUI();
            RoomManager.renderSettingsMembersTab();
            if (typeof populateHeaderIdentityDropdown === 'function') {
              populateHeaderIdentityDropdown();
            }
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
        const updatePayload = {};
        updatePayload[`fcmTokens.${myId}`] = {
          token: token,
          updatedAt: Date.now()
        };
        await db.collection('rooms').doc(roomCode).set(updatePayload, { merge: true });
        console.log(`[FirebaseSync] FCM push token registered in Firestore for ${myId}`);
      } catch (err) {
        console.warn('[FirebaseSync] registerFcmToken error:', err);
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
