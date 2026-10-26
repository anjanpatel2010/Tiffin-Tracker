module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY || 'BKdzxa4We0gIQMuW9gJedEKnTecB-PxOIS24zjIK4EFpScY5hXUsZu6n7rfKBnP_V-TMYO9NjxJlh8VnjWyoITM';
  res.status(200).json({ publicKey });
};
