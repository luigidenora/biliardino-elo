import { list } from '@vercel/blob';
import webpush from 'web-push';
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
  setCorsHeaders(res);
  if (handleCorsPreFlight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { playerId, title, body, url = '/', requireInteraction = false, actions } = req.body;

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
      // Rileva se endpoint è Apple usando URL parsing sicuro
      let isAppleEndpoint = false;
      try {
        const endpointUrl = new URL(playerSub.subscription.endpoint);
        isAppleEndpoint = endpointUrl.hostname === 'web.push.apple.com' || 
                         endpointUrl.hostname.endsWith('.push.apple.com');
      } catch (err) {
        // Se l'endpoint non è un URL valido, considera non-Apple
        isAppleEndpoint = false;
      }

      if (isAppleEndpoint) {
        // Usa formato Declarative Web Push per iOS
        const payload = {
          web_push: 8030,
          notification: {
            title,
            body,
            navigate: url, // DENTRO notification per iOS
            icon: '/icons/icon-192.jpg',
            badge: '/icons/icon-192-maskable.png',
            silent: false,
            app_badge: '1' // Stringa, non numero
          }
        };

        await webpush.sendNotification(
          playerSub.subscription,
          JSON.stringify(payload),
          {
            urgency: 'high'
          }
        );
      } else {
        // Usa formato semplice per altri browser (gestito da SW)
        const payload = { title, body, url };

        await webpush.sendNotification(
          playerSub.subscription,
          JSON.stringify(payload),
          {
            urgency: 'high'
          }
        );
      }

      console.log(`✅ Notifica inviata al player ${playerSub.playerName} (ID: ${playerId}) - Formato: ${isAppleEndpoint ? 'Declarative (iOS)' : 'Simple (SW)'}`);

      return res.status(200).json({
        success: true,
        message: `Notifica inviata a ${playerSub.playerName}`,
        playerId,
        playerName: playerSub.playerName,
        format: isAppleEndpoint ? 'declarative' : 'simple'
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
