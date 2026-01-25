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
    const {
      playerId,
      title,
      body,
      actions,
      navigate,
      dir,
      lang,
      tag,
      image,
      icon,
      badge,
      vibrate,
      timestamp,
      renotify,
      silent,
      requireInteraction,
      data,
      mutable
    } = req.body;

    const name = playerId || 'Giocatore';
    const notificationTitle = title || '✅ Test Notifica';
    const notificationBody = body || `Funziona! Ciao ${name} 👋`;

    // (actions defaulting handled per-subscription below)

    const { blobs } = await list({
      prefix: `${playerId}-subs/`,
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    if (blobs.length === 0) {
      return res.status(404).json({ error: `Nessuna subscription trovata per playerId ${playerId}` });
    }

    // cicla tutte le subscription trovate e invia la notifica
    for (const blob of blobs) {
      const response = await fetch(blob.url);
      const { subscription } = await response.json();

      const notificationNavigate = (typeof navigate === 'string' && navigate) ? navigate : '/';

      const notification = {
        title: notificationTitle,
        navigate: notificationNavigate
      };

      if (typeof dir === 'string' && ['auto', 'ltr', 'rtl'].includes(dir)) notification.dir = dir;
      if (typeof lang === 'string') notification.lang = lang;
      if (typeof notificationBody === 'string') notification.body = notificationBody;
      if (typeof tag === 'string') notification.tag = tag;
      if (typeof image === 'string') notification.image = image;
      if (typeof icon === 'string') notification.icon = icon;
      if (typeof badge === 'string') notification.badge = badge;
      if (Array.isArray(vibrate) && vibrate.every(v => Number.isInteger(v) && v >= 0 && v <= 0xFFFFFFFF)) notification.vibrate = vibrate;
      if (typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp >= 0) notification.timestamp = Math.floor(timestamp);
      if (typeof renotify === 'boolean') notification.renotify = renotify;
      if (typeof silent === 'boolean') notification.silent = silent;
      if (typeof requireInteraction === 'boolean') notification.requireInteraction = requireInteraction;
      if (data !== undefined) notification.data = data;

      const defaultActions = [
        { action: 'accept', title: 'Accetta', icon: '/icons/icon-192.jpg', navigate: notificationNavigate },
        { action: 'ignore', title: 'Ignora', icon: '/icons/icon-192.jpg', navigate: notificationNavigate }
      ];

      const sourceActions = Array.isArray(actions) ? actions : defaultActions;
      const validActions = [];
      for (const a of sourceActions) {
        const hasAction = typeof a?.action === 'string' && a.action;
        const hasTitle = typeof a?.title === 'string' && a.title;
        const nav = typeof a?.navigate === 'string' && a.navigate ? a.navigate : notificationNavigate;
        if (!hasAction || !hasTitle || !nav) continue;
        const actionObj = { action: a.action, title: a.title, navigate: nav };
        if (typeof a.icon === 'string') actionObj.icon = a.icon;
        validActions.push(actionObj);
      }
      if (validActions.length) notification.actions = validActions;

      const payload = {
        notification
      };
      if (typeof mutable === 'boolean') payload.mutable = mutable;

      await webpush.sendNotification(
        subscription,
        JSON.stringify(payload),
        {
          headers: { 'Content-Type': 'application/json' }
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
