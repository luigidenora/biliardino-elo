import { list } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import webpush from 'web-push';
import { withAuth } from './_auth.js';
import { handleCorsPreFlight, setCorsHeaders } from './_cors.js';
import { sanitizeLogOutput, validateMatchTime, validateNumber, validatePlayerId, validateString } from './_validation.js';

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

type NotificationType = 'player-selected' | 'rank-change';

interface AdminNotifyRequest {
  type?: NotificationType;
  playerId?: number;
  matchTime?: string;
  message?: string;
  oldRank?: number;
  newRank?: number;
}

/**
 * API per inviare notifiche admin a un player specifico
 * Supporta due tipi di notifiche:
 * - player-selected: Notifica selezione per partita
 * - rank-change: Notifica cambio posizione in classifica
 *
 * POST /api/admin-notify
 * Body: {
 *   type: 'player-selected' | 'rank-change',
 *   playerId: number,
 *   // Per player-selected:
 *   matchTime?: string,
 *   message?: string,
 *   // Per rank-change:
 *   oldRank?: number,
 *   newRank?: number,
 *   message?: string
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
      type: rawType,
      playerId: rawPlayerId,
      matchTime: rawMatchTime,
      message: rawMessage,
      oldRank: rawOldRank,
      newRank: rawNewRank
    } = req.body as AdminNotifyRequest;

    // Validazione input base
    if (!rawType) {
      return res.status(400).json({ error: 'type è obbligatorio' });
    }

    if (!rawPlayerId) {
      return res.status(400).json({ error: 'playerId è obbligatorio' });
    }

    // Validazione tipo
    if (rawType !== 'player-selected' && rawType !== 'rank-change') {
      return res.status(400).json({
        error: 'Tipo non valido',
        message: 'type deve essere "player-selected" o "rank-change"'
      });
    }

    // Valida e sanitizza playerId
    const playerId = validatePlayerId(rawPlayerId);

    // Validazione parametri specifici per tipo
    let matchTime: string | undefined;
    let oldRank: number | undefined;
    let newRank: number | undefined;
    let message: string | undefined;

    if (rawType === 'player-selected') {
      if (!rawMatchTime) {
        return res.status(400).json({ error: 'matchTime è obbligatorio per type "player-selected"' });
      }
      // Valida e sanitizza matchTime per prevenire injection
      matchTime = validateMatchTime(rawMatchTime);
    }

    if (rawType === 'rank-change') {
      if (rawOldRank === undefined || rawNewRank === undefined) {
        return res.status(400).json({ error: 'oldRank e newRank sono obbligatori per type "rank-change"' });
      }
      // Valida i rank (devono essere numeri interi positivi)
      oldRank = validateNumber(rawOldRank, 'oldRank', 1, 1000);
      newRank = validateNumber(rawNewRank, 'newRank', 1, 1000);

      if (!Number.isInteger(rawOldRank) || !Number.isInteger(rawNewRank)) {
        return res.status(400).json({ error: 'oldRank e newRank devono essere numeri interi' });
      }
    }

    // Valida messaggio personalizzato se fornito
    if (rawMessage) {
      message = validateString(rawMessage, 'message', 500);
    }

    // Verifica configurazione
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error('BLOB_READ_WRITE_TOKEN non configurato');
      return res.status(500).json({
        error: 'Configurazione server incompleta',
        details: 'BLOB_READ_WRITE_TOKEN mancante'
      });
    }

    // Cerca la subscription del player
    // Prova prima con il prefisso nuovo {playerId}-subs/
    let { blobs } = await list({
      prefix: `${playerId}-subs/`,
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    // Se non trovato, prova con il prefisso vecchio biliardino-subs/
    if (!blobs || blobs.length === 0) {
      const result = await list({
        prefix: 'biliardino-subs/',
        token: process.env.BLOB_READ_WRITE_TOKEN
      });
      blobs = result.blobs;
    }

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
    const playerSub = validSubscriptions.find(sub => sub.playerId === playerId);

    if (!playerSub) {
      return res.status(404).json({
        error: 'Subscription non trovata',
        message: `Nessuna subscription registrata per il player ID ${playerId}`,
        availablePlayers: validSubscriptions.map(s => ({ id: s.playerId, name: s.playerName }))
      });
    }

    // Prepara il payload della notifica in base al tipo
    let title: string;
    let body: string;
    let navigate: string;
    let tag: string;
    let requireInteraction: boolean;

    if (rawType === 'player-selected') {
      title = '⚽ SEI STATO CONVOCATO!';
      body = message || `⚽ Sei stato convocato! Partita alle ${matchTime}, preparati!`;
      navigate = '/matchmaking.html';
      tag = `selected-${matchTime}`;
      requireInteraction = true;
    } else {
      // rank-change
      const isImprovement = newRank! < oldRank!;
      title = isImprovement ? '🏆 Sei salito in classifica!' : '📉 Cambio in classifica';
      body = message || (isImprovement
        ? `Fantastico! Sei passato dalla posizione ${oldRank}ª alla ${newRank}ª! Continua così! 🔥`
        : `Sei sceso dalla posizione ${oldRank}ª alla ${newRank}ª. È ora di riscattarsi! 💪`);
      navigate = '/';
      tag = 'rank-change';
      requireInteraction = false;
    }

    // Invia la notifica usando il formato Declarative Web Push
    try {
      const payload = {
        web_push: 8030,
        notification: {
          title,
          body,
          navigate,
          icon: '/icons/icon-192.jpg',
          badge: '/icons/icon-192.jpg',
          requireInteraction,
          tag,
          app_badge: '0'
        }
      };

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

      console.log(`✅ Notifica ${rawType} inviata a ${sanitizeLogOutput(playerSub.playerName)} (ID: ${playerId})`);

      return res.status(200).json({
        success: true,
        type: rawType,
        message: `Notifica inviata a ${playerSub.playerName}`,
        playerId,
        playerName: playerSub.playerName
      });
    } catch (sendErr) {
      console.error('Errore invio notifica:', sendErr);
      return res.status(500).json({
        error: 'Errore durante l\'invio della notifica',
        details: (sendErr as Error).message
      });
    }
  } catch (err) {
    console.error('Errore API admin-notify:', err);
    return res.status(500).json({
      error: 'Errore server',
      details: (err as Error).message,
      stack: process.env.NODE_ENV === 'development' ? (err as Error).stack : undefined
    });
  }
}

export default withAuth(handler, 'admin');
