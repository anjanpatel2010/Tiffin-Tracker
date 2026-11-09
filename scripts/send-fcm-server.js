/**
 * Tiffin Tracker - Standalone FCM Push Notification Dispatcher & Server
 * Implements Google FCM HTTP v1 API with Firebase Admin SDK and Service Account authentication.
 * 
 * Features:
 * 1. Live Firestore Queue Listener: Listens for notifications enqueued by mobile clients and dispatches instantly.
 * 2. HTTP REST API Server (matching FCM v1 backend architecture):
 *    - POST /send: Sends 1-to-1 or room-targeted push notifications
 *    - POST /broadcast: Sends topic or broadcast notifications
 *    - GET /health: Health check and connectivity diagnostics
 * 3. Automatic Token Cleanup: Invalid/unregistered tokens are purged from Firestore automatically.
 * 4. CLI Runner: --test, --room <code>, --serve
 * 
 * Usage:
 *   node scripts/send-fcm-server.js            (Starts Queue Listener + HTTP Server on port 8080)
 *   node scripts/send-fcm-server.js --test     (Runs end-to-end FCM delivery test)
 *   node scripts/send-fcm-server.js --room 4188 --title "Dinner" --body "Roti ready"
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.resolve(__dirname, '../service-account.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('[Error] service-account.json not found in root directory.');
  console.error('Please ensure service-account.json is present in the project root.');
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

console.log(`[FCM Server] Initialized with Google Cloud project: ${serviceAccount.project_id}`);

/**
 * Extracts recipient FCM device tokens from room document data.
 * Supports both nested fcmTokens map and top-level fcmTokens.<member> dotted keys.
 */
function extractTokens(roomData, senderId = '') {
  const result = [];
  const senderClean = (senderId || '').trim().toLowerCase();

  // 1. Nested map: roomData.fcmTokens
  if (roomData.fcmTokens && typeof roomData.fcmTokens === 'object') {
    for (const [key, val] of Object.entries(roomData.fcmTokens)) {
      if (key && senderClean && senderClean !== 'member' && key.toLowerCase() === senderClean) {
        continue; // Exclude sender from receiving their own action
      }
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
      if (memberKey && senderClean && senderClean !== 'member' && memberKey.toLowerCase() === senderClean) {
        continue;
      }
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
 * Dispatches high-priority FCM notification to an array of tokens using Firebase Admin HTTP v1.
 */
async function sendToTokens(tokens, title, body, senderId = '', roomCode = '', customData = {}) {
  if (!tokens || tokens.length === 0) {
    return { successCount: 0, failureCount: 0, responses: [] };
  }

  const message = {
    tokens: tokens,
    notification: {
      title: title || 'Tiffin Tracker 🍲',
      body: body || 'New update in your flat'
    },
    data: {
      title: title || 'Tiffin Tracker 🍲',
      body: body || 'New update in your flat',
      roomCode: String(roomCode || ''),
      senderId: String(senderId || ''),
      timestamp: String(Date.now()),
      actionUrl: '#view-logger',
      ...Object.fromEntries(
        Object.entries(customData || {}).map(([k, v]) => [k, String(v)])
      )
    },
    android: {
      priority: 'high',
      notification: {
        channelId: 'tiffin_notifications',
        sound: 'default',
        priority: 'high',
        visibility: 'public',
        defaultSound: true,
        defaultVibrateTimings: true
      }
    }
  };

  const response = await messaging.sendEachForMulticast(message);
  return response;
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
    console.log(`[FCM Server] No recipient tokens in room #${cleanCode} (excluding sender: "${senderId || 'none'}").`);
    return { successCount: 0, failureCount: 0 };
  }

  const tokens = tokenEntries.map(e => e.token);
  console.log(`[FCM Server] Dispatching push to ${tokens.length} flatmates in room #${cleanCode}...`);

  const response = await sendToTokens(tokens, title, body, senderId, cleanCode, customData);
  console.log(`[FCM Server] Result for room #${cleanCode}: ${response.successCount} sent, ${response.failureCount} failed.`);

  // Cleanup invalid or unregistered tokens automatically
  const keysToDelete = {};
  response.responses.forEach((result, idx) => {
    if (!result.success) {
      const errCode = result.error ? result.error.code : '';
      console.warn(`[FCM Server] Token ${tokenEntries[idx].key} failed:`, errCode);
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

/**
 * Real-time Firestore Notification Queue Listener (Background Dispatcher)
 */
function startQueueListener() {
  console.log('[FCM Queue] Listening for queued notifications across all rooms in Firestore...');

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
            console.log(`[FCM Queue] Processing notification "${data.title}" for room #${roomCode}...`);
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
              console.log(`[FCM Queue] Marked notification ${doc.id} as dispatched.`);
            } catch (err) {
              console.error(`[FCM Queue] Failed to process notification ${doc.id}:`, err);
            }
          }
        }
      });
    }, error => {
      console.error('[FCM Queue] Snapshot listener error:', error);
    });
}

