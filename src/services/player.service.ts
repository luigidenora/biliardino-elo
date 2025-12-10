import { IPlayer } from '@/models/player.interface';
import { getDisplayElo } from '@/utils/get-display-elo.util';

/**
 * Service handling storage and management of player records.
 * todo: get player sorted alphabetically for selects
 */
export class PlayerService {
  /**
   * Internal store of players, mapping player id -> player.
   */
  private static readonly _players = new Map<string, IPlayer>();
  /**
   * Memoized mapping of player id -> rank.
   *
   * This is computed lazily and invalidated whenever players change.
   */
  private static _rankMemo: Map<string, number> | null = null;

  /**
   * Find a player by identifier.
   *
   * @param id - Player id.
   * @returns The matching player, or `undefined` if none exists.
   */
  public static getPlayerById(id: string): IPlayer | undefined {
    return PlayerService._players.get(id);
  }

  /**
   * Find a player by name (partial match).
   *
   * @param name - Name or substring to search.
   * @returns The first matching player, or `undefined` if not found.
   */
  public static getPlayerByName(name: string): IPlayer | undefined {
    for (const [, player] of PlayerService._players) {
      if (player.name.includes(name)) {
        return player;
      }
    }
    return undefined;
  }

  /**
   * Get an array of all stored players.
   *
   * @returns All players currently registered.
   */
  public static getAllPlayers(): IPlayer[] {
    return Array.from(PlayerService._players.values());
  }

  /**
   * Get the ranking position of a player based on Elo.
   *
   * Players are sorted by Elo descending. Players that share the same
   * Elo share the same rank number. Computation is memoized and only
   * recomputed when the player list or their Elo changes.
   *
   * @param id - Player id.
   * @returns The rank of the player, or `undefined` if not found.
   */
  public static getRank(id: string): number | undefined {
    if (!PlayerService._rankMemo) {
      PlayerService.recomputeRanks();
    }

    return PlayerService._rankMemo?.get(id);
  }

  /**
   * Update a player's elo and match count after a match.
   *
   * If the player is not found, nothing happens.
   *
   * @param id - Player id.
   * @param delta - Elo delta (positive or negative).
   */
  public static updateAfterMatch(id: string, delta: number, isDefender: boolean, goalsFor: number, goalsAgainst: number): void {
    const player = PlayerService.getPlayerById(id);
    if (!player) {
      return;
    }

    const matchesDelta = player.matchesDelta ?? [];
    matchesDelta.push(delta);

    PlayerService._players.set(id, { // TODO avoid to recreate a new object, reuse the same
      ...player,
      elo: player.elo + delta,
      matches: player.matches + 1,
      wins: (player.wins ?? 0) + (delta > 0 ? 1 : 0),
      goalsFor: (player.goalsFor ?? 0) + goalsFor,
      goalsAgainst: (player.goalsAgainst ?? 0) + goalsAgainst,
      matchesAsDefender: (player.matchesAsDefender ?? 0) + (isDefender ? 1 : 0),
      matchesAsAttacker: (player.matchesAsAttacker ?? 0) + (isDefender ? 0 : 1),
      matchesDelta
    });

    PlayerService.invalidateRankMemo();
  }

  /**
   * Replace all stored players with the provided list.
   *
   * Clears any previously stored players and then loads each player
   * from the given array. If two players share the same id in the
   * provided list, the last one will take precedence.
   *
   * @param players - Array of players to load into the store.
   */
  public static loadPlayers(players: IPlayer[]): void {
    PlayerService.clearPlayers();
    for (const player of players) {
      PlayerService._players.set(player.id, player);
    }

    PlayerService.invalidateRankMemo();
  }

  /**
   * Remove all stored player records.
   */
  public static clearPlayers(): void {
    PlayerService._players.clear();
    PlayerService.invalidateRankMemo();
  }

  /**
   * Mark the rank memo as stale so it will be recomputed
   * on the next call to getRank().
   */
  private static invalidateRankMemo(): void {
    PlayerService._rankMemo = null;
  }

  /**
   * Recompute rank mapping (player id -> rank) based on Elo.
   *
   * Players are sorted by Elo descending. Players with the same Elo
   * receive the same rank number.
   */
  private static recomputeRanks(): void {
    const players = PlayerService.getAllPlayers().toSorted((a, b) => b.elo - a.elo);

    const cache = new Map<string, number>();
    let rank = 1;
    let previousElo: number | null = null;

    for (const player of players) {
      const elo = getDisplayElo(player);
      if (previousElo !== null && elo !== previousElo) {
        rank++;
      }

      cache.set(player.id, rank);
      previousElo = elo;
    }

    PlayerService._rankMemo = cache;
  }
}
