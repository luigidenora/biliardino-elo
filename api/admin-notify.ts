import { list } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import webpush from 'web-push';
import { withAuth } from './_auth.js';
import { handleCorsPreFlight, setCorsHeaders } from './_cors.js';
import { getRandomMessage } from './_randomMessage.js';
import { sanitizeLogOutput, validateMatchTime, validatePlayerId, validateString } from './_validation.js';

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
      // Valida che siano numeri (elo va da 0 a n, nessun limite)
      oldRank = Number(rawOldRank);
      newRank = Number(rawNewRank);

      if (Number.isNaN(oldRank) || Number.isNaN(newRank)) {
        return res.status(400).json({ error: 'oldRank e newRank devono essere numeri validi' });
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

    // Cerca la subscription del player con il prefisso {playerId}-subs/
    const { blobs } = await list({
      prefix: `${playerId}-subs/`,
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    if (!blobs || blobs.length === 0) {
      return res.status(404).json({
        error: 'Subscription non trovata',
        message: `Nessuna subscription registrata per il player ID ${playerId}`
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
        message: `Nessuna subscription registrata per il player ID ${playerId}`
      });
    }

    // Prepara il payload della notifica in base al tipo
    let title: string;
    let body: string;
    let navigate: string;
    let tag: string;
    let requireInteraction: boolean;

    if (rawType === 'player-selected') {
      // Usa messaggio personalizzato o genera uno random per convocazione
      if (message) {
        title = '⚽ SEI STATO CONVOCATO!';
        body = message;
      } else {
        const randomMsg = getRandomMessage(playerSub.playerName);
        title = randomMsg.title;
        body = `${randomMsg.body} Partita alle ${matchTime}!`;
      }
      navigate = '/matchmaking.html';
      tag = `selected-${matchTime}`;
      requireInteraction = true;
    } else {
      // rank-change
      const isImprovement = newRank! < oldRank!;

      if (message) {
        title = isImprovement ? '🏆 Sei salito in classifica!' : '📉 Cambio in classifica';
        body = message;
      } else {
        // Messaggi random per cambio classifica
        const improvementTitles = [
          '🏆 Sei salito in classifica!',
          '⭐ Grande scalata!',
          '🚀 In ascesa!',
          '💎 Che progressi!',
          '🔥 Stai volando!'
        ];

        const declineTitles = [
          '📉 Cambio in classifica',
          '⚠️ Attenzione!',
          '💪 È ora di reagire!',
          '🎯 Non mollare!',
          '🔄 Tempo di rimonta!'
        ];

        const improvementBodies = [
          `Fantastico! Sei passato dalla posizione ${oldRank}ª alla ${newRank}ª! Continua così! 🔥`,
          `Che scalata! Da ${oldRank}ª a ${newRank}ª posizione! Gli squali non si fermano! 🦈`,
          `Boom! Dalla ${oldRank}ª alla ${newRank}ª! Mostra di che pasta sei fatto! 💎`,
          `Eccezionale! Posizione ${newRank}ª raggiunta (eri ${oldRank}ª)! Adrenalina pura! ⚡`,
          `Strepitoso! ${oldRank}ª → ${newRank}ª! È il tuo momento! 🌟`
        ];

        const declineBodies = [
          `Sei sceso dalla posizione ${oldRank}ª alla ${newRank}ª. È ora di riscattarsi! 💪`,
          `Da ${oldRank}ª a ${newRank}ª. Gli squali non mollano mai! Torna a dominare! 🦈`,
          `Posizione ${newRank}ª (eri ${oldRank}ª). Cocciutaggine attiva! Recupera! 🐂`,
          `${oldRank}ª → ${newRank}ª. È tempo di rimonta! Dai tutto! 🔥`,
          `Ora sei ${newRank}ª (prima ${oldRank}ª). La rivincita ti aspetta! ⚔️`
        ];

        if (isImprovement) {
          title = improvementTitles[Math.floor(Math.random() * improvementTitles.length)];
          body = improvementBodies[Math.floor(Math.random() * improvementBodies.length)];
        } else {
          title = declineTitles[Math.floor(Math.random() * declineTitles.length)];
          body = declineBodies[Math.floor(Math.random() * declineBodies.length)];
        }
      }

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