/**
 * Lightweight HTTP REST API Server
 */
function startHttpServer(port = 8080) {
  const server = http.createServer(async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // Health check endpoint
    if (req.method === 'GET' && (pathname === '/' || pathname === '/health')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        service: 'tiffin-tracker-fcm-server',
        project: serviceAccount.project_id,
        timestamp: Date.now()
      }));
      return;
    }

    // Read JSON body for POST endpoints
    if (req.method === 'POST') {
      let bodyStr = '';
      req.on('data', chunk => { bodyStr += chunk; });
      req.on('end', async () => {
        let body = {};
        try {
          body = bodyStr ? JSON.parse(bodyStr) : {};
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
          return;
        }

        try {
          // 1. Direct message endpoint (POST /send)
          if (pathname === '/send') {
            const { to, roomCode, title, body: msgBody, notification, senderId, data } = body;
            const notifTitle = title || notification?.title || 'Tiffin Tracker 🍲';
            const notifText = msgBody || notification?.body || 'New message';

            if (to && to.length > 20) {
              // Direct single token send
              const singleMsg = {
                token: to,
                notification: { title: notifTitle, body: notifText },
                data: Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, String(v)])),
                android: {
                  priority: 'high',
                  notification: { channelId: 'tiffin_notifications', sound: 'default', priority: 'high', visibility: 'public' }
                }
              };
              const msgId = await messaging.send(singleMsg);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, messageId: msgId }));
              return;
            } else if (roomCode) {
              // Send to all flatmates in room
              const result = await sendToRoom(roomCode, notifTitle, notifText, senderId, data);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, ...result }));
              return;
            } else {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing "to" (device token) or "roomCode"' }));
              return;
            }
          }

          // 2. Broadcast / Topic endpoint (POST /broadcast)
          if (pathname === '/broadcast') {
            const { topic = 'tiffin_broadcast', title, body: msgBody, notification, data } = body;
            const notifTitle = title || notification?.title || 'Tiffin Tracker 🍲';
            const notifText = msgBody || notification?.body || 'Announcement';

            const topicMsg = {
              topic: topic,
              notification: { title: notifTitle, body: notifText },
              data: Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, String(v)])),
              android: {
                priority: 'high',
                notification: { channelId: 'tiffin_notifications', sound: 'default', priority: 'high', visibility: 'public' }
              }
            };
            const msgId = await messaging.send(topicMsg);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, messageId: msgId }));
            return;
          }

          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Endpoint not found' }));
        } catch (postErr) {
          console.error('[HTTP API] Error processing request:', postErr);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: postErr.message }));
        }
      });
      return;
    }

    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
  });

  server.listen(port, () => {
    console.log(`[FCM Server] HTTP REST API listening on port ${port} (endpoints: POST /send, POST /broadcast, GET /health)`);
  });
}

// -----------------------------------------------------------------------------
// CLI Runner & Entry Point
// -----------------------------------------------------------------------------
const args = process.argv.slice(2);

if (args.includes('--test')) {
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
          'Service account verified and FCM HTTP v1 push notifications working perfectly!'
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
  const title = titleIdx > 0 ? args[titleIdx] : 'Tiffin Tracker 🍲';
  const bodyIdx = args.indexOf('--body') + 1;
  const body = bodyIdx > 0 ? args[bodyIdx] : 'New update in your flat mess';

  if (!roomCode) {
    console.error('[Error] Please specify a room code: --room <code>');
    process.exit(1);
  }

  sendToRoom(roomCode, title, body).then(() => {
    console.log('[FCM Server] Dispatched.');
    process.exit(0);
  }).catch(err => {
    console.error('[FCM Server] Error:', err);
    process.exit(1);
  });

} else {
  // Default mode: start both real-time queue listener and HTTP server
  const port = process.env.PORT || 8080;
  console.log('===============================================================');
  console.log('[FCM Dispatcher] Running in full-stack mode.');
  console.log(`1. Firestore Real-time Queue Listener: ACTIVE`);
  console.log(`2. HTTP REST API Server: Port ${port}`);
  console.log('===============================================================');

  startQueueListener();
  startHttpServer(port);
}
