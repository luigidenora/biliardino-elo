export const WIN_RATE_GREEN_MIN = 60;
export const WIN_RATE_RED_MAX = 40;

export const GOAL_RATIO_GREEN_MIN = 1.15;
export const GOAL_RATIO_RED_MAX = 0.8;

export function getWinRateColor(ratePercent: number): string {
  if (ratePercent >= WIN_RATE_GREEN_MIN) return 'green';
  if (ratePercent <= WIN_RATE_RED_MAX) return 'red';
  return 'inherit';
}

export function getGoalRatioColor(ratio: number): string {
  if (ratio >= GOAL_RATIO_GREEN_MIN) return 'green';
  if (ratio <= GOAL_RATIO_RED_MAX) return 'red';
  return 'inherit';
}
