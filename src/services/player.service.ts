import { IMatch, ITeam } from '@/models/match.interface';
import { IPlayer, IPlayerDTO } from '@/models/player.interface';
import { DerankTreshold, FinalK, FirstRankUp, MatchesToRank, MatchesToTransition, RankTreshold, StartK } from './elo.service';
import { fetchPlayers } from './repository.service';

const playersMap = new Map<number, IPlayer>();
let playersArray: IPlayer[] = [];

try {
  await loadPlayers();
} catch (e) {
  console.error('[player.service] Failed to load players from Firebase:', e);
}

export function getPlayerById(id: number): IPlayer | undefined {
  return playersMap.get(id);
}

export function getPlayerByName(name: string): IPlayer | undefined {
  for (const [, player] of playersMap) {
    if (player.name.includes(name)) return player;
  }
  return undefined;
}

export function getAllPlayers(): IPlayer[] {
  return playersArray;
}

export function createPlayerDTO(name: string, role: -1 | 0 | 1): IPlayerDTO {
  const lastId = Math.max(...playersArray.map(p => p.id));
  const id = Number.isFinite(lastId) ? lastId + 1 : 1;

  const newPlayer: IPlayerDTO = {
    id,
    name,
    role
  };

  return newPlayer;
}

export function updatePlayer(id: number, idMate: number, opponentTeam: ITeam, role: number, match: IMatch): void {
  const player = getPlayerById(id);
  if (!player) return;

  const teamId = match.teamA.defence === player.id || match.teamA.attack === player.id ? 0 : 1;
  const idOppoA = opponentTeam.defence;
  const idOppoB = opponentTeam.attack;
  const delta = match.deltaELO[teamId];
  const goalsFor = match.score[teamId];
  const goalsAgainst = match.score[teamId ^ 1];
  const won = delta > 0 ? 1 : 0;

  player.elo[role] += delta * getBonusK(player.matches[role]);
  player.matches[role]++;
  player.wins[role] += won;
  player.goalsFor[role] += goalsFor;
  player.goalsAgainst[role] += goalsAgainst;

  player.matchesDelta[role].push(delta);
  player.history[role].push(match);

  updatePlayerClass(player, won, role);
  updatePlayersOccurency(player, idMate, idOppoA, idOppoB, won, role, delta);
  updateMatchesRecord(player, match, role, teamId, won);

  player.avgTeamElo[role] = updateAverage(player.avgTeamElo[role], player.matches[role] - 1, match.teamELO[teamId]); // TODO consider only the mate instead of both?
  player.avgOpponentElo[role] = updateAverage(player.avgOpponentElo[role], player.matches[role] - 1, match.teamELO[teamId ^ 1]);

  if (player.matches[role] >= MatchesToRank) {
    player.bestElo[role] = Math.max(player.bestElo[role], player.elo[role]);
    player.worstElo[role] = Math.min(player.worstElo[role], player.elo[role]);
    player.bestClass[role] = Math.max(player.bestClass[role], player.class[role]);
  }

  if (won) {
    player.streak[role] = player.streak[role] > 0 ? player.streak[role] + 1 : 1;
  } else {
    player.streak[role] = player.streak[role] < 0 ? player.streak[role] - 1 : -1;
  }

  if (player.streak[role] > player.bestWinStreak[role]) {
    player.bestWinStreak[role] = player.streak[role];
  }

  if (player.streak[role] < player.worstLossStreak[role]) {
    player.worstLossStreak[role] = player.streak[role];
  }

  player.bestRole = getBestRole(player);
}

function getBestRole(player: IPlayer): number {
  if (player.class[0] === player.class[1]) {
    if (player.matches[1] === 0) return 0;
    if (player.matches[0] === 0) return 1;
    return player.elo[1] > player.elo[0] ? 1 : 0;
  }

  return player.class[1] > player.class[0] ? 1 : 0;
}

