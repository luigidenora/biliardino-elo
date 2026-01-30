import { list } from '@vercel/blob';
import { handleCorsPreFlight } from './_cors.js';
import { redis } from './_redisClient.js';

async function findMatchingSubscription(playerId, incomingSubscription) {
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
      return await response.json();
    })
  );

  const incomingEndpoint = incomingSubscription?.endpoint;
  const matched = subscriptions.some((item) => item?.subscription?.endpoint === incomingEndpoint);

  return { exists: true, matched };
}

export default async function handler(req, res) {
  // setCorsHeaders(res);

  if (handleCorsPreFlight(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { playerId, matchTime, subscription } = req.body;

    if (!playerId || !matchTime) {
      return res.status(400).json({ error: 'Missing playerId or matchTime' });
    }

    const playerIdNum = Number(playerId);
    if (Number.isNaN(playerIdNum)) {
      return res.status(400).json({ error: 'playerId deve essere un numero' });
    }

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
    // }y
    // if (!matched) {
    //   return res.status(401).json({ error: 'Subscription non valida per questo utente' });
    // }

    const key = `availability:${matchTime}:${playerIdNum}`;

    await redis.set(key, {
      playerId: playerIdNum,
      matchTime,
      confirmedAt: new Date().toISOString(),
      subscription: parsedSubscription
    }, {
      ex: 1800 // Expire dopo 30 minuti
    });

    const keys = await redis.keys(`availability:${matchTime}:*`);
    const count = keys.length;

    console.log(`✅ Conferma da ${playerId} per match ${matchTime} (totale: ${count})`);

    res.status(200).json({ ok: true, count });
  } catch (err) {
    console.error('Errore conferma availability:', err);
    res.status(500).json({ error: 'Errore salvataggio conferma' });
  }
}

// export default withAuth(handler, 'admin');
