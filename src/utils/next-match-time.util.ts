/**
 * Orari fissi delle partite
 */
const MATCH_TIMES = [
  { hour: 11, minute: 0, label: '11:00' },
  { hour: 16, minute: 0, label: '16:00' }
] as const;

/**
 * Determina il prossimo orario di partita in base all'ora corrente
 * Logica:
 * - Prima delle 11:00 → 11:00
 * - Dalle 11:00 alle 16:00 → 16:00
 * - Dopo le 16:00 → 11:00 del giorno successivo
 *
 * @param now - Data corrente (default: new Date())
 * @returns L'orario della prossima partita (es. "11:00")
 */
export function getNextMatchTime(now: Date = new Date()): string {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const matchTime of MATCH_TIMES) {
    const matchMinutes = matchTime.hour * 60 + matchTime.minute;

    // Se il match è nel futuro oggi, restituiscilo
    if (currentMinutes < matchMinutes) {
      return matchTime.label;
    }
  }

  // Se siamo dopo tutti gli orari di oggi, restituisci il primo di domani
  return MATCH_TIMES[0].label;
}

/**
 * Verifica se siamo in una finestra di 15 minuti prima del match
 * (10:45-11:00 o 15:45-16:00)
 */
export function isNearMatchTime(now: Date = new Date()): boolean {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const matchTime of MATCH_TIMES) {
    const matchMinutes = matchTime.hour * 60 + matchTime.minute;
    const windowStart = matchMinutes - 15;

    if (currentMinutes >= windowStart && currentMinutes < matchMinutes) {
      return true;
    }
  }

  return false;
}
