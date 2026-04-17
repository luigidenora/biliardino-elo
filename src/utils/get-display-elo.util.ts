import { IPlayer } from '@/models/player.interface';

/**
 * Get a rounded Elo rating to display for a given player.
 *
 * @param player - The player whose Elo value is used.
 * @returns The player's Elo rounded to the nearest integer.
 */
export function getDisplayElo(player: IPlayer): number {
  return Math.round(Math.max(player.elo[0], player.elo[1]));
}
