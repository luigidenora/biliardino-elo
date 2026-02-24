import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateFishName } from './_fishNames.js';
import { redis, redisRaw } from './_redisClient.js';
// import { withAuth } from './_auth.js';
import { handleCorsPreFlight, setCorsHeaders } from './_cors.js';

interface Confirmation {
  playerId: number;
  confirmedAt: string;
  subscription?: any;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  setCorsHeaders(res);
  if (handleCorsPreFlight(req, res)) return res;

  try {
    const { time: rawTime } = req.query as { time?: string };

    // Retrieve all confirmations for the global lobby
    const keys = await redis.keys(`availability:*`);
    const confirmations = await Promise.all(
      keys.map(async (key) => {
        // `redis.keys()` ritorna chiavi già prefissate: usare `redisRaw` per evitare doppio prefisso
        const raw = await redisRaw.get(key as string) as unknown;
        if (!raw) return null;

        let data: Confirmation | null = null;

        if (typeof raw === 'string') {
          try {
            data = JSON.parse(raw) as Confirmation;
          } catch (e) {
            // Se non è JSON, potrebbe essere stato salvato come stringa semplice
            console.warn('Impossibile parse value Redis for', key, raw);
            return null;
          }
        } else if (typeof raw === 'object') {
          data = raw as Confirmation;
        }

        if (!data) return null;

        // Aggiungi nome pesce deterministico
        return {
          ...data,
          fishName: generateFishName(data.playerId)
        };
      })
    );

    return res.status(200).json({
      count: confirmations.filter(Boolean).length,
      confirmations: confirmations.filter(Boolean)
    });
  } catch (err) {
    console.error('Errore lettura confirmations:', err);
    return res.status(500).json({ error: 'Errore lettura conferme' });
  }
}

// export default withAuth(handler, 'admin');
