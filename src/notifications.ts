import styles from '../styles/notifications.module.css';
import { API_BASE_URL, BASE_PATH, VAPID_PUBLIC_KEY } from './config/env.config';
import BANNER_TEMPLATE from './notification-banner.html?raw';
import IOS_MODAL_TEMPLATE from './ios-notification-modal.html?raw';
import { getAllPlayers } from './services/player.service';
import { getRegisteredPlayerName } from './utils/notification-status.util';
/**
 * Inizializza il servizio di notifiche push
 */
export function initNotification(): void {
  // NON sottoscrivere automaticamente su iOS - aspetta user gesture dalla modale
  initNotificationButton();
}

// LocalStorage key for iOS modal dismissal
const IOS_MODAL_DISMISSED_KEY = 'biliardino_ios_modal_dismissed';

// Timer registry for auto-collapse of expanded button
const collapseTimers = new Map<HTMLElement, number>();

// Easter egg counter for test notifications page access
let easterEggClickCount = 0;
let easterEggResetTimer: number | null = null;

declare global {
  // Safari exposes pushManager on window for Declarative Web Push
  interface Window {
    pushManager?: PushManager;
  }
}

// Detect Declarative Web Push support (Safari/WebKit)
function isDeclarativePushSupported(): boolean {
  return typeof window !== 'undefined' && 'pushManager' in window && !!window.pushManager;
}