export function updatePlayerClass(player: IPlayer, won: number, role: number): void {
  if (player.matches[role] < MatchesToRank) return;

  const currentClass = player.class[role];
  let newClass = getClass(player.elo[role]);

  if (currentClass === newClass) return;

  if (won === 1) { // win
    newClass = Math.max(newClass, currentClass); // to avoid to derank after win if in the treshold
  } else if (currentClass !== -1 && checkDerankThreshold(player.elo[role])) {
    newClass++;
  }

  player.class[role] = newClass;
}

export function updatePlayersOccurency(player: IPlayer, idMate: number, idOppoA: number, idOppoB: number, won: number, role: number, delta: number): void {
  player.teammatesStats[role][idMate] ??= { delta: 0, matches: 0, wins: 0 };
  player.teammatesStats[role][idMate].delta += delta;
  player.teammatesStats[role][idMate].matches++;
  player.teammatesStats[role][idMate].wins += won;

  player.opponentsStats[role][idOppoA] ??= { delta: 0, matches: 0, wins: 0 };
  player.opponentsStats[role][idOppoA].delta += delta;
  player.opponentsStats[role][idOppoA].matches++;
  player.opponentsStats[role][idOppoA].wins += won;

  player.opponentsStats[role][idOppoB] ??= { delta: 0, matches: 0, wins: 0 };
  player.opponentsStats[role][idOppoB].delta += delta;
  player.opponentsStats[role][idOppoB].matches++;
  player.opponentsStats[role][idOppoB].wins += won;
}

function updateMatchesRecord(player: IPlayer, match: IMatch, role: number, teamId: number, won: number): void {
  if (won) {
    player.bestVictoryByElo[role] ??= { match, value: -Infinity };
    player.bestVictoryByScore[role] ??= { match, value: -Infinity };
    player.bestVictoryByPercentage[role] ??= { match, value: Infinity };

    if (match.deltaELO[teamId] > player.bestVictoryByElo[role].value) {
      player.bestVictoryByElo[role].match = match;
      player.bestVictoryByElo[role].value = match.deltaELO[teamId];
    }

    const scoreDifference = match.score[teamId] - match.score[teamId ^ 1];
    if (scoreDifference > player.bestVictoryByScore[role].value) {
      player.bestVictoryByScore[role].match = match;
      player.bestVictoryByScore[role].value = scoreDifference;
    }

    if (match.expectedScore[teamId] < player.bestVictoryByPercentage[role].value) {
      player.bestVictoryByPercentage[role].match = match;
      player.bestVictoryByPercentage[role].value = match.expectedScore[teamId];
    }

    return;
  }

  player.worstDefeatByElo[role] ??= { match, value: Infinity };
  player.worstDefeatByScore[role] ??= { match, value: -Infinity };
  player.worstDefeatByPercentage[role] ??= { match, value: -Infinity };

  if (match.deltaELO[teamId] < player.worstDefeatByElo[role].value) {
    player.worstDefeatByElo[role].match = match;
    player.worstDefeatByElo[role].value = match.deltaELO[teamId];
  }

  const scoreDifference = match.score[teamId ^ 1] - match.score[teamId];
  if (scoreDifference > player.worstDefeatByScore[role].value) {
    player.worstDefeatByScore[role].match = match;
    player.worstDefeatByScore[role].value = scoreDifference;
  }

  if (match.expectedScore[teamId] > player.worstDefeatByPercentage[role].value) {
    player.worstDefeatByPercentage[role].match = match;
    player.worstDefeatByPercentage[role].value = match.expectedScore[teamId];
  }
}

export function getClass(elo: number): number {
  elo = Math.round(elo);
  if (elo >= FirstRankUp + RankTreshold * 3) return 5; // megalodonte virtual rank
  if (elo >= FirstRankUp + RankTreshold * 2) return 4; // squalo virtual rank
  if (elo >= FirstRankUp + RankTreshold) return 3; // barracuda
  if (elo >= FirstRankUp) return 2; // tonno
  if (elo >= FirstRankUp - RankTreshold) return 1; // spigola
  return 0; // sogliola
}

