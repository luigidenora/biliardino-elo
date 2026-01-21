import { list } from '@vercel/blob';
import webpush from 'web-push';

// Verifica che le variabili d'ambiente siano configurate
if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
  console.error('ERRORE: VAPID keys non configurate nelle variabili d\'ambiente');
}

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('ERRORE: BLOB_READ_WRITE_TOKEN non configurato nelle variabili d\'ambiente');
}

webpush.setVapidDetails(
  'mailto:info@biliardino.app',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

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
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { playerId, title, body, url = '/', requireInteraction = false } = req.body;

    // Validazione input
    if (!playerId) {
      return res.status(400).json({ error: 'playerId è obbligatorio' });
    }

    if (!title || !body) {
      return res.status(400).json({ error: 'title e body sono obbligatori' });
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

    // Invia la notifica
    try {
      await webpush.sendNotification(
        playerSub.subscription,
        JSON.stringify({
          title,
          body,
          url,
          icon: '/icons/icon-192.jpg',
          badge: '/icons/icon-192.jpg',
          tag: `notification-${playerId}-${Date.now()}`,
          requireInteraction
        })
      );

      console.log(`✅ Notifica inviata al player ${playerSub.playerName} (ID: ${playerId})`);

      return res.status(200).json({
        success: true,
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
    console.error('Errore API send-notification:', err);
    return res.status(500).json({
      error: 'Errore server',
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
}
