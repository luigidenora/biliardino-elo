import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { IMessage } from '../src/models/message.interface.js';
import { handleCorsPreFlight, setCorsHeaders } from './_cors.js';
import { generateFishName } from './_fishNames.js';
import { withSecurityMiddleware } from './_middleware.js';
import { prefixed, redis, redisRaw } from './_redisClient.js';

interface Confirmation {
  playerId: number;
  confirmedAt: string;
}

/**
 * Unified Lobby API — returns full lobby state in a single call.
 *
 * GET /api/lobby
 *
 * Response: {
 *   exists: boolean,
 *   ttl: number,
 *   match: IRunningMatchDTO | null,
 *   count: number,
 *   confirmations: Array<Confirmation & { fishName: string }>,
 *   messages: IMessage[],
 *   messageCount: number
 * }
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  setCorsHeaders(res);
  if (handleCorsPreFlight(req, res)) return res;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fetch lobby registry, confirmations, and message IDs in parallel
    const [lobbyData, rawMap, messageIds] = await Promise.all([
      redis.get('lobby') as Promise<Record<string, unknown> | null>,
      redisRaw.hgetall(prefixed('availability')) as Promise<Record<string, string> | null>,
      redis.lrange('messages', 0, -1) as Promise<string[]>
    ]);

    // ── Lobby existence & TTL ────────────────────────────────
    const exists = lobbyData !== null;
    let ttl = 0;
    if (exists) {
      ttl = await redis.ttl('lobby');
    }

    // Extract match data (if present)
    const match = (lobbyData && typeof lobbyData === 'object' && 'match' in lobbyData)
      ? lobbyData.match
      : null;

    // ── Confirmations ────────────────────────────────────────
    const confirmations = Object.values(rawMap || {}).map((v) => {
      try {
        const data = (typeof v === 'string' ? JSON.parse(v) : v) as Confirmation;
        return {
          ...data,
          fishName: generateFishName(data.playerId)
        };
      } catch {
        return null;
      }
    }).filter(Boolean) as Array<Confirmation & { fishName: string }>;

    // ── Messages ─────────────────────────────────────────────
    const messages: IMessage[] = [];
    if (messageIds.length > 0) {
      const messagePromises = messageIds.map(id => redis.get<IMessage>(`message:${id}`));
      const results = await Promise.all(messagePromises);
      for (const msg of results) {
        if (msg) messages.push(msg);
      }
    }

    return res.status(200).json({
      exists,
      ttl,
      match,
      count: confirmations.length,
      confirmations,
      messages,
      messageCount: messages.length
    });
  } catch (error) {
    console.error('Errore lobby:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withSecurityMiddleware(handler);
