/**
 * Lista hardcoded di playerIds admin
 * Solo questi utenti hanno accesso alla pagina matchmaking.html
 */
export const ADMIN_PLAYER_IDS = [
  25, // Andrea Gargaro
  18, // Admin 2
  22, // Admin 3
  13, // Admin 4
  21, // Admin 5
];

/**
 * Verifica se un giocatore è admin
 */
export function isPlayerAdmin(playerId: number | null | undefined): boolean {
  if (!playerId) return false;
  return ADMIN_PLAYER_IDS.includes(playerId);
}
