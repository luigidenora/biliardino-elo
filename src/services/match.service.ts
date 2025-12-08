import { Guid } from 'guid-typescript';
import { IMatch } from '../models/match.interface';
import { ITeam } from '../models/team.interface';

/**
 * Service handling storage and management of match records.
 */
export class MatchService {
  /**
   * Internal store of matches, mapping match id -> match.
   */
  private static readonly _matches = new Map<string, IMatch>();

  /**
   * Get all stored matches.
   *
   * @returns All registered matches as an array.
   */
  public static getAllMatches(): IMatch[] {
    return Array.from(MatchService._matches.values());
  }

  /**
   * Create and store a new match between two teams.
   *
   * @param teamA - First team participating in the match.
   * @param teamB - Second team participating in the match.
   * @param score - Final score represented as [scoreA, scoreB].
   */
  public static addMatch(teamA: ITeam, teamB: ITeam, score: [number, number]): IMatch {
    const id = Guid.create().toString();
    const newMatch: IMatch = { id, teamA, teamB, score, createdAt: Date.now() };
    MatchService._matches.set(id, newMatch);
    return newMatch;
  }

  /**
   * Replace all stored matches with the provided list.
   *
   * Clears any previously stored matches and then loads each match
   * from the given array. If two matches share the same id in the
   * provided list, the last one will take precedence.
   *
   * @param matches - Array of matches to load into the store.
   */
  public static loadMatches(matches: IMatch[]): void {
    MatchService.clearMatches();
    for (const match of matches.toSorted((a, b) => b.createdAt - a.createdAt)) {
      MatchService._matches.set(match.id, match);
    }
  }

  /**
   * Remove all stored matches from memory.
   */
  public static clearMatches(): void {
    MatchService._matches.clear();
  }
}
