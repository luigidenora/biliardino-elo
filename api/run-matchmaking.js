import webpush from 'web-push';
import { withAuth } from './_auth.js';
import { handleCorsPreFlight, setCorsHeaders } from './_cors.js';
import { redis } from './_redisClient.js';

webpush.setVapidDetails(
  'mailto:info@biliardino.app',
  process.env.VITE_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

async function handler(req, res) {
  setCorsHeaders(res);
  if (handleCorsPreFlight(req, res)) return;

  try {
    const { matchTime } = req.query;

    if (!matchTime) {
      return res.status(400).json({ error: 'Missing matchTime parameter' });
    }

    // Ottieni conferme da Redis
    const keys = await redis.keys(`availability:${matchTime}:*`);
    const confirmations = await Promise.all(
      keys.map(async (key) => {
        const data = await redis.get(key);
        return data;
      })
    );

    const validConfirmations = confirmations.filter(Boolean);

    if (validConfirmations.length < 5) {
      console.log(`⚠️ Solo ${validConfirmations.length} conferme per ${matchTime}, minimo 5 richiesto`);
      return res.status(200).json({
        ok: false,
        message: 'Conferme insufficienti',
        required: 5,
        current: validConfirmations.length
      });
    }

    // 4 giocatori random
    const shuffled = validConfirmations.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 4);
    const selectedIds = selected.map(c => c.playerId);

    console.log(`🎮 Matchmaking per ${matchTime}: estratti ${selectedIds.join(', ')}`);

    // Ottieni le subscriptions di questi giocatori
    const { blobs } = await list({
      prefix: `${playerId}-subs/`,
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    const allSubscriptions = await Promise.all(
      blobs.map(async (blob) => {
        const response = await fetch(blob.url);
        return await response.json();
      })
    );

    const selectedSubscriptions = allSubscriptions.filter(sub =>
      selectedIds.includes(sub.playerId)
    );

    // Notifica i giocatori estratti
    let success = 0;
    let fail = 0;

    for (const subData of selectedSubscriptions) {
      try {
        await webpush.sendNotification(
          subData.subscription,
          JSON.stringify({
            web_push: 8030,
            notification: {
              title: '⚽ SEI STATO CONVOCATO!',
              body: `Partita alle ${matchTime}! Preparati a dominare il campo!`,
              navigate: '/matchmaking.html',
              tag: `selected-${matchTime}`,
              requireInteraction: true,
              icon: '/icons/icon-192.jpg',
              badge: '/icons/icon-192.jpg',
              app_badge: '0'
            }
          }),
          {
            headers: {
              'Content-Type': 'application/notification+json'
            },
            urgency: 'high',
            TTL: 86400
          }
        );
        success++;
      } catch (err) {
        console.warn('Errore notifica a:', subData.playerId, err.message);
        fail++;
      }
    }

    // Pulisci le conferme di questa fascia oraria
    await Promise.all(keys.map(key => redis.del(key)));

    console.log(`✅ Matchmaking completato: ${success} notifiche inviate, ${fail} fallite`);

    res.status(200).json({
      ok: true,
      selected: selectedIds,
      notified: success,
      failed: fail,
      matchTime
    });
  } catch (err) {
    console.error('Errore matchmaking:', err);
    res.status(500).json({ error: 'Errore matchmaking' });
  }
}

export default withAuth(handler, 'admin');
