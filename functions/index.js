const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

/**
 * Extracts recipient FCM device tokens from room document data.
 * Supports both nested fcmTokens map and top-level fcmTokens.<member> dotted keys.
 */
function extractTokens(roomData, senderId = '') {
  const result = [];

  // 1. Nested map: roomData.fcmTokens
  if (roomData.fcmTokens && typeof roomData.fcmTokens === 'object') {
    for (const [key, val] of Object.entries(roomData.fcmTokens)) {
      if (key && senderId && key.toLowerCase() === senderId.toLowerCase()) continue;
      const t = typeof val === 'string' ? val : val?.token;
      if (t && typeof t === 'string' && t.trim().length > 10) {
        result.push({ token: t.trim(), key: `fcmTokens.${key}` });
      }
    }
  }

  // 2. Dotted top-level keys: roomData['fcmTokens.member']
  for (const [key, val] of Object.entries(roomData)) {
    if (key.startsWith('fcmTokens.')) {
      const memberKey = key.slice('fcmTokens.'.length);
      if (memberKey && senderId && memberKey.toLowerCase() === senderId.toLowerCase()) continue;
      const t = typeof val === 'string' ? val : val?.token;
      if (t && typeof t === 'string' && t.trim().length > 10) {
        if (!result.some(r => r.token === t.trim())) {
          result.push({ token: t.trim(), key });
        }
      }
    }
  }

  return result;
}

/**
 * Cloud Function: sendPushNotificationOnEvent
 * 
 * Triggers automatically whenever a client app creates a notification doc:
 * rooms/{roomCode}/notifications/{notifId}
 * 
 * 1. Reads the room's registered FCM tokens
 * 2. Filters out the sender (so you don't receive alerts for your own action)
 * 3. Dispatches high-priority push notifications to all flatmates
 * 4. Cleans up invalid/expired device tokens from Firestore
 */
exports.sendPushNotificationOnEvent = functions.firestore
  .document('rooms/{roomCode}/notifications/{notifId}')
  .onCreate(async (snap, context) => {
    const { roomCode, notifId } = context.params;
    const notifData = snap.data();

    if (!notifData) return null;

    const title = notifData.title || 'Tiffin Tracker';
    const body = notifData.body || 'New update in your flat mess';
    const senderId = notifData.senderId || '';
    const customData = notifData.data || {};

    try {
      // 1. Fetch room document to get registered flatmate device tokens
      const roomDoc = await admin.firestore().collection('rooms').doc(roomCode).get();
      if (!roomDoc.exists) {
        console.warn(`[FCM] Room #${roomCode} does not exist.`);
        return null;
      }

      const roomData = roomDoc.data() || {};
      const tokenEntries = extractTokens(roomData, senderId);

      if (tokenEntries.length === 0) {
        console.log(`[FCM] No recipient tokens found in room #${roomCode} (excluding sender: "${senderId || 'none'}").`);
        return null;
      }

      const targetTokens = tokenEntries.map(e => e.token);
      console.log(`[FCM] Sending push notification to ${targetTokens.length} flatmates in room #${roomCode}...`);

      // 2. Construct the FCM Multicast Message
      const message = {
        tokens: targetTokens,
        notification: {
          title: title,
          body: body
        },
        data: {
          title: title,
          body: body,
          roomCode: String(roomCode),
          senderId: senderId,
          ...Object.fromEntries(
            Object.entries(customData).map(([k, v]) => [k, String(v)])
          )
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'tiffin_notifications',
            sound: 'default',
            priority: 'high',
            visibility: 'public' // Lock screen visible
          }
        }
      };

      // 3. Send using modern Firebase Admin SDK Multicast API
      const response = await admin.messaging().sendEachForMulticast(message);
      console.log(`[FCM] Successfully delivered ${response.successCount}/${targetTokens.length} messages.`);

      // 4. Clean up expired / invalid tokens from Firestore automatically
      const tokensToRemove = {};
      response.responses.forEach((result, idx) => {
        if (!result.success) {
          const errCode = result.error ? result.error.code : '';
          console.warn(`[FCM] Delivery failed for ${tokenEntries[idx].key}:`, errCode);
          if (
            errCode === 'messaging/invalid-registration-token' ||
            errCode === 'messaging/registration-token-not-registered'
          ) {
            tokensToRemove[tokenEntries[idx].key] = admin.firestore.FieldValue.delete();
          }
        }
      });

      if (Object.keys(tokensToRemove).length > 0) {
        await admin.firestore().collection('rooms').doc(roomCode).update(tokensToRemove);
        console.log(`[FCM] Cleaned up ${Object.keys(tokensToRemove).length} invalid tokens.`);
      }

      // 5. Mark notification as dispatched
      await snap.ref.update({
        dispatched: true,
        dispatchedAt: admin.firestore.FieldValue.serverTimestamp(),
        successCount: response.successCount,
        failureCount: response.failureCount
      });

      return null;
    } catch (err) {
      console.error(`[FCM] Error processing notification ${notifId} in room #${roomCode}:`, err);
      return null;
    }
  });
