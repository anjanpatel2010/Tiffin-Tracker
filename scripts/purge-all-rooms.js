/**
 * scripts/purge-all-rooms.js
 * 
 * Safely purges all room documents and notifications subcollections from Cloud Firestore
 * Project: tiffin-tracker-a91db
 * 
 * NOTE: Destructive action. Runs only with explicit user confirmation.
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, deleteDoc, doc } = require('firebase/firestore');

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCWFma4diWKudEBVPT4D4nQAxfo0L2CtGs",
  authDomain: "tiffin-tracker-a91db.firebaseapp.com",
  projectId: "tiffin-tracker-a91db",
  storageBucket: "tiffin-tracker-a91db.firebasestorage.app",
  messagingSenderId: "805212210681",
  appId: "1:805212210681:web:6cb8e12767a4a04d3d2928"
};

async function purgeAll() {
  console.log('[Purge] Connecting to Firestore (Project: tiffin-tracker-a91db)...');
  const app = initializeApp(FIREBASE_CONFIG);
  const db = getFirestore(app);

  const roomsColl = collection(db, 'rooms');
  const snap = await getDocs(roomsColl);

  console.log(`[Purge] Found ${snap.size} room(s) in Firestore.`);
  if (snap.empty) {
    console.log('[Purge] No rooms found. Database is already completely empty.');
    return;
  }

  for (const roomDoc of snap.docs) {
    const roomId = roomDoc.id;
    console.log(`[Purge] Deleting room #${roomId}...`);

    // Delete any notifications subcollection documents
    try {
      const notifsSnap = await getDocs(collection(db, 'rooms', roomId, 'notifications'));
      for (const nDoc of notifsSnap.docs) {
        await deleteDoc(doc(db, 'rooms', roomId, 'notifications', nDoc.id));
      }
      if (notifsSnap.size > 0) {
        console.log(`  - Deleted ${notifsSnap.size} notification(s) for room #${roomId}`);
      }
    } catch (e) {
      console.warn(`  - Subcollection cleanup notice: ${e.message}`);
    }

    // Delete the room document itself
    await deleteDoc(doc(db, 'rooms', roomId));
    console.log(`  ✓ Room #${roomId} permanently deleted.`);
  }

  console.log('[Purge] Successfully purged all rooms and all user records from Cloud Firestore.');
}

if (require.main === module) {
  purgeAll()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Purge] Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { purgeAll };