export function checkDerankThreshold(elo: number): boolean {
  elo = Math.round(elo);
  if (elo >= FirstRankUp + RankTreshold * 2) return elo >= FirstRankUp + RankTreshold * 3 - DerankTreshold; // derank megalodonte -> squalo
  if (elo >= FirstRankUp + RankTreshold) return elo >= FirstRankUp + RankTreshold * 2 - DerankTreshold; // derank squalo -> barracuda
  if (elo >= FirstRankUp) return elo >= FirstRankUp + RankTreshold - DerankTreshold; // derank barracuda -> tonno
  if (elo >= FirstRankUp - RankTreshold) return elo >= FirstRankUp - DerankTreshold; // derank tonno -> spigola
  if (elo < FirstRankUp - RankTreshold) return elo >= FirstRankUp - RankTreshold - DerankTreshold; // derank spigola -> sogliola
  return false;
}

export async function loadPlayers(): Promise<void> {
  playersArray = await fetchPlayers();

  for (const player of playersArray) {
    playersMap.set(player.id, player);
  }
}

export function getBonusK(matches: number): number {
  const alpha = MatchesToTransition / Math.log(StartK / FinalK);
  return Math.max(FinalK, StartK * Math.exp(-matches / alpha)) / FinalK;
}

export function updateAverage(average: number, count: number, value: number): number {
  return (average * count + value) / (count + 1);
}

export function updatePlayerRecords(playerId: number, role: number): void {
  const player = getPlayerById(playerId);
  if (!player) throw new Error('Player not found when updating records.');

  const teammatesStats = player.teammatesStats[role];
  for (const idMate in teammatesStats) {
    const stats = teammatesStats[idMate];

    player.bestTeammateCount[role] ??= { player: -1, value: 0 };
    player.bestTeammate[role] ??= { player: -1, value: -Infinity };
    player.worstTeammate[role] ??= { player: -1, value: Infinity };

    if (stats.matches > player.bestTeammateCount[role].value) {
      player.bestTeammateCount[role].player = Number(idMate);
      player.bestTeammateCount[role].value = stats.matches;
    }

    if (stats.delta > player.bestTeammate[role].value) {
      player.bestTeammate[role].player = Number(idMate);
      player.bestTeammate[role].value = stats.delta;
    }

    if (stats.delta < player.worstTeammate[role].value) {
      player.worstTeammate[role].player = Number(idMate);
      player.worstTeammate[role].value = stats.delta;
    }
  }

  const opponentsStats = player.opponentsStats[role];
  for (const idOpponent in opponentsStats) {
    const stats = opponentsStats[idOpponent];

    player.bestOpponentCount[role] ??= { player: -1, value: 0 };
    player.bestOpponent[role] ??= { player: -1, value: Infinity };
    player.worstOpponent[role] ??= { player: -1, value: -Infinity };

    if (stats.matches > player.bestOpponentCount[role].value) {
      player.bestOpponentCount[role].player = Number(idOpponent);
      player.bestOpponentCount[role].value = stats.matches;
    }

    if (stats.delta > player.worstOpponent[role].value) {
      player.worstOpponent[role].player = Number(idOpponent);
      player.worstOpponent[role].value = stats.delta;
    }

    if (stats.delta < player.bestOpponent[role].value) {
      player.bestOpponent[role].player = Number(idOpponent);
      player.bestOpponent[role].value = stats.delta;
    }
  }
}

export function updateAllPlayerRecords(): void {
  for (const player of playersArray) {
    updatePlayerRecords(player.id, 0);
    updatePlayerRecords(player.id, 1);
  }
}

export function computeEloDayStart(): void {
  for (const player of playersArray) {
    player.eloAtDayStart[0] = player.elo[0];
    player.eloAtDayStart[1] = player.elo[1];
  }
}

