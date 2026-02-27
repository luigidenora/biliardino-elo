import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth } from './_auth.js';
import { handleCorsPreFlight, setCorsHeaders } from './_cors.js';
import { prefixed, redis, redisRaw } from './_redisClient.js';

/**
 * API per cancellare messaggi chat e conferme della lobby (admin only)
 *
 * POST /api/admin-cleanup
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  setCorsHeaders(res);
  if (handleCorsPreFlight(req, res)) return res;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Clear messages
    const messagesKey = 'messages';
    const messageIds = await redis.lrange(messagesKey, 0, -1);

    for (const messageId of messageIds) {
      await redis.del(`message:${messageId}`);
    }
    await redis.del(messagesKey);

    // Clear confirmations (hash + sorted set)
    const confirmCount = await redisRaw.hlen(prefixed('availability'));
    const pipeline = redisRaw.pipeline();
    pipeline.del(prefixed('availability'));
    pipeline.del(prefixed('availability_ts'));
    await pipeline.exec();

    console.log(`Cleanup: ${messageIds.length} messaggi, ${confirmCount} conferme cancellate`);

    return res.status(200).json({
      ok: true,
      deletedMessages: messageIds.length,
      deletedConfirmations: confirmCount
    });
  } catch (error) {
    console.error('Errore admin-cleanup:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler, 'admin');
