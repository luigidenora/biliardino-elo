import { IMatch } from '@/models/match.interface';
import { IPlayer } from '@/models/player.interface';
import { getMatchPlayerElo } from './elo.service';
import { getAllMatches } from './match.service';
import { getAllPlayers, getClass, getPlayerById } from './player.service';

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
   * Randomness factor (0-1). Adds variation to avoid always selecting the same match.
   */
  randomness: number;
}

export interface IMatchProposal {
  teamA: { defence: IPlayer; attack: IPlayer };
  teamB: { defence: IPlayer; attack: IPlayer };
  heuristicData?: IHeuristicData;
}

export interface IHeuristicData {
  matchBalance: { score: number; max: number };
  priority: { score: number; max: number };
  diversity: { score: number; max: number };
  randomness: { score: number; max: number };
  classBalance: { score: number; max: number };
  total: { score: number; max: number };
}

// TODO: consider early exit if bad performance (too many players)

export type Diversity = { teammate: number; opponent: number };

const config: IMatchmakingConfig = {
  matchBalanceWeight: 0.35,
  priorityWeight: 0.15,
  diversityWeight: 0.35,
  randomness: 0.15
};

export function findBestMatch(playersId: number[], priorityPlayersId: number[]): IMatchProposal | null {
  if (playersId.length < 4) return null;

  const players = playersId.map(id => getPlayerById(id)!);
  const priorityPlayers = priorityPlayersId.map(id => getPlayerById(id)!);

  if (players.includes(undefined!)) {
    throw new Error('Some player IDs are invalid');
  }

  const maxEloDiff = getMaxEloDifference(getAllPlayers());
  const maxMatches = getMaxMatchesPlayed(getAllPlayers());
  const maxDiversity = getMaxDiversity(getAllPlayers(), playersId);
  const defArray: IPlayer[] = [];
  const attArray: IPlayer[] = [];
  getPlayersRolesArray(getAllMatches(), players, defArray, attArray);

  return generateBestMatch(maxEloDiff, maxMatches, maxDiversity, defArray, attArray, priorityPlayers);
}

