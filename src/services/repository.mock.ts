import type { IMatch, IMatchDTO, IRunningMatchDTO } from '@/models/match.interface';
import type { IPlayer } from '@/models/player.interface';

/**
 * Mock repository for development.
 * Simulates Firebase operations with in-memory data.
 * Writes modify in-memory state; reads return cloned snapshots.
 */

let mockPlayers: IPlayer[] = [
  {
    id: 1, name: 'Admin', elo: 1200, startElo: 1200, defence: 0.5,
    matches: 0, bestElo: 1200, goalsAgainst: 0, goalsFor: 0,
    matchesAsAttacker: 0, matchesAsDefender: 0, matchesDelta: [],
    wins: 0, rank: -1, class: -1, isAdmin: true
  },
  {
    id: 2, name: 'User', elo: 1100, startElo: 1100, defence: 0.6,
    matches: 0, bestElo: 1100, goalsAgainst: 0, goalsFor: 0,
    matchesAsAttacker: 0, matchesAsDefender: 0, matchesDelta: [],
    wins: 0, rank: -1, class: -1, isAdmin: false
  }
];

const mockMatches: IMatch[] = [
  {
    id: 1,
    teamA: { defence: 1, attack: 2 }, teamB: { defence: 2, attack: 1 },
    score: [10, 8], createdAt: Date.now() - 7 * 86_400_000,
    deltaELO: [-1, -1], expectedScore: [-1, -1],
    teamELO: [-1, -1], teamAELO: [-1, -1], teamBELO: [-1, -1]
  },
  {
    id: 2,
    teamA: { defence: 2, attack: 1 }, teamB: { defence: 1, attack: 2 },
    score: [5, 10], createdAt: Date.now() - 5 * 86_400_000,
    deltaELO: [-1, -1], expectedScore: [-1, -1],
    teamELO: [-1, -1], teamAELO: [-1, -1], teamBELO: [-1, -1]
  }
];

let mockRunningMatch: IRunningMatchDTO | null = null;

async function delay(ms = 80): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export async function updatePlayersHash(): Promise<void> {
  console.log('[MOCK] updatePlayersHash');
  await delay(30);
}

export async function updateMatchesHash(): Promise<void> {
  console.log('[MOCK] updateMatchesHash');
  await delay(30);
}

export async function fetchPlayers(): Promise<IPlayer[]> {
  console.log('[MOCK] fetchPlayers:', mockPlayers.length);
  await delay();
  return JSON.parse(JSON.stringify(mockPlayers));
}

export async function fetchMatches(): Promise<IMatch[]> {
  console.log('[MOCK] fetchMatches:', mockMatches.length);
  await delay();
  return JSON.parse(JSON.stringify(mockMatches));
}

// Note: `_mergeUnused` is kept to mirror the Firebase repository signature but ignored in this mock.
export async function saveMatch(match: IMatchDTO, _mergeUnused = false): Promise<void> {
  console.log('[MOCK] saveMatch:', match.id);
  await delay();
  const idx = mockMatches.findIndex(m => m.id === match.id);
  const full: IMatch = {
    ...match,
    deltaELO: [-1, -1], expectedScore: [-1, -1],
    teamELO: [-1, -1], teamAELO: [-1, -1], teamBELO: [-1, -1]
  };
  if (idx >= 0) mockMatches[idx] = full; else mockMatches.push(full);
}

export function parseMatchDTO(match: IMatchDTO): IMatch {
  return {
    ...match,
    deltaELO: [-1, -1], expectedScore: [-1, -1],
    teamELO: [-1, -1], teamAELO: [-1, -1], teamBELO: [-1, -1]
  };
}

export async function saveRunningMatch(match: IRunningMatchDTO): Promise<void> {
  console.log('[MOCK] saveRunningMatch');
  await delay();
  mockRunningMatch = JSON.parse(JSON.stringify(match));
}

export async function fetchRunningMatch(): Promise<IRunningMatchDTO | null> {
  console.log('[MOCK] fetchRunningMatch');
  await delay();
  return mockRunningMatch ? JSON.parse(JSON.stringify(mockRunningMatch)) : null;
}

export async function clearRunningMatch(): Promise<void> {
  console.log('[MOCK] clearRunningMatch');
  await delay();
  mockRunningMatch = null;
}

export async function savePlayer(player: IPlayer): Promise<void> {
  console.log('[MOCK] savePlayer:', player.id, player.name);
  await delay();
  const idx = mockPlayers.findIndex(p => p.id === player.id);
  if (idx >= 0) mockPlayers[idx] = JSON.parse(JSON.stringify(player));
  else mockPlayers.push(JSON.parse(JSON.stringify(player)));
}

export async function deletePlayer(id: number): Promise<void> {
  console.log('[MOCK] deletePlayer:', id);
  await delay();
  mockPlayers = mockPlayers.filter(p => p.id !== id);
}
