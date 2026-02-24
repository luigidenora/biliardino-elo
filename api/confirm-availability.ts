import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCorsPreFlight, setCorsHeaders } from './_cors.js';
import { withSecurityMiddleware } from './_middleware.js';
import { redis } from './_redisClient.js';
import { sanitizeLogOutput, validatePlayerId } from './_validation.js';

interface SubscriptionData {
  subscription?: {
    endpoint: string;
    [key: string]: any;
  };
  playerId?: number;
  [key: string]: any;
}

async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  setCorsHeaders(res);

  if (handleCorsPreFlight(req, res)) return res;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { playerId: rawPlayerId, subscription } = req.body as {
      playerId?: string | number;
      subscription?: any;
    };

    if (!rawPlayerId) {
      return res.status(400).json({ error: 'Missing playerId' });
    }

    // Valida e sanitizza input per prevenire injection
    const playerIdNum = validatePlayerId(rawPlayerId);

    let parsedSubscription = subscription;
    if (typeof subscription === 'string') {
      try {
        parsedSubscription = JSON.parse(subscription);
      } catch {
        parsedSubscription = null;
      }
    }


    const key = `availability:${playerIdNum}`;

    await redis.set(key, {
      playerId: playerIdNum,
      confirmedAt: new Date().toISOString(),
      subscription: parsedSubscription
    }, {
      ex: 5400 // Expire dopo 90 minuti
    });

    const keys = await redis.keys(`availability:*`);
    const count = keys.length;

    console.log(`✅ Conferma da ${sanitizeLogOutput(String(playerIdNum))} (totale: ${count})`);

    return res.status(200).json({ ok: true, count });
  } catch (err) {
    console.error('Errore conferma availability:', err);
    return res.status(500).json({ error: 'Errore salvataggio conferma' });
  }
}

// Applica security middleware per protezione Node.js
export default withSecurityMiddleware(handler, {
  maxPayloadSize: 10 * 1024, // 10KB
  timeout: 10000 // 10s
});

// export default withAuth(handler, 'admin');
