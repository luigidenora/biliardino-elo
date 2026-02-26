import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth } from './_auth.js';
import { handleCorsPreFlight, setCorsHeaders } from './_cors.js';
import { redis } from './_redisClient.js';
import { sanitizeLogOutput, validateMatchTime } from './_validation.js';

async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  setCorsHeaders(res);
  if (handleCorsPreFlight(req, res)) return res;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { matchTime: rawMatchTime } = req.body as { matchTime?: string };

    if (!rawMatchTime) {
      return res.status(400).json({ error: 'Missing matchTime parameter' });
    }

    // Valida e sanitizza matchTime per prevenire injection
    const matchTime = validateMatchTime(rawMatchTime);

    const keys = await redis.keys(`availability:*`);

    if (keys.length > 0) {
      await Promise.all(keys.map(key => redis.del(key)));
    }

    console.log(`🗑️ Cancellate ${keys.length} conferme per match ${sanitizeLogOutput(matchTime)}`);

    return res.status(200).json({
      ok: true,
      deleted: keys.length,
      matchTime
    });
  } catch (err) {
    console.error('Errore cancellazione conferme:', err);
    return res.status(500).json({ error: 'Errore cancellazione conferme' });
  }
}

export default withAuth(handler, 'admin');
