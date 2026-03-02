// In dev mode usa il repository mock (dati in memoria, no Firebase).
// In produzione usa Firebase. Rollup elimina il ramo non usato (dead-code elimination).
const repo = __DEV_MODE__
  ? await import('./repository.mock')
  : await import('./repository.firebase.js');

export const fetchPlayers = repo.fetchPlayers;
export const fetchMatches = repo.fetchMatches;
export const parseMatchDTO = repo.parseMatchDTO;
export const fetchRunningMatch = repo.fetchRunningMatch;
export const updatePlayersHash = repo.updatePlayersHash;
export const updateMatchesHash = repo.updateMatchesHash;
export const saveMatch = repo.saveMatch;
export const saveRunningMatch = repo.saveRunningMatch;
export const clearRunningMatch = repo.clearRunningMatch;
export const savePlayer = repo.savePlayer;
export const deletePlayer = repo.deletePlayer;
