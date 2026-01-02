import { IMatch, ITeam } from '@/models/match.interface';
import { IPlayer } from '@/models/player.interface';
import { getAllMatches } from './match.service';
import { getPlayerById } from './player.service';

export type MatchResult = { match: IMatch; delta: number };
export type PlayerResult = { player: IPlayer; score: number };

export interface PlayerStats {
  history: MatchResult[];

  elo: number;
  bestElo: number;
  worstElo: number;

  matches: number;
  matchesAsAttack: number;
  matchesAsDefence: number;
  wins: number;
  winsAsAttack: number;
  winsAsDefence: number;
  losses: number;
  lossesAsAttack: number;
  lossesAsDefence: number;

  bestWinStreak: number;
  worstLossStreak: number;

  bestTeammateCount: PlayerResult | null; // by matches
  bestTeammate: PlayerResult | null; // by Elo gain
  worstTeammate: PlayerResult | null; // by Elo loss
  bestOpponent: PlayerResult | null; // by Elo gain
  worstOpponent: PlayerResult | null; // by Elo loss

  bestVictoryByElo: MatchResult | null;
  worstDefeatByElo: MatchResult | null;
  bestVictoryByScore: IMatch | null;
  worstDefeatByScore: IMatch | null;

  totalGoalsFor: number;
  totalGoalsAgainst: number;
}

