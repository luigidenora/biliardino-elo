import { IMatch } from '@/models/match.interface';
import { getPlayerById } from './player.service';

export const StartK = 24 * 1;
export const FinalK = 24;
export const MatchesToRank = 10;
export const MatchesToTransition = 1; // Numero di partite dopo le quali il moltiplicatore K diventa 1
export const RankTreshold = 70;
export const DerankTreshold = Math.round(RankTreshold * 0.2);
export const MaxEloDiff = RankTreshold * 2 + DerankTreshold - 1; // qui consideriamo un rank di differenza nel mm
export const FirstRankUp = 1005;
export const startElo = 1000;
const EloScalingFactorFormula = 150;

export function updateMatch(match: IMatch): boolean {
  const teamAP1 = getPlayerById(match.teamA.defence);
  const teamAP2 = getPlayerById(match.teamA.attack);

  const teamBP1 = getPlayerById(match.teamB.defence);
  const teamBP2 = getPlayerById(match.teamB.attack);

  if (!teamAP1 || !teamAP2 || !teamBP1 || !teamBP2) {
    console.error('One or more players not found for match Elo calculation.');
    return false;
  }

  const [goalsA, goalsB] = match.score;

  const eloA = (teamAP1.elo[0] + teamAP2.elo[1]) / 2;
  const eloB = (teamBP1.elo[0] + teamBP2.elo[1]) / 2;

  const expA = expectedScore(eloA, eloB);
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

  match.teamAELO[0] = teamAP1.elo[0];
  match.teamAELO[1] = teamAP2.elo[1];

  match.teamBELO[0] = teamBP1.elo[0];
  match.teamBELO[1] = teamBP2.elo[1];

  return true;
}

export function expectedScore(eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / EloScalingFactorFormula));
}

function marginMultiplier(goalsA: number, goalsB: number): number {
  const diff = Math.abs(goalsA - goalsB) - 1;
  return 1 + (diff / 7) * 0.5; // da 1 a 1.5
}
