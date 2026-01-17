import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  try {
    const { time } = req.query;

    if (!time) {
      return res.status(400).json({ error: 'Missing time parameter' });
    }

    const keys = await kv.keys(`availability:${time}:*`);
    const confirmations = await Promise.all(
      keys.map(async (key) => {
        const data = await kv.get(key);
        return data;
      })
    );

    res.status(200).json({
      count: confirmations.length,
      confirmations: confirmations.filter(Boolean)
    });
  } catch (err) {
    console.error('❌ Errore lettura confirmations:', err);
    res.status(500).json({ error: 'Errore lettura conferme' });
  }
}
