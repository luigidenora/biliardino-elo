import { list, put } from '@vercel/blob';

function generateId(endpoint) {
  const base = endpoint.slice(-30).replace(/[^a-zA-Z0-9]/g, '');
  const rand = Math.floor(Math.random() * 1e6);
  return `biliardino-subs/${base}-${Date.now()}-${rand}.json`;
}

export default async function handler(req, res) {
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

      const key = generateId(subscription.endpoint);
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
      console.error('❌ Errore salvataggio subscription:', err);
      return res.status(500).json({ error: 'Write error' });
    }
  }

  if (req.method === 'GET') {
    try {
      const { blobs } = await list({
        prefix: 'biliardino-subs/',
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
      console.error('❌ Errore lettura subscriptions:', err);
      return res.status(500).json({ error: 'Read error' });
    }
  }

  res.status(405).end();
}
