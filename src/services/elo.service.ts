import { IMatch } from '@/models/match.interface';
import { IPlayer } from '@/models/player.interface';
import { getPlayerById } from './player.service';

export const StartK = 40 * 1;
export const FinalK = 40;
export const MatchesK = 1;

export function updateMatch(match: IMatch): void {
  const teamAP1 = getPlayerById(match.teamA.defence);
  const teamAP2 = getPlayerById(match.teamA.attack);

  const teamBP1 = getPlayerById(match.teamB.defence);
  const teamBP2 = getPlayerById(match.teamB.attack);

  if (!teamAP1 || !teamAP2 || !teamBP1 || !teamBP2) {
    throw new Error('One or more players not found for match Elo calculation.');
  }

  const [goalsA, goalsB] = match.score;

  const teamAP1Elo = getPlayerElo(teamAP1, true);
  const teamAP2Elo = getPlayerElo(teamAP2, false);
  const teamBP1Elo = getPlayerElo(teamBP1, true);
  const teamBP2Elo = getPlayerElo(teamBP2, false);

  const eloA = (teamAP1Elo + teamAP2Elo) / 2;
  const eloB = (teamBP1Elo + teamBP2Elo) / 2;

  const expA = expectedScore(eloA, eloB);
  const expB = 1 - expA;

  const goalMultiplier = marginMultiplier(goalsA, goalsB);
  const winnerExp = goalsA > goalsB ? expA : expB;
  const winnerSign = winnerExp > 0.5 ? -1 : 1;
  const surpriseFactor = 1 + (3 * Math.pow(Math.abs(0.5 - winnerExp), 1.5)) * winnerSign;

  const scoreA = goalsA > goalsB ? 1 : goalsA === goalsB ? 0.5 : 0;
  const scoreB = 1 - scoreA;

  const kA = getTeamK(teamAP1, teamAP2);
  const kB = getTeamK(teamBP1, teamBP2);

  const deltaA = kA * goalMultiplier * (scoreA - expA) * surpriseFactor;
  const deltaB = kB * goalMultiplier * (scoreB - expB) * surpriseFactor;

  match.expectedScore[0] = expA;
  match.expectedScore[1] = expB;

  if (Math.max(goalsA, goalsB) < 8) {
    match.deltaELO[0] = 0;
    match.deltaELO[1] = 0;
  } else {
    match.deltaELO[0] = deltaA;
    match.deltaELO[1] = deltaB;
  }

  match.teamELO[0] = eloA;
  match.teamELO[1] = eloB;

  match.teamAELO[0] = teamAP1Elo;
  match.teamAELO[1] = teamAP2Elo;

  match.teamBELO[0] = teamBP1Elo;
  match.teamBELO[1] = teamBP2Elo;
}

export function getPlayerElo(player: IPlayer, isDef: boolean): number {
  return player.elo - (isDef ? 1 - player.defence : player.defence) * 100;
}

function getPlayerK(matches: number): number {
  const firstMatchMultiplier = Math.max(0, (1 - (matches / MatchesK)) * (StartK - FinalK));
  return FinalK + firstMatchMultiplier;
}

function getTeamK(p1: IPlayer, p2: IPlayer): number {
  return (getPlayerK(p1.matches) + getPlayerK(p2.matches)) / 2;
}

export function expectedScore(eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

function marginMultiplier(goalsA: number, goalsB: number): number {
  const diff = Math.abs(goalsA - goalsB);
  return 1 + (diff / 8 * 0.5); // pesato al 50%
}
