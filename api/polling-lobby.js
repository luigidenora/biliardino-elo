import { redis } from './_redisClient.js';
// import { withAuth } from './_auth.js';
import { handleCorsPreFlight, setCorsHeaders } from './_cors.js';

export default async function handler(req, res) {
  setCorsHeaders(res);
  if (handleCorsPreFlight(req, res)) return;
  try {
    const { time } = req.query;

    if (!time) {
      return res.status(400).json({ error: 'Missing time parameter' });
    }

    const keys = await redis.keys(`availability:${time}:*`);
    const confirmations = await Promise.all(
      keys.map(async (key) => {
        const data = await redis.get(key);
        return data;
      })
    );

    res.status(200).json({
      count: confirmations.length,
      confirmations: confirmations.filter(Boolean)
    });
  } catch (err) {
    console.error('Errore lettura confirmations:', err);
    res.status(500).json({ error: 'Errore lettura conferme' });
  }
}

// export default withAuth(handler, 'admin');
