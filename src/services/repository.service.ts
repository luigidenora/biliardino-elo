// Import condizionale basato su __DB_PROVIDER__ (compile-time constant).
// Rollup elimina dal bundle le implementazioni non usate (dead-code elimination):
//   'mock'     → solo repository.mock     (dev locale, nessuna chiamata DB reale)
//   'supabase' → solo repository.supabase (PostgreSQL via Supabase)
//   'firebase' → solo repository.firebase (Firestore, default produzione)
const repo =
  __DB_PROVIDER__ === 'mock'     ? await import('./repository.mock') :
  __DB_PROVIDER__ === 'supabase' ? await import('./repository.supabase.js') :
                                   await import('./repository.firebase.js');

export const updatePlayersHash = repo.updatePlayersHash;
export const updateMatchesHash = repo.updateMatchesHash;
export const fetchPlayers = repo.fetchPlayers;
export const fetchMatches = repo.fetchMatches;
export const saveMatch = repo.saveMatch;
export const parseMatchDTO = repo.parseMatchDTO;
export const saveRunningMatch = repo.saveRunningMatch;
export const fetchRunningMatch = repo.fetchRunningMatch;
export const clearRunningMatch = repo.clearRunningMatch;
export const savePlayer = repo.savePlayer;
export const deletePlayer = repo.deletePlayer;
