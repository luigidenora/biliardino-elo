/**
 * Implementazione Supabase del repository.
 * Esporta la stessa interface implicita di repository.firebase.ts e repository.mock.ts.
 *
 * Schema SQL richiesto (eseguire una volta in Supabase SQL editor):
 *
 * ```sql
 * create table players (
 *   id       int  primary key,
 *   name     text not null,
 *   elo      int  not null default 1000,
 *   defence  int  not null   -- valore × 100, es. 50 = 0.50
 * );
 *
 * create table matches (
 *   id               int   primary key,
 *   team_a_defence   int   not null,
 *   team_a_attack    int   not null,
 *   team_b_defence   int   not null,
 *   team_b_attack    int   not null,
 *   score_a          int   not null,
 *   score_b          int   not null,
 *   created_at       bigint not null
 * );
 *
 * create table running_match (
 *   id               int  primary key default 1,  -- riga singleton
 *   team_a_defence   int,
 *   team_a_attack    int,
 *   team_b_defence   int,
 *   team_b_attack    int
 * );
 * ```
 */

import { IMatch, IMatchDTO, IRunningMatchDTO } from '@/models/match.interface';
import { IPlayer, IPlayerDTO } from '@/models/player.interface';
import { supabase } from '@/utils/supabase.util';

// ─── Cache hash (localStorage) ───────────────────────────────────────────────

const CACHE_HASH_PLAYERS_KEY = 'supabase_cache_hash_players';
const CACHE_HASH_MATCHES_KEY = 'supabase_cache_hash_matches';

export async function updatePlayersHash(): Promise<void> {
  localStorage.setItem(CACHE_HASH_PLAYERS_KEY, Math.random().toString());
}

export async function updateMatchesHash(): Promise<void> {
  localStorage.setItem(CACHE_HASH_MATCHES_KEY, Math.random().toString());
}

// ─── Players ─────────────────────────────────────────────────────────────────

export async function fetchPlayers(): Promise<IPlayer[]> {
  const { data, error } = await supabase
    .from('players')
    .select('id, name, elo, defence')
    .order('id');

  if (error) throw new Error(`[supabase] fetchPlayers: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    elo: 1000,
    startElo: 1000,
    defence: row.defence / 100,
    matches: 0,
    bestElo: -1,
    goalsAgainst: 0,
    goalsFor: 0,
    matchesAsAttacker: 0,
    matchesAsDefender: 0,
    matchesDelta: [],
    wins: 0,
    rank: -1,
    class: -1
  } satisfies IPlayer));
}

export async function savePlayer(player: IPlayerDTO): Promise<void> {
  const { error } = await supabase
    .from('players')
    .upsert({
      id: player.id,
      name: player.name,
      elo: player.elo,
      defence: player.defence
    });

  if (error) throw new Error(`[supabase] savePlayer: ${error.message}`);
  await updatePlayersHash();
}

export async function deletePlayer(id: number): Promise<void> {
  const { error } = await supabase
    .from('players')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`[supabase] deletePlayer: ${error.message}`);
}

// ─── Matches ─────────────────────────────────────────────────────────────────

export async function fetchMatches(): Promise<IMatch[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('id, team_a_defence, team_a_attack, team_b_defence, team_b_attack, score_a, score_b, created_at')
    .order('created_at');

  if (error) throw new Error(`[supabase] fetchMatches: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    teamA: { defence: row.team_a_defence, attack: row.team_a_attack },
    teamB: { defence: row.team_b_defence, attack: row.team_b_attack },
    score: [row.score_a, row.score_b] as [number, number],
    createdAt: row.created_at,
    deltaELO: [-1, -1],
    expectedScore: [-1, -1],
    teamELO: [-1, -1],
    teamAELO: [-1, -1],
    teamBELO: [-1, -1]
  } satisfies IMatch));
}

export async function saveMatch(match: IMatchDTO, merge = false): Promise<void> {
  const row = {
    id: match.id,
    team_a_defence: match.teamA.defence,
    team_a_attack: match.teamA.attack,
    team_b_defence: match.teamB.defence,
    team_b_attack: match.teamB.attack,
    score_a: match.score[0],
    score_b: match.score[1],
    created_at: match.createdAt
  };

  const { error } = merge
    ? await supabase.from('matches').upsert(row)
    : await supabase.from('matches').insert(row);

  if (error) throw new Error(`[supabase] saveMatch: ${error.message}`);
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

// ─── Running match ────────────────────────────────────────────────────────────

export async function saveRunningMatch(match: IRunningMatchDTO): Promise<void> {
  const { error } = await supabase
    .from('running_match')
    .upsert({
      id: 1,
      team_a_defence: match.teamA.defence,
      team_a_attack: match.teamA.attack,
      team_b_defence: match.teamB.defence,
      team_b_attack: match.teamB.attack
    });

  if (error) throw new Error(`[supabase] saveRunningMatch: ${error.message}`);
}

export async function fetchRunningMatch(): Promise<IRunningMatchDTO | null> {
  const { data, error } = await supabase
    .from('running_match')
    .select('team_a_defence, team_a_attack, team_b_defence, team_b_attack')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw new Error(`[supabase] fetchRunningMatch: ${error.message}`);
  if (!data) return null;

  return {
    teamA: { defence: data.team_a_defence, attack: data.team_a_attack },
    teamB: { defence: data.team_b_defence, attack: data.team_b_attack }
  };
}

export async function clearRunningMatch(): Promise<void> {
  const { error } = await supabase
    .from('running_match')
    .delete()
    .eq('id', 1);

  if (error) throw new Error(`[supabase] clearRunningMatch: ${error.message}`);
}
