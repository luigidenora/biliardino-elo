import { IPlayer } from '@/models/player.interface';
import { getAllPlayers, getPlayerById } from './player.service';

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
   * Weight for diversity (0-1). Higher values prioritize new player combinations.
   */
  diversityWeight: number;
  /**
   * Weight for diversity (0-1). Higher values prioritize new player combinations.
   */
  teamBalanceWeight: number;
  /**
   * Randomness factor (0-1). Adds variation to avoid always selecting the same match.
   * The final score is multiplied by random(1 - randomness, 1 + randomness).
   */
  randomness: number;
}

export interface IMatchProposal {
  teamA: { defence: IPlayer; attack: IPlayer };
  teamB: { defence: IPlayer; attack: IPlayer };
}

const config: IMatchmakingConfig = {
  matchBalanceWeight: 0.4,
  teamBalanceWeight: 0.2,
  priorityWeight: 0.2,
  diversityWeight: 0.2,
  randomness: 0.08
};

export function findBestMatch(availablePlayerId: number[], priorityPlayersId: number[]): IMatchProposal | null {
  if (availablePlayerId.length < 4) return null;

  const players = availablePlayerId.map(id => getPlayerById(id)!);
  const priorityPlayers = priorityPlayersId.map(id => getPlayerById(id)!);

  if (players.includes(undefined!)) {
    throw new Error('Some player IDs are invalid');
  }

  const allPlayers = getAllPlayers();
  const maxEloDiff = getMaxEloDifference(allPlayers);
  const maxMatches = getMaxMatchesPlayed(allPlayers);
  const maxDiversity = getMaxDiversity(allPlayers);

  return generateBestMatch(maxEloDiff, maxMatches, maxDiversity, players, priorityPlayers);
}

function generateBestMatch(maxEloDiff: number, maxMatches: number, maxDiversity: number, players: IPlayer[], priorityPlayers: IPlayer[]): IMatchProposal | null {
  const n = players.length;
  const bestProposal: IMatchProposal = { teamA: { defence: players[0], attack: players[0] }, teamB: { defence: players[0], attack: players[0] } };
  let bestScore = -Infinity;

  for (let i = 0; i < n; i++) { // TODO early exit here
    for (let j = i + 1; j < n; j++) {
      for (let k = i + 1; k < n; k++) {
        if (k === j) continue;
        for (let l = k + 1; l < n; l++) {
          if (l === i || l === j) continue;

          const p1 = players[i];
          const p2 = players[j];
          const p3 = players[k];
          const p4 = players[l];

          if (!validatePriorityPlayers(p1, p2, p3, p4, priorityPlayers)) continue;

          bestScore = checkProposal(p1, p2, p3, p4, maxEloDiff, maxMatches, maxDiversity, bestScore, bestProposal);
        }
      }
    }
  }

  return bestScore === -Infinity ? null : bestProposal;
}

function validatePriorityPlayers(p1: IPlayer, p2: IPlayer, p3: IPlayer, p4: IPlayer, priorityPlayers: IPlayer[]): boolean {
  const playersSet = new Set([p1, p2, p3, p4]);

  for (const priorityPlayer of priorityPlayers) {
    if (!playersSet.has(priorityPlayer)) return false;
  }

  return true;
}

function checkProposal(defA: IPlayer, attA: IPlayer, defB: IPlayer, attB: IPlayer, maxEloDiff: number, maxMatches: number, maxDiversity: number, bestScore: number, proposal: IMatchProposal): number {
  // MATCH ELO DIFFERENCE SCORE
  const teamAElo = (defA.elo + attA.elo) / 2; // il / 2 può essere tolgo se usiamo la somma
  const teamBElo = (defB.elo + attB.elo) / 2;
  const matchEloDiff = Math.abs(teamAElo - teamBElo);
  const matchEloDiffNormalized = 1 - (matchEloDiff / maxEloDiff);
  const matchBalanceScore = matchEloDiffNormalized * config.matchBalanceWeight;

  // TEAM ELO DIFFERENCE SCORE
  const diffTeamAElo = Math.abs(defA.elo - attA.elo);
  const diffTeamBElo = Math.abs(defB.elo - attB.elo);
  const teamEloDiff = Math.max(diffTeamAElo, diffTeamBElo);
  const teamEloDiffNormalized = 1 - Math.min(1, teamEloDiff / maxEloDiff);
  const teamBalanceScore = teamEloDiffNormalized * config.teamBalanceWeight; // stiamo usando la differenza tra i primi 2 player e gli ultimi 2, ma va bene comunque

  // AVERAGE MATCHES PLAYED
  const teamsMatches = defA.matches + attA.matches + defB.matches + attB.matches;
  const teamMatchessNormalized = 1 - (teamsMatches / maxMatches);
  const priorityScore = teamMatchessNormalized * config.priorityWeight;

  // TODO we can apply an eary exit here

  // DIVERSITY SCORE
  const diversityTeammateCount = getTeammateDiversity(defA, attA, defB, attB);
  const diversityOpponentCount = getOpponentDiversity(defA, attA, defB, attB);
  const diversityNormalized = 1 - ((diversityTeammateCount + diversityOpponentCount) / maxDiversity);
  const diversityScore = diversityNormalized * config.diversityWeight;

  const score = calculateMatchScore(diversityScore, matchBalanceScore, priorityScore, teamBalanceScore);

  if (score > bestScore) {
    proposal.teamA.defence = defA;
    proposal.teamA.attack = attA;
    proposal.teamB.defence = defB;
    proposal.teamB.attack = attB;
    bestScore = score;
  }

  return bestScore;
}

