import { kv } from '@vercel/kv';
import { handleCorsPreFlight, setCorsHeaders } from './_cors.js';

export default async function handler(req, res) {
  setCorsHeaders(res);
  if (handleCorsPreFlight(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { playerId, matchTime } = req.body;

    if (!playerId || !matchTime) {
      return res.status(400).json({ error: 'Missing playerId or matchTime' });
    }

    const key = `availability:${matchTime}:${playerId}`;

    await kv.set(key, {
      playerId,
      matchTime,
      confirmedAt: new Date().toISOString()
    }, {
      ex: 1800 // Expire dopo 30 minuti
    });

    const count = await kv.keys(`availability:${matchTime}:*`).then(keys => keys.length);

    console.log(`✅ Conferma da ${playerId} per match ${matchTime} (totale: ${count})`);

    res.status(200).json({ ok: true, count });
  } catch (err) {
    console.error('Errore conferma availability:', err);
    res.status(500).json({ error: 'Errore salvataggio conferma' });
  }
}