export function computeRanks(rankKey: 'rank' | 'rankAtDayStart'): void {
  computeRanksRole(0, rankKey);
  computeRanksRole(1, rankKey);
  computeRanksRole(2, rankKey);
}

function computeRanksRole(role: number, rankKey: 'rank' | 'rankAtDayStart'): void {
  let comparer: (a: IPlayer, b: IPlayer) => number;

  if (role === 2) {
    comparer = (a, b) => {
      return (b.class[b.bestRole] - a.class[a.bestRole]) || (b.elo[b.bestRole] - a.elo[a.bestRole]);
    };
  } else {
    comparer = (a, b) => {
      return (b.class[role] - a.class[role]) || (b.elo[role] - a.elo[role]);
    };
  }

  const players = playersArray.toSorted(comparer);

  let rank = 0;
  let previousElo = -1;
  let previousClass = -1;
  let count = 0;

  for (const player of players) {
    const roleToCheck = role === 2 ? player.bestRole : role;
    if (player.matches[roleToCheck] < 1) continue; // at least one game to be viewed in the scoreboard

    count++;
    const elo = player.elo[roleToCheck];
    const playerClass = player.class[roleToCheck];

    if (elo !== previousElo || playerClass !== previousClass) {
      rank = count;
      previousElo = elo;
      previousClass = playerClass;
    }

    player[rankKey][role] = rank;
  }
}

function standardDeviation(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

export function calculateConsistency(player: IPlayer, role: number): number {
  // OPTIMIZE sta calcolando due volte tutta sta roba e sta ricalcolando pure il player stesso
  const matches = player.history[role];
  if (matches.length === 0) return 0;

  const results: { sigma: number; mu: number }[] = [];

  for (const p of getAllPlayers()) {
    results.push(getSigmaMu(p, 0, MatchesToRank), getSigmaMu(p, 1, MatchesToRank));
  }

  const sigmas = results.map(r => r.sigma).filter(sigma => Number.isFinite(sigma));
  const mus = results.map(r => r.mu).filter(mu => Number.isFinite(mu));
  const maxSigma = Math.max(...sigmas);
  const minSigma = Math.min(...sigmas);
  const maxMu = Math.max(...mus);
  const minMu = Math.min(...mus);

  const { sigma, mu } = getSigmaMu(player, role, 1);
  const sigmaNorm = 1 - normClamp(sigma, minSigma, maxSigma);
  const muNorm = normClamp(mu, minMu, maxMu);

  console.log(`Player ${player.name} - Role ${role === 0 ? 'Defender' : 'Attacker'} - Consistency calculation: sigma=${sigma.toFixed(3)} (norm ${sigmaNorm.toFixed(3)}), mu=${mu.toFixed(3)} (norm ${muNorm.toFixed(3)})`);

  const consistency = sigmaNorm * 0.5 + muNorm * 0.5;
  return consistency;
}

function getSigmaMu(player: IPlayer, role: number, minMatches: number): { sigma: number; mu: number } {
  const matches = player.history[role];
  if (matches.length < minMatches) return { sigma: 0.5, mu: 0 };

  const errors: number[] = [];

  for (const match of matches) {
    const teamId = match.teamA.defence === player.id || match.teamA.attack === player.id ? 0 : 1;
    const expected = match.expectedScore[teamId];
    const won = match.score[teamId] === 8 ? 1 : 0;
    const error = won - expected;
    errors.push(error);
  }

  const sigma = standardDeviation(errors); // deviazione standard degli errori (quanto i risultati si discostano dall'atteso)
  const mu = errors.reduce((sum, v) => sum + v, 0) / errors.length; // media degli errori (quanto si tende a sovra/performance rispetto all'atteso)

  return { sigma, mu };
}

function normClamp(value: number, min: number, max: number): number {
  const norm = (value - min) / (max - min);
  return Math.max(0, Math.min(1, norm));
}
