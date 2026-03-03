// In dev mode usa Firebase in sola lettura per lavorare con dati reali.
// Imposta VITE_DEV_FIREBASE_READONLY=false per tornare al repository mock.
const useFirebaseRepoInDev = import.meta.env.VITE_DEV_FIREBASE_READONLY !== 'false';
const useMockRepo = __DEV_MODE__ && !useFirebaseRepoInDev;
const isDevReadOnlyMode = __DEV_MODE__ && useFirebaseRepoInDev;

const repo = useMockRepo
  ? await import('./repository.mock')
  : await import('./repository.firebase.js');

export const fetchPlayers = repo.fetchPlayers;
export const fetchMatches = repo.fetchMatches;
export const parseMatchDTO = repo.parseMatchDTO;
export const fetchRunningMatch = repo.fetchRunningMatch;

// Scritture: in dev mode bloccate con warning, in produzione passthrough a Firebase.
const devWriteBlock = (..._args: unknown[]): Promise<void> => {
  console.warn('[DEV] Scrittura bloccata in dev mode (read-only)');
  return Promise.resolve();
};

export const updatePlayersHash = isDevReadOnlyMode ? devWriteBlock : repo.updatePlayersHash;
export const updateMatchesHash = isDevReadOnlyMode ? devWriteBlock : repo.updateMatchesHash;
export const saveMatch = isDevReadOnlyMode ? devWriteBlock : repo.saveMatch;
export const saveRunningMatch = isDevReadOnlyMode ? devWriteBlock : repo.saveRunningMatch;
export const clearRunningMatch = isDevReadOnlyMode ? devWriteBlock : repo.clearRunningMatch;
export const savePlayer = isDevReadOnlyMode ? devWriteBlock : repo.savePlayer;
export const deletePlayer = isDevReadOnlyMode ? devWriteBlock : repo.deletePlayer;
