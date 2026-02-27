import { list } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import webpush from 'web-push';
import { withAuth } from './_auth.js';
import { handleCorsPreFlight, setCorsHeaders } from './_cors.js';
import { validatePlayerId, validateString } from './_validation.js';

// Verifica che le variabili d'ambiente siano configurate
if (!process.env.VITE_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
  console.error('ERRORE: VAPID keys non configurate nelle variabili d\'ambiente');
}

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('ERRORE: BLOB_READ_WRITE_TOKEN non configurato nelle variabili d\'ambiente');
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
  url?: string;
}

/**
 * API per inviare notifiche a un player specifico tramite playerId
 *
 * POST /api/send-notification
 * Body: {
 *   playerId: number,
 *   title: string,
 *   body: string,
 *   url?: string (default: '/'),
 *   requireInteraction?: boolean (default: false)
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
      playerId: rawPlayerId,
      title: rawTitle,
      body: rawBody,
      url: rawUrl = '/',
      requireInteraction = false,
      actions
    } = req.body as {
      playerId?: number;
      title?: string;
      body?: string;
      url?: string;
      requireInteraction?: boolean;
      actions?: NotificationAction[];
    };

    // Validazione input
    if (!rawPlayerId) {
      return res.status(400).json({ error: 'playerId è obbligatorio' });
    }

    if (!rawTitle || !rawBody) {
      return res.status(400).json({ error: 'title e body sono obbligatori' });
    }

    // Valida e sanitizza input
    const playerId = validatePlayerId(rawPlayerId);
    const title = validateString(rawTitle, 'title', 100);
    const body = validateString(rawBody, 'body', 500);
    const url = validateString(rawUrl, 'url', 200);

    // Verifica configurazione
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error('BLOB_READ_WRITE_TOKEN non configurato');
      return res.status(500).json({
        error: 'Configurazione server incompleta',
        details: 'BLOB_READ_WRITE_TOKEN mancante'
      });
    }

    // Cerca la subscription del player
    const { blobs } = await list({
      prefix: 'biliardino-subs/',
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    if (!blobs || blobs.length === 0) {
      return res.status(404).json({
        error: 'Nessuna subscription trovata',
        message: 'Non ci sono subscriptions registrate nel sistema'
      });
    }

    // Carica tutte le subscriptions
    const allSubscriptions = await Promise.all(
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

    const validSubscriptions = allSubscriptions.filter((sub): sub is SubscriptionData => sub !== null);

    // Trova la subscription del player specifico
    const playerSub = validSubscriptions.find(sub => sub.playerId === Number(playerId));

    if (!playerSub) {
      return res.status(404).json({
        error: 'Subscription non trovata',
        message: `Nessuna subscription registrata per il player ID ${playerId}`,
        availablePlayers: validSubscriptions.map(s => ({ id: s.playerId, name: s.playerName }))
      });
    }

    // Invia la notifica usando il formato Declarative Web Push
    try {
      const payload: any = {
        web_push: 8030,
        notification: {
          title,
          body,
          navigate: url,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          requireInteraction: requireInteraction,
          app_badge: '0'
        }
      };

      // Aggiungi actions se fornite
      if (actions && Array.isArray(actions) && actions.length > 0) {
        payload.notification.actions = actions.map(action => ({
          action: action.action,
          title: action.title,
          navigate: action.url || url
        }));
      }

      await webpush.sendNotification(
        playerSub.subscription,
        JSON.stringify(payload),
        {
          headers: {
            'Content-Type': 'application/notification+json'
          },
          urgency: 'high',
          TTL: 86400
        }
      );

      console.log(`✅ Notifica inviata al player ${playerSub.playerName} (ID: ${playerId}) - Formato: Declarative Web Push`);

      return res.status(200).json({
        success: true,
        message: `Notifica inviata a ${playerSub.playerName}`,
        playerId,
        playerName: playerSub.playerName,
        format: 'declarative'
      });
    } catch (sendErr) {
      console.error('Errore invio notifica:', sendErr);
      return res.status(500).json({
        error: 'Errore durante l\'invio della notifica',
        details: (sendErr as Error).message
      });
    }
  } catch (err) {
    console.error('Errore API send-notification:', err);
    return res.status(500).json({
      error: 'Errore server',
      details: (err as Error).message,
      stack: process.env.NODE_ENV === 'development' ? (err as Error).stack : undefined
    });
  }
}

export default withAuth(handler, 'notify');
