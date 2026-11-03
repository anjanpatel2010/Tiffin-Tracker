/**
 * Tiffin Tracker - Firebase Cloud Realtime Engine & Cloud Messaging
 * Unified real-time cloud sync for Room Data, Ledger, Polls, and Native FCM Push Tokens.
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
                            localStorage.getItem('tiffin_sync_room') || 'TF-FLAT';
        this.subscribeRoom(initialRoom);

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
      return (code || currentRoomCode || 'TF-FLAT').toString().trim().toUpperCase();
    },

    subscribeRoom(roomCode) {
      if (!this.isAvailable || !db) return;
      const cleanCode = this.getCleanRoom(roomCode);
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

            // Synchronize session role
            if (RoomManager.session && RoomManager.session.name) {
              const matchedSessionMember = RoomManager.findMatchingMember(deduplicated, {
                name: RoomManager.session.name,
                phone: RoomManager.session.phone
              });
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

          // 2. Synchronize Active Poll
          if (data.activePoll && data.activePoll.status === 'active') {
            const incPoll = data.activePoll;
            const curTime = (appState && appState.activePoll) ? Number(appState.activePoll.createdTime || 0) : 0;
            const incTime = Number(incPoll.createdTime || 0);

            if (!appState.activePoll || appState.activePoll.id !== incPoll.id || incTime >= curTime) {
              const isFirstArrival = !appState.activePoll || appState.activePoll.id !== incPoll.id;
              appState.activePoll = incPoll;
              const rKey = cleanCode.toLowerCase();
              if (incPoll.votes && typeof getCanonicalPollVotes === 'function') {
                const canonicalMap = getCanonicalPollVotes(incPoll);
                const cleanedVotes = {};
                canonicalMap.forEach((v, k) => {
                  cleanedVotes[k] = v;
                });
                incPoll.votes = cleanedVotes;
              }
              localStorage.setItem('tiffin_active_poll_' + rKey, JSON.stringify(incPoll));
              modified = true;

              const isCreator = PollReminderManager.isUserCreator(incPoll);
              const hasVoted = PollReminderManager.hasUserVoted(incPoll);
              const notifKey = 'tiffin_notified_poll_' + incPoll.id;

              if (!isCreator && !hasVoted) {
                if (isFirstArrival && !sessionStorage.getItem(notifKey)) {
                  sessionStorage.setItem(notifKey, 'true');
                  if (typeof playJoinAlertChime === 'function') {
                    playJoinAlertChime();
                  }
                  if (typeof NotificationManager !== 'undefined') {
                    NotificationManager.send(`🍲 New ${incPoll.mealSlot || 'Meal'} Poll!`, {
                      body: `Launched by ${incPoll.author || 'Flatmate'}. Tap to choose your sabzi!`,
                      tag: 'poll-' + incPoll.id,
                      renotify: true
                    });
                  }
                }
                PollReminderManager.start(incPoll);
              } else {
                PollReminderManager.stop(incPoll.id);
              }
            }
          } else if (data.activePoll === null && appState && appState.activePoll) {
            // Poll was cancelled or cleared in cloud
            appState.activePoll = null;
            localStorage.removeItem('tiffin_active_poll_' + cleanCode.toLowerCase());
            if (typeof hidePollAlertBanner === 'function') {
              hidePollAlertBanner();
            }
            if (typeof PollReminderManager !== 'undefined') {
              PollReminderManager.stop();
            }
            modified = true;
          }

          // 3. Synchronize Ledger State (Days, Meals, Sabzi, Amul)
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

    async saveActivePoll(roomCode, poll) {
      if (!this.isAvailable || !db) return;
      const cleanCode = this.getCleanRoom(roomCode);
      try {
        await db.collection('rooms').doc(cleanCode).set({
          activePoll: poll,
          lastUpdated: Date.now()
        }, { merge: true });
        console.log(`[FirebaseSync] Active poll saved to Firestore: ${poll.id}`);
      } catch (err) {
        console.warn('[FirebaseSync] saveActivePoll error:', err);
      }
    },

    async castVote(roomCode, pollId, roommateId, voteObj) {
      if (!this.isAvailable || !db) return;
      const cleanCode = this.getCleanRoom(roomCode);
      try {
        const updatePayload = {
          lastUpdated: Date.now()
        };
        updatePayload[`activePoll.votes.${roommateId}`] = voteObj;
        await db.collection('rooms').doc(cleanCode).update(updatePayload);
        console.log(`[FirebaseSync] Vote cast saved to Firestore for ${roommateId}`);
      } catch (err) {
        console.warn('[FirebaseSync] castVote error:', err);
      }
    },

    async finalizePoll(roomCode, pollId, winner, mealsApplied, day, mealSlot) {
      if (!this.isAvailable || !db) return;
      const cleanCode = this.getCleanRoom(roomCode);
      try {
        const updatePayload = {
          'activePoll.status': 'finalized',
          'activePoll.winner': winner,
          lastUpdated: Date.now()
        };
        if (day) {
          updatePayload[`state.days.${day}.sabzi`] = winner;
          updatePayload[`state.days.${day}.sabziUpdatedAt`] = Date.now();
          if (mealsApplied) {
            const slot = (mealSlot || 'Dinner').toLowerCase();
            Object.entries(mealsApplied).forEach(([rId, portion]) => {
              updatePayload[`state.days.${day}.meals.${rId}.${slot}`] = portion === 'Off' ? '' : portion;
            });
          }
        }
        await db.collection('rooms').doc(cleanCode).update(updatePayload);
        console.log(`[FirebaseSync] Poll finalized in Firestore: ${winner}`);
      } catch (err) {
        console.warn('[FirebaseSync] finalizePoll error:', err);
      }
    },

    async cancelPoll(roomCode) {
      if (!this.isAvailable || !db) return;
      const cleanCode = this.getCleanRoom(roomCode);
      try {
        await db.collection('rooms').doc(cleanCode).update({
          activePoll: null,
          lastUpdated: Date.now()
        });
      } catch (err) {
        console.warn('[FirebaseSync] cancelPoll error:', err);
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
