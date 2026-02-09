import { list } from '@vercel/blob';
import webpush from 'web-push';
import { withAuth } from './_auth.js';
import { handleCorsPreFlight, setCorsHeaders } from './_cors.js';

// Verifica che le variabili d'ambiente siano configurate
if (!process.env.VITE_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
  console.error('ERRORE: VAPID keys non configurate nelle variabili d\'ambiente');
}

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('ERRORE: BLOB_READ_WRITE_TOKEN non configurato nelle variabili d\'ambiente');
}

webpush.setVapidDetails(
  'mailto:info@biliardino.app',
  process.env.VITE_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

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
async function handler(req, res) {
  setCorsHeaders(res);
  if (handleCorsPreFlight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, playerId, matchTime, message, oldRank, newRank } = req.body;

    // Validazione input base
    if (!type) {
      return res.status(400).json({ error: 'type è obbligatorio' });
    }

    if (!playerId) {
      return res.status(400).json({ error: 'playerId è obbligatorio' });
    }

    // Validazione tipo
    if (type !== 'player-selected' && type !== 'rank-change') {
      return res.status(400).json({
        error: 'Tipo non valido',
        message: 'type deve essere "player-selected" o "rank-change"'
      });
    }

    // Validazione parametri specifici per tipo
    if (type === 'player-selected' && !matchTime) {
      return res.status(400).json({ error: 'matchTime è obbligatorio per type "player-selected"' });
    }

    if (type === 'rank-change') {
      if (oldRank === undefined || newRank === undefined) {
        return res.status(400).json({ error: 'oldRank e newRank sono obbligatori per type "rank-change"' });
      }
      if (typeof oldRank !== 'number' || typeof newRank !== 'number') {
        return res.status(400).json({ error: 'oldRank e newRank devono essere numeri' });
      }
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
          return await response.json();
        } catch (err) {
          console.error(`Errore caricamento blob ${blob.pathname}:`, err);
          return null;
        }
      })
    );

    const validSubscriptions = allSubscriptions.filter(sub => sub !== null);

    // Trova la subscription del player specifico
    const playerSub = validSubscriptions.find(sub => sub.playerId === Number(playerId));

    if (!playerSub) {
      return res.status(404).json({
        error: 'Subscription non trovata',
        message: `Nessuna subscription registrata per il player ID ${playerId}`,
        availablePlayers: validSubscriptions.map(s => ({ id: s.playerId, name: s.playerName }))
      });
    }

    // Prepara il payload della notifica in base al tipo
    let title, body, navigate, tag, requireInteraction;

    if (type === 'player-selected') {
      title = '⚽ SEI STATO CONVOCATO!';
      body = message || `⚽ Sei stato convocato! Partita alle ${matchTime}, preparati!`;
      navigate = '/matchmaking.html';
      tag = `selected-${matchTime}`;
      requireInteraction = true;
    } else if (type === 'rank-change') {
      const isImprovement = newRank < oldRank;
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

      console.log(`✅ Notifica ${type} inviata a ${playerSub.playerName} (ID: ${playerId})`);

      return res.status(200).json({
        success: true,
        type,
        message: `Notifica inviata a ${playerSub.playerName}`,
        playerId,
        playerName: playerSub.playerName
      });
    } catch (sendErr) {
      console.error('Errore invio notifica:', sendErr);
      return res.status(500).json({
        error: 'Errore durante l\'invio della notifica',
        details: sendErr.message
      });
    }
  } catch (err) {
    console.error('Errore API admin-notify:', err);
    return res.status(500).json({
      error: 'Errore server',
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
}

export default withAuth(handler, 'admin');
