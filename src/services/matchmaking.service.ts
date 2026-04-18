import { IPlayer } from '@/models/player.interface';
import { MaxEloDiff } from './elo.service';
import { getAllMatches } from './match.service';
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

// TODO: consider early exit if bad performance (too many players)

type Priority = { min: number; max: number; diff: number };
type DiversityMap = Record<number, Record<number, number> & Priority>;
type Diversity = { teamDef: DiversityMap; teamAtt: DiversityMap; opponent: DiversityMap };

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
  const maxDiversity = getDiversity(playersId, maxClassDiff);
  const defArray: IPlayer[] = [];
  const attArray: IPlayer[] = [];

  getPlayersRolesArray(players, defArray, attArray);

  return generateBestMatch(priority, maxDiversity, defArray, attArray, priorityPlayers, maxClassDiff);
}

function generateBestMatch(priority: Priority, maxDiversity: Diversity, def: IPlayer[], att: IPlayer[], priorityPlayers: IPlayer[], maxClassDiff: number): IMatchProposal | null {
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

          const classDiff = getClassDiff4(p1, p2, p3, p4);
          if (classDiff > maxClassDiff || !validatePriority(p1, p2, p3, p4, priorityPlayers)) continue;

          bestScore = checkProposal(p1, p2, p3, p4, priority, maxDiversity, bestScore, bestProposal);
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
  // p1=defA, p2=attA, p3=defB, p4=attB — use role-specific class
  const class1 = Math.max(2, p1.class[0]);
  const class2 = Math.max(2, p2.class[1]);
  const class3 = Math.max(2, p3.class[0]);
  const class4 = Math.max(2, p4.class[1]);

  const maxClass = Math.max(class1, class2, class3, class4);
  const minClass = Math.min(class1, class2, class3, class4);

  return maxClass - minClass;
}

function getClassDiff2(p1: IPlayer, p2: IPlayer): number {
  const class1 = Math.max(2, p1.class[p1.bestRole]);
  const class2 = Math.max(2, p2.class[p2.bestRole]);
  return Math.abs(class1 - class2);
}

