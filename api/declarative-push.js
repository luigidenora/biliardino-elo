import { list } from '@vercel/blob';
import webpush from 'web-push';
import { handleCorsPreFlight, setCorsHeaders } from './_cors.js';

/**
 * Declarative Web Push API (WebKit/Safari Standard)
 *
 * Sends push notifications using the WebKit Declarative Web Push format.
 * This format allows Safari/WebKit to display notifications directly
 * without requiring service worker JavaScript execution.
 *
 * @see https://github.com/nickmasu/nickmasu/wiki/Declarative-Web-Push
 * @see https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
  */

// Verify environment configuration
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

export default async function handler(req, res) {
  setCorsHeaders(res);
  if (handleCorsPreFlight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      playerId,
      title,
      options,
      default_action_url,
      mutable,
      app_badge
    } = req.body;

    // Validate input - title and default_action_url are required per spec
    if (!playerId) {
      return res.status(400).json({ error: 'playerId è obbligatorio' });
    }

    if (!title) {
      return res.status(400).json({ error: 'title è obbligatorio per Declarative Web Push' });
    }

    if (!default_action_url) {
      return res.status(400).json({ error: 'default_action_url è obbligatorio per Declarative Web Push' });
    }

    // Verify configuration
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error('BLOB_READ_WRITE_TOKEN non configurato');
      return res.status(500).json({
        error: 'Configurazione server incompleta',
        details: 'BLOB_READ_WRITE_TOKEN mancante'
      });
    }

    // Find player subscription
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

    // Build options object per WebKit spec
    const notificationOptions = options || {};
    const builtOptions = {};

    // Standard NotificationOptions fields
    if (typeof notificationOptions.body === 'string') builtOptions.body = notificationOptions.body;
    if (typeof notificationOptions.icon === 'string') builtOptions.icon = notificationOptions.icon;
    if (typeof notificationOptions.badge === 'string') builtOptions.badge = notificationOptions.badge;
    if (typeof notificationOptions.tag === 'string') builtOptions.tag = notificationOptions.tag;
    if (typeof notificationOptions.lang === 'string') builtOptions.lang = notificationOptions.lang;
    if (['auto', 'ltr', 'rtl'].includes(notificationOptions.dir)) builtOptions.dir = notificationOptions.dir;
    if (typeof notificationOptions.silent === 'boolean') builtOptions.silent = notificationOptions.silent;
    if (typeof notificationOptions.requireInteraction === 'boolean') builtOptions.requireInteraction = notificationOptions.requireInteraction;
    if (notificationOptions.data !== undefined) builtOptions.data = notificationOptions.data;

    // Build actions with 'url' property (WebKit spec requirement)
    if (Array.isArray(notificationOptions.actions)) {
      const validActions = notificationOptions.actions
        .filter(a => a && typeof a.action === 'string' && typeof a.title === 'string' && typeof a.url === 'string')
        .slice(0, 2) // Max 2 actions supported
        .map((a) => {
          const actionObj = {
            action: a.action,
            title: a.title,
            url: a.url // Required per WebKit spec
          };
          if (typeof a.icon === 'string') actionObj.icon = a.icon;
          return actionObj;
        });

      if (validActions.length > 0) {
        builtOptions.actions = validActions;
      }
    }

    // Send to all subscriptions for this player
    const results = [];

    for (const blob of blobs) {
      try {
        const response = await fetch(blob.url);
        const data = await response.json();
        const subscription = data.subscription;

        if (!subscription) {
          console.warn(`Subscription mancante nel blob ${blob.pathname}`);
          continue;
        }
        const payload = {
          web_push: 8030,
          notification: {
            title,
            body: builtOptions.body || '',
            icon: builtOptions.icon || '/icons/icon-192.jpg',
            badge: builtOptions.badge || '/icons/icon-192.jpg',
            navigate: default_action_url,
            lang: builtOptions.lang || 'it-IT',
            dir: 'ltr',
            silent: false,
            app_badge: String(app_badge || 1)
          }
        };
        // Send with Content-Type: application/notification+json
        // This signals to Safari/WebKit that this is a declarative push
        await webpush.sendNotification(
          subscription,
          JSON.stringify(payload),
          {
            urgency: 'high',
            TTL: 86400, // 24 hours
            headers: {
              'Content-Type': 'application/notification+json'
            }
          }
        );

        results.push({
          success: true,
          endpoint: subscription.endpoint.substring(0, 30) + '...'
        });

        console.log(`✅ Declarative Web Push inviato a player ${playerId}`);
      } catch (sendErr) {
        console.error(`Errore invio a ${blob.pathname}:`, sendErr.message);
        results.push({
          success: false,
          error: sendErr.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;

    if (successCount === 0) {
      return res.status(500).json({
        error: 'Nessuna notifica inviata',
        details: results
      });
    }

    return res.status(200).json({
      success: true,
      message: `Notifica dichiarativa inviata (${successCount}/${results.length} dispositivi)`,
      playerId,
      results
    });
  } catch (err) {
    console.error('Errore API declarative-push:', err);
    return res.status(500).json({
      error: 'Errore server',
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
}
