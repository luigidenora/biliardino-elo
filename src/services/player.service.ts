import { IMatch } from '@/models/match.interface';
import { IPlayer, IPlayerDTO } from '@/models/player.interface';
import { DerankTreshold, FinalK, FirstRankUp, MatchesToRank, MatchesToTransition, RankTreshold, StartK } from './elo.service';
import { fetchPlayers } from './repository.service';

const playersMap = new Map<number, IPlayer>();
let playersArray: IPlayer[] = [];
let rankOutdated = true;

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

export function getRank(id: number): number {
  if (rankOutdated) computeRanks();
  return getPlayerById(id)?.rank ?? -1;
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

export function updatePlayer(id: number, idMate: number, idOppoA: number, idOppoB: number, delta: number, role: number, goalsFor: number, goalsAgainst: number, match: IMatch): void {
  const player = getPlayerById(id);
  if (!player) return;

  const won = delta > 0 ? 1 : 0;

  player.elo[role] += delta * getBonusK(player.matches[role]);
  player.matches[role]++;
  player.wins[role] += won;
  player.goalsFor[role] += goalsFor;
  player.goalsAgainst[role] += goalsAgainst;

  player.matchesDelta.push(delta);
  player.history.push(match);

  if (player.matches[role] >= MatchesToRank) {
    player.bestElo[role] = Math.max(player.bestElo[role], player.elo[role]);
    player.worstElo[role] = Math.min(player.worstElo[role], player.elo[role]);
  }

  updatePlayerClass(player, won, role);
  updatePlayersOccurency(player, idMate, idOppoA, idOppoB, won, role, delta);
  updateMatchesRecord(player, match, role);

  // player.avgTeamElo[role] = updateAverage(player.avgTeamElo[role], player.matches[role], delta);
  // player.avgOpponentElo[role] = updateAverage(player.avgOpponentElo[role], player.matches[role], -delta);

  // bestClass: [number, number];
  // bestWinStreak: [number, number];
  // worstLossStreak: [number, number];

  // bestTeammateCount: [PlayerStats | null, PlayerStats | null]; // by matches
  // bestTeammate: [PlayerStats | null, PlayerStats | null]; // by Elo gain
  // worstTeammate: [PlayerStats | null, PlayerStats | null]; // by Elo loss
  // bestOpponent: [PlayerStats | null, PlayerStats | null]; // by Elo gain
  // worstOpponent: [PlayerStats | null, PlayerStats | null]; // by Elo loss

  rankOutdated = true;
}

export function updatePlayerClass(player: IPlayer, won: number, role: number): void {
  if (player.matches[role] < MatchesToRank) return;

  const currentClass = player.class[role];
  let newClass = getClass(player.elo[role]);

  if (currentClass === newClass) return;

  if (won === 1) { // win
    newClass = Math.min(newClass, currentClass === -1 ? Infinity : currentClass); // to avoid to derank after win if in the treshold
  } else if (currentClass !== -1 && checkDerankThreshold(player.elo[role])) {
    newClass--;
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

function updateMatchesRecord(player: IPlayer, match: IMatch, role: number): void {
  const teamId = match.teamA.defence === player.id || match.teamA.attack === player.id ? 0 : 1;
  const won = match.deltaELO[teamId] > 0 ? 1 : 0;

  if (won) {
    player.bestVictoryByElo[role] ??= { match, value: match.deltaELO[teamId] };
    player.bestVictoryByScore[role] ??= { match, value: match.score[teamId] };
    player.bestVictoryByPercentage[role] ??= { match, value: match.expectedScore[teamId] };

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

  player.worstDefeatByElo[role] ??= { match, value: match.deltaELO[teamId] };
  player.worstDefeatByScore[role] ??= { match, value: match.score[teamId] };
  player.worstDefeatByPercentage[role] ??= { match, value: match.expectedScore[teamId] };

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
  if (elo >= FirstRankUp + RankTreshold * 3) return 0; // megalodonte virtual rank
  if (elo >= FirstRankUp + RankTreshold * 2) return 1; // squalo virtual rank
  if (elo >= FirstRankUp + RankTreshold) return 2; // barracuda
  if (elo >= FirstRankUp) return 3; // tonno
  return 4; // sogliola
}

export function checkDerankThreshold(elo: number): boolean {
  elo = Math.round(elo);
  if (elo >= FirstRankUp + RankTreshold * 2) return elo >= FirstRankUp + RankTreshold * 3 - DerankTreshold; // derank megalodonte -> squalo
  if (elo >= FirstRankUp + RankTreshold) return elo >= FirstRankUp + RankTreshold * 2 - DerankTreshold; // derank squalo -> barracuda
  if (elo >= FirstRankUp) return elo >= FirstRankUp + RankTreshold - DerankTreshold; // derank barracuda -> tonno
  if (elo < FirstRankUp) return elo >= FirstRankUp - DerankTreshold; // derank tonno -> sogliola
  return false;
}

export async function loadPlayers(): Promise<void> {
  playersArray = await fetchPlayers();

  for (const player of playersArray) {
    playersMap.set(player.id, player);
  }
}

function computeRanks(): void { // TODO refactor
  const players = playersArray.toSorted((a, b) => {
    const classA = Math.min(a.class[0], a.class[1]) == -1 ? Infinity : Math.min(a.class[0], a.class[1]);
    const classB = Math.min(b.class[0], b.class[1]) == -1 ? Infinity : Math.min(b.class[0], b.class[1]);
    return classA - classB || Math.max(b.elo[0], b.elo[1]) - Math.max(a.elo[0], a.elo[1]);
  });

  let rank = 0;
  let previousElo = -1;
  let previousClass = -1;
  let count = 0;

  for (const player of players) {
    if (Math.max(player.matches[0], player.matches[1]) < 1) continue; // TODO customize it

    count++;
    const elo = Math.max(player.elo[0], player.elo[1]);
    const playerClass = Math.min(player.class[0], player.class[1]);

    if (elo !== previousElo || playerClass !== previousClass) {
      rank = count;
      previousElo = elo;
      previousClass = playerClass;
    }

    player.rank = rank;
  }

  rankOutdated = false;
}

export function getBonusK(matches: number): number {
  const alpha = MatchesToTransition / Math.log(StartK / FinalK);
  return Math.max(FinalK, StartK * Math.exp(-matches / alpha)) / FinalK;
}

export function updateAverage(average: number, count: number, value: number): number {
  return (average * count + value) / (count + 1);
}
