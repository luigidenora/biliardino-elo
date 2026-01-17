import { ensurePlayerSelected, subscribeToPushNotifications } from './pwa';

type BannerState = 'enable-notifications' | 'denied' | 'hidden';

/**
 * Determina il tipo di dispositivo
 */
function getDeviceType(): 'ios' | 'android' | 'desktop' {
  const userAgent = navigator.userAgent.toLowerCase();

  if (/iphone|ipad|ipod/.test(userAgent)) {
    return 'ios';
  } else if (/android/.test(userAgent)) {
    return 'android';
  } else {
    return 'desktop';
  }
}

/**
 * Mostra il banner appropriato in base allo stato della PWA e delle notifiche
 */
async function showNotificationBannerIfNeeded(): Promise<void> {
  // Verifica supporto browser
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return;
  }

  const bannerState = getBannerState();

  if (bannerState === 'hidden') {
    return;
  }

  const banner = document.getElementById('notification-banner');
  if (!banner) return;

  // Configura il banner in base allo stato
  configureBanner(bannerState);

  // Mostra il banner dopo un breve delay
  setTimeout(() => {
    banner.classList.remove('hidden');
  }, 2000); // Delay di 2 secondi per non essere troppo invasivi
}

/**
 * Determina quale stato del banner mostrare
 */
function getBannerState(): BannerState {
  const permission = Notification.permission;
  const dismissed = localStorage.getItem('biliardino_notification_dismissed');
  const playerId = localStorage.getItem('biliardino_player_id');
  const savedSubscription = localStorage.getItem('biliardino_subscription');

  // Se le notifiche sono state negate, mostra messaggio speciale
  if (permission === 'denied') {
    return 'denied';
  }

  // Se le notifiche sono già attive E l'utente è registrato E c'è una subscription, non mostrare nulla
  if (permission === 'granted' && playerId && savedSubscription) {
    return 'hidden';
  }

  // Se il permesso è granted ma manca utente o subscription, mostra il banner
  // per permettere di completare la configurazione
  if (permission === 'granted' && (!playerId || !savedSubscription)) {
    return 'enable-notifications';
  }

  // Se l'utente ha chiuso il banner delle notifiche E non ha il permesso granted, non mostrarlo più
  // Ma se ha il permesso granted ma manca la subscription, mostralo comunque
  if (dismissed === 'true' && permission !== 'granted') {
    return 'hidden';
  }

  // Altrimenti mostra il banner per abilitare le notifiche
  return 'enable-notifications';
}

/**
 * Configura il contenuto del banner in base allo stato
 */
function configureBanner(state: BannerState): void {
  const banner = document.getElementById('notification-banner');
  const icon = banner?.querySelector('.banner-icon') as HTMLElement;
  const title = banner?.querySelector('.banner-title') as HTMLElement;
  const text = banner?.querySelector('.banner-text') as HTMLElement;
  const button = document.getElementById('notification-banner-button') as HTMLButtonElement;

  if (!icon || !title || !text || !button) return;

  switch (state) {
    case 'enable-notifications':
      icon.textContent = '🔔';
      title.textContent = 'Abilita le Notifiche';
      text.textContent = 'Seleziona il tuo nome e ricevi un avviso quando inizia la partita';
      button.textContent = 'Attiva';
      button.onclick = handleEnableNotifications;
      break;

    case 'denied':
      icon.textContent = '🔕';
      title.textContent = 'Notifiche bloccate';
      text.textContent = 'Le notifiche sono state bloccate. Vai nelle impostazioni del browser per riattivarle.';
      button.textContent = 'Apri impostazioni';
      button.onclick = handleOpenSettings;
      break;
  }
}

/**
 * Gestisce l'apertura delle impostazioni
 */
