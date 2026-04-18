import { IPlayer } from '@/models/player.interface';
import { MaxEloDiff } from './elo.service';
import { getClass, getPlayerById } from './player.service';

export interface IMatchmakingConfig {
  /**
   * Weight for ELO balance (0-1). Higher values prioritize balanced matches.
   */
  matchBalanceWeight: number;
  /**
   * Weight for player priority (0-1). Higher values prioritize players with fewer matches.
   */
  priorityWeight: number;
  /**
   * Weight for team diversity (0-1). Higher values prioritize new player combinations.
   */
  diversityTeamWeight: number;
  /**
 * Weight for opponent diversity (0-1). Higher values prioritize new player combinations.
 */
  diversityOpponentWeight: number;
  /**
   * Weight for players difference (0-1). Higher values prioritize matches with similar player skill levels.
   */
  playersDifferenceWeight: number;
  /**
   * Randomness factor (0-1). Adds variation to avoid always selecting the same match.
   */
  randomness: number;
}

export interface IMatchProposal {
  teamA: { defence: IPlayer; attack: IPlayer };
  teamB: { defence: IPlayer; attack: IPlayer };
  heuristicData?: IHeuristicData;
}

type IMatchProposalScore = { score: number; max: number };

export interface IHeuristicData {
  matchBalance: IMatchProposalScore;
  priority: IMatchProposalScore;
  diversityTeam: IMatchProposalScore;
  diversityOpponent: IMatchProposalScore;
  playersDifference: IMatchProposalScore;
  randomness: IMatchProposalScore;
  total: IMatchProposalScore;
}

export type MatchmakingRange = { min: number; diff: number };

const config: IMatchmakingConfig = {
  matchBalanceWeight: 0.15,
  playersDifferenceWeight: 0.25,
  priorityWeight: 0.15,
  diversityTeamWeight: 0.25,
  diversityOpponentWeight: 0.15,
  randomness: 0.05
};

export function findBestMatch(playersId: number[], priorityPlayersId: number[], maxClassDiff = 1): IMatchProposal | null {
  if (playersId.length < 4) return null;

  const players = playersId.map(id => getPlayerById(id)!);
  const priorityPlayers = priorityPlayersId.map(id => getPlayerById(id)!);

  if (players.includes(undefined!)) {
    throw new Error('Some player IDs are invalid');
  }

  const priority = getPriority(players);
  const defArray: IPlayer[] = [];
  const attArray: IPlayer[] = [];

  getPlayersRolesArray(players, defArray, attArray);

  return generateBestMatch(priority, defArray, attArray, priorityPlayers, maxClassDiff);
}

function generateBestMatch(priority: MatchmakingRange, def: IPlayer[], att: IPlayer[], priorityPlayers: IPlayer[], maxClassDiff: number): IMatchProposal | null {
  const defCount = def.length;
  const attCount = att.length;
  const bestProposal: IMatchProposal = { teamA: { defence: def[0], attack: att[0] }, teamB: { defence: def[0], attack: att[0] } };
  let bestScore = -Infinity;

  for (let i = 0; i < defCount - 1; i++) {
    const p1 = def[i];

    for (let j = 0; j < attCount; j++) {
      const p2 = att[j];
      if (p2 === p1 || getClassDiff2(p1, p2) > maxClassDiff) continue;

      for (let k = i + 1; k < defCount; k++) {
        const p3 = def[k];
        if (p3 === p2) continue;

        for (let l = 0; l < attCount; l++) {
          const p4 = att[l];
          if (p4 === p1 || p4 === p2 || p4 === p3) continue;

          const classDiff = getClassDiff4(p1, p2, p3, p4);
          if (classDiff > maxClassDiff || !validatePriority(p1, p2, p3, p4, priorityPlayers)) continue;

          bestScore = checkProposal(p1, p2, p3, p4, priority, bestScore, bestProposal);
        }
      }
    }
  }

  return bestScore === -Infinity ? null : bestProposal;
}

