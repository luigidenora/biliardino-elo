import { IMatch, IMatchDTO, IRunningMatchDTO } from '@/models/match.interface';
import { IPlayer } from '@/models/player.interface';

/**
 * Mock repository for development
 * Simulates Firebase operations with in-memory data
 */

// Mock data storage - Generate 35 players
let mockPlayers: IPlayer[] = [
  {
    id: 1,
    name: 'Admin',
    elo: 1200,
    startElo: 1200,
    defence: 0.5,
    matches: 0,
    bestElo: 1200,
    goalsAgainst: 0,
    goalsFor: 0,
    matchesAsAttacker: 0,
    matchesAsDefender: 0,
    matchesDelta: [],
    wins: 0,
    rank: -1,
    class: -1,
    isAdmin: true
  },
  {
    id: 2,
    name: 'User',
    elo: 1100,
    startElo: 1100,
    defence: 0.6,
    matches: 0,
    bestElo: 1100,
    goalsAgainst: 0,
    goalsFor: 0,
    matchesAsAttacker: 0,
    matchesAsDefender: 0,
    matchesDelta: [],
    wins: 0,
    rank: -1,
    class: -1,
    isAdmin: false
  }
];

const mockMatches: IMatch[] = [
  {
    id: 1,
    teamA: { defence: 1, attack: 2 },
    teamB: { defence: 2, attack: 1 },
    score: [10, 8],
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 7,
    deltaELO: [-1, -1],
    expectedScore: [-1, -1],
    teamELO: [-1, -1],
    teamAELO: [-1, -1],
    teamBELO: [-1, -1]
  },
  {
    id: 2,
    teamA: { defence: 2, attack: 1 },
    teamB: { defence: 1, attack: 2 },
    score: [5, 10],
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 5,
    deltaELO: [-1, -1],
    expectedScore: [-1, -1],
    teamELO: [-1, -1],
    teamAELO: [-1, -1],
    teamBELO: [-1, -1]
  }
];

let mockRunningMatch: IRunningMatchDTO | null = null;

let cacheHashPlayers = Math.random();
let cacheHashMatches = Math.random();

/**
 * Simulates delay for async operations (optional, for more realistic simulation)
 */
async function simulateDelay(ms: number = 100): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function updatePlayersHash(): Promise<void> {
  console.log('[MOCK] Updating players cache hash');
  await simulateDelay(50);
  cacheHashPlayers = Math.random();
}

export async function updateMatchesHash(): Promise<void> {
  console.log('[MOCK] Updating matches cache hash');
  await simulateDelay(50);
  cacheHashMatches = Math.random();
}

export async function fetchPlayers(): Promise<IPlayer[]> {
  console.log('[MOCK] Fetching players:', mockPlayers.length);
  await simulateDelay();
  return JSON.parse(JSON.stringify(mockPlayers)); // Deep clone
}

export async function fetchMatches(): Promise<IMatch[]> {
  console.log('[MOCK] Fetching matches:', mockMatches.length);
  await simulateDelay();
  return JSON.parse(JSON.stringify(mockMatches)); // Deep clone
}

export async function saveMatch(match: IMatchDTO, merge = false): Promise<void> {
  console.log('[MOCK] Saving match:', match.id);
  await simulateDelay();

  const existingIndex = mockMatches.findIndex(m => m.id === match.id);
  const matchWithDefaults: IMatch = {
    ...match,
    deltaELO: [-1, -1],
    expectedScore: [-1, -1],
    teamELO: [-1, -1],
    teamAELO: [-1, -1],
    teamBELO: [-1, -1]
  };

  if (existingIndex >= 0) {
    mockMatches[existingIndex] = matchWithDefaults;
  } else {
    mockMatches.push(matchWithDefaults);
  }

  await updateMatchesHash();
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

export async function saveRunningMatch(match: IRunningMatchDTO): Promise<void> {
  console.log('[MOCK] Saving running match');
  await simulateDelay();
  mockRunningMatch = JSON.parse(JSON.stringify(match));
}

export async function fetchRunningMatch(): Promise<IRunningMatchDTO | null> {
  console.log('[MOCK] Fetching running match');
  await simulateDelay();
  return mockRunningMatch ? JSON.parse(JSON.stringify(mockRunningMatch)) : null;
}

export async function clearRunningMatch(): Promise<void> {
  console.log('[MOCK] Clearing running match');
  await simulateDelay();
  mockRunningMatch = null;
}

export async function savePlayer(player: IPlayer): Promise<void> {
  console.log('[MOCK] Saving player:', player.id, player.name);
  await simulateDelay();

  const existingIndex = mockPlayers.findIndex(p => p.id === player.id);

  if (existingIndex >= 0) {
    mockPlayers[existingIndex] = JSON.parse(JSON.stringify(player));
  } else {
    mockPlayers.push(JSON.parse(JSON.stringify(player)));
  }

  await updatePlayersHash();
}

export async function deletePlayer(id: number): Promise<void> {
  console.log('[MOCK] Deleting player:', id);
  await simulateDelay();
  mockPlayers = mockPlayers.filter(p => p.id !== id);
  await updatePlayersHash();
}
