/**
 * Mappa VERCEL_ENV → chiave ambiente lobby.
 * 'production' isolato; tutto il resto ('preview', 'development') → 'preview'.
 */
export const lobbyEnv: 'production' | 'preview'
  = process.env.VERCEL_ENV === 'production' ? 'production' : 'preview';
