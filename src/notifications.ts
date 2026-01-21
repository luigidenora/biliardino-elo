import styles from '../styles/notifications.module.css';
import { getAllPlayers } from './services/player.service';
import { areNotificationsActive, getRegisteredPlayerName } from './utils/notification-status.util';
/**
 * Inizializza il servizio di notifiche push
 */
export function initNotification(): void {
  self.addEventListener("install", (event) => {
    (self as any).skipWaiting();
  });

  self.addEventListener("activate", (event) => {
    console.log("PWA service worker attivato");
  });

  self.addEventListener("fetch", (event) => {
    // fallback: lascia tutto pass-through per ora
  });
  self.addEventListener("push", (event: any/* PushEvent */) => {
    const data = event.data?.json() || {};

    const title = data.title || "CA Biliardino";
    const options = {
      body: data.body || "Nuova partita generata!",
      icon: "/icon-192.png",
      data: data.url || "/",
    };

    event.waitUntil((self as any).registration.showNotification(title, options));
  });

  self.addEventListener("notificationclick", (event: any/* NotificationEvent */) => {
    event.notification.close();
    const url = event.notification.data;
    event.waitUntil((self as any).clients.openWindow(url));
  });



  initNotificationButton();
}

// Timer registry for auto-collapse of expanded button
const collapseTimers = new Map<HTMLElement, number>();

async function notificationsSubscribe() {
  const reg = await navigator.serviceWorker.ready;

  const existingSub = await reg.pushManager.getSubscription();

  if (existingSub) {
    // Se abbiamo già salvato la stessa subscription in localStorage, evitiamo doppio POST
    const saved = localStorage.getItem("notification_subscription");
    if (saved && JSON.stringify(existingSub) === saved) {
      console.log("🔄 Subscription già salvata, nessuna azione necessaria");
      return;
    }
  }

  const subscription = existingSub || await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(process.env.VITE_VAPID_PUBLIC_KEY),
  });

  try {
    await fetch("/api/subscription", {
      method: "POST",
      body: JSON.stringify(subscription),
      headers: { "Content-Type": "application/json" },
    });
    localStorage.setItem("notification_subscription", JSON.stringify(subscription));
    console.log("Subscription salvata correttamente");
  } catch (err) {
    console.error("Errore salvataggio subscription:", err);
  }
}
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
    toggleInlineSelect(button);
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
  const savedId = localStorage.getItem('biliardino_player_id') || localStorage.getItem('selected_player_id');
  players.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = String(p.id);
    opt.textContent = p.name;
    if (savedId && String(p.id) === savedId) opt.selected = true;
    inlineSelect.appendChild(opt);
  });

  inlineSelect.addEventListener('change', async () => {
    const playerId = Number(inlineSelect.value);
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
  const fallbackAvatar = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSIjZTBlMGUwIi8+PGNpcmNsZSBjeD0iMjQiIGN5PSIxNSIgcj0iNyIgZmlsbD0iIzcyN2Y3MCIvPjxwYXRoIGQ9Ik0gMTAgMzAgQyAxMCAyNCAyNiAyMCAyNiAyMCBDIDI2IDIwIDQyIDI0IDQyIDMwIiBmaWxsPSIjNzI3ZjcwIi8+PC9zdmc+`;
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
  button.appendChild(inlineSelect);
  button.appendChild(avatar);
  button.appendChild(notificationIcon);

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
  button.setAttribute('data-tooltip', '');
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
  // Restore tooltip
  const playerName = getRegisteredPlayerName();
  button.setAttribute('data-tooltip', playerName || 'Notifiche');
}

/**
 * Aggiorna lo stato dell'icona/avatar in base alle notifiche
 */
async function updateButtonState(): Promise<void> {
  const button = document.getElementById('notification-user-button');
  if (!button) return;

  const avatarImg = button.querySelector(`.${styles.userAvatar}`) as HTMLImageElement;
  const notificationIcon = button.querySelector(`.${styles.notificationUserIcon}`) as HTMLElement;

  const isActive = areNotificationsActive();
  const playerName = getRegisteredPlayerName();
  const playerId = localStorage.getItem('biliardino_player_id');

  // Aggiorna il tooltip con il nome utente
  const tooltipText = playerName ? playerName : 'Notifiche';
  button.setAttribute('data-tooltip', tooltipText);

  if (isActive && playerName) {
    // Notifiche attive con utente - mostra avatar con puntino verde
    if (avatarImg && playerId) {
      avatarImg.src = `/biliardino-elo/avatars/${playerId}.webp`;
    }
    button.classList.add(styles.active);
    button.classList.remove(styles.inactive);
  } else if (playerName) {
    // Utente selezionato ma notifiche non attive - icona con linea
    if (notificationIcon) notificationIcon.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      </svg>
    `;
    button.classList.add(styles.inactive);
    button.classList.remove(styles.active);
  } else {
    // Nessun utente selezionato - icona standard grigia
    if (notificationIcon) notificationIcon.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
      </svg>
    `;
    button.classList.add(styles.inactive);
    button.classList.remove(styles.active);
  }
}

async function subscribeAndSave(playerId: number, playerName: string): Promise<void> {
  debugger;
  const reg = await navigator.serviceWorker.ready;

  const existingSub = await reg.pushManager.getSubscription();
  const subscription = existingSub || await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(process.env.VITE_VAPID_PUBLIC_KEY),
  });

  const body = { subscription, playerId, playerName };
  await fetch('/api/subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  localStorage.setItem('biliardino_player_id', String(playerId));
  localStorage.setItem('biliardino_player_name', playerName);
  // Back-compat keys if referenced elsewhere
  localStorage.setItem('selected_player_id', String(playerId));
  localStorage.setItem('selected_player_name', playerName);
  localStorage.setItem('biliardino_subscription', JSON.stringify(subscription));
}

// Inizializza quando il DOM è pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNotificationButton);
} else {
  initNotificationButton();
}

