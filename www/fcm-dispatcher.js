/**
 * Tiffin Tracker - Secure FCM Dispatcher Bridge
 * Handles flat notification dispatching through secure backend services or Firestore queues.
 * 
 * SECURITY GUARANTEE:
 * Contains NO private keys or credentials.
 * Operates purely via client-to-backend relay or Firestore cloud queue.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FcmDispatcher = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FcmDispatcher = {
    /**
     * Optional backend relay URL (e.g. hosted serverless function or send-fcm-server)
     */
    relayUrl: window.FCM_RELAY_URL || null,

    setRelayUrl(url) {
      this.relayUrl = url;
    },

    /**
     * Dispatch an FCM notification to a room.
     * 1. If a secure backend relay is configured, posts to the relay.
     * 2. Persists to Cloud Firestore notifications queue.
     */
    async sendToRoom(roomCode, title, body, data = {}, excludeToken = null) {
      if (!roomCode) return false;
      const cleanCode = String(roomCode).trim().toUpperCase();

      // 1. If a backend relay is configured, forward to it
      if (this.relayUrl) {
        try {
          fetch(`${this.relayUrl}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roomCode: cleanCode,
              title: title,
              body: body || '',
              data: data || {},
              excludeToken: excludeToken
            })
          }).catch(err => {
            console.warn('[FcmDispatcher] Relay POST error:', err);
          });
        } catch (e) {}
      }

      // 2. Queue in Firestore for background processors
      if (typeof firebase !== 'undefined' && firebase.firestore) {
        try {
          const db = firebase.firestore();
          await db.collection('rooms').doc(cleanCode).collection('notifications').add({
            title: title || 'Tiffin Tracker 🍲',
            body: body || '',
            tag: data.tag || 'tiffin-alert',
            senderId: data.senderId || 'member',
            senderName: data.senderName || 'Flatmate',
            roomCode: cleanCode,
            data: {
              title: title || 'Tiffin Tracker 🍲',
              body: body || '',
              roomCode: cleanCode,
              timestamp: String(Date.now()),
              ...Object.fromEntries(
                Object.entries(data || {}).map(([k, v]) => [k, String(v)])
              )
            },
            dispatched: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          console.log(`[FcmDispatcher] Enqueued notification in Firestore for room #${cleanCode}: "${title}"`);
          return true;
        } catch (dbErr) {
          console.warn('[FcmDispatcher] Firestore enqueue warning:', dbErr);
        }
      }

      return true;
    }
  };

  return FcmDispatcher;
}));
