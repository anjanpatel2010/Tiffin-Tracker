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
     * Join Room Workflow (Instant Direct Entry - No Approval Gates)
     */
    async joinRoom(roomCode, candidate, adminPin) {
      if (!this.isAvailable || !db) {
        return { success: false, error: 'Cloud sync is offline. Check internet connection.' };
      }
      const cleanCode = String(roomCode).trim().toUpperCase();
      if (!cleanCode) return { success: false, error: 'Invalid room code.' };

      try {
        const roomRef = db.collection('rooms').doc(cleanCode);
        let joinedMember = null;
        let roomState = null;
        let finalRoomData = null;

        const result = await db.runTransaction(async (transaction) => {
          const doc = await transaction.get(roomRef);
          if (!doc.exists) {
            return { success: false, notFound: true, error: `Flat #${cleanCode} was not found. Please verify the 4-digit code.` };
          }

          const data = doc.data() || {};
          const roomData = data.roomData || { code: cleanCode, name: 'My Flat', members: [] };
          roomState = data.state || null;
          let members = Array.isArray(roomData.members) ? [...roomData.members] : [];

          // 1. Admin PIN Verification (if PIN provided)
          if (adminPin) {
            if (roomData.adminPin && String(roomData.adminPin).trim() !== String(adminPin).trim()) {
              return { success: false, error: 'Incorrect Admin Security PIN for this flat.' };
            }
            let adminMember = members.find(m => m.role === 'admin');
            if (adminMember) {
              if (candidate.phone && !adminMember.phone) adminMember.phone = candidate.phone;
              joinedMember = adminMember;
            } else {
              adminMember = {
                id: candidate.id || ('m_' + Date.now()),
                name: candidate.name || roomData.adminName || 'Admin',
                phone: candidate.phone || roomData.adminPhone || '',
                role: 'admin',
                avatarColor: '#00d26a',
                joinedAt: new Date().toISOString()
              };
              members.unshift(adminMember);
              joinedMember = adminMember;
            }
          } else {
            // 2. Member join (WITHOUT Admin PIN):
            // A. Explicit Kicked Blacklist Check (Permanently blocked from re-entering)
            if (Array.isArray(roomData.kickedMembers)) {
              const isKicked = roomData.kickedMembers.some(km =>
                (candidate.id && km.id === candidate.id) ||
                (candidate.phone && km.phone && candidate.phone.slice(-10) === km.phone.slice(-10)) ||
                (candidate.name && km.name && candidate.name.trim().toLowerCase() === km.name.trim().toLowerCase())
              );
              if (isKicked) {
                return { success: false, error: 'You have been removed from this flat by the Admin. You cannot rejoin.' };
              }
            }

            // B. Prevent regular member from taking over Admin's profile without the PIN
            const currentAdmin = members.find(m => m.role === 'admin');
            if (currentAdmin && candidate.name && currentAdmin.name && candidate.name.trim().toLowerCase() === currentAdmin.name.trim().toLowerCase()) {
              return {
                success: false,
                error: `The name "${candidate.name}" belongs to the Flat Admin. If you are the admin, enter your Admin PIN to log in. Otherwise, please enter your own name.`
              };
            }

            // C. Match only NON-ADMIN existing members
            let existingMember = members.find(m => {
              if (m.role === 'admin') return false; // STRICT: Never match admin without PIN
              if (candidate.id && m.id === candidate.id) return true;
              if (candidate.phone && m.phone && candidate.phone.slice(-10) === m.phone.slice(-10)) return true;
              if (candidate.name && m.name && candidate.name.trim().toLowerCase() === m.name.trim().toLowerCase()) return true;
              return false;
            });

            if (existingMember) {
              // Returning regular member
              if (candidate.phone && !existingMember.phone) existingMember.phone = candidate.phone;
              existingMember.role = 'member'; // GUARANTEED role
              joinedMember = existingMember;
            } else {
              // 3. Brand New Member - Instant Direct Entry!
              const avatarColors = ['#00d4ff', '#a78bfa', '#ff3b5c', '#ffb800', '#10b981', '#38bdf8', '#f43f5e', '#ec4899'];
              const avatarColor = candidate.avatarColor || avatarColors[members.length % avatarColors.length];
              const newMember = {
                id: candidate.id || ('m_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)),
                name: candidate.name,
                phone: candidate.phone || '',
                role: 'member', // GUARANTEED role
                avatarColor: avatarColor,
                joinedAt: new Date().toISOString()
              };
              members.push(newMember);
              joinedMember = newMember;
            }
          }

          roomData.members = members;
          finalRoomData = roomData;

          transaction.set(roomRef, {
            roomData: roomData,
            lastUpdated: Date.now()
          }, { merge: true });

          return { success: true };
        });

        if (result && !result.success) {
          return result;
        }

        console.log(`[FirebaseSync] Instant direct join to #${cleanCode}: ${joinedMember.name}`);

        // Dispatch instant push notification to all other roommates
        this.sendRoomNotification({
          roomCode: cleanCode,
          title: 'Flatmate Joined! 🍱',
          body: `${joinedMember.name} joined room #${cleanCode}!`,
          tag: `join-${joinedMember.id}`,
          data: {
            roomCode: cleanCode,
            memberName: joinedMember.name,
            memberId: joinedMember.id,
            type: 'member_joined'
          }
        });

        return {
          success: true,
          roomData: finalRoomData,
          state: roomState,
          member: joinedMember
        };
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

        // Record explicitly in kickedMembers list to prevent ghost resurrection
        roomData.kickedMembers = Array.isArray(roomData.kickedMembers) ? roomData.kickedMembers : [];
        roomData.kickedMembers = roomData.kickedMembers.filter(km => km.id !== memberId);
        if (target) {
          roomData.kickedMembers.push({
            id: memberId,
            name: target.name || 'Member',
            phone: target.phone || '',
            kickedAt: Date.now()
          });
        }

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

        // Dispatch notification to inform room of member kick
        this.sendRoomNotification({
          roomCode: cleanCode,
          title: 'Member Removed 👋',
          body: `${target ? target.name : 'A member'} was removed from the flat by Admin.`,
          tag: `kick-${memberId}`,
          data: {
            roomCode: cleanCode,
            memberId: memberId,
            memberName: target ? target.name : '',
            type: 'member_kicked'
          }
        });
        return { success: true };
      } catch (err) {
        console.error('[FirebaseSync] removeMemberFromRoom error:', err);
        return { success: false, error: err.message };
      }
    },

    /**
     * Member / Admin: Leave Room cleanly with automatic Admin succession
     */
    async leaveRoom(roomCode, memberId) {
      if (!this.isAvailable || !db || !roomCode) return { success: false };
      const cleanCode = this.getCleanRoom(roomCode);
      const roomRef = db.collection('rooms').doc(cleanCode);

      try {
        const result = await db.runTransaction(async (transaction) => {
          const doc = await transaction.get(roomRef);
          if (!doc.exists) {
            return { success: true };
          }
          const data = doc.data() || {};
          const roomData = data.roomData || {};
          let members = Array.isArray(roomData.members) ? [...roomData.members] : [];

          // Find the member who is leaving
          const leavingMember = members.find(m => m.id === memberId);
          const remainingMembers = members.filter(m => m.id !== memberId);

          const isLeavingAdmin = leavingMember && (
            leavingMember.role === 'admin' ||
            (roomData.adminName && leavingMember.name && roomData.adminName.toLowerCase() === leavingMember.name.toLowerCase())
          );

          // CASE 1: No members left in the room (Flat is abandoned)
          if (remainingMembers.length === 0) {
            transaction.delete(roomRef);
            return { success: true, dissolved: true };
          }

          let newAdmin = null;

          // CASE 2: The leaving member was the Admin, and other members remain
          if (isLeavingAdmin) {
            // Sort remaining members by joinedAt ascending (seniority)
            remainingMembers.sort((a, b) => {
              const tA = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
              const tB = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
              return tA - tB;
            });

            // Promote first remaining flatmate
            newAdmin = remainingMembers[0];
            newAdmin.role = 'admin';

            roomData.adminName = newAdmin.name;
            roomData.adminPhone = newAdmin.phone || '';
            roomData.adminPinNeedsReset = true; // Signals client to prompt for new PIN
            roomData.newAdminId = newAdmin.id;
          }

          roomData.members = remainingMembers;

          const updatePayload = {
            roomData: roomData,
            lastUpdated: Date.now()
          };
          if (memberId) {
            updatePayload[`fcmTokens.${memberId}`] = firebase.firestore.FieldValue.delete();
          }

          transaction.set(roomRef, updatePayload, { merge: true });

          return {
            success: true,
            promotedAdmin: newAdmin,
            remainingMembers: remainingMembers,
            leavingMember: leavingMember
          };
        });

        // Dispatch notification to notify all other flatmates that member left
        if (result.success && !result.dissolved) {
          const leftName = result.leavingMember ? result.leavingMember.name : 'A flatmate';
          this.sendRoomNotification({
            roomCode: cleanCode,
            title: 'Flatmate Left 👋',
            body: `${leftName} left the flat.`,
            tag: `leave-${memberId}`,
            data: {
              roomCode: cleanCode,
              memberId: memberId,
              memberName: leftName,
              type: 'member_left'
            }
          });
        }

        // Broadcast notifications if admin was promoted
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

        this.unsubscribeRoom();
        return result;
      } catch (err) {
        console.error('[FirebaseSync] leaveRoom error:', err);
        this.unsubscribeRoom();
        return { success: false, error: err.message };
      }
    },

    /**
     * Update Admin Security PIN (called by new admin on PIN generation)
     */
    async updateAdminPin(roomCode, newPin) {
      if (!this.isAvailable || !db || !roomCode) return { success: false };
      const cleanCode = this.getCleanRoom(roomCode);
      const roomRef = db.collection('rooms').doc(cleanCode);

      try {
        await db.runTransaction(async (transaction) => {
          const doc = await transaction.get(roomRef);
          if (!doc.exists) return;
          const data = doc.data() || {};
          const roomData = data.roomData || {};

          roomData.adminPin = String(newPin).trim();
          roomData.adminPinNeedsReset = false;
          delete roomData.newAdminId;

          transaction.update(roomRef, {
            'roomData.adminPin': String(newPin).trim(),
            'roomData.adminPinNeedsReset': false,
            'roomData.newAdminId': firebase.firestore.FieldValue.delete(),
            lastUpdated: Date.now()
          });
        });

        return { success: true };
      } catch (err) {
        console.error('[FirebaseSync] updateAdminPin error:', err);
        return { success: false, error: err.message };
      }
    },

    /**
     * Transfer Admin Role manually to another member
     */
    async transferAdminRole(roomCode, targetMemberId) {
      if (!this.isAvailable || !db || !roomCode || !targetMemberId) return { success: false };
      const cleanCode = this.getCleanRoom(roomCode);
      const roomRef = db.collection('rooms').doc(cleanCode);

      try {
        let promotedMember = null;
        await db.runTransaction(async (transaction) => {
          const doc = await transaction.get(roomRef);
          if (!doc.exists) throw new Error('Room not found');
          const data = doc.data() || {};
          const roomData = data.roomData || {};
          const members = Array.isArray(roomData.members) ? [...roomData.members] : [];

          members.forEach(m => {
            if (m.id === targetMemberId) {
              m.role = 'admin';
              promotedMember = m;
            } else if (m.role === 'admin') {
              m.role = 'member';
            }
          });

          if (!promotedMember) throw new Error('Target member not found in flat');

          roomData.adminName = promotedMember.name;
          roomData.adminPhone = promotedMember.phone || '';
          roomData.adminPinNeedsReset = true;
          roomData.newAdminId = promotedMember.id;
          roomData.members = members;

          transaction.update(roomRef, {
            'roomData.adminName': promotedMember.name,
            'roomData.adminPhone': promotedMember.phone || '',
            'roomData.adminPinNeedsReset': true,
            'roomData.newAdminId': promotedMember.id,
            'roomData.members': members,
            lastUpdated: Date.now()
          });
        });

        if (promotedMember) {
          this.sendRoomNotification({
            roomCode: cleanCode,
            title: `👑 New Flat Admin: ${promotedMember.name}`,
            body: `${promotedMember.name} has been appointed Flat Admin.`,
            tag: `admin-promoted-${promotedMember.id}`,
            data: {
              roomCode: cleanCode,
              newAdminId: promotedMember.id,
              type: 'admin_promoted'
            }
          });
        }

        return { success: true, targetMember: promotedMember };
      } catch (err) {
        console.error('[FirebaseSync] transferAdminRole error:', err);
        return { success: false, error: err.message };
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
