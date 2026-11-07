const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

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
      const fcmTokensMap = roomData.fcmTokens || {};

      // 2. Filter tokens: only send to other flatmates (exclude sender)
      const targetTokens = [];
      const tokenKeys = [];

      for (const [memberKey, tokenEntry] of Object.entries(fcmTokensMap)) {
        if (memberKey === senderId) continue; // Skip sender

        const token = typeof tokenEntry === 'string' ? tokenEntry : tokenEntry?.token;
        if (token && typeof token === 'string' && token.trim().length > 0) {
          targetTokens.push(token.trim());
          tokenKeys.push(memberKey);
        }
      }

      if (targetTokens.length === 0) {
        console.log(`[FCM] No recipient tokens found in room #${roomCode} (excluding sender: ${senderId}).`);
        return null;
      }

      console.log(`[FCM] Sending push notification to ${targetTokens.length} flatmates in room #${roomCode}...`);

      // 3. Construct the FCM Multicast Message
      const message = {
        tokens: targetTokens,
        notification: {
          title: title,
          body: body
        },
        data: {
          title: title,
          body: body,
          roomCode: roomCode,
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

      // 4. Send using modern Firebase Admin SDK Multicast API
      const response = await admin.messaging().sendEachForMulticast(message);
      console.log(`[FCM] Successfully delivered ${response.successCount}/${targetTokens.length} messages.`);

      // 5. Clean up expired / invalid tokens from Firestore automatically
      const tokensToRemove = {};
      response.responses.forEach((result, idx) => {
        if (!result.success) {
          const errCode = result.error ? result.error.code : '';
          console.warn(`[FCM] Delivery failed for ${tokenKeys[idx]}:`, errCode);
          if (
            errCode === 'messaging/invalid-registration-token' ||
            errCode === 'messaging/registration-token-not-registered'
          ) {
            tokensToRemove[`fcmTokens.${tokenKeys[idx]}`] = admin.firestore.FieldValue.delete();
          }
        }
      });

      if (Object.keys(tokensToRemove).length > 0) {
        await admin.firestore().collection('rooms').doc(roomCode).update(tokensToRemove);
        console.log(`[FCM] Cleaned up ${Object.keys(tokensToRemove).length} invalid tokens.`);
      }

      // Mark notification as dispatched
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
