// ── Win Rate ────────────────────────────────────────────────
export const WIN_RATE_GREEN_MIN = 60; // ≥60% → verde
export const WIN_RATE_RED_MAX = 40; // ≤40% → rosso

// ── Goal Ratio (fatti / subiti) ─────────────────────────────
export const GOAL_RATIO_GREEN_MIN = 1.15; // ≥1.15 → verde
export const GOAL_RATIO_RED_MAX = 0.85; // ≤0.85 → rosso

// ── Media goal segnati per partita ──────────────────────────
export const AVG_FOR_GREEN_MIN = 7; // ≥7 → verde
export const AVG_FOR_RED_MAX = 4.5; // ≤4.5 → rosso

// ── Media goal subiti per partita ───────────────────────────
export const AVG_AGAINST_RED_MIN = 7; // ≥7 → rosso
export const AVG_AGAINST_GREEN_MAX = 4.5; // ≤4.5 → verde

// ── Best Win Streak ─────────────────────────────────────────
export const STREAK_WIN_GREEN_MIN = 5; // ≥5 → verde
export const STREAK_WIN_RED_MAX = 2; // ≤2 → rosso

// ── Worst Loss Streak ───────────────────────────────────────
export const STREAK_LOSS_RED_MIN = 5; // ≥5 → rosso
export const STREAK_LOSS_GREEN_MAX = 2; // ≤2 → verde

// ── ELO Compagno medio ──────────────────────────────────────
export const TEAM_ELO_GREEN_MIN = 1200; // ≥1200 → verde (compagni forti)
export const TEAM_ELO_RED_MAX = 900; // ≤900  → rosso

// ── ELO Avversario medio ────────────────────────────────────
export const OPP_ELO_GREEN_MIN = 1200; // ≥1200 → verde (avversari forti = merito)
export const OPP_ELO_RED_MAX = 900; // ≤900  → rosso

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

export function getBestStreakColor(streak: number): string {
  if (streak >= STREAK_WIN_GREEN_MIN) return C.win;
  if (streak <= STREAK_WIN_RED_MAX) return C.loss;
  return C.normal;
}

export function getWorstStreakColor(streak: number): string {
  if (streak >= STREAK_LOSS_RED_MIN) return C.loss;
  if (streak <= STREAK_LOSS_GREEN_MAX) return C.win;
  return C.normal;
}

export function getTeamEloColor(elo: number): string {
  if (elo >= TEAM_ELO_GREEN_MIN) return C.win;
  if (elo <= TEAM_ELO_RED_MAX) return C.loss;
  return C.normal;
}

export function getOppEloColor(elo: number): string {
  if (elo >= OPP_ELO_GREEN_MIN) return C.win;
  if (elo <= OPP_ELO_RED_MAX) return C.loss;
  return C.normal;
}
