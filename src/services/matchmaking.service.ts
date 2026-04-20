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

export type MatchmakingRange = { min: number; max: number; diff: number };
export type MatchmakingRangesArray = [{ [x: number]: MatchmakingRange }, { [x: number]: MatchmakingRange }];

interface MatchmakingRanges {
  priority: MatchmakingRange;
  diversityTeam: MatchmakingRangesArray;
  diversityOpponent: MatchmakingRangesArray;
}

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

  const mmRanges = getPriorityAndDiversity(players, maxClassDiff);
  const defArray: IPlayer[] = [];
  const attArray: IPlayer[] = [];

  getPlayersRolesArray(players, defArray, attArray);

  return generateBestMatch(mmRanges, defArray, attArray, priorityPlayers, maxClassDiff);
}

function generateBestMatch(mmRanges: MatchmakingRanges, def: IPlayer[], att: IPlayer[], priorityPlayers: IPlayer[], maxClassDiff: number): IMatchProposal | null {
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

          bestScore = checkProposal(p1, p2, p3, p4, mmRanges, bestScore, bestProposal);
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

function getClassDiff4(def1: IPlayer, att1: IPlayer, def2: IPlayer, att2: IPlayer): number {
  const class1 = Math.min(3, Math.max(1, def1.class[0] === -1 ? getClass(def1.elo[0]) : def1.class[0])); // da 1 a 3 perchè le altre classi sono virtuali
  const class2 = Math.min(3, Math.max(1, att1.class[1] === -1 ? getClass(att1.elo[1]) : att1.class[1]));
  const class3 = Math.min(3, Math.max(1, def2.class[0] === -1 ? getClass(def2.elo[0]) : def2.class[0]));
  const class4 = Math.min(3, Math.max(1, att2.class[1] === -1 ? getClass(att2.elo[1]) : att2.class[1]));

  const maxClass = Math.max(class1, class2, class3, class4);
  const minClass = Math.min(class1, class2, class3, class4);

  return maxClass - minClass;
}

function getClassDiff2(def: IPlayer, att: IPlayer): number {
  const class1 = Math.min(3, Math.max(1, def.class[0] === -1 ? getClass(def.elo[0]) : def.class[0]));
  const class2 = Math.min(3, Math.max(1, att.class[1] === -1 ? getClass(att.elo[1]) : att.class[1]));
  return Math.abs(class1 - class2);
}

function checkProposal(defA: IPlayer, attA: IPlayer, defB: IPlayer, attB: IPlayer, mmRanges: MatchmakingRanges, bestScore: number, proposal: IMatchProposal): number {
  // MATCH ELO DIFFERENCE SCORE
  const teamAElo = (defA.elo[0] + attA.elo[1]) / 2; // il / 2 può essere tolgo se usiamo la somma
  const teamBElo = (defB.elo[0] + attB.elo[1]) / 2;
  const matchEloDiff = Math.abs(teamAElo - teamBElo);
  const matchEloDiffNormalized = 1 - Math.min(1, matchEloDiff / MaxEloDiff);
  const matchBalanceScore = matchEloDiffNormalized * config.matchBalanceWeight;

  // AVERAGE MATCHES PLAYED
  const localMaxMatches = Math.max(defA.matches[0], attA.matches[1], defB.matches[0], attB.matches[1]);
  const teamMatchessNormalized = 1 - ((localMaxMatches - mmRanges.priority.min) / mmRanges.priority.diff);
  const priorityScore = teamMatchessNormalized * config.priorityWeight;

  // PLAYERS ELO DIFFERENCE SCORE
  const playersMaxElo = Math.max(defA.elo[0], attA.elo[1], defB.elo[0], attB.elo[1]);
  const playersMinElo = Math.min(defA.elo[0], attA.elo[1], defB.elo[0], attB.elo[1]);
  const playersEloDiff = playersMaxElo - playersMinElo;
  const playersEloDiffNormalized = 1 - Math.min(1, playersEloDiff / MaxEloDiff);
  const playersDifferenceScore = playersEloDiffNormalized * config.playersDifferenceWeight;

  // DIVERSITY SCORE
  const diversityTeamScore = getTeammateDiversity(defA, attA, defB, attB, mmRanges.diversityTeam) * config.diversityTeamWeight;
  const diversityOpponentScore = getOpponentDiversity(defA, attA, defB, attB, mmRanges.diversityOpponent) * config.diversityOpponentWeight;

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

function getPriorityAndDiversity(players: IPlayer[], maxClassDiff: number): MatchmakingRanges {
  const matches = players.map(x => x.role === 0 ? Math.max(...x.matches) : (x.role === -1 ? x.matches[0] : x.matches[1]));
  const max = Math.max(...matches, 1);
  const min = Math.min(...matches);
  const priority = { min, max, diff: max - min } satisfies MatchmakingRange;

  const diversityTeam: MatchmakingRangesArray = [{}, {}];
  const diversityOpponent: MatchmakingRangesArray = [{}, {}];

  for (const player of players) {
    for (const p2 of players) {
      if (player === p2) continue;

      if (player.role <= 0 && p2.role >= 0 && getClassDiff2(player, p2) <= maxClassDiff) {
        diversityTeam[0][player.id] ??= { min: Infinity, max: -Infinity, diff: 0 };
        diversityOpponent[0][player.id] ??= { min: Infinity, max: -Infinity, diff: 0 };

        diversityTeam[0][player.id].min = Math.min(diversityTeam[0][player.id].min, player.teammatesStats[0][p2.id]?.matches ?? 0);
        diversityTeam[0][player.id].max = Math.max(diversityTeam[0][player.id].max, player.teammatesStats[0][p2.id]?.matches ?? 0);

        diversityOpponent[0][player.id].min = Math.min(diversityOpponent[0][player.id].min, player.opponentsStats[0][p2.id]?.matches ?? 0);
        diversityOpponent[0][player.id].max = Math.max(diversityOpponent[0][player.id].max, player.opponentsStats[0][p2.id]?.matches ?? 0);
      }

      if (player.role >= 0 && p2.role <= 0 && getClassDiff2(p2, player) <= maxClassDiff) { // conta solo se il giocatore contro gioca in quel ruolo
        diversityTeam[1][player.id] ??= { min: Infinity, max: -Infinity, diff: 0 };
        diversityOpponent[1][player.id] ??= { min: Infinity, max: -Infinity, diff: 0 };

        diversityTeam[1][player.id].min = Math.min(diversityTeam[1][player.id].min, player.teammatesStats[1][p2.id]?.matches ?? 0);
        diversityTeam[1][player.id].max = Math.max(diversityTeam[1][player.id].max, player.teammatesStats[1][p2.id]?.matches ?? 0);

        diversityOpponent[1][player.id].min = Math.min(diversityOpponent[1][player.id].min, player.opponentsStats[1][p2.id]?.matches ?? 0);
        diversityOpponent[1][player.id].max = Math.max(diversityOpponent[1][player.id].max, player.opponentsStats[1][p2.id]?.matches ?? 0);
      }
    }

    if (diversityTeam[0][player.id]) {
      diversityTeam[0][player.id].diff = diversityTeam[0][player.id].max - diversityTeam[0][player.id].min;
    }

    if (diversityTeam[1][player.id]) {
      diversityTeam[1][player.id].diff = diversityTeam[1][player.id].max - diversityTeam[1][player.id].min;
    }

    if (diversityOpponent[0][player.id]) {
      diversityOpponent[0][player.id].diff = diversityOpponent[0][player.id].max - diversityOpponent[0][player.id].min;
    }

    if (diversityOpponent[1][player.id]) {
      diversityOpponent[1][player.id].diff = diversityOpponent[1][player.id].max - diversityOpponent[1][player.id].min;
    }
  }

  return { priority, diversityTeam, diversityOpponent };
}

function getTeammateDiversity(defA: IPlayer, attA: IPlayer, defB: IPlayer, attB: IPlayer, ranges: MatchmakingRangesArray): number {
  const defADiv = ranges[0][defA.id];
  const defAScore = 1 - ((defA.teammatesStats[0][attA.id]?.matches ?? 0) - defADiv.min) / Math.max(defADiv.diff, 1);

  const attADiv = ranges[1][attA.id];
  const attAScore = 1 - ((attA.teammatesStats[1][defA.id]?.matches ?? 0) - attADiv.min) / Math.max(attADiv.diff, 1);

  const defBDiv = ranges[0][defB.id];
  const defBScore = 1 - ((defB.teammatesStats[0][attB.id]?.matches ?? 0) - defBDiv.min) / Math.max(defBDiv.diff, 1);

  const attBDiv = ranges[1][attB.id];
  const attBScore = 1 - ((attB.teammatesStats[1][defB.id]?.matches ?? 0) - attBDiv.min) / Math.max(attBDiv.diff, 1);

  return (defAScore + attAScore + defBScore + attBScore) / 4;
}

function getOpponentDiversity(defA: IPlayer, attA: IPlayer, defB: IPlayer, attB: IPlayer, ranges: MatchmakingRangesArray): number {
  const defAOpp = defA.opponentsStats[0];
  const defAOppRange = ranges[0][defA.id];
  const defAScore = 1 - ((defAOpp[defB.id]?.matches ?? 0) + (defAOpp[attB.id]?.matches ?? 0) - defAOppRange.min * 2) / (Math.max(defAOppRange.diff, 1) * 2);

  const attAOpp = attA.opponentsStats[1];
  const attAOppRange = ranges[1][attA.id];
  const attAScore = 1 - ((attAOpp[defB.id]?.matches ?? 0) + (attAOpp[attB.id]?.matches ?? 0) - attAOppRange.min * 2) / (Math.max(attAOppRange.diff, 1) * 2);

  const defBOpp = defB.opponentsStats[0];
  const defBOppRange = ranges[0][defB.id];
  const defBScore = 1 - ((defBOpp[defA.id]?.matches ?? 0) + (defBOpp[attA.id]?.matches ?? 0) - defBOppRange.min * 2) / (Math.max(defBOppRange.diff, 1) * 2);

  const attBOpp = attB.opponentsStats[1];
  const attBOppRange = ranges[1][attB.id];
  const attBScore = 1 - ((attBOpp[defA.id]?.matches ?? 0) + (attBOpp[attA.id]?.matches ?? 0) - attBOppRange.min * 2) / (Math.max(attBOppRange.diff, 1) * 2);

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
