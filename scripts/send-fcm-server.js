/**
 * Standalone Firebase Admin FCM Push Dispatcher
 * Can be run locally, in CI/CD, or as a background service on Render/Railway/VPS.
 * 
 * Usage:
 *   1. Download Service Account Key from Firebase Console:
 *      Project Settings -> Service accounts -> Generate new private key
 *      Save it as "service-account.json" in this directory.
 * 
 *   2. Run command:
 *      node scripts/send-fcm-server.js --room 1234 --title "Dinner Ready" --body "Paneer & Roti updated"
 * 
 *   3. Or run in daemon mode (listens to Firestore continuously):
 *      node scripts/send-fcm-server.js --listen
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.resolve(__dirname, '../service-account.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.log('----------------------------------------------------------------------');
  console.log('[Notice] service-account.json not found in root directory.');
  console.log('To run this standalone script or backend server:');
  console.log('1. Go to Firebase Console -> Project Settings -> Service accounts');
  console.log('2. Click "Generate new private key"');
  console.log('3. Save the downloaded JSON file as "service-account.json" in project root.');
  console.log('----------------------------------------------------------------------');
} else {
  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath))
  });
  console.log('[FCM Server] Firebase Admin SDK initialized successfully.');
}

async function sendToRoom(roomCode, title, body, senderId = '') {
  if (!admin.apps.length) {
    console.error('[FCM Server] Admin SDK not initialized. Missing service-account.json.');
    return;
  }

  const db = admin.firestore();
  const roomDoc = await db.collection('rooms').doc(String(roomCode)).get();
  if (!roomDoc.exists) {
    console.warn(`[FCM Server] Room #${roomCode} not found.`);
    return;
  }

  const roomData = roomDoc.data() || {};
  const tokens = [];
  const tokenMap = roomData.fcmTokens || {};

  for (const [memberKey, tokenEntry] of Object.entries(tokenMap)) {
    if (memberKey === senderId) continue;
    const token = typeof tokenEntry === 'string' ? tokenEntry : tokenEntry?.token;
    if (token && typeof token === 'string' && token.trim()) {
      tokens.push(token.trim());
    }
  }

  if (tokens.length === 0) {
    console.log(`[FCM Server] No tokens registered in room #${roomCode}.`);
    return;
  }

  console.log(`[FCM Server] Sending push to ${tokens.length} devices in room #${roomCode}...`);

  const message = {
    tokens: tokens,
    notification: { title, body },
    data: { title, body, roomCode: String(roomCode) },
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

  const response = await admin.messaging().sendEachForMulticast(message);
  console.log(`[FCM Server] Delivery result: ${response.successCount} sent, ${response.failureCount} failed.`);
}

// CLI Argument Handler
const args = process.argv.slice(2);
if (args.includes('--listen')) {
  if (!admin.apps.length) process.exit(1);
  console.log('[FCM Server] Listening for queued notifications in Firestore across all rooms...');
  admin.firestore().collectionGroup('notifications')
    .where('dispatched', '!=', true)
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const doc = change.doc;
          const data = doc.data();
          const roomRef = doc.ref.parent.parent;
          const roomCode = roomRef ? roomRef.id : '';
          if (roomCode) {
            sendToRoom(roomCode, data.title || 'Tiffin Tracker', data.body || 'New update', data.senderId)
              .then(() => doc.ref.update({ dispatched: true, dispatchedAt: admin.firestore.FieldValue.serverTimestamp() }))
              .catch(console.error);
          }
        }
      });
    });
} else if (args.includes('--room')) {
  const roomIdx = args.indexOf('--room') + 1;
  const roomCode = args[roomIdx];
  const titleIdx = args.indexOf('--title') + 1;
  const title = titleIdx > 0 ? args[titleIdx] : 'Tiffin Tracker Test';
  const bodyIdx = args.indexOf('--body') + 1;
  const body = bodyIdx > 0 ? args[bodyIdx] : 'Test notification from server script';

  if (roomCode) {
    sendToRoom(roomCode, title, body).then(() => process.exit(0)).catch(console.error);
  }
}