function handleOpenSettings(): void {
  const deviceType = getDeviceType();
  let message = 'Vai nelle impostazioni del browser per abilitare le notifiche.';

  switch (deviceType) {
    case 'ios':
      message = 'Vai in Impostazioni > Safari > Impostazioni sito e consenti le notifiche per questo sito.';
      break;
    case 'android':
      message = 'Vai in Impostazioni > Siti e autorizzazioni > Notifiche e consenti le notifiche per questo sito.';
      break;
    case 'desktop':
      message = 'Vai in Impostazioni > Privacy e sicurezza > Impostazioni sito > Notifiche, e rimuovi il blocco per questo sito.';
      break;
  }

  alert(message);
  closeBanner();
}

/**
 * Gestisce l'attivazione delle notifiche
 */
async function handleEnableNotifications(): Promise<void> {
  const banner = document.getElementById('notification-banner');

  try {
    // 1. Chiedi chi è l'utente
    const playerSelected = await ensurePlayerSelected();
    if (!playerSelected) {
      return;
    }

    // 2. Attiva le notifiche e salva la subscription
    await subscribeToPushNotifications();

    // 3. Nascondi il banner
    if (banner) {
      banner.classList.add('hidden');
    }

    // 4. Mostra messaggio di successo
    showSuccessMessage('✅ Notifiche attivate con successo!');
  } catch (err) {
    console.error('❌ Errore attivazione notifiche:', err);

    // Se l'utente ha negato il permesso, mostra il messaggio appropriato
    if (Notification.permission === 'denied') {
      configureBanner('denied');
    } else {
      // Mostra messaggio di errore all'utente
      showErrorBanner(
        err instanceof Error ? err.message : 'Errore durante l\'attivazione delle notifiche. Riprova più tardi.'
      );
    }
  }
}

/**
 * Mostra un banner di errore all'utente
 */
function showErrorBanner(errorMessage: string): void {
  const banner = document.getElementById('notification-banner');
  const icon = banner?.querySelector('.banner-icon') as HTMLElement;
  const title = banner?.querySelector('.banner-title') as HTMLElement;
  const text = banner?.querySelector('.banner-text') as HTMLElement;
  const button = document.getElementById('notification-banner-button') as HTMLButtonElement;

  if (!icon || !title || !text || !button || !banner) return;

  icon.textContent = '⚠️';
  title.textContent = 'Errore';
  text.textContent = errorMessage;
  button.textContent = 'Riprova';
  button.onclick = handleEnableNotifications;

  banner.classList.remove('hidden');
}

/**
 * Mostra un messaggio di successo temporaneo
 */
function showSuccessMessage(message: string): void {
  const banner = document.getElementById('notification-banner');
  const icon = banner?.querySelector('.banner-icon') as HTMLElement;
  const title = banner?.querySelector('.banner-title') as HTMLElement;
  const text = banner?.querySelector('.banner-text') as HTMLElement;
  const button = document.getElementById('notification-banner-button') as HTMLButtonElement;

  if (!icon || !title || !text || !button || !banner) return;

  icon.textContent = '✅';
  title.textContent = 'Tutto pronto!';
  text.textContent = message;
  button.style.display = 'none';

  banner.classList.remove('hidden');

  // Nascondi dopo 3 secondi
  setTimeout(() => {
    banner.classList.add('hidden');
    button.style.display = '';
  }, 3000);
}

/**
 * Chiude il banner
 */
function closeBanner(): void {
  const banner = document.getElementById('notification-banner');
  if (banner) {
    banner.classList.add('hidden');
    localStorage.setItem('biliardino_notification_dismissed', 'true');
  }
}

/**
 * Inizializza il sistema di notifiche
 */
function init(): void {
  const enableButton = document.getElementById('notification-banner-button');
  const closeButton = document.getElementById('notification-banner-close');

  if (enableButton) {
    enableButton.addEventListener('click', handleEnableNotifications);
  }

  if (closeButton) {
    closeButton.addEventListener('click', closeBanner);
  }

  showNotificationBannerIfNeeded();
}

// Avvia quando il DOM è pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
