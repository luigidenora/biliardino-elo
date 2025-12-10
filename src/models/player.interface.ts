export interface IPlayer {
  /**
   * Unique identifier.
   */
  id: string;
  /**
   * Full name (name and surname).
   */
  name: string;
  /**
   * Current Elo rating.
   *
   * Higher values indicate stronger performance. This value is
   * typically updated after each match.
   */
  elo: number;
  /**
   * Total number of matches played.
   */
  matches: number;

  // CALCULATED AFTER

  matchesAsDefender?: number;
  matchesAsAttacker?: number;
  wins?: number;
  matchesDelta?: number[];
  goalsFor?: number;
  goalsAgainst?: number;
}