function validatePriority(p1: IPlayer, p2: IPlayer, p3: IPlayer, p4: IPlayer, priorityPlayers: IPlayer[]): boolean {
  if (priorityPlayers.length === 0) return true;

  const playersSet = new Set([p1, p2, p3, p4]);

  for (const priorityPlayer of priorityPlayers) {
    if (!playersSet.has(priorityPlayer)) return false;
  }

  return true;
}

function getClassDiff4(p1: IPlayer, p2: IPlayer, p3: IPlayer, p4: IPlayer): number {
  const class1 = Math.min(3, Math.max(1, p1.class[0] === -1 ? getClass(p1.elo[0]) : p1.class[0])); // da 1 a 3 perchè le altre classi sono virtuali
  const class2 = Math.min(3, Math.max(1, p2.class[1] === -1 ? getClass(p2.elo[1]) : p2.class[1]));
  const class3 = Math.min(3, Math.max(1, p3.class[0] === -1 ? getClass(p3.elo[0]) : p3.class[0]));
  const class4 = Math.min(3, Math.max(1, p4.class[1] === -1 ? getClass(p4.elo[1]) : p4.class[1]));

  const maxClass = Math.max(class1, class2, class3, class4);
  const minClass = Math.min(class1, class2, class3, class4);

  return maxClass - minClass;
}

function getClassDiff2(p1: IPlayer, p2: IPlayer): number {
  const class1 = Math.min(3, Math.max(1, p1.class[0] === -1 ? getClass(p1.elo[0]) : p1.class[0]));
  const class2 = Math.min(3, Math.max(1, p2.class[1] === -1 ? getClass(p2.elo[1]) : p2.class[1]));
  return Math.abs(class1 - class2);
}

function checkProposal(defA: IPlayer, attA: IPlayer, defB: IPlayer, attB: IPlayer, priority: MatchmakingRange, bestScore: number, proposal: IMatchProposal): number {
  // MATCH ELO DIFFERENCE SCORE
  const teamAElo = (defA.elo[0] + attA.elo[1]) / 2; // il / 2 può essere tolgo se usiamo la somma
  const teamBElo = (defB.elo[0] + attB.elo[1]) / 2;
  const matchEloDiff = Math.abs(teamAElo - teamBElo);
  const matchEloDiffNormalized = 1 - Math.min(1, matchEloDiff / MaxEloDiff);
  const matchBalanceScore = matchEloDiffNormalized * config.matchBalanceWeight;

  // AVERAGE MATCHES PLAYED
  const localMaxMatches = Math.max(defA.matches[0], attA.matches[1], defB.matches[0], attB.matches[1]);
  const teamMatchessNormalized = 1 - ((localMaxMatches - priority.min) / priority.diff);
  const priorityScore = teamMatchessNormalized * config.priorityWeight;

  // PLAYERS ELO DIFFERENCE SCORE
  const playersMaxElo = Math.max(defA.elo[0], attA.elo[1], defB.elo[0], attB.elo[1]);
  const playersMinElo = Math.min(defA.elo[0], attA.elo[1], defB.elo[0], attB.elo[1]);
  const playersEloDiff = playersMaxElo - playersMinElo;
  const playersEloDiffNormalized = 1 - Math.min(1, playersEloDiff / MaxEloDiff);
  const playersDifferenceScore = playersEloDiffNormalized * config.playersDifferenceWeight;

  // DIVERSITY SCORE
  const diversityTeamScore = getTeammateDiversity(defA, attA, defB, attB) * config.diversityTeamWeight;
  const diversityOpponentScore = getOpponentDiversity(defA, attA, defB, attB) * config.diversityOpponentWeight;

  const randomness = Math.random() * config.randomness;

  const score = diversityTeamScore + diversityOpponentScore + matchBalanceScore + priorityScore + playersDifferenceScore + randomness;

  if (score > bestScore) {
    proposal.teamA.defence = defA;
    proposal.teamA.attack = attA;
    proposal.teamB.defence = defB;
    proposal.teamB.attack = attB;

    proposal.heuristicData = {
      matchBalance: { score: matchBalanceScore, max: config.matchBalanceWeight },
      priority: { score: priorityScore, max: config.priorityWeight },
      diversityTeam: { score: diversityTeamScore, max: config.diversityTeamWeight },
      diversityOpponent: { score: diversityOpponentScore, max: config.diversityOpponentWeight },
      playersDifference: { score: playersDifferenceScore, max: config.playersDifferenceWeight },
      randomness: { score: randomness, max: config.randomness },
      total: { score: score, max: config.matchBalanceWeight + config.priorityWeight + config.diversityTeamWeight + config.diversityOpponentWeight + config.playersDifferenceWeight + config.randomness }
    };

    bestScore = score;
  }

  return bestScore;
}