// Normalize PushManager retrieval: use window.pushManager on WebKit, SW registration elsewhere
async function getPushManager(): Promise<PushManager> {
  if (isDeclarativePushSupported()) {
    return window.pushManager as PushManager;
  }

  if (('serviceWorker' in navigator)) {
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager;
  } else {
    throw new Error('Service workers non supportati su questo browser');
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
/**
 * Crea e gestisce il pulsante delle notifiche nell'header
 */
export function initNotificationButton(): void {
  const header = createNotificationHeader();
  document.body.appendChild(header);
  updateButtonState();
}

/**
 * Crea il header container con icona notifiche minimal
 */
function createNotificationHeader(): HTMLElement {
  const header = document.createElement('div');
  header.className = styles.notificationHeader;

  const button = createNotificationButton();
  header.appendChild(button);
  button.addEventListener('click', (e) => {
    e.preventDefault();

    // Easter egg: 6 clicks to access test notifications page
    handleEasterEggClick(button);

    showIosPwaBannerIfNeeded();
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(() => {
        updateButtonState();
      });
    } else {
      toggleInlineSelect(button);
    }
  });

  return header;
}

/**
 * Crea l'elemento HTML del pulsante con icona e avatar
 */
function createNotificationButton(): HTMLElement {
  const button = document.createElement('button');
  button.id = 'notification-user-button';
  button.className = styles.notificationUserButton;
  (button as HTMLButtonElement).type = 'button';
  button.setAttribute('aria-label', 'Impostazioni Notifiche');
  button.setAttribute('data-tooltip', 'Notifiche');

  // Inline select hidden inside the button
  const inlineSelect = document.createElement('select');
  inlineSelect.className = styles.notificationInlineSelect;
  inlineSelect.setAttribute('aria-label', 'Seleziona utente');
  inlineSelect.setAttribute('id', 'select-notification-player');

  const players = [...getAllPlayers().toSorted((a, b) => a.name.localeCompare(b.name))];
  const savedId = localStorage.getItem('biliardino_player_id');

  // Opzione vuota iniziale
  const placeholderOpt = document.createElement('option');
  placeholderOpt.value = '';
  placeholderOpt.textContent = 'Seleziona utente...';
  placeholderOpt.disabled = true;
  if (!savedId) placeholderOpt.selected = true;
  inlineSelect.appendChild(placeholderOpt);

  players.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = String(p.id);
    opt.textContent = p.name;
    if (savedId && String(p.id) === savedId) opt.selected = true;
    inlineSelect.appendChild(opt);
  });

  inlineSelect.addEventListener('change', async () => {
    const playerId = Number(inlineSelect.value);
    if (!playerId) {
      collapseInlineSelect(button);
      return;
    }
    const playerName = players.find(p => p.id === playerId)?.name || '';

    // Su iOS con Declarative Web Push, mostra modale invece di sottoscrivere direttamente
    if (isDeclarativePushSupported() && shouldShowIosModal()) {
      collapseInlineSelect(button);
      showIosNotificationModal(playerId, playerName);
      return;
    }

    try {
      await subscribeAndSave(playerId, playerName);
      collapseInlineSelect(button);
      updateButtonState();
    } catch (err) {
      console.error('Errore registrazione', err);
      collapseInlineSelect(button);
    }
  });

  inlineSelect.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  inlineSelect.addEventListener('blur', () => {
    // Auto-collapse after short delay to allow option click
    const timerId = window.setTimeout(() => {
      collapseInlineSelect(button);
      collapseTimers.delete(button);
    }, 200);
    collapseTimers.set(button, timerId);
  });

  // Avatar dell'utente - nascosto di default
  const avatar = document.createElement('img');
  avatar.className = styles.userAvatar;
  avatar.alt = 'Avatar Utente';
  avatar.setAttribute('data-player-avatar', 'true');
  const fallbackAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJncmFkIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgeDE9IjAlIiB5MT0iMCUiIHgyPSIwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNlMGUwZTA7c3RvcC1vcGFjaXR5OjEiIC8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdHlsZT0ic3RvcC1jb2xvcjojZjVmNWY1O3N0b3Atb3BhY2l0eToxIiAvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgZmlsbD0idXJsKCNncmFkKSIvPjxjaXJjbGUgY3g9IjI0IiBjeT0iMTUiIHI9IjciIGZpbGw9IiM3OTdhYjEiLz48cGF0aCBkPSJNIDEwIDMwIEMgMTAgMjQgMTYgMjAgMjQgMjAgQyAzMiAyMCAzOCAyNCAzOCAzMCBDIDM4IDM4IDMyIDQyIDI0IDQyIEMgMTYgNDIgMTAgMzggMTAgMzAiIGZpbGw9IiM3OTdhYjEiLz48L3N2Zz4=';
  avatar.addEventListener('error', () => {
    avatar.src = fallbackAvatar;
  });

  // Icona notifiche (SVG)
  const notificationIcon = document.createElement('span');
  notificationIcon.className = styles.notificationUserIcon;
  notificationIcon.setAttribute('aria-hidden', 'true');
  notificationIcon.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
    </svg>
  `;

  // Order: select (left side), then avatar/icon (right side)
  button.appendChild(avatar);
  button.appendChild(notificationIcon);
  button.appendChild(inlineSelect);

  return button;
}

function toggleInlineSelect(button: HTMLElement): void {
  const select = button.querySelector(`.${styles.notificationInlineSelect}`) as HTMLSelectElement | null;
  if (!select) return;

  const isExpanded = button.classList.contains(styles.notificationExpanded);
  if (isExpanded) {
    collapseInlineSelect(button);
    return;
  }

  // Expand the button
  button.classList.add(styles.notificationExpanded);
  // Hide tooltip while expanded
  requestAnimationFrame(() => {
    select.focus();
    // Try to open the native picker
    try {
      select.click();
    } catch {
      // Ignore errors
    }
  });
}

function collapseInlineSelect(button: HTMLElement): void {
  button.classList.remove(styles.notificationExpanded);
  const existingTimer = collapseTimers.get(button);
  if (existingTimer) {
    window.clearTimeout(existingTimer);
    collapseTimers.delete(button);
  }
}

/**
 * Aggiorna lo stato dell'icona/avatar in base alle notifiche
 */
async function updateButtonState(): Promise<void> {
  const button = document.getElementById('notification-user-button');
  if (!button) return;

  const avatarImg = button.querySelector(`.${styles.userAvatar}`) as HTMLImageElement;
  const notificationIcon = button.querySelector(`.${styles.notificationUserIcon}`) as HTMLElement;
  const allowed = Notification.permission === 'granted';

  let tooltipText = allowed ? 'Seleziona Giocatore' : 'Abilita notifiche';
  const playerId = localStorage.getItem('biliardino_player_id');
  // Default - icona campanello standard
  if (notificationIcon) notificationIcon.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
      </svg>
    `;

  if (!allowed) {
    // Notifiche non permesse - icona campanello barrata
    if (notificationIcon) notificationIcon.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      </svg>
    `;
  } else if (playerId) {
    // Notifiche permesse e utente selezionato - mostra avatar
    if (avatarImg) {
      avatarImg.src = `${BASE_PATH}avatars/${playerId}.webp`;
    }

    tooltipText += playerId ? ` - Utente: ${getRegisteredPlayerName()}` : ' - Nessun utente selezionato';
  }
  if (allowed && playerId) {
    // Notifiche permesse e utente selezionato - verifica subscription
    if (localStorage.getItem('biliardino_subscription')) {
      button.classList.add(styles.active);
      button.classList.remove(styles.inactive);
      tooltipText = 'Notifiche attive';
    } else {
      // No subscription salvata - notifiche offline
      button.classList.add(styles.inactive);
      button.classList.remove(styles.active);
      tooltipText = 'Errori nella subscription, riprova';
    }
  }

  button.setAttribute('data-tooltip', tooltipText);
}

async function subscribeAndSave(playerId: number, playerName: string): Promise<void> {
  /* FOR DEBUG ON IPHONE: */ alert('Registrazione alle notifiche in corso...');
  const declarativeSupported = isDeclarativePushSupported();

  if (!declarativeSupported && !('serviceWorker' in navigator)) {
    const errorMsg = 'Service workers non supportati su questo browser';
    /* FOR DEBUG ON IPHONE: */ alert(errorMsg);
    throw new Error(errorMsg);
  }
  /* FOR DEBUG ON IPHONE: */ alert(declarativeSupported ? 'Declarative Web Push disponibile' : 'Service workers supportati su questo browser');

  // Save player selection immediately to differentiate selection vs subscription failure
  localStorage.setItem('biliardino_player_id', String(playerId));
  localStorage.setItem('biliardino_player_name', playerName);

  try {
    const pushManager = await getPushManager();
    /* FOR DEBUG ON IPHONE: */ alert(declarativeSupported ? 'PushManager (window) pronto' : 'Service worker pronto');

    if (!VAPID_PUBLIC_KEY) {
      throw new Error('Chiave VAPID mancante, contattare lo sviluppatore');
    }
    /* FOR DEBUG ON IPHONE: */ alert('Chiave VAPID presente');
    // Get or create push subscription
    const existingSub = await pushManager.getSubscription();
    const subscription = existingSub || await pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    /* FOR DEBUG ON IPHONE: */ alert('Subscription ottenuta');
    // Send subscription to server with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    /* FOR DEBUG ON IPHONE: */ alert('Invio subscription al server');
    try {
      const response = await fetch(`${API_BASE_URL}/subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription, playerId, playerName }),
        signal: controller.signal
      });
      /* FOR DEBUG ON IPHONE: */ alert('Risposta ricevuta dal server');
      clearTimeout(timeoutId);

      if (!response.ok) {
        /* FOR DEBUG ON IPHONE: */ alert('Errore nella risposta del server');
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error || `Errore API: ${response.status} ${response.statusText}`;
        throw new Error(errorMsg);
      }
      /* FOR DEBUG ON IPHONE: */ alert('Subscription registrata con successo');

      // Only save subscription to localStorage after successful API call
      localStorage.setItem('biliardino_subscription', JSON.stringify(subscription));
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  } catch (err) {
    /* FOR DEBUG ON IPHONE: */ alert('Errore durante la registrazione delle notifiche');
    // Remove only subscription on failure, keep player selection
    localStorage.removeItem('biliardino_subscription');

    const errorMessage = err instanceof Error ? err.message : 'Errore sconosciuto';
    // Don't show alert twice for service worker error (already shown above)
    alert('Errore durante la registrazione delle notifiche: ' + errorMessage);
    console.error('Errore registrazione notifiche:', err);
    throw err;
  } finally {
    /* FOR DEBUG ON IPHONE: */ alert('Aggiornamento stato pulsante notifiche');
    updateButtonState();
  }
}

