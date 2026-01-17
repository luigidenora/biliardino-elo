import { list } from '@vercel/blob';
import webpush from 'web-push';

webpush.setVapidDetails(
  'mailto:info@biliardino.app',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  try {
    const now = new Date();
    const hour = now.getHours();
    const matchTime = hour === 10 ? '11:00' : '16:00';

    const { blobs } = await list({
      prefix: 'biliardino-subs/',
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    const subscriptionsData = await Promise.all(
      blobs.map(async (blob) => {
        const response = await fetch(blob.url);
        return await response.json();
      })
    );

    let success = 0;
    let fail = 0;

    for (const data of subscriptionsData) {
      try {
        const playerName = data.playerName || 'Giocatore';

        await webpush.sendNotification(
          data.subscription,
          JSON.stringify({
            title: '🎮 CAlcio Balilla',
            body: `Ciao ${playerName}! Partita alle ${matchTime} 🏆`,
            url: `/confirm.html?time=${matchTime}`,
            tag: `match-${matchTime}`,
            requireInteraction: true,
            icon: '/icons/icon-192.jpg',
            badge: '/icons/icon-192.jpg'
          })
        );
        success++;
      } catch (err) {
        console.warn('❌ Errore invio a:', data.playerName || data.playerId, err.message);
        fail++;
      }
    }

    console.log(`✅ Broadcast: ${success}/${subscriptionsData.length} inviati (Match: ${matchTime})`);
    res.status(200).json({ success, fail, total: subscriptionsData.length, matchTime });
  } catch (err) {
    console.error('❌ Errore broadcast:', err);
    res.status(500).json({ error: 'Errore invio broadcast' });
  }
}
