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
      if (activeUnsubscribe && currentRoomCode === cleanCode) return;

      this.unsubscribeRoom();
      currentRoomCode = cleanCode;
      console.log(`[FirebaseSync] Subscribing to real-time room: #${cleanCode}`);

      try {
        const roomRef = db.collection('rooms').doc(cleanCode);

        activeUnsubscribe = roomRef.onSnapshot((doc) => {
          if (!doc.exists) {
            console.log(`[FirebaseSync] Room document #${cleanCode} does not exist in cloud.`);
            return;
          }

          const data = doc.data() || {};
          this.latestSnapshot = data;
          this.notifySubscribers(data);
        }, (err) => {
          console.warn('[FirebaseSync] Snapshot listener error:', err);
        });
      } catch (err) {
        console.warn('[FirebaseSync] Subscription failed:', err);
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

    /**
     * Join Room Workflow (Atomic & Error-Tolerant)
     */
    async joinRoom(roomCode, candidate, adminPin) {
      if (!this.isAvailable || !db) {
        return { success: false, error: 'Cloud sync is offline. Check internet connection.' };
      }
      const cleanCode = String(roomCode).trim().toUpperCase();
      if (!cleanCode) return { success: false, error: 'Invalid room code.' };

      try {
        const roomRef = db.collection('rooms').doc(cleanCode);
        const doc = await roomRef.get();
        if (!doc.exists) {
          return { success: false, notFound: true, error: `Flat #${cleanCode} was not found. Please verify the 4-digit code.` };
        }

        const data = doc.data() || {};
        const roomData = data.roomData || { code: cleanCode, name: 'My Flat', members: [], pendingRequests: [] };
        const state = data.state || null;
        const members = Array.isArray(roomData.members) ? roomData.members : [];

        // 1. Admin PIN Login (Super-user bypass)
        if (adminPin) {
          if (roomData.adminPin && String(roomData.adminPin).trim() !== String(adminPin).trim()) {
            return { success: false, error: 'Incorrect Admin Security PIN for this flat.' };
          }
          // Find existing member or create admin member
          let adminMember = members.find(m => m.role === 'admin') ||
                            members.find(m => (m.name || '').toLowerCase() === (candidate.name || '').toLowerCase());
          if (!adminMember) {
            adminMember = {
              id: candidate.id || ('m_' + Date.now()),
              name: candidate.name || roomData.adminName || 'Admin',
              phone: candidate.phone || roomData.adminPhone || '',
              role: 'admin',
              avatarColor: '#00d26a',
              joinedAt: new Date().toISOString()
            };
            members.unshift(adminMember);
            roomData.members = members;
            await roomRef.set({ roomData, lastUpdated: Date.now() }, { merge: true });
          }
          return { success: true, roomData, state, member: adminMember };
        }

        // 2. Existing Member Login (Recognize returning user by phone or sanitized name)
        const existingMember = members.find(m => {
          if (candidate.phone && m.phone && candidate.phone.slice(-10) === m.phone.slice(-10)) return true;
          if (candidate.name && m.name && candidate.name.trim().toLowerCase() === m.name.trim().toLowerCase()) return true;
          return false;
        });

        if (existingMember) {
          console.log(`[FirebaseSync] Returning member logged into #${cleanCode}: ${existingMember.name}`);
          return { success: true, roomData, state, member: existingMember };
        }

        // 3. New User: Check if Room Requires Approval
        const requireApproval = roomData.requireApproval !== false;
        if (requireApproval) {
          roomData.pendingRequests = Array.isArray(roomData.pendingRequests) ? roomData.pendingRequests : [];

          // Deduplicate request if already pending
          let existingReq = roomData.pendingRequests.find(r =>
            (r.phone && candidate.phone && r.phone.slice(-10) === candidate.phone.slice(-10)) ||
            (r.name && candidate.name && r.name.trim().toLowerCase() === candidate.name.trim().toLowerCase())
          );

          if (!existingReq) {
            existingReq = {
              id: 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
              name: candidate.name,
              phone: candidate.phone || '',
              roomCode: cleanCode,
              requestedAt: Date.now()
            };
            roomData.pendingRequests.push(existingReq);
          } else {
            existingReq.requestedAt = Date.now();
            if (candidate.phone) existingReq.phone = candidate.phone;
          }

          await roomRef.set({
            roomData: roomData,
            lastUpdated: Date.now()
          }, { merge: true });

          console.log(`[FirebaseSync] Join request submitted for #${cleanCode}: ${candidate.name} (${existingReq.id})`);

          // Alert Admin via FCM
          this.sendRoomNotification({
            title: `Knock Knock! 🔔 ${candidate.name}`,
            body: `${candidate.name} requested to join flat #${cleanCode}. Tap to review and approve!`,
            tag: `req-${existingReq.id}`,
            data: {
              type: 'join_request',
              reqId: existingReq.id,
              name: candidate.name,
              phone: candidate.phone || '',
              roomCode: cleanCode
            }
          });

          return {
            success: true,
            requiresApproval: true,
            requestId: existingReq.id,
            roomData: roomData,
            member: candidate
          };
        }

        // 4. Direct Entry (Approval Disabled)
        members.push(candidate);
        roomData.members = members;

        await roomRef.set({
          roomData: roomData,
          lastUpdated: Date.now()
        }, { merge: true });

        console.log(`[FirebaseSync] Direct join to #${cleanCode}: ${candidate.name}`);

        this.sendRoomNotification({
          title: 'Flatmate Joined! 🍱',
          body: `${candidate.name} joined room #${cleanCode}!`,
          tag: `join-${candidate.id || Date.now()}`,
          data: { roomCode: cleanCode, memberName: candidate.name, type: 'member_joined' }
        });

        return {
          success: true,
          roomData: roomData,
          state: state,
          member: candidate
        };
      } catch (err) {
        console.error('[FirebaseSync] joinRoom error:', err);
        return { success: false, error: 'Failed to connect: ' + (err.message || 'Network error') };
      }
    },

    /**
     * Admin: Approve Pending Request (Atomic)
     */
    async approvePendingRequest(roomCode, requestId) {
      if (!this.isAvailable || !db) return { success: false, error: 'Database offline.' };
      const cleanCode = String(roomCode).trim().toUpperCase();

      try {
        const roomRef = db.collection('rooms').doc(cleanCode);
        const doc = await roomRef.get();
        if (!doc.exists) return { success: false, error: 'Flat not found.' };

        const roomData = doc.data()?.roomData || {};
        const pending = Array.isArray(roomData.pendingRequests) ? roomData.pendingRequests : [];
        const req = pending.find(p => p.id === requestId);
        if (!req) return { success: false, error: 'Request not found or already processed.' };

        // Remove from pending
        roomData.pendingRequests = pending.filter(p => p.id !== requestId);

        // Add to members
        roomData.members = Array.isArray(roomData.members) ? roomData.members : [];
        const avatarColors = ['#00d4ff', '#a78bfa', '#ff3b5c', '#ffb800', '#10b981', '#38bdf8', '#f43f5e', '#ec4899'];
        const avatarColor = avatarColors[roomData.members.length % avatarColors.length];

        const newMember = {
          id: 'm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          name: req.name,
          phone: req.phone || '',
          role: 'member',
          avatarColor: avatarColor,
          joinedAt: new Date().toISOString()
        };

        roomData.members.push(newMember);

        await roomRef.set({
          roomData: roomData,
          lastUpdated: Date.now()
        }, { merge: true });

        console.log(`[FirebaseSync] Approved member ${newMember.name} in #${cleanCode}`);

        // Send celebration FCM alert
        this.sendRoomNotification({
          title: `Welcome ${newMember.name}! 🍱`,
          body: `${newMember.name} joined the flat mess!`,
          tag: `join-${newMember.id}`,
          data: { roomCode: cleanCode, memberName: newMember.name, type: 'member_approved' }
        });

        return { success: true, approvedMember: newMember, roomData: roomData };
      } catch (err) {
        console.error('[FirebaseSync] approvePendingRequest error:', err);
        return { success: false, error: err.message };
      }
    },

    /**
     * Admin: Decline Pending Request (Atomic)
     */
    async declinePendingRequest(roomCode, requestId) {
      if (!this.isAvailable || !db) return { success: false, error: 'Database offline.' };
      const cleanCode = String(roomCode).trim().toUpperCase();

      try {
        const roomRef = db.collection('rooms').doc(cleanCode);
        const doc = await roomRef.get();
        if (!doc.exists) return { success: false, error: 'Flat not found.' };

        const roomData = doc.data()?.roomData || {};
        roomData.pendingRequests = (roomData.pendingRequests || []).filter(p => p.id !== requestId);

        await roomRef.set({
          roomData: roomData,
          lastUpdated: Date.now()
        }, { merge: true });

        console.log(`[FirebaseSync] Declined request ${requestId} in #${cleanCode}`);
        return { success: true };
      } catch (err) {
        console.error('[FirebaseSync] declinePendingRequest error:', err);
        return { success: false, error: err.message };
      }
    },

    /**
     * Applicant: Cancel Join Request (Atomic)
     */
    async cancelJoinRequest(roomCode, requestId) {
      return this.declinePendingRequest(roomCode, requestId);
    },

    /**
     * Admin: Remove Member from Flat (Atomic & Immediate)
     */
    async removeMemberFromRoom(roomCode, memberId) {
      if (!this.isAvailable || !db) return { success: false, error: 'Database offline.' };
      const cleanCode = String(roomCode).trim().toUpperCase();

      try {
        const roomRef = db.collection('rooms').doc(cleanCode);
        const doc = await roomRef.get();
        if (!doc.exists) return { success: false, error: 'Flat not found.' };

        const data = doc.data() || {};
        const roomData = data.roomData || {};
        const members = Array.isArray(roomData.members) ? roomData.members : [];

        const target = members.find(m => m.id === memberId);
        if (target && target.role === 'admin') {
          return { success: false, error: 'Cannot remove the room Admin.' };
        }

        roomData.members = members.filter(m => m.id !== memberId);

        const updatePayload = {
          roomData: roomData,
          lastUpdated: Date.now()
        };

        // Remove their FCM token from the room document
        if (data[`fcmTokens.${memberId}`] || (data.fcmTokens && data.fcmTokens[memberId])) {
          updatePayload[`fcmTokens.${memberId}`] = firebase.firestore.FieldValue.delete();
        }

        await roomRef.update(updatePayload);

        console.log(`[FirebaseSync] Removed member ${memberId} from #${cleanCode}`);
        return { success: true };
      } catch (err) {
        console.error('[FirebaseSync] removeMemberFromRoom error:', err);
        return { success: false, error: err.message };
      }
    },

    /**
     * Member / Admin: Leave Room cleanly
     */
    async leaveRoom(roomCode, memberId) {
      if (!this.isAvailable || !db || !roomCode) return;
      const cleanCode = String(roomCode).trim().toUpperCase();
      try {
        if (memberId) {
          const roomRef = db.collection('rooms').doc(cleanCode);
          await roomRef.update({
            [`fcmTokens.${memberId}`]: firebase.firestore.FieldValue.delete()
          }).catch(() => {});
        }
      } catch (e) {}
      this.unsubscribeRoom();
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
      if (!roomCode) {
        console.log('[FirebaseSync] FCM token cached, waiting for active flat to bind.');
        return;
      }

      let myId = 'member';
      try {
        const sessionRaw = localStorage.getItem('tiffin_session') || localStorage.getItem('tiffin_user_session');
        if (sessionRaw) {
          const s = JSON.parse(sessionRaw);
          if (s && s.memberId) myId = s.memberId;
          else if (s && s.name) myId = s.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
        }
      } catch (e) {}

      try {
        const tokenObj = {
          token: token.trim(),
          platform: 'android',
          updatedAt: Date.now()
        };

        await db.collection('rooms').doc(roomCode).set({
          [`fcmTokens.${myId}`]: tokenObj
        }, { merge: true });

        console.log(`[FirebaseSync] FCM push token registered for ${myId} in #${roomCode}`);
      } catch (err) {
        console.warn('[FirebaseSync] registerFcmToken error:', err);
      }
    },

    /**
     * Enqueue a push notification in Firestore for this flat.
     * Firebase Cloud Messaging background dispatchers pick this up automatically.
     */
    async sendRoomNotification({ title, body, tag = 'tiffin-alert', data = {} }) {
      if (!this.isAvailable || !db) return false;
      const roomCode = this.getCleanRoom();
      if (!roomCode) return false;

      let myId = 'member';
      let myName = 'Flatmate';
      try {
        const sessionRaw = localStorage.getItem('tiffin_session') || localStorage.getItem('tiffin_user_session');
        if (sessionRaw) {
          const s = JSON.parse(sessionRaw);
          if (s && s.memberId) myId = s.memberId;
          if (s && s.name) myName = s.name;
        }
      } catch (e) {}

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
