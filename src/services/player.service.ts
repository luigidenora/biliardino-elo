import { IPlayer, IPlayerDTO } from '@/models/player.interface';
import { getDisplayElo } from '@/utils/get-display-elo.util';
import { FinalK, MatchesToRank, MatchesToTransition, StartK } from './elo.service';
import { fetchPlayers } from './repository.service';

const playersMap = new Map<number, IPlayer>();
const derankTreshold = Math.round(100 * 0.3);
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

export function createPlayerDTO(name: string, elo: number, defence: number): IPlayerDTO {
  const lastId = Math.max(...playersArray.map(p => p.id));
  const id = Number.isFinite(lastId) ? lastId + 1 : 1;

  const newPlayer: IPlayerDTO = {
    id,
    name,
    elo,
    defence
  };

  return newPlayer;
}

export function updatePlayer(id: number, idMate: number, idOppoA: number, idOppoB: number, delta: number, isDefender: boolean, goalsFor: number, goalsAgainst: number): void {
  const player = getPlayerById(id);
  if (!player) return;

  player.elo += delta * getBonusK(player.matches);
  player.bestElo = Math.max(player.bestElo ?? player.elo, player.elo);
  player.matches++;
  player.wins += delta > 0 ? 1 : 0;
  player.goalsFor += goalsFor;
  player.goalsAgainst += goalsAgainst;
  player.matchesAsDefender += isDefender ? 1 : 0;
  player.matchesAsAttacker += isDefender ? 0 : 1;

  if (id > idMate) { // to avoid to calculate twice the same teammate delta
    if (!player.teammatesMatchCount) {
      player.teammatesDelta = new Map<number, number>();
      player.teammatesMatchCount = new Map<number, number>();
    }

    player.teammatesDelta!.set(idMate, (player.teammatesDelta!.get(idMate) ?? 0) + delta);
    player.teammatesMatchCount.set(idMate, (player.teammatesMatchCount.get(idMate) ?? 0) + 1);
  }

  if (id > idOppoA) { // to avoid to calculate twice the same teammate delta
    player.opponentsMatchCount ??= new Map<number, number>();
    player.opponentsMatchCount.set(idOppoA, (player.opponentsMatchCount.get(idOppoA) ?? 0) + 1);
  }

  if (id > idOppoB) { // to avoid to calculate twice the same teammate delta
    player.opponentsMatchCount ??= new Map<number, number>();
    player.opponentsMatchCount.set(idOppoB, (player.opponentsMatchCount.get(idOppoB) ?? 0) + 1);
  }

  updatePlayerClass(player, delta > 0);

  player.matchesDelta.push(delta);

  rankOutdated = true;
}

export function updatePlayerClass(player: IPlayer, win: boolean): void {
  if (player.matches < MatchesToRank) return;

  const currentClass = player.class;
  let newClass = getClass(player.elo);

  if (currentClass === newClass) return;

  if (win) {
    newClass = Math.min(newClass, currentClass === -1 ? Infinity : currentClass); // to avoid to derank after win if in the treshold
  } else if (currentClass !== -1 && checkDerankThreshold(player.elo)) {
    newClass--;
  }

  player.class = newClass;
}

export function getClass(elo: number): number {
  elo = Math.round(elo);
  if (elo >= 1200) return 0;
  if (elo >= 1100) return 1;
  if (elo >= 1000) return 2;
  if (elo >= 900) return 3;
  return 4;
}

export function checkDerankThreshold(elo: number): boolean {
  elo = Math.round(elo);
  if (elo >= 1100) return elo >= 1200 - derankTreshold;
  if (elo >= 1000) return elo >= 1100 - derankTreshold;
  if (elo >= 900) return elo >= 1000 - derankTreshold;
  if (elo < 900) return elo >= 900 - derankTreshold;
  return false;
}

export async function loadPlayers(): Promise<void> {
  playersArray = await fetchPlayers();

  for (const player of playersArray) {
    playersMap.set(player.id, player);
  }
}

function computeRanks(): void {
  const players = playersArray.toSorted((a, b) => {
    const classA = a.class == -1 ? Infinity : a.class;
    const classB = b.class == -1 ? Infinity : b.class;
    return classA - classB || b.elo - a.elo;
  });

  let rank = 0;
  let previousElo = -1;
  let previousClass = -1;
  let count = 0;

  for (const player of players) {
    if (player.matches < 1) continue; // TODO customize it

    count++;
    const elo = getDisplayElo(player);

    if (elo !== previousElo || player.class !== previousClass) {
      rank = count;
      previousElo = elo;
      previousClass = player.class;
    }

    player.rank = rank;
  }

  rankOutdated = false;
}

export function getBonusK(matches: number): number {
  const alpha = MatchesToTransition / Math.log(StartK / FinalK);
  return Math.max(FinalK, StartK * Math.exp(-matches / alpha)) / FinalK;
}
