const webpush = require('web-push');
const fs = require('fs');
const path = require('path');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BKdzxa4We0gIQMuW9gJedEKnTecB-PxOIS24zjIK4EFpScY5hXUsZu6n7rfKBnP_V-TMYO9NjxJlh8VnjWyoITM';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'DdfUDUbFdDaV3qIug5jeHknjuVA21Epi8pMmoo7G_sk';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@tiffin-tracker.app';

try {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (e) {
  console.warn('VAPID setup warning:', e.message);
}

const globalSubs = global.__tiffin_subs || new Map();
global.__tiffin_subs = globalSubs;

async function getStoredSubs(roomCode) {
  const key = `tiffin_push_${roomCode.toLowerCase()}`;
  // 1. Upstash Redis / Vercel KV REST
  const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (kvUrl && kvToken) {
    try {
      const res = await fetch(`${kvUrl}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${kvToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.result) {
          const parsed = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
          return Array.isArray(parsed) ? parsed : [];
        }
      }
    } catch (e) {
      console.warn('[KV get failed]', e.message);
    }
  }

  // 2. Memory
  if (globalSubs.has(key)) return globalSubs.get(key);

  // 3. /tmp
  try {
    const tmpFile = path.join('/tmp', `${key}.json`);
    if (fs.existsSync(tmpFile)) {
      return JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    }
  } catch (e) {}

  return [];
}

async function saveStoredSubs(roomCode, subs) {
  const key = `tiffin_push_${roomCode.toLowerCase()}`;
  globalSubs.set(key, subs);

  const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (kvUrl && kvToken) {
    try {
      await fetch(`${kvUrl}/set/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${kvToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(JSON.stringify(subs))
      });
    } catch (e) {}
  }

  try {
    const tmpFile = path.join('/tmp', `${key}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify(subs));
  } catch (e) {}
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      roomCode,
      title = 'Tiffin Tracker 🍲',
      body = 'New update from flatmates!',
      tag = 'tiffin-alert',
      url = './#view-poll',
      senderEndpoint = null,
      additionalSubscriptions = []
    } = req.body || {};

    const room = (roomCode || 'default').toLowerCase().trim();
    const storedSubs = await getStoredSubs(room);

    // Merge stored subscriptions and any direct room subscriptions provided in the call
    const allCandidates = [...storedSubs];
    if (Array.isArray(additionalSubscriptions)) {
      additionalSubscriptions.forEach(sub => {
        const ep = sub?.endpoint || sub?.subscription?.endpoint;
        if (ep && !allCandidates.some(c => (c.endpoint || c.subscription?.endpoint) === ep)) {
          allCandidates.push(sub.subscription ? sub : { subscription: sub, endpoint: ep });
        }
      });
    }

    if (allCandidates.length === 0) {
      return res.status(200).json({
        success: true,
        sent: 0,
        message: 'No registered devices in room #' + room
      });
    }

    const payload = JSON.stringify({
      title,
      body,
      tag,
      url,
      timestamp: Date.now()
    });

    const expiredEndpoints = new Set();
    let successCount = 0;

    await Promise.all(
      allCandidates.map(async (record) => {
        const sub = record.subscription || record;
        const endpoint = sub.endpoint;

        // Skip sending push back to the author's own device if provided
        if (senderEndpoint && endpoint === senderEndpoint) {
          return;
        }

        try {
          await webpush.sendNotification(sub, payload, {
            TTL: 60 * 60 * 4, // 4 hours retention
            urgency: 'high'
          });
          successCount++;
        } catch (err) {
          console.warn('Web push delivery error:', err.statusCode, err.message);
          // 404 or 410 means subscription has expired or user revoked permission
          if (err.statusCode === 404 || err.statusCode === 410) {
            expiredEndpoints.add(endpoint);
          }
        }
      })
    );

    // Clean up expired subscriptions
    if (expiredEndpoints.size > 0) {
      const activeSubs = storedSubs.filter(s => !expiredEndpoints.has(s.endpoint || s.subscription?.endpoint));
      await saveStoredSubs(room, activeSubs);
    }

    return res.status(200).json({
      success: true,
      sent: successCount,
      failed: allCandidates.length - successCount,
      totalDevices: allCandidates.length
    });
  } catch (err) {
    console.error('send-push failure:', err);
    return res.status(500).json({ error: err.message });
  }
};
