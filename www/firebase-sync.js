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
        const initialRoom = this.getCleanRoom();
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
      if (typeof window.handleCloudSyncUpdate === 'function') {
        try {
          window.handleCloudSyncUpdate(data);
        } catch (e) {
          console.error('[FirebaseSync] window.handleCloudSyncUpdate error:', e);
        }
      }
    },

    getCleanRoom(code) {
      if (code) return code.toString().trim().toUpperCase();
      if (currentRoomCode) return currentRoomCode;
      try {
        const rawSession = localStorage.getItem('tiffin_user_session');
        if (rawSession) {
          const s = JSON.parse(rawSession);
          if (s && s.roomCode) return s.roomCode.toString().trim().toUpperCase();
        }
      } catch (e) {}
      const stored = localStorage.getItem('tiffin_sync_room');
      return stored ? stored.toString().trim().toUpperCase() : null;
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
          this.latestSnapshot = data;
          this.notifySubscribers(data);
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

        // If this is an existing approved member or logging in with valid Admin PIN:
        if (existing || adminPin) {
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

          console.log(`[FirebaseSync] Successfully logged into room #${cleanCode} as ${finalMember.name}`);

          this.sendRoomNotification({
            title: 'Flatmate Joined! 🍱',
            body: `${finalMember.name} joined room #${cleanCode}!`,
            tag: `join-${finalMember.id || Date.now()}`,
            data: { roomCode: cleanCode, memberName: finalMember.name, type: 'member_joined' }
          });

          return {
            success: true,
            roomData: roomData,
            state: state,
            member: finalMember
          };
        }

        // This is a NEW user joining without Admin PIN:
        // Check if room requires Admin approval (default: true)
        const requireApproval = roomData.requireApproval !== false;

        if (requireApproval) {
          if (!Array.isArray(roomData.pendingRequests)) {
            roomData.pendingRequests = [];
          }

          // Check if request already pending for this person
          let existingReq = roomData.pendingRequests.find(r =>
            (r.name && (r.name || '').trim().toLowerCase() === (newMember.name || '').trim().toLowerCase()) ||
            (r.phone && newMember.phone && r.phone === newMember.phone)
          );

          if (!existingReq) {
            existingReq = {
              id: 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
              name: newMember.name,
              phone: newMember.phone || '',
              roomCode: cleanCode,
              requestedAt: Date.now()
            };
            roomData.pendingRequests.push(existingReq);
          } else {
            existingReq.requestedAt = Date.now();
            if (newMember.phone && !existingReq.phone) existingReq.phone = newMember.phone;
          }

          await roomRef.set({
            roomData: roomData,
            lastUpdated: Date.now()
          }, { merge: true });

          console.log(`[FirebaseSync] Join request submitted for #${cleanCode}: ${newMember.name} (${existingReq.id})`);

          // Queue real-time push notification to room Admin
          this.sendRoomNotification({
            title: `Join Request: ${newMember.name} 🔔`,
            body: `${newMember.name} requested to join flat #${cleanCode}. Tap to review and approve!`,
            tag: `req-${existingReq.id}`,
            data: {
              type: 'join_request',
              reqId: existingReq.id,
              name: newMember.name,
              phone: newMember.phone || '',
              roomCode: cleanCode
            }
          });

          return {
            success: true,
            requiresApproval: true,
            requestId: existingReq.id,
            roomData: roomData,
            member: newMember
          };
        }

        // Direct join if requireApproval is explicitly false
        members.push(newMember);
        const deduplicated = typeof RoomManager !== 'undefined'
          ? RoomManager.deduplicateMembers(members, roomData.adminName)
          : members;

        roomData.members = deduplicated;

        await roomRef.set({
          roomData: roomData,
          lastUpdated: Date.now()
        }, { merge: true });

        console.log(`[FirebaseSync] Successfully joined room #${cleanCode} directly as ${newMember.name}`);

        this.sendRoomNotification({
          title: 'Flatmate Joined! 🍱',
          body: `${newMember.name} joined room #${cleanCode}!`,
          tag: `join-${newMember.id || Date.now()}`,
          data: { roomCode: cleanCode, memberName: newMember.name, type: 'member_joined' }
        });

        return {
          success: true,
          roomData: roomData,
          state: state,
          member: newMember
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

    async cancelJoinRequest(roomCode, requestId) {
      if (!this.isAvailable || !db || !requestId) return;
      const cleanCode = this.getCleanRoom(roomCode);
      try {
        const roomRef = db.collection('rooms').doc(cleanCode);
        const doc = await roomRef.get();
        if (doc.exists) {
          const data = doc.data() || {};
          if (data.roomData && Array.isArray(data.roomData.pendingRequests)) {
            data.roomData.pendingRequests = data.roomData.pendingRequests.filter(r => r.id !== requestId);
            await roomRef.set({
              roomData: data.roomData,
              lastUpdated: Date.now()
            }, { merge: true });
            console.log(`[FirebaseSync] Cancelled join request ${requestId} in #${cleanCode}`);
          }
        }
      } catch (err) {
        console.warn('[FirebaseSync] cancelJoinRequest error:', err);
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
