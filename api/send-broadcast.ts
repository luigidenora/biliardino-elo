import { list } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import webpush from 'web-push';
import { withAuth } from './_auth.js';
import { handleCorsPreFlight, setCorsHeaders } from './_cors.js';
import { combineMiddlewares, withSecurityMiddleware } from './_middleware.js';
import { getRandomMessage } from './_randomMessage.js';
import { sanitizeLogOutput, validateMatchTime, validateString } from './_validation.js';

// Verifica configurazione
if (!process.env.VITE_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
  console.error('ERRORE: VAPID keys non configurate');
}

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('ERRORE: BLOB_READ_WRITE_TOKEN non configurato');
}

webpush.setVapidDetails(
  'mailto:info@biliardino.app',
  process.env.VITE_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

interface SubscriptionData {
  subscription: webpush.PushSubscription;
  playerId: number;
  playerName: string;
  createdAt: string;
}

interface NotificationAction {
  action: string;
  title: string;
  url: string;
}

/**
 * API per inviare broadcast a tutti gli utenti registrati
 *
 * POST /api/send-broadcast
 * Body: {
 *   matchTime: string (es: "14:30"),
 *   title?: string (opzionale),
 *   body?: string (opzionale)
 * }
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {

  setCorsHeaders(res);
  if (handleCorsPreFlight(req, res)) return res;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      matchTime: rawMatchTime,
      title: rawTitle,
      subtitle: rawSubtitle,
      body: rawBody
    } = req.body as {
      matchTime?: string;
      title?: string;
      subtitle?: string;
      body?: string;
    };

    if (!rawMatchTime) {
      return res.status(400).json({ error: 'matchTime è obbligatorio' });
    }

    // Valida e sanitizza input
    const matchTime = validateMatchTime(rawMatchTime);
    const customTitle = rawTitle ? validateString(rawTitle, 'title', 100) : undefined;
    const customBody = rawBody ? validateString(rawBody, 'body', 500) : undefined;

    // Verifica configurazione
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error('BLOB_READ_WRITE_TOKEN non configurato');
      return res.status(500).json({
        error: 'Configurazione server incompleta',
        details: 'BLOB_READ_WRITE_TOKEN mancante'
      });
    }

    const { blobs } = await list({
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    if (!blobs || blobs.length === 0) {
      return res.status(404).json({
        error: 'Nessuna subscription trovata',
        message: 'Non ci sono subscriptions registrate nel sistema'
      });
    }

    const subscriptionsData = await Promise.all(
      blobs.map(async (blob) => {
        try {
          const response = await fetch(blob.url);
          return await response.json() as SubscriptionData;
        } catch (err) {
          console.error(`Errore caricamento blob ${blob.pathname}:`, err);
          return null;
        }
      })
    );

    const validSubscriptions = subscriptionsData.filter((sub): sub is SubscriptionData => sub !== null);

    if (validSubscriptions.length === 0) {
      return res.status(404).json({
        error: 'Nessuna subscription valida',
        message: 'Non ci sono subscriptions valide da notificare'
      });
    }

    const url = process.env.BASE_URL || '.';
    const matchDate = new Date(matchTime).toLocaleTimeString('it-IT', { hour: '2-digit' });
    // Invia tutte le notifiche in parallelo
    const results = await Promise.allSettled(
      validSubscriptions.map(async (data) => {
        const playerName = data.playerName || 'Giocatore';
        const _randomMessage = getRandomMessage(playerName.split(' ')[0]);
        const title = customTitle || _randomMessage.title;
        const body = customBody || _randomMessage.body;
        const actions: NotificationAction[] = [
          { action: 'confirm', title: 'Partecipa', url: `${url}/confirm.html?c=true&matchTime=${matchTime}` },
          { action: 'cancel', title: 'Rifiuta', url: `${url}/confirm.html?c=false&matchTime=${matchTime}` }
        ];

        await webpush.sendNotification(
          data.subscription,
          JSON.stringify({
            web_push: 8030,
            notification: {
              title,
              body,
              navigate: `${url}/confirm.html?matchTime=${matchTime}`,
              tag: `match`,
              requireInteraction: true,
              icon: '/icons/icon-192.jpg',
              badge: '/icons/icon-192.jpg',
              app_badge: '0',
              actions: actions?.map(a => ({
                action: a.action,
                title: a.title,
                navigate: a.url,
              }))
            }
          }),
          {
            headers: {
              'Content-Type': 'application/notification+json'
            },
            urgency: 'high',
            TTL: 86400
          }
        );

        console.log(`✅ Notifica inviata a ${sanitizeLogOutput(playerName)}`);
        return { playerName, success: true };
      })
    );

    const sent = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    // Log errori
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const playerName = validSubscriptions[index]?.playerName || validSubscriptions[index]?.playerId.toString() || 'Unknown';
        console.warn('Errore invio a:', playerName, (result.reason as Error)?.message || result.reason);
      }
    });

    console.log(`✅ Broadcast completato: ${sent}/${validSubscriptions.length} inviati (Match: ${matchTime})`);

    return res.status(200).json({
      sent,
      failed,
      total: validSubscriptions.length,
      matchTime
    });
  } catch (err) {
    console.error('Errore broadcast:', err);
    return res.status(500).json({
      error: 'Errore invio broadcast',
      details: (err as Error).message,
      stack: process.env.NODE_ENV === 'development' ? (err as Error).stack : undefined
    });
  }
}

// Applica auth + security middleware
export default combineMiddlewares(
  handler,
  (h) => withAuth(h, 'admin'),
  (h) => withSecurityMiddleware(h, { timeout: 60000 }) // 60s per notifiche multiple
);
