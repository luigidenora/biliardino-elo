// ── Win Rate ────────────────────────────────────────────────
export const WIN_RATE_GREEN_MIN = 57; // ≥57% → verde
export const WIN_RATE_RED_MAX = 43; // ≤43% → rosso

// ── Goal Ratio (fatti / subiti) ─────────────────────────────
export const GOAL_RATIO_GREEN_MIN = 1.15; // ≥1.15 → verde
export const GOAL_RATIO_RED_MAX = 0.85; // ≤0.85 → rosso

// ── Media goal segnati per partita ──────────────────────────
export const AVG_FOR_GREEN_MIN = 6.6; // ≥6.6 → verde
export const AVG_FOR_RED_MAX = 5.6; // ≤5.6 → rosso

// ── Media goal subiti per partita ───────────────────────────
export const AVG_AGAINST_RED_MIN = 6.6; // ≥6.6 → rosso
export const AVG_AGAINST_GREEN_MAX = 5.6; // ≤5.6 → verde

// ── Helpers ─────────────────────────────────────────────────
const C = {
  win: 'var(--color-win)',
  loss: 'var(--color-loss)',
  normal: 'var(--color-text-primary)'
};

export function getWinRateColor(ratePercent: number): string {
  if (ratePercent >= WIN_RATE_GREEN_MIN) return C.win;
  if (ratePercent <= WIN_RATE_RED_MAX) return C.loss;
  return C.normal;
}

export function getGoalRatioColor(r: number): string {
  if (r >= GOAL_RATIO_GREEN_MIN) return C.win;
  if (r <= GOAL_RATIO_RED_MAX) return C.loss;
  return C.normal;
}

export function getAvgForColor(avg: number): string {
  if (avg >= AVG_FOR_GREEN_MIN) return C.win;
  if (avg <= AVG_FOR_RED_MAX) return C.loss;
  return C.normal;
}

export function getAvgAgainstColor(avg: number): string {
  if (avg >= AVG_AGAINST_RED_MIN) return C.loss;
  if (avg <= AVG_AGAINST_GREEN_MAX) return C.win;
  return C.normal;
}
