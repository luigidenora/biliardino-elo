import { IMatch, IMatchDTO, IRunningMatchDTO } from '@/models/match.interface';
import { IPlayer } from '@/models/player.interface';

/**
 * Mock repository for development
 * Simulates Firebase operations with in-memory data
 */

// Mock data storage - Generate 35 players
const playerNames = [
  'Mario Rossi', 'Luigi Verdi', 'Anna Bianchi', 'Paolo Neri', 'Giulia Russo',
  'Marco Ferrari', 'Sofia Romano', 'Alessandro Marino', 'Francesca Greco', 'Matteo Conti',
  'Chiara Ricci', 'Andrea Bruno', 'Elena Colombo', 'Davide Rizzo', 'Sara Barbieri',
  'Simone Costa', 'Laura Fontana', 'Lorenzo Moretti', 'Valentina Serra', 'Francesco Leone',
  'Martina Giordano', 'Gabriele Marchetti', 'Federica De Luca', 'Luca Mancini', 'Alessia Vitale',
  'Nicola Lombardi', 'Giorgia Santoro', 'Stefano Caruso', 'Elisa Mariani', 'Roberto Rinaldi',
  'Claudia Longo', 'Daniele Ferraro', 'Beatrice Gallo', 'Tommaso Martini', 'Silvia Messina'
];

let mockPlayers: IPlayer[] = playerNames.map((name, index) => {
  const baseElo = 1000 + Math.floor(Math.random() * 400); // ELO tra 1000 e 1400
  const defence = Math.round((0.3 + Math.random() * 0.4) * 100) / 100; // Difesa tra 0.3 e 0.7

  return {
    id: index + 1,
    name,
    elo: baseElo,
    startElo: baseElo,
    defence,
    matches: 0,
    bestElo: baseElo,
    goalsAgainst: 0,
    goalsFor: 0,
    matchesAsAttacker: 0,
    matchesAsDefender: 0,
    matchesDelta: [],
    wins: 0,
    rank: -1
  };
});

const mockMatches: IMatch[] = [
  {
    id: 1,
    teamA: { defence: 1, attack: 2 },
    teamB: { defence: 3, attack: 4 },
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
    teamA: { defence: 1, attack: 3 },
    teamB: { defence: 2, attack: 4 },
    score: [10, 5],
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
