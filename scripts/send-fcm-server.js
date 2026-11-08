/**
 * Standalone Firebase Admin FCM Push Dispatcher
 * Can be run locally, in CI/CD, or as a 24/7 background worker service (Render / Railway / VPS / Cloud Run).
 * 
 * Uses service-account.json from the project root (never committed to git).
 * 
 * Commands:
 *   node scripts/send-fcm-server.js --test
 *   node scripts/send-fcm-server.js --room 4188 --title "Dinner Update" --body "Paneer & Roti logged"
 *   node scripts/send-fcm-server.js --listen
 */

const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.resolve(__dirname, '../service-account.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('[Error] service-account.json not found in root directory.');
  console.error('Please ensure service-account.json is placed in the project root.');
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

const app = initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore(app);
const messaging = getMessaging(app);

console.log(`[FCM Server] Initialized with project: ${serviceAccount.project_id}`);

/**
 * Extracts recipient FCM device tokens from room document data.
 * Supports both nested fcmTokens map and top-level fcmTokens.<member> dotted keys.
 */
function extractTokens(roomData, senderId = '') {
  const result = [];

  // 1. Nested map: roomData.fcmTokens
  if (roomData.fcmTokens && typeof roomData.fcmTokens === 'object') {
    for (const [key, val] of Object.entries(roomData.fcmTokens)) {
      if (key && senderId && senderId !== 'member' && key.toLowerCase() === senderId.toLowerCase()) continue;
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
      if (memberKey && senderId && senderId !== 'member' && memberKey.toLowerCase() === senderId.toLowerCase()) continue;
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
 * Sends a high-priority push notification to all flatmates in a room.
 */
async function sendToRoom(roomCode, title, body, senderId = '', customData = {}) {
  const cleanCode = String(roomCode).trim();
  const roomDoc = await db.collection('rooms').doc(cleanCode).get();
  if (!roomDoc.exists) {
    console.warn(`[FCM Server] Room #${cleanCode} not found in Firestore.`);
    return { successCount: 0, failureCount: 0 };
  }

  const roomData = roomDoc.data() || {};
  const tokenEntries = extractTokens(roomData, senderId);

  if (tokenEntries.length === 0) {
    console.log(`[FCM Server] No tokens registered in room #${cleanCode} (excluding sender: "${senderId || 'none'}").`);
    return { successCount: 0, failureCount: 0 };
  }

  const tokens = tokenEntries.map(e => e.token);
  console.log(`[FCM Server] Dispatching push to ${tokens.length} devices in room #${cleanCode}...`);

  const message = {
    tokens: tokens,
    notification: {
      title: title || 'Tiffin Tracker',
      body: body || 'New update in your flat'
    },
    data: {
      title: title || 'Tiffin Tracker',
      body: body || 'New update in your flat',
      roomCode: cleanCode,
      senderId: senderId || '',
      ...Object.fromEntries(Object.entries(customData).map(([k, v]) => [k, String(v)]))
    },
    android: {
      priority: 'high',
      notification: {
        channelId: 'tiffin_notifications',
        sound: 'default',
        priority: 'high',
        visibility: 'public'
      }
    }
  };

  const response = await messaging.sendEachForMulticast(message);
  console.log(`[FCM Server] Result for room #${cleanCode}: ${response.successCount} sent, ${response.failureCount} failed.`);

  // Cleanup invalid or unregistered tokens
  const keysToDelete = {};
  response.responses.forEach((result, idx) => {
    if (!result.success) {
      const errCode = result.error ? result.error.code : '';
      console.warn(`[FCM Server] Token ${tokenEntries[idx].key} failed with error:`, errCode);
      if (
        errCode === 'messaging/invalid-registration-token' ||
        errCode === 'messaging/registration-token-not-registered'
      ) {
        keysToDelete[tokenEntries[idx].key] = FieldValue.delete();
      }
    }
  });

  if (Object.keys(keysToDelete).length > 0) {
    await db.collection('rooms').doc(cleanCode).update(keysToDelete);
    console.log(`[FCM Server] Cleaned up ${Object.keys(keysToDelete).length} stale tokens from room #${cleanCode}.`);
  }

  return response;
}

// -----------------------------------------------------------------------------
// CLI & Daemon Runner
// -----------------------------------------------------------------------------
const args = process.argv.slice(2);

if (args.includes('--listen')) {
  console.log('===============================================================');
  console.log('[FCM Dispatcher Daemon] Running in real-time listener mode.');
  console.log('Listening for queued notifications across all rooms in Firestore...');
  console.log('Press Ctrl+C to exit.');
  console.log('===============================================================');

  db.collectionGroup('notifications')
    .where('dispatched', '==', false)
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(async change => {
        if (change.type === 'added') {
          const doc = change.doc;
          const data = doc.data();
          const roomRef = doc.ref.parent.parent;
          const roomCode = roomRef ? roomRef.id : data.roomCode;

          if (roomCode) {
            console.log(`[FCM Daemon] Processing notification "${data.title}" for room #${roomCode}...`);
            try {
              const res = await sendToRoom(
                roomCode,
                data.title || 'Tiffin Tracker',
                data.body || 'New update',
                data.senderId || '',
                data.data || {}
              );

              await doc.ref.update({
                dispatched: true,
                dispatchedAt: FieldValue.serverTimestamp(),
                successCount: res?.successCount || 0,
                failureCount: res?.failureCount || 0
              });
              console.log(`[FCM Daemon] Marked notification ${doc.id} as dispatched.`);
            } catch (err) {
              console.error(`[FCM Daemon] Failed to process notification ${doc.id}:`, err);
            }
          }
        }
      });
    }, error => {
      console.error('[FCM Daemon] Snapshot listener error:', error);
    });

} else if (args.includes('--test')) {
  console.log('[FCM Test] Running end-to-end test with first registered room...');
  db.collection('rooms').get().then(async snap => {
    let tested = false;
    for (const doc of snap.docs) {
      const roomData = doc.data();
      const tokens = extractTokens(roomData);
      if (tokens.length > 0) {
        console.log(`[FCM Test] Found room #${doc.id} with ${tokens.length} registered tokens.`);
        await sendToRoom(
          doc.id,
          'Tiffin Tracker Push Test 🍱',
          'Service account verified and push notifications connected successfully!'
        );
        tested = true;
        break;
      }
    }
    if (!tested) {
      console.log('[FCM Test] No rooms with registered tokens found.');
    }
    process.exit(0);
  }).catch(e => {
    console.error('[FCM Test] Error:', e);
    process.exit(1);
  });

} else if (args.includes('--room')) {
  const roomIdx = args.indexOf('--room') + 1;
  const roomCode = args[roomIdx];
  const titleIdx = args.indexOf('--title') + 1;
  const title = titleIdx > 0 ? args[titleIdx] : 'Tiffin Tracker';
  const bodyIdx = args.indexOf('--body') + 1;
  const body = bodyIdx > 0 ? args[bodyIdx] : 'New update in your flat';

  if (!roomCode) {
    console.error('[Error] Please specify a room code: --room <code');
    process.exit(1);
  }

  sendToRoom(roomCode, title, body).then(() => {
    console.log('[FCM Server] Done.');
    process.exit(0);
  }).catch(err => {
    console.error('[FCM Server] Error:', err);
    process.exit(1);
  });

} else {
  console.log('Tiffin Tracker FCM Dispatcher:');
  console.log('  node scripts/send-fcm-server.js --test');
  console.log('  node scripts/send-fcm-server.js --room <code> [--title "..."] [--body "..."]');
  console.log('  node scripts/send-fcm-server.js --listen');
  process.exit(0);
}
