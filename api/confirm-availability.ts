import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCorsPreFlight, setCorsHeaders } from './_cors.js';
import { withSecurityMiddleware } from './_middleware.js';
import { prefixed, redisRaw } from './_redisClient.js';
import { sanitizeLogOutput, validatePlayerId } from './_validation.js';

async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  setCorsHeaders(res);

  if (handleCorsPreFlight(req, res)) return res;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { playerId: rawPlayerId } = req.body as {
      playerId?: string | number;
    };

    if (!rawPlayerId) {
      return res.status(400).json({ error: 'Missing playerId' });
    }

    // Valida e sanitizza input per prevenire injection
    const playerIdNum = validatePlayerId(rawPlayerId);

    const availabilityKey = 'availability';
    const field = String(playerIdNum);
    const confirmedAt = new Date().toISOString();
    const valueObj = { playerId: playerIdNum, confirmedAt };
    const ts = Math.floor(Date.now() / 1000);

    // Usa pipeline per operazioni atomiche e migliori performance
    const pipeline = redisRaw.pipeline();

    // Salva nello hash globale (una singola chiave) per ridurre richieste
    pipeline.hset(prefixed(availabilityKey), {
      [field]: JSON.stringify(valueObj)
    });

    // Aggiungi index temporale per cleanup TTL (score = epoch seconds)
    pipeline.zadd(prefixed('availability_ts'), { score: ts, member: field });

    // Conta le conferme con HLEN (incluso nel pipeline per consistency)
    pipeline.hlen(prefixed(availabilityKey));

    // Esegui tutte le operazioni in un singolo HTTP request
    // Upstash pipeline lancia eccezione se un comando fallisce
    const results = await pipeline.exec();

    // results è un array di valori diretti: [hset_result, zadd_result, hlen_result]
    const count = results[2] as number;

    // Pubblica evento per aggiornamenti realtime (non critico, fuori dal pipeline)
    try {
      // Publish on a stable topic name (no env prefix) so clients can subscribe
      await redisRaw.publish('availability_events', JSON.stringify({ playerId: playerIdNum, confirmedAt }));
    } catch (e) {
      // Non bloccare l'operazione se publish fallisce
      console.warn('Publish availability event fallito:', (e as Error).message || e);
    }

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