function getMaxEloDifference(allPlayers: IPlayer[]): number {
  let maxElo = -Infinity, minElo = Infinity, maxElo2 = -Infinity, minElo2 = Infinity;

  for (const player of allPlayers) {
    if (player.elo > maxElo) {
      maxElo2 = maxElo;
      maxElo = player.elo;
    } else if (player.elo > maxElo2) {
      maxElo2 = player.elo;
    }

    if (player.elo < minElo) {
      minElo2 = minElo;
      minElo = player.elo;
    } else if (player.elo < minElo2) {
      minElo2 = player.elo;
    }
  }

  const value = (maxElo + maxElo2 - minElo - minElo2) / 2;
  return Math.max(value, 1);
}

function getMaxMatchesPlayed(allPlayers: IPlayer[]): number {
  const sortedPlayers = [...allPlayers].sort((a, b) => b.matches - a.matches);
  const matches = sortedPlayers[0].matches + sortedPlayers[1].matches + sortedPlayers[2].matches + sortedPlayers[3].matches;
  return Math.max(matches, 1);
}

function getMaxDiversity(allPlayers: IPlayer[]): number {
  const opponentMax: number[] = new Array(4).fill(0); // make a func and use it everywhere (in getMaxMatchesPlayed togliere sort e mettere questo approccio)
  let teammateMax = 0, teammateMax2 = 0;

  for (const player of allPlayers) {
    player.teammatesMatchCount?.forEach((value) => {
      if (value > teammateMax) {
        teammateMax2 = teammateMax;
        teammateMax = value;
      } else if (value > teammateMax2) {
        teammateMax2 = value;
      }
    });

    player.opponentsMatchCount?.forEach((value) => {
      if (value <= opponentMax[3]) return;

      for (let i = 0; i < 4; i++) {
        if (value > opponentMax[i]) {
          for (let j = 3; j > i; j--) {
            opponentMax[j] = opponentMax[j - 1];
          }
          opponentMax[i] = value;
        }
      }
    });
  }

  const diversity = teammateMax + teammateMax2 + opponentMax.reduce((a, b) => a + b, 0);
  return Math.max(diversity, 1);
}

function getTeammateDiversity(defA: IPlayer, attA: IPlayer, defB: IPlayer, attB: IPlayer): number {
  const teamAPlayer = defA.id > attA.id ? defA : attA;
  const teamAOtherPlayer = defA.id > attA.id ? attA : defA;
  const teamA = teamAPlayer.teammatesMatchCount?.get(teamAOtherPlayer.id) ?? 0;

  const teamBPlayer = defB.id > attB.id ? defB : attB;
  const teamBOtherPlayer = defB.id > attB.id ? attB : defB;
  const teamB = teamBPlayer.teammatesMatchCount?.get(teamBOtherPlayer.id) ?? 0;

  return teamA + teamB;
}

function getOpponentDiversity(defA: IPlayer, attA: IPlayer, defB: IPlayer, attB: IPlayer): number {
  const A1Player = defA.id > defB.id ? defA : defB;
  const A1OtherPlayer = defA.id > defB.id ? defB : defA;
  const A1 = A1Player.opponentsMatchCount?.get(A1OtherPlayer.id) ?? 0;

  const A2Player = defA.id > attB.id ? defA : attB;
  const A2OtherPlayer = defA.id > attB.id ? attB : defA;
  const A2 = A2Player.opponentsMatchCount?.get(A2OtherPlayer.id) ?? 0;

  const B1Player = attA.id > defB.id ? attA : defB;
  const B1OtherPlayer = attA.id > defB.id ? defB : attA;
  const B1 = B1Player.opponentsMatchCount?.get(B1OtherPlayer.id) ?? 0;

  const B2Player = attA.id > attB.id ? attA : attB;
  const B2OtherPlayer = attA.id > attB.id ? attB : attA;
  const B2 = B2Player.opponentsMatchCount?.get(B2OtherPlayer.id) ?? 0;

  return A1 + A2 + B1 + B2; // TODO fix normalizzazione qui e anche sui match (bisogna sottrarre il minimo)
}

function calculateMatchScore(diversityScore: number, matchBalanceScore: number, priorityScore: number, teamBalanceScore: number): number {
  const randomness = (Math.random() * 2 - 1) * config.randomness;
  const baseScore = diversityScore + matchBalanceScore + priorityScore + teamBalanceScore;
  return baseScore * (1 - randomness);
}
