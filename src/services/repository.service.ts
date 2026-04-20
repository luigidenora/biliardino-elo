// Import condizionale: in produzione (__DEV_MODE__ = false) il mock non viene mai importato
// e Rollup lo elimina completamente dal bundle.
const repo = await import('./repository.firebase.js');

export const updatePlayersHash = repo.updatePlayersHash;
export const updateMatchesHash = repo.updateMatchesHash;
export const fetchPlayers = repo.fetchPlayers;
export const fetchMatches = repo.fetchMatches;
export const saveMatch = repo.saveMatch;
export const fetchMatchById = repo.fetchMatchById;
export const parseMatchDTO = repo.parseMatchDTO;
export const saveRunningMatch = repo.saveRunningMatch;
export const fetchRunningMatch = repo.fetchRunningMatch;
export const clearRunningMatch = repo.clearRunningMatch;
export const savePlayer = repo.savePlayer;
export const deletePlayer = repo.deletePlayer;