/**
 * Easter egg: 6 clicks on notification button to access test page
 */
function handleEasterEggClick(button: HTMLElement): void {
  easterEggClickCount++;

  // Reset counter after 3 seconds of inactivity
  if (easterEggResetTimer !== null) {
    window.clearTimeout(easterEggResetTimer);
  }
  easterEggResetTimer = window.setTimeout(() => {
    easterEggClickCount = 0;
    easterEggResetTimer = null;
  }, 3000);

  // Show progress after 3rd click
  if (easterEggClickCount >= 3 && easterEggClickCount < 6) {
    const remaining = 6 - easterEggClickCount;
    button.setAttribute('data-tooltip', `${remaining} click rimanenti...`);
  }

  // Navigate to test page after 6 clicks
  if (easterEggClickCount === 6) {
    easterEggClickCount = 0;
    if (easterEggResetTimer !== null) {
      window.clearTimeout(easterEggResetTimer);
      easterEggResetTimer = null;
    }

    // Navigate directly without confirmation
    window.location.href = `${BASE_PATH}test-notifications.html`;
  }
}

/**
 * Mostra il banner di installazione PWA per iOS se applicabile
 */
function showIosPwaBannerIfNeeded(): void {
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isInStandalone
    = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true;
  if (isIos) {
    if (!isInStandalone) {
      document.getElementById('ios-pwa-install-banner')?.remove();
      const bannerContainer = document.createElement('div');
      bannerContainer.id = 'ios-pwa-install-banner';
      bannerContainer.className = styles.iosPwaInstallBanner;
      bannerContainer.innerHTML = BANNER_TEMPLATE;
      document.body.appendChild(bannerContainer);
    }
  }
}

