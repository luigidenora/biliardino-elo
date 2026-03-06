import type { IMatch, IMatchDTO, IRunningMatchDTO } from '@/models/match.interface';
import type { IPlayer, IPlayerDTO } from '@/models/player.interface';

// In dev mode usa Firebase in sola lettura per lavorare con dati reali.
// Imposta VITE_DEV_FIREBASE_READONLY=false per tornare al repository mock.
const useFirebaseRepoInDev = import.meta.env.VITE_DEV_FIREBASE_READONLY !== 'false';
const _useMockRepo = __DEV_MODE__ && !useFirebaseRepoInDev;
const _isDevReadOnlyMode = __DEV_MODE__ && useFirebaseRepoInDev;

type RepoModule = typeof import('./repository.firebase');
let _repoModule: RepoModule | null = null;

async function getRepo(): Promise<RepoModule> {
  if (_repoModule) return _repoModule;
  _repoModule = _useMockRepo
    ? (await import('./repository.mock')) as unknown as RepoModule
    : await import('./repository.firebase.js');
  return _repoModule;
}

const devWriteBlock = (..._args: unknown[]): Promise<void> => {
  console.warn('[DEV] Scrittura bloccata in dev mode (read-only)');
  return Promise.resolve();
};

export async function fetchPlayers(): Promise<IPlayer[]> {
  return (await getRepo()).fetchPlayers();
}

export async function fetchMatches(): Promise<IMatch[]> {
  return (await getRepo()).fetchMatches();
}

export function parseMatchDTO(match: IMatchDTO): IMatch {
  return {
    id: match.id,
    teamA: match.teamA,
    teamB: match.teamB,
    score: match.score,
    createdAt: match.createdAt,
    deltaELO: [-1, -1],
    expectedScore: [-1, -1],
    teamELO: [-1, -1],
    teamAELO: [-1, -1],
    teamBELO: [-1, -1]
  };
}

export async function fetchRunningMatch(): Promise<IRunningMatchDTO | null> {
  return (await getRepo()).fetchRunningMatch();
}

export async function updatePlayersHash(): Promise<void> {
  if (_isDevReadOnlyMode) return devWriteBlock();
  return (await getRepo()).updatePlayersHash();
}

export async function updateMatchesHash(): Promise<void> {
  if (_isDevReadOnlyMode) return devWriteBlock();
  return (await getRepo()).updateMatchesHash();
}

export async function saveMatch(match: IMatchDTO, merge?: boolean): Promise<void> {
  if (_isDevReadOnlyMode) return devWriteBlock();
  return (await getRepo()).saveMatch(match, merge);
}

export async function saveRunningMatch(match: IRunningMatchDTO): Promise<void> {
  if (_isDevReadOnlyMode) return devWriteBlock();
  return (await getRepo()).saveRunningMatch(match);
}

export async function clearRunningMatch(): Promise<void> {
  if (_isDevReadOnlyMode) return devWriteBlock();
  return (await getRepo()).clearRunningMatch();
}

export async function savePlayer(player: IPlayerDTO): Promise<void> {
  if (_isDevReadOnlyMode) return devWriteBlock();
  return (await getRepo()).savePlayer(player);
}

export async function deletePlayer(id: number): Promise<void> {
  if (_isDevReadOnlyMode) return devWriteBlock();
  return (await getRepo()).deletePlayer(id);
}
