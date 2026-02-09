import styles from '../styles/notifications.module.css';
import { API_BASE_URL, BASE_PATH, VAPID_PUBLIC_KEY } from './config/env.config';
import IOS_PWA_INSTALL_BANNER_TEMPLATE from './pwa-ios-banner.html?raw';
import { getAllPlayers } from './services/player.service';
import { getRegisteredPlayerName } from './utils/notification-status.util';

/**
 * Subscribes a player to push notifications.
 * 
 * This function handles the complete push notification subscription flow:
 * 1. Validates player data and browser support
 * 2. Requests notification permission from the user
 * 3. Gets or creates a push subscription
 * 4. Registers the subscription with the backend API
 * 5. Stores subscription data locally
 * 
 * @param playerId - The unique identifier of the player
 * @param playerName - The name of the player
 * @returns A promise that resolves to the PushSubscription object
 * @throws {Error} If player data is missing
 * @throws {Error} If VAPID public key is not configured
 * @throws {Error} If push notifications are not supported by the browser
 * @throws {Error} If notifications API is unavailable
 * @throws {Error} If user denies notification permission
 * @throws {Error} If subscription registration with the API fails
 * 
 */
export const subscribeToPushNotifications = async (playerId: number, playerName: string): Promise<PushSubscription> => {
  if (!playerId || !playerName) throw new Error('Player data missing');
  if (!VAPID_PUBLIC_KEY) throw new Error('VAPID public key missing');
  if (!('PushManager' in window || navigator.pushManager)) throw new Error('Push not supported');

  if (!('Notification' in window)) throw new Error('Notifications unavailable');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications not granted');

  const header = document.querySelector(`.${styles.notificationHeader}`);
  if (header) header.classList.add(styles.loading);

  localStorage.setItem(PLAYER_ID_KEY, String(playerId));
  localStorage.setItem(PLAYER_NAME_KEY, playerName);

  const pushManager = await getPushManager();
  const existing = await pushManager.getSubscription();
  const subscription = existing ?? await pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  });
  const response = await fetch(`${API_BASE_URL}/subscription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription, playerId, playerName })
  });
  if (header) header.classList.remove(styles.loading);
  if (!response.ok) throw new Error('Subscription registration failed');

  localStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(subscription));

  return subscription;
};

export function initNotification(): void {
  initNotificationButton();
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

  const notificationBtn = createNotificationButton();
  header.appendChild(notificationBtn);

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

    try {
      await subscribeToPushNotifications(playerId, playerName);
      collapseInlineSelect(button);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Errore sconosciuto';
      alert('Errore durante la registrazione delle notifiche: ' + errorMessage);
      console.error('[Notifications]', err);
      collapseInlineSelect(button);
    }

    updateButtonState();
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


  button.addEventListener('click', (e) => {
    e.preventDefault();

    showIosPwaBannerIfNeeded();
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(() => {
        updateButtonState();
      });
    } else {
      toggleInlineSelect(button);
    }
  });

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
      bannerContainer.innerHTML = IOS_PWA_INSTALL_BANNER_TEMPLATE;
      document.body.appendChild(bannerContainer);
    }
  }
}

declare global {
  interface Navigator {
    pushManager?: PushManager;
  }
  interface Window {
    pushManager?: PushManager;
  }
}

const SUBSCRIPTION_KEY = 'biliardino_subscription';
const PLAYER_ID_KEY = 'biliardino_player_id';
const PLAYER_NAME_KEY = 'biliardino_player_name';

const collapseTimers = new Map<HTMLElement, number>();
let easterEggClickCount = 0;
let easterEggResetTimer: number | null = null;

function urlBase64ToUint8Array(base64String: string): BufferSource | string {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

function isDeclarativePushSupported(): boolean {
  return typeof navigator.pushManager?.subscribe === 'function';
}

async function getPushManager(): Promise<PushManager> {
  if (typeof navigator.pushManager?.subscribe === 'function') {
    return navigator.pushManager;
  }

  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager;
  }

  throw new Error('PushManager non disponibile');
}