function generateBestMatch(maxEloDiff: number, maxMatches: number, maxDiversity: Diversity, def: IPlayer[], att: IPlayer[], priorityPlayers: IPlayer[]): IMatchProposal | null {
  const defCount = def.length;
  const attCount = att.length;
  const bestProposal: IMatchProposal = { teamA: { defence: def[0], attack: att[0] }, teamB: { defence: def[0], attack: att[0] } };
  let bestScore = -Infinity;

  for (let i = 0; i < defCount - 1; i++) {
    const p1 = def[i];

    for (let j = 0; j < attCount; j++) {
      const p2 = att[j];
      if (p2 === p1) continue;

      for (let k = i + 1; k < defCount; k++) {
        const p3 = def[k];
        if (p3 === p2) continue;

        for (let l = 0; l < attCount; l++) {
          const p4 = att[l];
          if (p4 === p1 || p4 === p2 || p4 === p3) continue;

          const classDiff = getClassDiff(p1, p2, p3, p4);
          if (classDiff > 2 || !validatePriority(p1, p2, p3, p4, priorityPlayers)) continue;

          bestScore = checkProposal(p1, p2, p3, p4, maxEloDiff, maxMatches, maxDiversity, bestScore, bestProposal, classDiff);
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

function getClassDiff(p1: IPlayer, p2: IPlayer, p3: IPlayer, p4: IPlayer): number {
  const class1 = p1.class === -1 ? getClass(p1.elo) : p1.class;
  const class2 = p2.class === -1 ? getClass(p2.elo) : p2.class;
  const class3 = p3.class === -1 ? getClass(p3.elo) : p3.class;
  const class4 = p4.class === -1 ? getClass(p4.elo) : p4.class;

  const maxClass = Math.max(class1, class2, class3, class4);
  const minClass = Math.min(class1, class2, class3, class4);

  return maxClass - minClass;
}

function checkProposal(defA: IPlayer, attA: IPlayer, defB: IPlayer, attB: IPlayer, maxEloDiff: number, maxMatches: number, maxDiversity: Diversity, bestScore: number, proposal: IMatchProposal, classDiff: number): number {
  // MATCH ELO DIFFERENCE SCORE
  const teamAElo = (getMatchPlayerElo(defA, true) + getMatchPlayerElo(attA, false)) / 2; // il / 2 può essere tolgo se usiamo la somma
  const teamBElo = (getMatchPlayerElo(defB, true) + getMatchPlayerElo(attB, false)) / 2;
  const matchEloDiff = Math.abs(teamAElo - teamBElo);
  const matchEloDiffNormalized = 1 - (matchEloDiff / maxEloDiff);
  const matchBalanceScore = matchEloDiffNormalized * config.matchBalanceWeight;

  // AVERAGE MATCHES PLAYED
  const teamsMatches = defA.matches + attA.matches + defB.matches + attB.matches;
  const teamMatchessNormalized = 1 - (teamsMatches / maxMatches);
  const priorityScore = teamMatchessNormalized * config.priorityWeight;

  // DIVERSITY SCORE
  const diversityTeammateCount = getTeammateDiversity(defA, attA, defB, attB);
  const diversityOpponentCount = getOpponentDiversity(defA, attA, defB, attB);
  // 60% peso alla diversità dei compagni di squadra, 40% a quella degli avversari
  // TODO split euristica
  const diversityNormalized = 1 - ((diversityTeammateCount / maxDiversity.teammate) * 0.6 + (diversityOpponentCount / maxDiversity.opponent) * 0.4);
  const diversityScore = diversityNormalized * config.diversityWeight;
  const randomness = Math.random() * config.randomness;

  const classBalance = classDiff <= 1 ? 1 : 0;

  const score = diversityScore + matchBalanceScore + priorityScore + randomness + classBalance;

  if (score > bestScore) {
    proposal.teamA.defence = defA;
    proposal.teamA.attack = attA;
    proposal.teamB.defence = defB;
    proposal.teamB.attack = attB;

    proposal.heuristicData = {
      matchBalance: { score: matchBalanceScore, max: config.matchBalanceWeight },
      priority: { score: priorityScore, max: config.priorityWeight },
      diversity: { score: diversityScore, max: config.diversityWeight },
      randomness: { score: randomness, max: config.randomness },
      classBalance: { score: classBalance, max: 1 },
      total: { score: score, max: 2 }
    };

    bestScore = score;
  }

  return bestScore;
}

function getMaxEloDifference(players: IPlayer[]): number {
  let maxElo = -Infinity, minElo = Infinity, maxElo2 = -Infinity, minElo2 = Infinity;

  for (const player of players) {
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

function getMaxMatchesPlayed(players: IPlayer[]): number {
  const sortedPlayers = [...players].sort((a, b) => b.matches - a.matches);
  const matches = sortedPlayers[0].matches + sortedPlayers[1].matches + sortedPlayers[2].matches + sortedPlayers[3].matches;
  return Math.max(matches, 1);
}

function getMaxDiversity(players: IPlayer[], playersId: number[]): Diversity {
  const playersSet = new Set(playersId);
  const opponentMax: number[] = new Array(4).fill(0); // make a func and use it everywhere (in getMaxMatchesPlayed togliere sort e mettere questo approccio)
  let teammateMax = 0, teammateMax2 = 0;

  for (const player of players) {
    player.teammatesMatchCount?.forEach((value, key) => {
      if (!playersSet.has(key)) return;

      if (value > teammateMax) {
        teammateMax2 = teammateMax;
        teammateMax = value;
      } else if (value > teammateMax2) {
        teammateMax2 = value;
      }
    });

    player.opponentsMatchCount?.forEach((value, key) => {
      if (value <= opponentMax[3] || !playersSet.has(key)) return;

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

  return {
    teammate: Math.max(teammateMax + teammateMax2, 1),
    opponent: Math.max(opponentMax[0] + opponentMax[1] + opponentMax[2] + opponentMax[3], 1)
  };
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

function getPlayersRolesArray(matches: IMatch[], players: IPlayer[], defArray: IPlayer[], attArray: IPlayer[]): void {
  const playersMap = new Map<number, { matches: number; def: number }>();

  for (const player of players) {
    playersMap.set(player.id, { matches: 0, def: 0 });
  }

  for (const match of matches) {
    const teamA = match.teamA;
    const teamB = match.teamB;

    checkPlayer(teamA.defence, true);
    checkPlayer(teamA.attack, false);
    checkPlayer(teamB.defence, true);
    checkPlayer(teamB.attack, false);
  }

  for (const [id, info] of playersMap) {
    const player = getPlayerById(id)!;
    const expectedDef = player.defence * 10;
    const att = info.matches - info.def;
    const expectedAtt = 10 - expectedDef;

    if (info.def < expectedDef) {
      defArray.push(player);
    }

    if (att < expectedAtt) {
      attArray.push(player);
    }
  }

  function checkPlayer(id: number, isDef: boolean): void {
    const playerInfo = playersMap.get(id);
    if (!playerInfo) return;

    if (playerInfo.matches < 9) {
      playerInfo.matches++;
      playerInfo.def += isDef ? 1 : 0;
    } else {
      playerInfo.matches = 0;
      playerInfo.def = 0;
    }
  }
}
