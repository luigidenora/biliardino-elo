import { list, put } from '@vercel/blob';
import { handleCorsPreFlight, setCorsHeaders } from './_cors.js';

function generateId(playerId, subscription) {
  const deviceHash = subscription.endpoint.slice(-20).replace(/[^a-zA-Z0-9]/g, '');
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `${playerId}-subs/${deviceHash}-${randomSuffix}.json`;
}

export default async function handler(req, res) {
  setCorsHeaders(res);
  if (handleCorsPreFlight(req, res)) return;
  if (req.method === 'POST') {
    try {
      const { subscription, playerId, playerName } = req.body;

      // Validazione input
      if (!subscription || !playerId || !playerName) {
        return res.status(400).json({ error: 'Missing subscription, playerId or playerName' });
      }

      // Validazione playerId sia un numero
      const playerIdNum = Number(playerId);
      if (isNaN(playerIdNum)) {
        return res.status(400).json({ error: 'playerId deve essere un numero' });
      }

      const key = generateId(playerIdNum, subscription);
      const data = {
        subscription,
        playerId: playerIdNum, // Salva come numero
        playerName,
        createdAt: new Date().toISOString()
      };

      const blob = await put(key, JSON.stringify(data), {
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN,
        contentType: 'application/json'
      });

      console.log('✅ Subscription salvata:', playerName, '(ID:', playerIdNum, ')');
      return res.status(201).json({ ok: true, url: blob.url, playerId: playerIdNum });
    } catch (err) {
      console.error('Errore salvataggio subscription:', err);
      return res.status(500).json({ error: 'Write error' });
    }
  }

  if (req.method === 'GET') {
    try {
      const { blobs } = await list({
        prefix: `${playerIdNum}-subs/`,
        token: process.env.BLOB_READ_WRITE_TOKEN
      });

      const subscriptions = await Promise.all(
        blobs.map(async (b) => {
          const res = await fetch(b.url);
          return await res.json();
        })
      );

      return res.status(200).json({ subscriptions });
    } catch (err) {
      console.error('Errore lettura subscriptions:', err);
      return res.status(500).json({ error: 'Read error' });
    }
  }

  res.status(405).end();
}
