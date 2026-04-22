import { IMatch } from './match.interface';

export interface IPlayerDTO {
  id: number;
  name: string;
  role: -1 | 0 | 1; // 0 defender, 1 attacker, -1 both
}

export type MatchPlayerStats = { matches: number; wins: number; delta: number };
export type PlayerStats = { player: number; value: number };
export type MatchStats = { match: IMatch; value: number };

export interface IPlayer extends IPlayerDTO {
  elo: [number, number]; // [defenderElo, attackerElo]
  eloAtDayStart: [number, number];
  matches: [number, number];
  wins: [number, number];
  goalsFor: [number, number];
  goalsAgainst: [number, number];
  rank: [number, number, number]; // [rankDefender, rankAttacker, rankOverall]
  rankAtDayStart: [number, number, number];
  class: [number, number];
  streak: [number, number];
  bestRole: number; // 0 defender, 1 attacker
  consistency: [number, number];
  // rating: [number, number];

  teammatesStats: [{ [x: number]: MatchPlayerStats }, { [x: number]: MatchPlayerStats }];
  opponentsStats: [{ [x: number]: MatchPlayerStats }, { [x: number]: MatchPlayerStats }];
  history: [IMatch[], IMatch[]];
  matchesDelta: [number[], number[]];

  avgTeamElo: [number, number];
  avgOpponentElo: [number, number];
  bestTeammateCount: [PlayerStats | null, PlayerStats | null]; // by matches
  bestTeammate: [PlayerStats | null, PlayerStats | null]; // by elo gain
  worstTeammate: [PlayerStats | null, PlayerStats | null]; // by elo loss
  bestOpponentCount: [PlayerStats | null, PlayerStats | null]; // by matches
  bestOpponent: [PlayerStats | null, PlayerStats | null]; // by elo gain
  worstOpponent: [PlayerStats | null, PlayerStats | null]; // by elo loss

  bestElo: [number, number];
  worstElo: [number, number];
  bestClass: [number, number];
  bestWinStreak: [number, number];
  worstLossStreak: [number, number];
  bestVictoryByElo: [MatchStats | null, MatchStats | null];
  bestVictoryByScore: [MatchStats | null, MatchStats | null];
  bestVictoryByPercentage: [MatchStats | null, MatchStats | null];
  worstDefeatByElo: [MatchStats | null, MatchStats | null];
  worstDefeatByScore: [MatchStats | null, MatchStats | null];
  worstDefeatByPercentage: [MatchStats | null, MatchStats | null];
  // TODO add match with highest elo too?
}
