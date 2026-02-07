import { redis } from './_redisClient.js';
import { withAuth } from './_auth.js';
import { handleCorsPreFlight, setCorsHeaders } from './_cors.js';

async function handler(req, res) {
  setCorsHeaders(res);
  if (handleCorsPreFlight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { matchTime } = req.body;

    if (!matchTime) {
      return res.status(400).json({ error: 'Missing matchTime parameter' });
    }

    const keys = await redis.keys(`availability:${matchTime}:*`);

    if (keys.length > 0) {
      await Promise.all(keys.map(key => redis.del(key)));
    }

    console.log(`🗑️ Cancellate ${keys.length} conferme per match ${matchTime}`);

    res.status(200).json({
      ok: true,
      deleted: keys.length,
      matchTime
    });
  } catch (err) {
    console.error('Errore cancellazione conferme:', err);
    res.status(500).json({ error: 'Errore cancellazione conferme' });
  }
}

export default withAuth(handler, 'admin');