/**
 * Verifica se la modale iOS deve essere mostrata
 */
function shouldShowIosModal(): boolean {
  // Non mostrare se l'utente ha già una subscription attiva
  if (localStorage.getItem('biliardino_subscription')) {
    return false;
  }

  // Non mostrare se l'utente ha già visto/rifiutato la modale
  if (localStorage.getItem(IOS_MODAL_DISMISSED_KEY) === 'true') {
    return false;
  }

  return true;
}

/**
 * Mostra la modale informativa iOS per le notifiche
 */
function showIosNotificationModal(playerId: number, playerName: string): void {
  // Rimuovi eventuali modali esistenti
  document.getElementById('ios-notification-modal-container')?.remove();

  // Crea il container della modale
  const modalContainer = document.createElement('div');
  modalContainer.id = 'ios-notification-modal-container';
  modalContainer.innerHTML = IOS_MODAL_TEMPLATE;

  // Applica le classi CSS dal module
  const overlay = modalContainer.querySelector('.ios-notification-modal-overlay');
  const modal = modalContainer.querySelector('.ios-notification-modal');
  const header = modalContainer.querySelector('.ios-notification-modal-header');
  const body = modalContainer.querySelector('.ios-notification-modal-body');
  const intro = modalContainer.querySelector('.ios-notification-modal-intro');
  const benefits = modalContainer.querySelector('.ios-notification-modal-benefits');
  const actions = modalContainer.querySelector('.ios-notification-modal-actions');
  const footer = modalContainer.querySelector('.ios-notification-modal-footer');
  const info = modalContainer.querySelector('.ios-notification-modal-info');
  const btnPrimary = modalContainer.querySelector('[data-action="activate"]');
  const btnSecondary = modalContainer.querySelector('[data-action="dismiss"]');

  if (overlay) overlay.className = styles.iosNotificationModalOverlay;
  if (modal) modal.className = styles.iosNotificationModal;
  if (header) header.className = styles.iosNotificationModalHeader;
  if (body) body.className = styles.iosNotificationModalBody;
  if (intro) intro.className = styles.iosNotificationModalIntro;
  if (benefits) benefits.className = styles.iosNotificationModalBenefits;
  if (actions) actions.className = styles.iosNotificationModalActions;
  if (footer) footer.className = styles.iosNotificationModalFooter;
  if (info) info.className = styles.iosNotificationModalInfo;
  if (btnPrimary) {
    btnPrimary.className = `${styles.iosNotificationModalBtn} ${styles.iosNotificationModalBtnPrimary}`;
  }
  if (btnSecondary) {
    btnSecondary.className = `${styles.iosNotificationModalBtn} ${styles.iosNotificationModalBtnSecondary}`;
  }

  // Aggiungi event listeners ai pulsanti
  btnPrimary?.addEventListener('click', async () => {
    // Questa è la user gesture richiesta da iOS
    try {
      await subscribeAndSave(playerId, playerName);
      removeIosModal();
      updateButtonState();
    } catch (err) {
      console.error('Errore durante la sottoscrizione', err);
      removeIosModal();
    }
  });

  btnSecondary?.addEventListener('click', () => {
    // Salva in localStorage che l'utente ha rifiutato
    localStorage.setItem(IOS_MODAL_DISMISSED_KEY, 'true');
    removeIosModal();
  });

  // Chiudi al click sull'overlay
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) {
      localStorage.setItem(IOS_MODAL_DISMISSED_KEY, 'true');
      removeIosModal();
    }
  });

  // Aggiungi al DOM
  document.body.appendChild(modalContainer);
}

/**
 * Rimuove la modale iOS dal DOM
 */
function removeIosModal(): void {
  const modalContainer = document.getElementById('ios-notification-modal-container');
  if (modalContainer) {
    // Aggiungi animazione di uscita
    const overlay = modalContainer.querySelector(`.${styles.iosNotificationModalOverlay}`);
    if (overlay) {
      overlay.classList.add('fade-out');
      setTimeout(() => {
        modalContainer.remove();
      }, 300);
    } else {
      modalContainer.remove();
    }
  }
}
