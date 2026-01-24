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
    const { subscription, playerName, title, body, actions } = req.body;

    if (!subscription) {
      return res.status(400).json({ error: 'Subscription mancante' });
    }

    const name = playerName || 'Giocatore';
    const notificationTitle = title || '✅ Test Notifica';
    const notificationBody = body || `Funziona! Ciao ${name} 👋`;

    // Default actions if not provided
    const notificationActions = actions || [
      { action: 'accept', title: 'Accetta', icon: '/icons/icon-192.jpg' },
      { action: 'ignore', title: 'Ignora', icon: '/icons/icon-192.jpg' }
    ];

    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: notificationTitle,
        body: notificationBody,
        url: '/',
        icon: '/icons/icon-192.jpg',
        badge: '/icons/icon-192.jpg',
        tag: 'test',
        requireInteraction: true,
        actions: notificationActions
      })
    );

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
