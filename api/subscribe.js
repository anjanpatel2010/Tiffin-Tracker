const fs = require('fs');
const path = require('path');

// Global memory cache across warm invocations
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
  if (globalSubs.has(key)) {
    return globalSubs.get(key);
  }

  // 3. /tmp fallback
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

  // 1. Upstash Redis / Vercel KV REST
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
    } catch (e) {
      console.warn('[KV set failed]', e.message);
    }
  }

  // 2. /tmp fallback
  try {
    const tmpFile = path.join('/tmp', `${key}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify(subs));
  } catch (e) {}
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    const room = (req.query.room || 'default').toLowerCase().trim();
    const subs = await getStoredSubs(room);
    return res.status(200).json({ count: subs.length, subscriptions: subs });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { roomCode, subscription, memberId, memberName } = req.body || {};
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Valid push subscription is required' });
    }

    const room = (roomCode || 'default').toLowerCase().trim();
    let subs = await getStoredSubs(room);

    // Filter out existing endpoint to prevent duplicate alerts
    subs = subs.filter(s => s.subscription?.endpoint !== subscription.endpoint && s.endpoint !== subscription.endpoint);

    subs.push({
      subscription,
      endpoint: subscription.endpoint,
      memberId: memberId || 'anonymous',
      memberName: memberName || 'Flatmate',
      updatedAt: Date.now()
    });

    if (subs.length > 50) subs = subs.slice(-50);

    await saveStoredSubs(room, subs);

    return res.status(200).json({
      success: true,
      message: 'Subscription registered for room #' + room,
      totalDevices: subs.length
    });
  } catch (err) {
    console.error('Subscription error:', err);
    return res.status(500).json({ error: err.message });
  }
};
