/**
 * Utility per verificare e gestire lo stato delle notifiche
 */

/**
 * Verifica se le notifiche sono completamente attive e configurate
 * @returns true se utente selezionato, permesso concesso e subscription salvata
 */
export function areNotificationsActive(): boolean {
  const playerId = localStorage.getItem('biliardino_player_id');
  const savedSubscription = localStorage.getItem('biliardino_subscription');
  const permission = Notification.permission;

  return !!(playerId && savedSubscription && permission === 'granted');
}

/**
 * Ottiene l'ID del giocatore registrato
 */
export function getRegisteredPlayerId(): number | null {
  const playerId = localStorage.getItem('biliardino_player_id');
  return playerId ? Number(playerId) : null;
}

/**
 * Ottiene il nome del giocatore registrato
 */
export function getRegisteredPlayerName(): string | null {
  return localStorage.getItem('biliardino_player_name');
}

/**
 * Ottiene la subscription salvata
 */
export function getSavedSubscription(): PushSubscription | null {
  const saved = localStorage.getItem('biliardino_subscription');
  if (!saved) return null;

  try {
    return JSON.parse(saved) as PushSubscription;
  } catch {
    return null;
  }
}

/**
 * Verifica se l'utente è registrato (ha selezionato il giocatore)
 */
export function isUserRegistered(): boolean {
  const playerId = localStorage.getItem('biliardino_player_id');
  const playerName = localStorage.getItem('biliardino_player_name');
  return !!(playerId && playerName);
}

/**
 * Verifica se esiste una subscription attiva nel browser
 */
export async function hasActiveSubscription(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;

  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}

/**
 * Ottiene lo stato completo delle notifiche
 */
export async function getNotificationStatus(): Promise<{
  userRegistered: boolean;
  playerId: number | null;
  playerName: string | null;
  permission: NotificationPermission;
  hasSubscription: boolean;
  subscriptionSaved: boolean;
  fullyActive: boolean;
}> {
  const playerId = getRegisteredPlayerId();
  const playerName = getRegisteredPlayerName();
  const hasSubscription = await hasActiveSubscription();
  const subscriptionSaved = !!getSavedSubscription();

  return {
    userRegistered: isUserRegistered(),
    playerId,
    playerName,
    permission: Notification.permission,
    hasSubscription,
    subscriptionSaved,
    fullyActive: areNotificationsActive() && hasSubscription
  };
}
