import { list } from '@vercel/blob';
import webpush from 'web-push';
import { handleCorsPreFlight, setCorsHeaders } from './_cors.js';

// Verifica configurazione
if (!process.env.VITE_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
  console.error('ERRORE: VAPID keys non configurate');
}

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('ERRORE: BLOB_READ_WRITE_TOKEN non configurato');
}

webpush.setVapidDetails(
  'mailto:info@biliardino.app',
  process.env.VITE_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

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
export default async function handler(req, res) {
  setCorsHeaders(res);
  if (handleCorsPreFlight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { matchTime, title: customTitle, body: customBody } = req.body;

    if (!matchTime) {
      return res.status(400).json({ error: 'matchTime è obbligatorio' });
    }

    // Verifica configurazione
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error('BLOB_READ_WRITE_TOKEN non configurato');
      return res.status(500).json({
        error: 'Configurazione server incompleta',
        details: 'BLOB_READ_WRITE_TOKEN mancante'
      });
    }

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

    const subscriptionsData = await Promise.all(
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

    const validSubscriptions = subscriptionsData.filter(sub => sub !== null);

    if (validSubscriptions.length === 0) {
      return res.status(404).json({
        error: 'Nessuna subscription valida',
        message: 'Non ci sono subscriptions valide da notificare'
      });
    }

    let sent = 0;
    let failed = 0;

    for (const data of validSubscriptions) {
      try {
        const playerName = data.playerName || 'Giocatore';
        const title = customTitle || '🎮 CAlcio Balilla';
        const body = customBody || `Ciao ${playerName}! Partita alle ${matchTime} 🏆`;

        await webpush.sendNotification(
          data.subscription,
          JSON.stringify({
            title,
            body,
            url: `/confirm.html?time=${matchTime}`,
            tag: `match-${matchTime}`,
            requireInteraction: true,
            icon: '/icons/icon-192.jpg',
            badge: '/icons/icon-192.jpg'
          })
        );
        sent++;
        console.log(`✅ Notifica inviata a ${playerName}`);
      } catch (err) {
        console.warn('Errore invio a:', data.playerName || data.playerId, err.message);
        failed++;
      }
    }

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
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
}
