import { IMatch, ITeam } from '@/models/match.interface';
import { IPlayer, IPlayerDTO } from '@/models/player.interface';
import { DerankTreshold, FinalK, FirstRankUp, MatchesToRank, MatchesToTransition, RankTreshold, StartK } from './elo.service';
import { fetchPlayers } from './repository.service';

const playersMap = new Map<number, IPlayer>();
let playersArray: IPlayer[] = [];

await loadPlayers();

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

export function createPlayerDTO(name: string, elo: number, role: -1 | 0 | 1): IPlayerDTO {
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

  player.avgTeamElo[role] = updateAverage(player.avgTeamElo[role], player.matches[role], match.teamELO[teamId]); // TODO consider only the mate instead of both?
  player.avgOpponentElo[role] = updateAverage(player.avgOpponentElo[role], player.matches[role], match.teamELO[teamId ^ 1]);

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

  if (Math.abs(player.streak[role]) > Math.abs(player.worstLossStreak[role])) {
    player.worstLossStreak[role] = player.streak[role];
  }

  player.bestRole = Number(player.class[0] === player.class[1] ? player.elo[1] > player.elo[0] : player.class[1] > player.class[0]);
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

export function computeRanks(): void {
  computeRanksRole(0);
  computeRanksRole(1);
  computeRanksRole(2);
}

function computeRanksRole(role: number): void {
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

    player.rank[role] = rank;
  }
}