export function getPlayerStats(player: number): PlayerStats {
  const result: PlayerStats = {
    history: [],
    elo: -Infinity,
    bestElo: -Infinity,
    worstElo: Infinity,
    matches: 0,
    matchesAsAttack: 0,
    matchesAsDefence: 0,
    wins: 0,
    winsAsAttack: 0,
    winsAsDefence: 0,
    losses: 0,
    lossesAsAttack: 0,
    lossesAsDefence: 0,
    bestWinStreak: 0,
    worstLossStreak: 0,
    bestTeammateCount: null,
    bestTeammate: null,
    worstTeammate: null,
    bestOpponent: null,
    worstOpponent: null,
    bestVictoryByElo: null,
    worstDefeatByElo: null,
    bestVictoryByScore: null,
    worstDefeatByScore: null,
    totalGoalsFor: 0,
    totalGoalsAgainst: 0
  };

  const matches = getAllMatches();
  const teammateList: Record<string, [number, number]> = {};
  const opponentList: Record<string, number> = {};
  let currentStreak = 0;
  let bestVictoryElo = -Infinity;
  let worstDefeatElo = Infinity;
  let bestVictoryScore = -1;
  let worstDefeatScore = -1;

  for (const match of matches) {
    const team = getTeam(player, match);
    if (team === -1) continue;

    const role = getRole(player, team, match);
    const matchResult = updateEloResult(team, match);
    result.history.push(matchResult);

    updateMatchCount(role, matchResult);
    updateStreak(matchResult.delta);
    updateOtherPlayers(team, role, matchResult);
    updateBestMatch(matchResult);
    updateGoalsCount(team, match);
  }

  finalizeOtherPlayers();

  return result;

  function updateEloResult(team: number, match: IMatch): MatchResult {
    const delta = team === 0 ? match.deltaELO[0] : match.deltaELO[1];

    result.elo += delta;

    if (result.elo > result.bestElo) result.bestElo = result.elo;
    if (result.elo < result.worstElo) result.worstElo = result.elo;

    return { match, delta };
  }

  function updateMatchCount(role: number, matchResult: MatchResult): void {
    const roleKey = role === 0 ? 'AsDefence' : 'AsAttack';
    result.matches++;
    result[`matches${roleKey}`]++;

    if (matchResult.delta > 0) {
      result.wins++;
      result[`wins${roleKey}`]++;
    } else {
      result.losses++;
      result[`losses${roleKey}`]++;
    }
  }

  function updateStreak(delta: number): void {
    const win = delta > 0;
    if (win) {
      currentStreak = Math.max(0, currentStreak) + 1;
      if (currentStreak > result.bestWinStreak) result.bestWinStreak = currentStreak;
    } else {
      currentStreak = Math.min(0, currentStreak) - 1;
      if (-currentStreak > result.worstLossStreak) result.worstLossStreak = -currentStreak;
    }
  }

  function updateOtherPlayers(team: number, role: number, matchResult: MatchResult): void {
    const delta = matchResult.delta;
    const teammate = getTeammate(team, role, matchResult.match);
    const { attack: opponentA, defence: opponentB } = getOpponentTeam(team, matchResult.match);

    teammateList[teammate] ??= [0, 0];
    teammateList[teammate][0]++;
    teammateList[teammate][1] += delta;
    opponentList[opponentA] ??= 0;
    opponentList[opponentA] += delta;
    opponentList[opponentB] ??= 0;
    opponentList[opponentB] += delta;
  }

  function updateBestMatch(matchResult: MatchResult): void {
    const delta = matchResult.delta;
    const win = delta > 0;
    const score = matchResult.match.score;
    const scoreDiff = Math.abs(score[0] - score[1]);

    if (win) {
      if (delta >= bestVictoryElo) {
        result.bestVictoryByElo = matchResult;
        bestVictoryElo = delta;
      }

      if (scoreDiff >= bestVictoryScore) {
        result.bestVictoryByScore = matchResult.match;
        bestVictoryScore = scoreDiff;
      }
    } else {
      if (delta <= worstDefeatElo) {
        result.worstDefeatByElo = matchResult;
        worstDefeatElo = delta;
      }

      if (scoreDiff >= worstDefeatScore) {
        result.worstDefeatByScore = matchResult.match;
        worstDefeatScore = scoreDiff;
      }
    }
  }

  function updateGoalsCount(team: number, match: IMatch): void {
    result.totalGoalsFor += match.score[team];
    result.totalGoalsAgainst += match.score[team ^ 1];
  }

  function finalizeOtherPlayers(): void {
    let bestTeammateScoreId = -1;
    let bestTeammateScore = -Infinity;
    let worstTeammateScoreId = -1;
    let worstTeammateScore = Infinity;
    let bestTeammateCountId = -1;
    let bestTeammateCount = 0;

    for (const teammate in teammateList) {
      if (teammateList[teammate][1] > bestTeammateScore) {
        bestTeammateScore = teammateList[teammate][1];
        bestTeammateScoreId = +teammate;
      }

      if (teammateList[teammate][1] < worstTeammateScore) {
        worstTeammateScore = teammateList[teammate][1];
        worstTeammateScoreId = +teammate;
      }

      if (teammateList[teammate][0] > bestTeammateCount) {
        bestTeammateCount = teammateList[teammate][0];
        bestTeammateCountId = +teammate;
      }
    }

    result.bestTeammateCount = { score: bestTeammateCount, player: getPlayerById(bestTeammateCountId)! };
    result.bestTeammate = { score: bestTeammateScore, player: getPlayerById(bestTeammateScoreId)! };
    result.worstTeammate = { score: worstTeammateScore, player: getPlayerById(worstTeammateScoreId)! };

    let bestOpponentId = -1;
    let bestOpponentScore = Infinity;
    let worstOpponentId = -1;
    let worstOpponentScore = -Infinity;

    for (const opponent in opponentList) {
      if (opponentList[opponent] < bestOpponentScore) {
        bestOpponentScore = opponentList[opponent];
        bestOpponentId = +opponent;
      }

      if (opponentList[opponent] > worstOpponentScore) {
        worstOpponentScore = opponentList[opponent];
        worstOpponentId = +opponent;
      }
    }

    result.bestOpponent = { score: bestOpponentScore, player: getPlayerById(bestOpponentId)! };
    result.worstOpponent = { score: worstOpponentScore, player: getPlayerById(worstOpponentId)! };
  }
}

// Returns 0 for teamA, 1 for teamB, -1 for not found
function getTeam(player: number, match: IMatch): number {
  if (match.teamA.defence === player || match.teamA.attack === player) return 0;
  if (match.teamB.defence === player || match.teamB.attack === player) return 1;
  return -1;
}

// Returns 0 for defence, 1 for attack
function getRole(player: number, team: number, match: IMatch): number {
  if (team === 0) return +(match.teamA.attack === player);
  return +(match.teamB.attack === player);
}

function getTeammate(team: number, role: number, match: IMatch): number {
  return match[team === 0 ? 'teamA' : 'teamB'][role === 0 ? 'attack' : 'defence'];
}

function getOpponentTeam(team: number, match: IMatch): ITeam {
  return match[team === 0 ? 'teamB' : 'teamA'];
}
