/**
 * RoleBadge — Inline badge showing a player's role (defence/attack/balanced).
 *
 * Three sizes:
 *   - 'sm'   → compact, for mobile sub-rows and inline usage
 *   - 'base' → standard, for table cells and ranking rows
 *   - 'lg'   → larger with label text, for live-match cards
 *
 * Accepts either a specific role ('defence' | 'attack') or match counts
 * to auto-detect the dominant role.
 */

export type RoleBadgeSize = 'sm' | 'base' | 'lg';

export interface RoleBadgeOptions {
  /** Explicit role — if omitted, computed from defenceMatches/attackMatches. */
  role?: 'defence' | 'attack';
  /** Role from player.role field: -1=defence, 0=both, 1=attack. Takes priority over defenceMatches/attackMatches. */
  playerRole?: -1 | 0 | 1;
  /** Matches played as defender. Used when role is auto-detected. */
  defenceMatches?: number;
  /** Matches played as attacker. Used when role is auto-detected. */
  attackMatches?: number;
  /** Badge size variant. Default: 'base'. */
  size?: RoleBadgeSize;
  /** Show percentage text. Default: true for 'base', false for 'sm'. */
  showPct?: boolean;
  /** Show full label (DIFENSORE / ATTACCANTE). Only for 'lg' size. */
  showLabel?: boolean;
}

interface RoleStyle {
  icon: string;
  color: string;
  bg: string;
  border: string;
  label: string;
}

const DEFENCE: RoleStyle = {
  icon: 'shield',
  color: '#60a5fa',
  bg: 'rgba(96,165,250,0.12)',
  border: 'rgba(96,165,250,0.25)',
  label: 'DIFENSORE'
};

const ATTACK: RoleStyle = {
  icon: 'sword',
  color: '#f87171',
  bg: 'rgba(248,113,113,0.12)',
  border: 'rgba(248,113,113,0.25)',
  label: 'ATTACCANTE'
};

const BALANCED: RoleStyle = {
  icon: 'scale',
  color: '#FFD700',
  bg: 'rgba(255,215,0,0.10)',
  border: 'rgba(255,215,0,0.25)',
  label: 'BILANCIATO'
};

function resolveRole(opts: RoleBadgeOptions): { style: RoleStyle; pct: string } {
  const def = opts.defenceMatches ?? 0;
  const att = opts.attackMatches ?? 0;
  const total = def + att;

  let style: RoleStyle;
  let dominant = 0;

  if (opts.playerRole === -1) {
    style = DEFENCE; dominant = def;
  } else if (opts.playerRole === 1) {
    style = ATTACK; dominant = att;
  } else if (opts.playerRole === 0) {
    style = BALANCED; dominant = def;
  } else if (opts.role === 'defence') {
    style = DEFENCE;
    dominant = def;
  } else if (opts.role === 'attack') {
    style = ATTACK;
    dominant = att;
  } else if (def > att) {
    style = DEFENCE;
    dominant = def;
  } else if (att > def) {
    style = ATTACK;
    dominant = att;
  } else {
    style = BALANCED;
    dominant = def;
  }

  const pct = total > 0 ? `${Math.round((dominant / total) * 100)}%` : '';
  return { style, pct };
}

const SIZE_CONFIG = {
  sm: { icon: 7, font: 7, px: 'px-1', py: 'py-px', gap: 'gap-0.5', rounded: 'rounded' },
  base: { icon: 12, font: 11, px: 'px-2', py: 'py-1.5', gap: 'gap-1.5', rounded: 'rounded-md' },
  lg: { icon: 9, font: 9, px: 'px-1.5', py: 'py-px', gap: 'gap-1', rounded: 'rounded' }
};

/**
 * Render a role badge as an HTML string.
 */
export function renderRoleBadge(opts: RoleBadgeOptions): string {
  const { style } = resolveRole(opts);
  const size = opts.size ?? 'base';
  const cfg = SIZE_CONFIG[size];

  const showLabel = opts.showLabel ?? (size === 'lg');

  const labelHtml = showLabel
    ? `<span class="font-ui" style="font-size:${cfg.font}px;letter-spacing:0.1em;color:${style.color}">${style.label}</span>`
    : '';

  const border = size === 'lg' ? `border:1px solid ${style.border};` : '';

  return `<span class="inline-flex items-center ${cfg.gap} ${cfg.rounded} ${cfg.px} ${cfg.py}" style="background:${style.bg};${border}"><i data-lucide="${style.icon}" style="width:${cfg.icon}px;height:${cfg.icon}px;color:${style.color};flex-shrink:0"></i>${labelHtml}</span>`;
}
