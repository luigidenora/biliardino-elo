import { IMatch, ITeam } from '@/models/match.interface';
import { IPlayer } from '@/models/player.interface';
import { MatchesK } from './elo.service';
import { getAllMatches } from './match.service';
import { checkDerankThreshold, getClass, getFirstMatchesBonus, getPlayerById } from './player.service';

export type PlayerResult = { player: IPlayer; score: number };

export interface PlayerStats {
  history: IMatch[];

  elo: number;
  bestElo: number;
  worstElo: number;
  class: number;
  bestClass: number;

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
  avgTeamElo: number | null;
  avgOpponentElo: number | null;

  bestVictoryByElo: IMatch | null;
  worstDefeatByElo: IMatch | null;
  bestVictoryByScore: IMatch | null;
  worstDefeatByScore: IMatch | null;

  totalGoalsFor: number;
  totalGoalsAgainst: number;
}

export function getPlayerStats(player: number): PlayerStats {
  const result: PlayerStats = {
    history: [],
    elo: getPlayerById(player)!.startElo,
    bestElo: -Infinity,
    worstElo: Infinity,
    class: -1,
    bestClass: Infinity,
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
    totalGoalsAgainst: 0,
    avgOpponentElo: null,
    avgTeamElo: null
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
    updateEloResult(team, match);
    result.history.push(match);

    updateMatchCount(role, match, team);
    updateStreak(match.deltaELO[team]);
    updateOtherPlayers(team, role, match);
    updateBestMatch(match, team);
    updateGoalsCount(team, match);
  }

  finalizeOtherPlayers();

  return result;

  function updateEloResult(team: number, match: IMatch): void {
    const delta = team === 0 ? match.deltaELO[0] : match.deltaELO[1];

    result.elo += delta * getFirstMatchesBonus(result.matches);

    if (result.matches >= MatchesK - 1) {
      if (result.elo > result.bestElo) result.bestElo = result.elo;
      if (result.elo < result.worstElo) result.worstElo = result.elo;

      updatePlayerClass(delta > 0);
      if (result.class < result.bestClass) result.bestClass = result.class;
    }

    result.avgTeamElo ??= 0;
    result.avgOpponentElo ??= 0;

    result.avgTeamElo += team === 0 ? match.teamELO[0] : match.teamELO[1];
    result.avgOpponentElo += team === 0 ? match.teamELO[1] : match.teamELO[0];
  }

  // must be the same as player.service.ts
  function updatePlayerClass(win: boolean): void {
    const currentClass = result.class;
    let newClass = getClass(result.elo);

    if (currentClass === newClass) return;

    if (win) {
      newClass = Math.min(newClass, currentClass === -1 ? Infinity : currentClass); // to avoid to derank after win if in the treshold
    } else if (checkDerankThreshold(result.elo)) {
      newClass--;
    }

    result.class = newClass;
  }

  function updateMatchCount(role: number, match: IMatch, team: number): void {
    const roleKey = role === 0 ? 'AsDefence' : 'AsAttack';
    result.matches++;
    result[`matches${roleKey}`]++;

    if (match.deltaELO[team] > 0) {
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

  function updateOtherPlayers(team: number, role: number, match: IMatch): void {
    const delta = match.deltaELO[team];
    const teammate = getTeammate(team, role, match);
    const { attack: opponentA, defence: opponentB } = getOpponentTeam(team, match);

    teammateList[teammate] ??= [0, 0];
    teammateList[teammate][0]++;
    teammateList[teammate][1] += delta;
    opponentList[opponentA] ??= 0;
    opponentList[opponentA] += delta;
    opponentList[opponentB] ??= 0;
    opponentList[opponentB] += delta;
  }

  function updateBestMatch(match: IMatch, team: number): void {
    const delta = match.deltaELO[team];
    const win = delta > 0;
    const score = match.score;
    const scoreDiff = Math.abs(score[0] - score[1]);

    if (win) {
      if (delta >= bestVictoryElo) {
        result.bestVictoryByElo = match;
        bestVictoryElo = delta;
      }

      if (scoreDiff >= bestVictoryScore) {
        result.bestVictoryByScore = match;
        bestVictoryScore = scoreDiff;
      }
    } else {
      if (delta <= worstDefeatElo) {
        result.worstDefeatByElo = match;
        worstDefeatElo = delta;
      }

      if (scoreDiff >= worstDefeatScore) {
        result.worstDefeatByScore = match;
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

    result.avgTeamElo! /= result.history.length;
    result.avgOpponentElo! /= result.history.length;
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
