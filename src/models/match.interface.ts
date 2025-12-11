import { ITeam } from './team.interface';

export interface IMatch {
  /**
   * Unique identifier.
   */
  id: string;
  /**
   * First team.
   */
  teamA: ITeam;
  /**
   * Second team
   */
  teamB: ITeam;
  /**
   * Final score of the match in the form [scoreA, scoreB],
   * where:
   * - scoreA is the number of goals scored by {@link IMatch.teamA}.
   * - scoreB is the number of goals scored by {@link IMatch.teamB}.
   */
  score: [number, number];
  /**
   * Timestamp representing when the match was created.
   *
   * Expressed as the number of milliseconds elapsed since
   * the Unix epoch (January 1, 1970 UTC).
   */
  createdAt: number;

  // CALCULATED AFTER

  expectedScore?: [number, number];
  teamELO?: [number, number];
  deltaELO?: [number, number];
  kFactor?: [number, number];
}
