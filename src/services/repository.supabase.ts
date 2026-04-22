import { IMatch, IMatchDTO, IRunningMatchDTO, ITeam } from '@/models/match.interface';
import { IPlayer, IPlayerDTO } from '@/models/player.interface';
import { supabase } from '@/utils/supabase.util';
import { IRepository } from './repository.interface';

const CACHE_CONTROL_ID = 'id';
/**
 * Restituisce l'hash attuale dei giocatori dalla tabella cache-control.
 */
export async function getPlayersHash(): Promise<number> {
  const { data, error } = await supabase
    .from('cache-control')
    .select('hashPlayers')
    .eq('firestore_id', CACHE_CONTROL_ID)
    .single<{ hashPlayers: number }>();
  if (error || !data || typeof data.hashPlayers !== 'number') return -1;
  return data.hashPlayers;
}

/**
 * Restituisce l'hash attuale delle partite dalla tabella cache-control.
 */
export async function getMatchesHash(): Promise<number> {
  const { data, error } = await supabase
    .from('cache-control')
    .select('hashMatches')
    .eq('firestore_id', CACHE_CONTROL_ID)
    .single<{ hashMatches: number }>();
  if (error || !data || typeof data.hashMatches !== 'number') return -1;
  return data.hashMatches;
}
const CACHE_HASH_PLAYERS_KEY = 'supabase_cache_hash_players';
const CACHE_HASH_MATCHES_KEY = 'supabase_cache_hash_matches';
const PLAYERS_DATA_KEY = 'supabase_players_data';
const MATCHES_DATA_KEY = 'supabase_matches_data';

export async function updatePlayersHash(): Promise<void> {
  const hash = Math.random();
  localStorage.setItem(CACHE_HASH_PLAYERS_KEY, String(hash));
  await supabase
    .from('cache-control')
    .upsert({ firestore_id: CACHE_CONTROL_ID, hashPlayers: hash });
}

export async function updateMatchesHash(): Promise<void> {
  const hash = Math.random();
  localStorage.setItem(CACHE_HASH_MATCHES_KEY, String(hash));
  await supabase
    .from('cache-control')
    .upsert({ firestore_id: CACHE_CONTROL_ID, hashMatches: hash });
}

function mapPlayerRow(row: { id: string; name: string; role: -1 | 0 | 1 }): IPlayer {
  return {
    id: Number(row.id),
    name: row.name,
    role: row.role,
    elo: [1000, 1000],
    eloAtDayStart: [1000, 1000],
    matches: [0, 0],
    wins: [0, 0],
    goalsFor: [0, 0],
    goalsAgainst: [0, 0],
    rank: [-1, -1, -1],
    rankAtDayStart: [-1, -1, -1],
    bestRole: 0,
    class: [-1, -1],
    streak: [0, 0],
    consistency: [0, 0],
    teammatesStats: [{}, {}],
    opponentsStats: [{}, {}],
    history: [[], []],
    matchesDelta: [[], []],
    avgTeamElo: [0, 0],
    avgOpponentElo: [0, 0],
    bestTeammateCount: [null, null],
    bestTeammate: [null, null],
    worstTeammate: [null, null],
    bestOpponentCount: [null, null],
    bestOpponent: [null, null],
    worstOpponent: [null, null],
    bestElo: [-Infinity, -Infinity],
    worstElo: [Infinity, Infinity],
    bestClass: [-1, -1],
    bestWinStreak: [0, 0],
    worstLossStreak: [0, 0],
    bestVictoryByElo: [null, null],
    bestVictoryByScore: [null, null],
    bestVictoryByPercentage: [null, null],
    worstDefeatByElo: [null, null],
    worstDefeatByScore: [null, null],
    worstDefeatByPercentage: [null, null]
  } satisfies IPlayer;
}

export async function fetchPlayers(): Promise<IPlayer[]> {
  try {
    const { data, error } = await supabase.from('playersShark').select('*');
    if (error) throw error;
    localStorage.setItem(PLAYERS_DATA_KEY, JSON.stringify(data));
    return data.map(mapPlayerRow);
  } catch (err) {
    const raw = localStorage.getItem(PLAYERS_DATA_KEY);
    if (raw) return (JSON.parse(raw) as { id: string; name: string; role: -1 | 0 | 1 }[]).map(mapPlayerRow);
    throw err;
  }
}

type MatchRow = { id: number; teamA: ITeam; teamB: ITeam; score: [number, number]; createdAt: number };

function mapMatchRow(row: MatchRow): IMatch {
  return {
    id: row.id,
    teamA: row.teamA,
    teamB: row.teamB,
    score: row.score,
    createdAt: row.createdAt,
    deltaELO: [-1, -1],
    expectedScore: [-1, -1],
    teamELO: [-1, -1],
    teamAELO: [-1, -1],
    teamBELO: [-1, -1]
  };
}

export async function fetchMatches(): Promise<IMatch[]> {
  try {
    const { data, error } = await supabase.from('matchesShark').select('*');
    if (error) throw error;
    localStorage.setItem(MATCHES_DATA_KEY, JSON.stringify(data));
    return data.map(mapMatchRow);
  } catch (err) {
    const raw = localStorage.getItem(MATCHES_DATA_KEY);
    if (raw) return (JSON.parse(raw) as MatchRow[]).map(mapMatchRow);
    throw err;
  }
}

export async function saveMatch(match: IMatchDTO, merge = false): Promise<void> {
  const row = {
    id: match.id,
    teamA: match.teamA,
    teamB: match.teamB,
    score: match.score,
    createdAt: match.createdAt,
    firestore_id: String(match.id)
  };
  const { error } = merge
    ? await supabase.from('matchesShark').upsert(row)
    : await supabase.from('matchesShark').insert(row);
  if (error) throw error;
  await updateMatchesHash();
}

export async function fetchMatchById(id: number): Promise<IMatchDTO | null> {
  const { data, error } = await supabase
    .from('matchesShark')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    teamA: data.teamA,
    teamB: data.teamB,
    score: data.score,
    createdAt: data.createdAt
  };
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
  const { error } = await (supabase as any).from('runningMatch').upsert({
    id: 1,
    teamA: match.teamA,
    teamB: match.teamB
  });
  if (error) throw error;
}

export async function fetchRunningMatch(): Promise<IRunningMatchDTO | null> {
  const { data, error } = await (supabase as any).from('runningMatch').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { teamA: data.teamA, teamB: data.teamB };
}

export async function clearRunningMatch(): Promise<void> {
  const { error } = await (supabase as any).from('runningMatch').delete().eq('id', 1);
  if (error) throw error;
}

export async function savePlayer(player: IPlayerDTO): Promise<void> {
  const { error } = await supabase
    .from('playersShark')
    .upsert({ id: String(player.id), name: player.name, role: player.role });
  if (error) throw error;
  await updatePlayersHash();
}

export async function deletePlayer(id: number): Promise<void> {
  const { error } = await supabase.from('playersShark').delete().eq('id', String(id));
  if (error) throw error;
}

// type-check: ensure this module satisfies the IRepository contract
const _check: IRepository = {
  updatePlayersHash,
  updateMatchesHash,
  getPlayersHash,
  getMatchesHash,
  fetchPlayers,
  fetchMatches,
  saveMatch,
  fetchMatchById,
  parseMatchDTO,
  saveRunningMatch,
  fetchRunningMatch,
  clearRunningMatch,
  savePlayer,
  deletePlayer
};
void _check;
