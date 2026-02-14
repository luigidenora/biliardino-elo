/**
 * Lista hardcoded di playerIds admin
 * Solo questi utenti possono vedere il pulsante match making
 */
export const ADMIN_PLAYER_IDS = [
  25, // Andrea Gargaro
  18, // Admin 2
  22, // Admin 3
];

/**
 * Verifica se un giocatore è admin
 */
export function isPlayerAdmin(playerId: number | null | undefined): boolean {
  if (!playerId) return false;
  return ADMIN_PLAYER_IDS.includes(playerId);
}