function getPriority(players: IPlayer[]): MatchmakingRange {
  const matches = players.map(x => x.role === 0 ? Math.max(...x.matches) : (x.role === -1 ? x.matches[0] : x.matches[1]));
  const max = Math.max(...matches, 1);
  const min = Math.min(...matches);
  return { min, diff: max - min };
}

function getTeammateDiversity(defA: IPlayer, attA: IPlayer, defB: IPlayer, attB: IPlayer): number {
  const defADiv = defA.teammatesStats[0];
  const defAScore = 1 - ((defADiv[attA.id]?.matches ?? 0) - defADiv.min) / Math.max(defADiv.diff, 1);

  const attADiv = attA.teammatesStats[1];
  const attAScore = 1 - ((attADiv[defA.id]?.matches ?? 0) - attADiv.min) / Math.max(attADiv.diff, 1);

  const defBDiv = defB.teammatesStats[0];
  const defBScore = 1 - ((defBDiv[attB.id]?.matches ?? 0) - defBDiv.min) / Math.max(defBDiv.diff, 1);

  const attBDiv = attB.teammatesStats[1];
  const attBScore = 1 - ((attBDiv[defB.id]?.matches ?? 0) - attBDiv.min) / Math.max(attBDiv.diff, 1);

  return (defAScore + attAScore + defBScore + attBScore) / 4;
}

function getOpponentDiversity(defA: IPlayer, attA: IPlayer, defB: IPlayer, attB: IPlayer): number {
  const defAOpp = defA.opponentsStats[0];
  const defAScore = 1 - ((defAOpp[defB.id]?.matches ?? 0) + (defAOpp[attB.id]?.matches ?? 0) - defAOpp.min * 2) / (Math.max(defAOpp.diff, 1) * 2);

  const attAOpp = attA.opponentsStats[1];
  const attAScore = 1 - ((attAOpp[defB.id]?.matches ?? 0) + (attAOpp[attB.id]?.matches ?? 0) - attAOpp.min * 2) / (Math.max(attAOpp.diff, 1) * 2);

  const defBOpp = defB.opponentsStats[0];
  const defBScore = 1 - ((defBOpp[defA.id]?.matches ?? 0) + (defBOpp[attA.id]?.matches ?? 0) - defBOpp.min * 2) / (Math.max(defBOpp.diff, 1) * 2);

  const attBOpp = attB.opponentsStats[1];
  const attBScore = 1 - ((attBOpp[defA.id]?.matches ?? 0) + (attBOpp[attA.id]?.matches ?? 0) - attBOpp.min * 2) / (Math.max(attBOpp.diff, 1) * 2);

  return (defAScore + attAScore + defBScore + attBScore) / 4;
}

function getPlayersRolesArray(players: IPlayer[], defArray: IPlayer[], attArray: IPlayer[]): void {
  for (const player of players) {
    if (player.role <= 0) {
      defArray.push(player);
    }

    if (player.role >= 0) {
      attArray.push(player);
    }
  }
}
