import { del, list, put } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'crypto';
import { handleCorsPreFlight, setCorsHeaders } from './_cors.js';
import { withSecurityMiddleware } from './_middleware.js';
import { sanitizeLogOutput, validatePlayerId, validateString } from './_validation.js';

interface PushSubscription {
  endpoint: string;
  keys?: {
    p256dh: string;
    auth: string;
  };
  [key: string]: any;
}

interface SubscriptionData {
  subscription: PushSubscription;
  playerId: number;
  playerName: string;
  createdAt: string;
}

function generateId(playerId: number, subscription: PushSubscription): string {
  const deviceHash = createHash('sha256').update(subscription.endpoint).digest('hex').slice(0, 16);
  return `${playerId}-subs/${deviceHash}.json`;
}

async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  setCorsHeaders(res);
  if (handleCorsPreFlight(req, res)) return res;

  if (req.method === 'POST') {
    try {
      const body = req.body as {
        subscription?: PushSubscription;
        playerId?: string | number;
        playerName?: string;
        verify?: boolean;
      };

      // If client only wants to verify whether the local subscription exists on server,
      // handle that server-side without returning the list of server endpoints.
      if (body.verify) {
        const { subscription, playerId: rawPlayerId } = body;
        if (!subscription || !rawPlayerId) {
          return res.status(400).json({ error: 'Missing subscription or playerId for verification' });
        }

        const endpointValue = subscription.endpoint;
        if (!endpointValue) return res.status(400).json({ error: 'Missing subscription endpoint' });

        // Compute same device hash used when saving subscriptions and look for a matching blob
        const deviceHash = createHash('sha256').update(endpointValue).digest('hex').slice(0, 16);
        const targetPathname = `${deviceHash}.json`;

        const { blobs } = await list();
        const matching = blobs.filter(b => b.pathname === targetPathname || b.pathname.endsWith(targetPathname));

        return res.status(200).json({ exists: matching.length > 0, count: matching.length });
      }

      const { subscription, playerId: rawPlayerId, playerName: rawPlayerName } = body;

      // Validazione input for create
      if (!subscription || !rawPlayerId || !rawPlayerName) {
        return res.status(400).json({ error: 'Missing subscription, playerId or playerName' });
      }

      // Valida e sanitizza input
      const playerIdNum = validatePlayerId(rawPlayerId);
      const playerName = validateString(rawPlayerName, 'playerName', 100);

      const key = generateId(playerIdNum, subscription);
      const data: SubscriptionData = {
        subscription,
        playerId: playerIdNum, // Salva come numero
        playerName,
        createdAt: new Date().toISOString()
      };

      const blob = await put(key, JSON.stringify(data), {
        access: 'public',
        contentType: 'application/json',
        allowOverwrite: true // Permetti sovrascrittura per aggiornamenti della stessa subscription
      });

      console.log('✅ Subscription salvata:', sanitizeLogOutput(playerName), '(ID:', playerIdNum, ')');
      // Do not return blob.url to client to avoid exposing endpoints
      return res.status(201).json({ ok: true, playerId: playerIdNum });
    } catch (err) {
      console.error('Errore salvataggio subscription:', err);
      return res.status(500).json({ error: 'Write error' });
    }
  }

  if (req.method === 'GET') {
    try {
      const { playerId: rawPlayerId } = req.query as { playerId?: string };

      if (!rawPlayerId) {
        return res.status(400).json({ error: 'Missing playerId parameter' });
      }

      // Valida playerId
      const playerIdNum = validatePlayerId(rawPlayerId);

      const { blobs } = await list({
        prefix: `${playerIdNum}-subs/`
      });

      // Since blobs are public at storage level, avoid returning raw URLs or payloads
      const subscriptionsMeta = blobs.map(b => ({
        pathname: b.pathname,
        size: (b as any).size ?? null,
        lastModified: (b as any).lastModified ?? null
      }));

      return res.status(200).json({ subscriptions: subscriptionsMeta });
    } catch (err) {
      console.error('Errore lettura subscriptions:', err);
      return res.status(500).json({ error: 'Read error' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { playerId: rawPlayerId, subscription, endpoint } = req.body as {
        playerId?: string | number;
        subscription?: PushSubscription;
        endpoint?: string;
      };

      if (!rawPlayerId || (!subscription && !endpoint)) {
        return res.status(400).json({ error: 'Missing playerId or subscription/endpoint' });
      }

      const playerIdNum = validatePlayerId(rawPlayerId);

      const endpointValue = endpoint ?? subscription?.endpoint;
      if (!endpointValue) {
        return res.status(400).json({ error: 'Missing subscription endpoint' });
      }

      // Compute device hash same as generateId
      const deviceHash = createHash('sha256').update(endpointValue).digest('hex').slice(0, 16);
      const targetPathname = `${deviceHash}.json`;

      const { blobs } = await list();

      const found = blobs.filter(b => b.pathname === targetPathname || b.pathname.endsWith(targetPathname));
      if (!found.length) {
        return res.status(404).json({ error: 'Subscription not found' });
      }

      // Delete the blob
      try {
        await del(found.map(b => b.url));
      } catch (err) {
        console.error('Errore cancellazione subscription blob:', err);
        return res.status(500).json({ error: 'Delete error' });
      }

      console.log('🗑️ Subscription cancellata:', sanitizeLogOutput(String(playerIdNum)));
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Errore delete subscription:', err);
      return res.status(500).json({ error: 'Delete error' });
    }
  }

  return res.status(405).end();
}

export default withSecurityMiddleware(handler);
