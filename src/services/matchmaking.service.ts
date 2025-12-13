import { IPlayer } from '@/models/player.interface';
import { PlayerService } from './player.service';

export interface IMatchmakingConfig {
  /**
   * Weight for ELO balance (0-1). Higher values prioritize balanced matches.
   * Default: 0.4
   */
  balanceWeight: number;
  /**
   * Weight for player priority (0-1). Higher values prioritize players with fewer matches.
   * Default: 0.4
   */
  priorityWeight: number;
  /**
   * Weight for diversity (0-1). Higher values prioritize new player combinations.
   * Default: 0.2
   */
  diversityWeight: number;
  /**
   * Randomness factor (0-1). Adds variation to avoid always selecting the same match.
   * The final score is multiplied by random(1 - randomness, 1 + randomness).
   * Default: 0.1 (10% variation)
   */
  randomness: number;
}

export interface IMatchProposal {
  score: number;
  /** Absolute ELO difference between teams */
  eloScore: number;
  /** Absolute ELO difference value */
  eloDifference: number;
  /** Priority score (0-1). Higher when players have fewer matches */
  priorityScore: number;
  /** Diversity score (0-1). Higher when these player combinations are new */
  diversityScore: number;

  teamA: { defence: IPlayer; attack: IPlayer };
  teamB: { defence: IPlayer; attack: IPlayer };
}

export class MatchmakingService {
  private static readonly defaultConfig: IMatchmakingConfig = {
    balanceWeight: 0.4,
    priorityWeight: 0.4,
    diversityWeight: 0.2,
    randomness: 0.1
  };

  private static config: IMatchmakingConfig;

  public static findBestMatches(availablePlayerNames: string[], config: IMatchmakingConfig = this.defaultConfig): IMatchProposal[] | null {
    if (availablePlayerNames.length < 4) return null;

    const players = availablePlayerNames.map(name => PlayerService.getPlayerByName(name)) as IPlayer[];

    if (players.filter(p => p === undefined).length > 0) {
      throw new Error('Some player IDs are invalid');
    }

    this.config = config;

    const allPlayers = PlayerService.getAllPlayers();
    const maxEloDiff = this.getMaxEloDifference(allPlayers);
    const maxMatches = this.getMaxMatchesPlayed(allPlayers);
    const maxDiversity = this.getMaxDiversity(allPlayers);
    const proposals = this.generateAllMatches(maxEloDiff, maxMatches, maxDiversity, players);

    const scoredProposals = proposals.map(proposal => ({ ...proposal, score: this.calculateMatchScore(proposal.diversityScore, proposal.eloScore, proposal.priorityScore) }));
    scoredProposals.sort((a, b) => b.score - a.score);

    return scoredProposals;
  }

  private static generateAllMatches(maxEloDiff: number, maxMatches: number, maxDiversity: number, players: IPlayer[]): IMatchProposal[] {
    const proposals: IMatchProposal[] = [];
    const n = players.length;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        for (let k = i + 1; k < n; k++) {
          if (k === j) continue;
          for (let l = k + 1; l < n; l++) {
            if (l === i || l === j) continue;

            const p1 = players[i];
            const p2 = players[j];
            const p3 = players[k];
            const p4 = players[l];

            proposals.push(this.createProposal(p1, p2, p3, p4, maxEloDiff, maxMatches, maxDiversity));
          }
        }
      }
    }

    return proposals;
  }

  private static createProposal(defA: IPlayer, attA: IPlayer, defB: IPlayer, attB: IPlayer, maxEloDiff: number, maxMatches: number, maxDiversity: number): IMatchProposal {
    // ELO DIFFERENCE SCORE
    const teamAElo = (defA.elo + attA.elo) / 2; // il / 2 può essere tolgo se usiamo la somma
    const teamBElo = (defB.elo + attB.elo) / 2;
    const eloDiff = Math.abs(teamAElo - teamBElo);
    const eloDiffNormalized = 1 - (eloDiff / maxEloDiff);
    const eloScore = eloDiffNormalized * this.config.balanceWeight;

    // AVERAGE MATCHES PLAYED
    const teamsMatches = defA.matches + attA.matches + defB.matches + attB.matches;
    const teamMatchessNormalized = 1 - (teamsMatches / maxMatches);
    const priorityScore = teamMatchessNormalized * this.config.priorityWeight;

    // DIVERSITY SCORE
    const diversityTeammateCount = this.getTeammateDiversity(defA, attA, defB, attB);
    const diversityOpponentCount = this.getOpponentDiversity(defA, attA, defB, attB);
    const diversityNormalized = 1 - ((diversityTeammateCount + diversityOpponentCount) / maxDiversity);
    const diversityScore = diversityNormalized * this.config.diversityWeight;

    return {
      teamA: { defence: defA, attack: attA },
      teamB: { defence: defB, attack: attB },
      eloDifference: eloDiff,
      eloScore,
      priorityScore,
      diversityScore,
      score: this.calculateMatchScore(diversityScore, eloScore, priorityScore)
    };
  }

  private static getMaxEloDifference(allPlayers: IPlayer[]): number {
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

    return (maxElo + maxElo2 - minElo - minElo2) / 2;
  }

  private static getMaxMatchesPlayed(allPlayers: IPlayer[]): number {
    const sortedPlayers = [...allPlayers].sort((a, b) => b.matches - a.matches);
    return sortedPlayers[0].matches + sortedPlayers[1].matches + sortedPlayers[2].matches + sortedPlayers[3].matches;
  }

  private static getMaxDiversity(allPlayers: IPlayer[]): number {
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

    return teammateMax + teammateMax2 + opponentMax.reduce((a, b) => a + b, 0);
  }

  private static getTeammateDiversity(defA: IPlayer, attA: IPlayer, defB: IPlayer, attB: IPlayer): number {
    const teamAPlayer = defA.id > attA.id ? defA : attA;
    const teamAOtherPlayer = defA.id > attA.id ? attA : defA;
    const teamA = teamAPlayer.teammatesMatchCount?.get(teamAOtherPlayer.id) ?? 0;

    const teamBPlayer = defB.id > attB.id ? defB : attB;
    const teamBOtherPlayer = defB.id > attB.id ? attB : defB;
    const teamB = teamBPlayer.teammatesMatchCount?.get(teamBOtherPlayer.id) ?? 0;

    return teamA + teamB;
  }

  private static getOpponentDiversity(defA: IPlayer, attA: IPlayer, defB: IPlayer, attB: IPlayer): number {
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

  private static calculateMatchScore(diversityScore: number, eloDifference: number, priorityScore: number): number {
    const randomness = (Math.random() * 2 - 1) * this.config.randomness;
    const baseScore = diversityScore + eloDifference + priorityScore;
    return baseScore * (1 - randomness);
  }
}
