import styles from '../styles/notifications.module.css';
import { API_BASE_URL, BASE_PATH, VAPID_PUBLIC_KEY } from './config/env.config';
import IOS_PWA_INSTALL_BANNER_TEMPLATE from './pwa-ios-banner.html?raw';
import { getAllPlayers } from './services/player.service';
import { getRegisteredPlayerName } from './utils/notification-status.util';

let alertSubscriptionDiscrepancy = false;
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

  const pushManager = await getPushManager();
  const existing = await pushManager.getSubscription();
  console.log('[Notifications] existing subscription:', existing);
  const subscription = existing ?? await pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  });

  // Do not trust localStorage as source-of-truth. PushManager and the backend
  // are the canonical sources. Always attempt server registration (idempotent).

  // Persist local player info before attempting registration
  localStorage.setItem(PLAYER_ID_KEY, String(playerId));
  localStorage.setItem(PLAYER_NAME_KEY, playerName);

  // Register with server (idempotent on server side). This is called when local
  // state and PushManager state disagree, or local state is missing.
  const response = await fetch(`${API_BASE_URL}/subscription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription, playerId, playerName })
  });
  if (header) header.classList.remove(styles.loading);
  if (!response.ok) throw new Error('Subscription registration failed');

  // Save local subscription only on successful server registration to keep client/server in sync
  localStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(subscription));
  // Mark as verified locally since server just accepted the registration
  try {
    localStorage.setItem(SUBSCRIPTION_VERIFIED_KEY, 'true');
  } catch { }

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
  // On startup avoid server verification to reduce load; UI will reconcile locally.
  updateButtonState(false);
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

  const players = [...getAllPlayers()].sort((a, b) => a.name.localeCompare(b.name));
  const savedId = localStorage.getItem('biliardino_player_id');

  // Opzione per disiscriversi (in cima alla select)
  const unsubscribeOpt = document.createElement('option');
  unsubscribeOpt.value = 'unsubscribe';
  unsubscribeOpt.textContent = 'Rimuovi notifiche';
  inlineSelect.appendChild(unsubscribeOpt);

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
    const val = inlineSelect.value;

    if (val === 'unsubscribe') {
      // Unsubscribe: preferire PushManager (browser) come fonte di verità,
      // chiamare subscription.unsubscribe() se presente, poi notificare il BE.
      const savedSubscription = localStorage.getItem(SUBSCRIPTION_KEY);
      const savedPlayerId = localStorage.getItem(PLAYER_ID_KEY);

      // If no local cache, still attempt to unsubscribe any PM subscription
      if (!savedSubscription && !savedPlayerId) {
        try {
          const pm = await getPushManager();
          const pmSub = await pm.getSubscription();
          if (pmSub) await pmSub.unsubscribe();
        } catch { /* ignore */ }

        localStorage.removeItem(SUBSCRIPTION_KEY);
        localStorage.removeItem(PLAYER_ID_KEY);
        localStorage.removeItem(PLAYER_NAME_KEY);
        localStorage.removeItem(SUBSCRIPTION_VERIFIED_KEY);
        inlineSelect.value = '';
        collapseInlineSelect(button);
        await updateButtonState(false);
        return;
      }

      const header = document.querySelector(`.${styles.notificationHeader}`) as HTMLElement | null;
      if (header) header.classList.add(styles.loading);
      button.setAttribute('disabled', 'true');
      try {
        const subObj = savedSubscription ? JSON.parse(savedSubscription) : null;

        // Try unsubscribing via PushManager first
        let endpointToDelete: string | undefined = subObj?.endpoint;
        try {
          const pm = await getPushManager();
          const pmSub = await pm.getSubscription();
          if (pmSub) {
            // If browser has the same subscription, unsubscribe it
            if (subObj?.endpoint && pmSub.endpoint === subObj.endpoint) {
              try { await pmSub.unsubscribe(); } catch (e) { console.warn('[Notifications] unsubscribe() failed', e); }
            }
            endpointToDelete = pmSub.endpoint ?? endpointToDelete;
          }
        } catch (err) {
          console.debug('[Notifications] pushManager unavailable during unsubscribe', err);
        }

        const resp = await fetch(`${API_BASE_URL}/subscription`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId: Number(savedPlayerId), endpoint: endpointToDelete, subscription: subObj })
        });

        if (resp.ok || resp.status === 404) {
          localStorage.removeItem(SUBSCRIPTION_KEY);
          localStorage.removeItem(PLAYER_ID_KEY);
          localStorage.removeItem(PLAYER_NAME_KEY);
          localStorage.removeItem(SUBSCRIPTION_VERIFIED_KEY);
          inlineSelect.value = '';
          collapseInlineSelect(button);
          await updateButtonState(false);
          return;
        }

        throw new Error('Server delete failed');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Errore sconosciuto';
        alert('Errore durante la rimozione della subscription: ' + errorMessage);
        console.error('[Notifications] unsubscribe error', err);
        collapseInlineSelect(button);
        await updateButtonState(false);
        return;
      } finally {
        if (header) header.classList.remove(styles.loading);
        button.removeAttribute('disabled');
      }
    }

    const playerId = Number(val);
    if (!playerId) {
      collapseInlineSelect(button);
      return;
    }

    const playerName = players.find(p => p.id === playerId)?.name || '';

    try {
      await subscribeToPushNotifications(playerId, playerName);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Errore sconosciuto';
      alert('Errore durante la registrazione delle notifiche: ' + errorMessage);
      console.error('[Notifications]', err);
    }

    collapseInlineSelect(button);
    await updateButtonState(true);
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
        // User interaction: allow server verification
        updateButtonState(true);
      });
    } else {
      updateButtonState(true);
      toggleInlineSelect(button);
    }
  });

  return button;
}

function collapseInlineSelect(button: HTMLElement): void {
  const select = button.querySelector(`.${styles.notificationInlineSelect}`) as HTMLSelectElement | null;
  if (!select) return;
  // collapse visual expansion
  button.classList.remove(styles.notificationExpanded);
  try { select.blur(); } catch { }
  const timerId = collapseTimers.get(button);
  if (timerId) {
    window.clearTimeout(timerId);
    collapseTimers.delete(button);
  }
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
    try { select.click(); } catch { }
  });
}
async function updateButtonState(verifyServer = false): Promise<void> {
  // TODO DA RIVEDERE INTERAMENTE - questa funzione è diventata un po' complessa, va semplificata e divisa in funzioni più piccole. L'obiettivo è mantenere lo stato del pulsante sempre in sincronia con la realtà (PushManager + server), preferendo PM come fonte di verità e usando il server come verifica opzionale.
  if (isUpdatingButtonState) return;
  isUpdatingButtonState = true;
  try {
    const button = document.getElementById('notification-user-button') as HTMLElement | null;
    if (!button) return;

    const notificationIcon = button.querySelector(`.${styles.notificationUserIcon}`) as HTMLElement | null;
    const avatarImg = button.querySelector('[data-player-avatar]') as HTMLImageElement | null;

    const allowed = Notification.permission === 'granted';
    const playerIdStr = localStorage.getItem(PLAYER_ID_KEY);
    const playerId = playerIdStr ? Number(playerIdStr) : null;
    let tooltipText = '';

    // Show avatar and tooltip depending on whether a player is selected
    if (playerId) {
      if (avatarImg) {
        avatarImg.style.display = '';
        avatarImg.src = `${BASE_PATH}avatars/${playerId}.webp`;
      }
      tooltipText += ` - Utente: ${getRegisteredPlayerName()}`;
    } else {
      // No player selected: hide avatar to reflect cleared state
      if (avatarImg) {
        avatarImg.removeAttribute('src');
        avatarImg.style.display = 'none';
      }
      tooltipText = 'Nessun utente selezionato';
    }
    if (allowed && playerId) {
      // Notifiche permesse e utente selezionato - preferiamo usare PushManager
      // come fonte di verità, con localStorage come cache/fallback.
      let subscriptionToVerify: PushSubscription | null = null;
      try {
        const pm = await getPushManager();
        const pmSub = await pm.getSubscription();
        if (pmSub) {
          subscriptionToVerify = pmSub as unknown as PushSubscription;
          // persist locally for quicker future checks
          try { localStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(subscriptionToVerify)); } catch { }
        }
      } catch (err) {
        // PushManager unavailable: fall back to localStorage cache
        const localSubStr = localStorage.getItem(SUBSCRIPTION_KEY);
        if (localSubStr) {
          try {
            subscriptionToVerify = JSON.parse(localSubStr) as PushSubscription;
          } catch {
            subscriptionToVerify = null;
          }
        }
        console.debug('[Notifications] pushManager reconcile error (fallback to cache)', err);
      }

      if (!subscriptionToVerify) {
        button.classList.add(styles.inactive);
        button.classList.remove(styles.active);
        button.classList.remove(styles.verified);
        tooltipText = 'Notifiche disattivate';
      } else {
        const localVerified = localStorage.getItem(SUBSCRIPTION_VERIFIED_KEY) === 'true';

        if (!verifyServer) {
          // subscription exists locally (PushManager) - show active state.
          // Only mark `verified` if we've previously recorded a server verification
          button.classList.add(styles.active);
          button.classList.remove(styles.inactive);
          if (localVerified) {
            button.classList.add(styles.verified);
            tooltipText = 'Notifiche attive';
          } else {
            button.classList.remove(styles.verified);
            tooltipText = 'Notifiche attive';
          }
        } else {
          // Caller requested server verification: do lightweight server check
          try {
            const resp = await fetch(`${API_BASE_URL}/subscription`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ verify: true, playerId: Number(playerId), subscription: subscriptionToVerify })
            });

            if (!resp.ok) throw new Error('Server response error');
            const data = await resp.json();
            const exists = !!data?.exists;
            const matchingCount = Number(data?.count ?? 0);

            if (!exists) {
              // server doesn't have this subscription
              localStorage.removeItem(SUBSCRIPTION_VERIFIED_KEY);
              button.classList.add(styles.inactive);
              button.classList.remove(styles.active);
              button.classList.remove(styles.verified);
              // segnaliamo all utente che c'è discrepanza tra client e server, senza esporre dettagli tecnici chiediamo di riprovare
              tooltipText = 'Notifiche non attive, prova a registrarti di nuovo';
            } else {
              // server confirmed: mark verified locally and set active
              try { localStorage.setItem(SUBSCRIPTION_VERIFIED_KEY, 'true'); } catch { }
              button.classList.add(styles.active);
              button.classList.add(styles.verified);
              button.classList.remove(styles.inactive);
              tooltipText = matchingCount > 1 ? `Notifiche attive (${matchingCount})` : 'Notifiche attive (verificate)';
              if (matchingCount > 1 && !alertSubscriptionDiscrepancy) { // alert only once per session to avoid spamming
                alertSubscriptionDiscrepancy = true;
                alert(`Ci sono ${matchingCount} subscription attive per questo device. Per non ottenere notifiche duplicate, prova a disiscriverti e iscriverti di nuovo per risolvere eventuali discrepanze. Se il problema persiste, contatta il supporto.`);
              }
            }
          } catch (err) {
            console.error('[Notifications] Errore verifica subscription server:', err);
            // show error state with exclamation
            button.classList.add(styles.inactive);
            button.classList.remove(styles.active);
            button.classList.remove(styles.verified);
            tooltipText = 'Errore verifica server subscription';
          }
        }
      }
    }

    // Update icon based on resulting tooltip/state (show exclamation on errors)
    if (notificationIcon) {
      const defaultBell = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
      </svg>`;
      const bellSlash = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      </svg>`;
      const exclamation = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9"></circle>
        <line x1="12" y1="7" x2="12" y2="13"></line>
        <circle cx="12" cy="17" r="1"></circle>
      </svg>`;

      const isError = /errore|non trovata|nessuna subscription/i.test(tooltipText);
      if (!allowed) {
        notificationIcon.innerHTML = bellSlash;
      } else if (isError) {
        notificationIcon.innerHTML = exclamation;
      } else {
        notificationIcon.innerHTML = defaultBell;
      }
    }

    button.setAttribute('data-tooltip', tooltipText);
  } finally {
    isUpdatingButtonState = false;
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
const SUBSCRIPTION_VERIFIED_KEY = 'biliardino_subscription_verified';
const PLAYER_ID_KEY = 'biliardino_player_id';
const PLAYER_NAME_KEY = 'biliardino_player_name';

const NOTIF_STATES = {
  DISABLED: 'disabled', // browser notifications not granted
  INACTIVE: 'inactive', // no subscription present on device
  ACTIVE_WORKING: 'active-working', // subscription exists and BE confirms
  ACTIVE_BROKEN: 'active-broken', // subscription exists but BE missing / discrepancy
  ERROR: 'error'
} as const;

const STATE_CLASS_MAP: Record<string, string[]> = {
  [NOTIF_STATES.DISABLED]: [styles.inactive],
  [NOTIF_STATES.INACTIVE]: [styles.inactive],
  [NOTIF_STATES.ACTIVE_WORKING]: [styles.active, styles.verified],
  [NOTIF_STATES.ACTIVE_BROKEN]: [styles.active],
  [NOTIF_STATES.ERROR]: [styles.inactive]
};

function applyNotificationState(button: HTMLElement, state: string): string {
  // compute all possible state classes and remove them first
  const allStateClasses = new Set<string>();
  Object.values(STATE_CLASS_MAP).forEach(arr => arr.forEach(c => allStateClasses.add(c)));
  // also ensure loading class is cleared
  allStateClasses.add(styles.loading);

  allStateClasses.forEach(cls => button.classList.remove(cls));

  // Apply classes for requested state
  const classesToApply = STATE_CLASS_MAP[state] ?? [];
  classesToApply.forEach(cls => button.classList.add(cls));

  // Return a short tooltip for the state
  switch (state) {
    case NOTIF_STATES.DISABLED:
      return 'Notifiche disabilitate nel browser';
    case NOTIF_STATES.INACTIVE:
      return 'Notifiche non attive';
    case NOTIF_STATES.ACTIVE_WORKING:
      return 'Notifiche attive e funzionanti';
    case NOTIF_STATES.ACTIVE_BROKEN:
      return 'Notifiche attive ma non funzionanti (discrepanza BE)';
    case NOTIF_STATES.ERROR:
    default:
      return 'Errore verifica subscription';
  }
}

const collapseTimers = new Map<HTMLElement, number>();
const easterEggClickCount = 0;
const easterEggResetTimer: number | null = null;
let isUpdatingButtonState = false;

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    output[i] = rawData.charCodeAt(i);
  }
  return output.buffer as ArrayBuffer;
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

