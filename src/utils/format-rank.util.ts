/**
 * Format rank for display purposes.
 * Shows "-" if the player hasn't played any matches (rank = -1)
 * Otherwise shows the rank with the degree symbol
 *
 * @param rank - The rank value (-1 for no matches, or positive integer)
 * @returns Formatted rank string for display
 */
export function formatRank(rank: number): string {
  return rank === -1 ? '-' : `${rank}°`;
}