function checkProposal(defA: IPlayer, attA: IPlayer, defB: IPlayer, attB: IPlayer, priority: Priority, diversity: Diversity, bestScore: number, proposal: IMatchProposal): number {
  // MATCH ELO DIFFERENCE SCORE
  const teamAElo = (defA.elo + attA.elo) / 2; // il / 2 può essere tolgo se usiamo la somma
  const teamBElo = (defB.elo + attB.elo) / 2;
  const matchEloDiff = Math.abs(teamAElo - teamBElo);
  const matchEloDiffNormalized = 1 - Math.min(1, matchEloDiff / MaxEloDiff);
  const matchBalanceScore = matchEloDiffNormalized * config.matchBalanceWeight;

  // AVERAGE MATCHES PLAYED
  const localMaxMatches = Math.max(defA.matches, attA.matches, defB.matches, attB.matches);
  const teamMatchessNormalized = 1 - ((localMaxMatches - priority.min) / priority.diff);
  const priorityScore = teamMatchessNormalized * config.priorityWeight;

  // PLAYERS ELO DIFFERENCE SCORE
  const playersMaxElo = Math.max(defA.elo, attA.elo, defB.elo, attB.elo);
  const playersMinElo = Math.min(defA.elo, attA.elo, defB.elo, attB.elo);
  const playersEloDiff = playersMaxElo - playersMinElo;
  const playersEloDiffNormalized = 1 - Math.min(1, playersEloDiff / MaxEloDiff);
  const playersDifferenceScore = playersEloDiffNormalized * config.playersDifferenceWeight;

  // DIVERSITY SCORE
  const diversityTeamScore = getTeammateDiversity(defA.id, attA.id, defB.id, attB.id, diversity) * config.diversityTeamWeight;
  const diversityOpponentScore = getOpponentDiversity(defA.id, attA.id, defB.id, attB.id, diversity.opponent) * config.diversityOpponentWeight;

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

function getPriority(players: IPlayer[]): Priority {
  const matches = players.map(x => x.matches);
  const max = Math.max(...matches, 1);
  const min = Math.min(...matches);
  return { max, min, diff: max - min };
}

// this can be precompute once
function getDiversity(playersId: number[], maxClassDiff: number): Diversity {
  const matches = getAllMatches();
  const teamDef: DiversityMap = {};
  const teamAtt: DiversityMap = {};
  const opponent: DiversityMap = {};

  for (const p1 of playersId) {
    (teamDef[p1] as Record<number, number>) ??= {};
    (teamAtt[p1] as Record<number, number>) ??= {};
    (opponent[p1] as Record<number, number>) ??= {};

    for (const p2 of playersId) { // TODO ottimizzare passando reference anzichè id nella func
      if (p1 === p2 || getClassDiff2(getPlayerById(p1)!, getPlayerById(p2)!) > maxClassDiff) continue;

      teamDef[p1][p2] = 0;
      teamAtt[p1][p2] = 0;
      opponent[p1][p2] = 0;
    }
  }

  for (const match of matches) {
    const teamA = match.teamA;
    const teamB = match.teamB;

    if (teamDef[teamA.defence]) {
      if (teamDef[teamA.defence][teamA.attack] !== undefined) teamDef[teamA.defence][teamA.attack]++; // valorizziamo solo quelli in queue
      if (opponent[teamA.defence][teamB.defence] !== undefined) opponent[teamA.defence][teamB.defence]++;
      if (opponent[teamA.defence][teamB.attack] !== undefined) opponent[teamA.defence][teamB.attack]++;
    }

    if (teamDef[teamB.defence]) {
      if (teamDef[teamB.defence][teamB.attack] !== undefined) teamDef[teamB.defence][teamB.attack]++;
      if (opponent[teamB.defence][teamA.defence] !== undefined) opponent[teamB.defence][teamA.defence]++;
      if (opponent[teamB.defence][teamA.attack] !== undefined) opponent[teamB.defence][teamA.attack]++;
    }

    if (teamAtt[teamA.attack]) {
      if (teamAtt[teamA.attack][teamA.defence] !== undefined) teamAtt[teamA.attack][teamA.defence]++;
      if (opponent[teamA.attack][teamB.defence] !== undefined) opponent[teamA.attack][teamB.defence]++;
      if (opponent[teamA.attack][teamB.attack] !== undefined) opponent[teamA.attack][teamB.attack]++;
    }

    if (teamAtt[teamB.attack]) {
      if (teamAtt[teamB.attack][teamB.defence] !== undefined) teamAtt[teamB.attack][teamB.defence]++;
      if (opponent[teamB.attack][teamA.defence] !== undefined) opponent[teamB.attack][teamA.defence]++;
      if (opponent[teamB.attack][teamA.attack] !== undefined) opponent[teamB.attack][teamA.attack]++;
    }
  }

  // COUNT

  for (const p1 of playersId) {
    // DEFENCE

    const p1Def = teamDef[p1];
    let minDef = Infinity, maxDef = -Infinity;

    for (const p2 in p1Def) {
      const p2Def = p1Def[p2];
      minDef = Math.min(minDef, p2Def);
      maxDef = Math.max(maxDef, p2Def);
    }

    p1Def.min = minDef === Infinity ? 0 : minDef;
    p1Def.max = Math.max(maxDef, 1);
    p1Def.diff = p1Def.max - p1Def.min;

    // ATTACK

    const p1Att = teamAtt[p1];
    let minAtt = Infinity, maxAtt = -Infinity;

    for (const p2 in p1Att) {
      const p2Att = p1Att[p2];
      minAtt = Math.min(minAtt, p2Att);
      maxAtt = Math.max(maxAtt, p2Att);
    }

    p1Att.min = minAtt === Infinity ? 0 : minAtt;
    p1Att.max = Math.max(maxAtt, 1);
    p1Att.diff = p1Att.max - p1Att.min;

    // OPPONENT
    const p1Opp = opponent[p1];
    let minOpp = Infinity, maxOpp = -Infinity;

    for (const p2 in p1Opp) {
      const p2Opp = p1Opp[p2];
      minOpp = Math.min(minOpp, p2Opp);
      maxOpp = Math.max(maxOpp, p2Opp);
    }

    p1Opp.min = minOpp === Infinity ? 0 : minOpp;
    p1Opp.max = Math.max(maxOpp, 1);
    p1Opp.diff = p1Opp.max - p1Opp.min;
  }

  return {
    teamDef,
    teamAtt,
    opponent
  };
}

function getTeammateDiversity(defA: number, attA: number, defB: number, attB: number, diversity: Diversity): number {
  const defADiv = diversity.teamDef[defA];
  const defAScore = defADiv ? 1 - (defADiv[attA] - defADiv.min) / defADiv.diff : 1;

  const attADiv = diversity.teamAtt[attA];
  const attAScore = attADiv ? 1 - (attADiv[defA] - attADiv.min) / attADiv.diff : 1;

  const defBDiv = diversity.teamDef[defB];
  const defBScore = defBDiv ? 1 - (defBDiv[attB] - defBDiv.min) / defBDiv.diff : 1;

  const attBDiv = diversity.teamAtt[attB];
  const attBScore = attBDiv ? 1 - (attBDiv[defB] - attBDiv.min) / attBDiv.diff : 1;

  return (defAScore + attAScore + defBScore + attBScore) / 4;
}

function getOpponentDiversity(defA: number, attA: number, defB: number, attB: number, opponent: DiversityMap): number {
  const defAOpp = opponent[defA];
  const defAScore = defAOpp ? 1 - (defAOpp[defB] + defAOpp[attB] - defAOpp.min * 2) / (defAOpp.diff * 2) : 1;

  const attAOpp = opponent[attA];
  const attAScore = attAOpp ? 1 - (attAOpp[defB] + attAOpp[attB] - attAOpp.min * 2) / (attAOpp.diff * 2) : 1;

  const defBOpp = opponent[defB];
  const defBScore = defBOpp ? 1 - (defBOpp[defA] + defBOpp[attA] - defBOpp.min * 2) / (defBOpp.diff * 2) : 1;

  const attBOpp = opponent[attB];
  const attBScore = attBOpp ? 1 - (attBOpp[defA] + attBOpp[attA] - attBOpp.min * 2) / (attBOpp.diff * 2) : 1;

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
