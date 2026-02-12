import { IMatch } from '@/models/match.interface';
import { IPlayer } from '@/models/player.interface';
import { getPlayerById } from './player.service';

export const StartK = 50 * 1; // TODO nella new season mettere 2 o 1.5
export const FinalK = 50;
export const MatchesK = 10;

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

  const expA = expectedScore(eloA * 2, eloB * 2); // * 2 to increase percentage
  const expB = 1 - expA;

  const goalMultiplier = marginMultiplier(goalsA, goalsB);

  const scoreA = goalsA > goalsB ? 1 : goalsA === goalsB ? 0.5 : 0;
  const scoreB = 1 - scoreA;

  const deltaA = FinalK * goalMultiplier * (scoreA - expA);
  const deltaB = FinalK * goalMultiplier * (scoreB - expB);

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

export function expectedScore(eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

function marginMultiplier(goalsA: number, goalsB: number): number {
  const diff = Math.abs(goalsA - goalsB) - 1;
  return 1 + (diff / 7) * 0.5; // da 1 a 1.5
}
