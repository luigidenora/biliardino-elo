import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { IMessage } from '../src/models/message.interface.js';
import { handleCorsPreFlight, setCorsHeaders } from './_cors.js';
import { redis } from './_redisClient.js';
import { validatePlayerId, validateString } from './_validation.js';

interface SendMessageBody {
  playerId: number;
  playerName: string;
  fishType: string;
  text: string;
  sentAt: number;
  timestamp: string;
}

/**
 * API per inviare un messaggio chat durante la conferma
 *
 * POST /api/send-message
 * Body: SendMessageBody
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  setCorsHeaders(res);
  if (handleCorsPreFlight(req, res)) return res;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { playerId, playerName, fishType, text, sentAt, timestamp } = req.body as SendMessageBody;

    // Validazioni
    if (!validatePlayerId(playerId)) {
      return res.status(400).json({ error: 'Invalid playerId' });
    }
    if (!validateString(playerName, 'playerName', 100)) {
      return res.status(400).json({ error: 'Invalid playerName' });
    }
    if (!validateString(fishType, 'fishType', 20)) {
      return res.status(400).json({ error: 'Invalid fishType' });
    }
    if (!validateString(text, 'text', 500)) {
      return res.status(400).json({ error: 'Message must be 1-500 chars' });
    }

    // Validazione lunghezza parole (max 6)
    const wordCount = text.trim().split(/\s+/).length;
    if (wordCount > 6) {
      return res.status(400).json({ error: 'Message must be max 6 words' });
    }

    const messageId = `${playerId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const message: IMessage = {
      id: messageId,
      playerId,
      playerName,
      fishType: fishType as any,
      text,
      sentAt,
      timestamp
    };

    // Chiave Redis per i messaggi globali della lobby
    const messagesKey = `messages`;
    const messageDataKey = `message:${messageId}`;

    // Salva il messaggio
    await redis.set(messageDataKey, JSON.stringify(message), { ex: 240 }); // TTL 4 minuti
    await redis.lpush(messagesKey, messageId); // Aggiungi a lista
    await redis.expire(messagesKey, 240); // TTL 4 minuti per la lista

    // Incrementa counter globale per la chat
    await redis.incr(`message-count`);

    return res.status(201).json(message);
  } catch (error) {
    console.error('❌ Errore send-message:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default handler;
