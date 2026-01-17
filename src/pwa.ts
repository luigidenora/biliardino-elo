import '../styles/player-modal.css';
import { showPlayerSelectionModal } from './player-selection-modal';

const baseUrl = import.meta.env.BASE_URL || '/';
const PUBLIC_VAPID_KEY = 'BOUHmi8SrZME9HKSAyqwKpTSiW1BATEoejeFqSzCUkxa718VNmx6ATtiUbi4YmCl-eAQC6kndhXCP-vZl9QHfpE';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register(`${baseUrl}sw.js`, { scope: baseUrl });
    } catch (err) {
      console.error('❌ Service Worker fallito:', err);
    }
  });
}

/**
 * Chiede all'utente di selezionare il proprio giocatore
 * @returns true se selezionato, false se annullato
 */
export async function ensurePlayerSelected(): Promise<boolean> {
  const playerId = localStorage.getItem('biliardino_player_id');
  const playerName = localStorage.getItem('biliardino_player_name');

  if (playerId && playerName) {
    return true;
  }

  return new Promise((resolve) => {
    showPlayerSelectionModal((selectedPlayerId: number, selectedPlayerName: string) => {
      localStorage.setItem('biliardino_player_id', selectedPlayerId.toString());
      localStorage.setItem('biliardino_player_name', selectedPlayerName);
      resolve(true);
    });
  });
}

/**
 * Attiva le notifiche push
 */
export async function subscribeToPushNotifications(): Promise<void> {
  try {
    const playerId = localStorage.getItem('biliardino_player_id');
    const playerName = localStorage.getItem('biliardino_player_name');

    if (!playerId || !playerName) {
      throw new Error('Seleziona prima il tuo nome');
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('È necessario accettare le notifiche per continuare');
    }

    const reg = await navigator.serviceWorker.ready;
    let subscription = await reg.pushManager.getSubscription();

    // Se non esiste una subscription, creala
    if (!subscription) {
      try {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY) as BufferSource
        });
      } catch (subErr) {
        console.error('❌ Errore creazione subscription:', subErr);
        throw new Error('Impossibile creare la subscription. Riprova più tardi.');
      }
    }

    // Salva sempre la subscription sul server per garantire che sia registrata
    try {
      await saveSubscription(subscription, Number(playerId), playerName);
    } catch (saveErr) {
      console.error('❌ Errore salvataggio:', saveErr);
      throw new Error('Impossibile salvare le notifiche sul server. Verifica la connessione e riprova.');
    }
  } catch (err) {
    console.error('❌ Errore:', err);
    throw err;
  }
}

async function saveSubscription(subscription: PushSubscription, playerId: number, playerName: string): Promise<void> {
  try {
    const response = await fetch('/api/save-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription, playerId, playerName }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error('Errore response:', response.status, errorText);
      throw new Error(`Errore durante il salvataggio (${response.status}). Riprova più tardi.`);
    }

    // Salva la subscription nel localStorage solo dopo il salvataggio sul server
    localStorage.setItem('biliardino_subscription', JSON.stringify(subscription));
  } catch (err) {
    console.error('❌ Errore salvataggio subscription:', err);
    if (err instanceof Error && err.message.includes('fetch')) {
      throw new Error('Impossibile connettersi al server. Controlla la connessione internet.');
    }
    throw err; // Rilancia l'errore per gestirlo nel chiamante
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  return new Uint8Array(
    atob(base64)
      .split('')
      .map((c) => c.charCodeAt(0))
  );
}
