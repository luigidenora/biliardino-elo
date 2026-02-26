import { list } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCorsPreFlight, setCorsHeaders } from './_cors.js';
import { withSecurityMiddleware } from './_middleware.js';
import { redis } from './_redisClient.js';
import { sanitizeLogOutput, validateMatchTime, validatePlayerId } from './_validation.js';

interface SubscriptionData {
  subscription?: {
    endpoint: string;
    [key: string]: any;
  };
  playerId?: number;
  [key: string]: any;
}

async function findMatchingSubscription(playerId: number, incomingSubscription?: any): Promise<{ exists: boolean; matched: boolean }> {
  const { blobs } = await list({
    prefix: `${playerId}-subs/`,
    token: process.env.BLOB_READ_WRITE_TOKEN
  });

  if (!blobs.length) return { exists: false, matched: false };

  if (!incomingSubscription) {
    return { exists: true, matched: false };
  }

  const subscriptions = await Promise.all(
    blobs.map(async (b) => {
      const response = await fetch(b.url);
      return await response.json() as SubscriptionData;
    })
  );

  const incomingEndpoint = incomingSubscription?.endpoint;
  const matched = subscriptions.some((item) => item?.subscription?.endpoint === incomingEndpoint);

  return { exists: true, matched };
}

async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  setCorsHeaders(res);

  if (handleCorsPreFlight(req, res)) return res;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { playerId: rawPlayerId, matchTime: rawMatchTime, subscription } = req.body as {
      playerId?: string | number;
      matchTime?: string;
      subscription?: any;
    };

    if (!rawPlayerId || !rawMatchTime) {
      return res.status(400).json({ error: 'Missing playerId or matchTime' });
    }

    // Valida e sanitizza input per prevenire injection
    const playerIdNum = validatePlayerId(rawPlayerId);
    const matchTime = validateMatchTime(rawMatchTime);

    let parsedSubscription = subscription;
    if (typeof subscription === 'string') {
      try {
        parsedSubscription = JSON.parse(subscription);
      } catch {
        parsedSubscription = null;
      }
    }

    // const { exists, matched } = await findMatchingSubscription(playerIdNum, parsedSubscription);
    // if (!exists) {
    //   return res.status(401).json({ error: 'Nessuna subscription associata a questo utente' });
    // }
    // if (!matched) {
    //   return res.status(401).json({ error: 'Subscription non valida per questo utente' });
    // }

    const key = `availability:${playerIdNum}`;

    await redis.set(key, {
      playerId: playerIdNum,
      matchTime,
      confirmedAt: new Date().toISOString(),
      subscription: parsedSubscription
    }, {
      ex: 1800 // Expire dopo 30 minuti
    });

    const keys = await redis.keys(`availability:*`);
    const count = keys.length;

    console.log(`✅ Conferma da ${sanitizeLogOutput(String(playerIdNum))} per match ${sanitizeLogOutput(matchTime)} (totale: ${count})`);

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
