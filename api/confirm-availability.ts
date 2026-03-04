import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCorsPreFlight, setCorsHeaders } from './_cors.js';
import { withSecurityMiddleware } from './_middleware.js';
import { lobbyChannel } from './_realtime.js';
import { prefixed, redisRaw } from './_redisClient.js';
import { sanitizeLogOutput, validatePlayerId } from './_validation.js';

async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  setCorsHeaders(res);

  if (handleCorsPreFlight(req, res)) return res;

  if (req.method === 'DELETE') {
    try {
      const { playerId: rawPlayerId } = req.body as { playerId?: string | number };
      if (!rawPlayerId) return res.status(400).json({ error: 'Missing playerId' });
      const playerIdNum = validatePlayerId(rawPlayerId);
      const field = String(playerIdNum);
      const pipeline = redisRaw.pipeline();
      pipeline.hdel(prefixed('availability'), field);
      pipeline.zrem(prefixed('availability_ts'), field);
      await pipeline.exec();
      try {
        await lobbyChannel().emit('lobby.confirmation_remove', { playerId: playerIdNum, timestamp: Date.now() });
      } catch (e) {
        console.warn('Emit cancel event fallito:', (e as Error).message || e);
      }
      console.log(`❌ Cancellazione conferma da ${sanitizeLogOutput(String(playerIdNum))}`);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Errore cancellazione conferma:', err);
      return res.status(500).json({ error: 'Errore cancellazione conferma' });
    }
  }

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

    // Pipeline unico: hset + zadd + hlen + ttl(lobby) — 1 solo HTTP request verso Upstash
    const pipeline = redisRaw.pipeline();

    pipeline.hset(prefixed(availabilityKey), { [field]: JSON.stringify(valueObj) });
    pipeline.zadd(prefixed('availability_ts'), { score: ts, member: field });
    pipeline.hlen(prefixed(availabilityKey));
    pipeline.ttl(prefixed('lobby')); // legge TTL lobby nello stesso batch

    const [hsetResult, zaddResult, availabilityCount, lobbyTtl] = await pipeline.exec() as [unknown, unknown, number, number];
    // hsetResult e zaddResult non sono usati, ma restano per mantenere l'allineamento con il pipeline.
    const count = availabilityCount;

    // Se la lobby è attiva, allinea il TTL delle chiavi availability in un secondo pipeline
    if (lobbyTtl > 0) {
      try {
        const expirePipeline = redisRaw.pipeline();
        expirePipeline.expire(prefixed(availabilityKey), lobbyTtl);
        expirePipeline.expire(prefixed('availability_ts'), lobbyTtl);
        await expirePipeline.exec();
      } catch (e) {
        console.warn('Impossibile impostare TTL availability:', (e as Error).message || e);
      }
    }

    // Emetti evento per aggiornamenti realtime (non critico, fuori dal pipeline)
    try {
      await lobbyChannel().emit('lobby.confirmation_add', { playerId: playerIdNum, timestamp: Date.now() });
    } catch (e) {
      // Non bloccare l'operazione se emit fallisce
      console.warn('Emit availability event fallito:', (e as Error).message || e);
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
