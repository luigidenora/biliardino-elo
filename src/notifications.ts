import styles from '../styles/notifications.module.css';
import { API_BASE_URL, VAPID_PUBLIC_KEY } from './config/env.config';
import BANNER_TEMPLATE from './notification-banner.html?raw';
import { getAllPlayers } from './services/player.service';
import { getRegisteredPlayerName } from './utils/notification-status.util';
/**
 * Inizializza il servizio di notifiche push
 */
export function initNotification(): void {
  initNotificationButton();
}

// Timer registry for auto-collapse of expanded button
const collapseTimers = new Map<HTMLElement, number>();

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  return new Uint8Array(
    atob(base64)
      .split("")
      .map((c) => c.charCodeAt(0))
  );
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
    const playerName = players.find((p) => p.id === playerId)?.name || '';
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
  avatar.addEventListener('error', () => { avatar.src = fallbackAvatar; });

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
    } catch { }
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

  var tooltipText = allowed ? 'Notifiche abilitate' : 'Abilita notifiche';
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
      avatarImg.src = `/biliardino-elo/avatars/${playerId}.webp`;
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
      tooltipText = 'Nessuna subscription';
    }
  }

  button.setAttribute('data-tooltip', tooltipText)
}

async function subscribeAndSave(playerId: number, playerName: string): Promise<void> {
  if ("serviceWorker" in navigator) {
    localStorage.setItem('biliardino_player_id', String(playerId));
    localStorage.setItem('biliardino_player_name', playerName);
    navigator.serviceWorker.ready.then(async (reg) => {
      const existingSub = await reg.pushManager.getSubscription();
      const subscription = existingSub || await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const body = { subscription, playerId, playerName };
      const response = await fetch(`${API_BASE_URL}/subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Errore API: ${response.status} ${response.statusText}`);
      }

      console.log('Subscription salvata con successo');
      localStorage.setItem('biliardino_subscription', JSON.stringify(subscription));

    }).catch((err) => {
      console.error('Service Worker non pronto', err);
      throw err;
    }).finally(() => {
      updateButtonState();
    });
  } else {
    console.error("Service workers are not supported.");
  }

}

/**
 * Mostra il banner di installazione PWA per iOS se applicabile
  */
function showIosPwaBannerIfNeeded() {
  if (Notification.permission === 'granted') return;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isInStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true;
  if (isIos) {
    if (!isInStandalone) {
      document.getElementById("ios-pwa-install-banner")?.remove();
      const bannerContainer = document.createElement("div");
      bannerContainer.id = "ios-pwa-install-banner";
      bannerContainer.className = styles.iosPwaInstallBanner;
      bannerContainer.innerHTML = BANNER_TEMPLATE;
      document.body.appendChild(bannerContainer);
    }
  }
}