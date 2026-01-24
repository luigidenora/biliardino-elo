import { list } from '@vercel/blob';
import webpush from 'web-push';
import { handleCorsPreFlight, setCorsHeaders } from './_cors.js';

webpush.setVapidDetails(
  'mailto:info@biliardino.app',
  process.env.VITE_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  setCorsHeaders(res);
  if (handleCorsPreFlight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { playerId, title, body, actions } = req.body;

    const name = playerId || 'Giocatore';
    const notificationTitle = title || '✅ Test Notifica';
    const notificationBody = body || `Funziona! Ciao ${name} 👋`;

    // Default actions if not provided
    const notificationActions = actions || [
      { action: 'accept', title: 'Accetta', icon: '/icons/icon-192.jpg' },
      { action: 'ignore', title: 'Ignora', icon: '/icons/icon-192.jpg' }
    ];

    const { blobs } = await list({
      prefix: `${playerId}-subs/`,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    if (blobs.length === 0) {
      return res.status(404).json({ error: `Nessuna subscription trovata per playerId ${playerId}` });
    }

    // cicla tutte le subscription trovate e invia la notifica
    for (const blob of blobs) {
      const response = await fetch(blob.url);
      const { subscription } = await response.json();

      const navigateUrl = '/';

      const payload = {
        // Declarative Web Push (Safari/WebKit)
        web_push: 8030,
        notification: {
          title: notificationTitle,
          body: notificationBody,
          navigate: navigateUrl,
          icon: '/icons/icon-192.jpg',
          badge: '/icons/icon-192.jpg',
          tag: 'test',
          requireInteraction: true,
          actions: notificationActions
        },
        // Imperative fallback for existing service worker handlers
        title: notificationTitle,
        body: notificationBody,
        url: navigateUrl,
        icon: '/icons/icon-192.jpg',
        badge: '/icons/icon-192.jpg',
        tag: 'test',
        requireInteraction: true,
        actions: notificationActions
      };

      await webpush.sendNotification(
        subscription,
        JSON.stringify(payload),
        {
          urgency: 'high'
        }
      );
    }

    res.status(200).json({
      success: true,
      message: `Notifica inviata a ${name}!`
    });
  } catch (err) {
    console.error('Errore test:', err);
    res.status(500).json({
      error: 'Errore invio notifica',
      details: err.message
    });
  }
}
