/**
 * StatsPage — Statistiche globali della season.
 *
 * Sezioni:
 *   - Overview cards (partite, gol, giocatori attivi, media gol)
 *   - Hall of Fame (record individuali: ELO, win, WR, streak, match)
 *   - Record individuali aggiuntivi
 *   - Migliori e peggiori coppie (top 10)
 *   - Migliori e peggiori partite
 *   - Distribuzione classi
 *
 * Route: /stats (public)
 */

import { MatchesToRank } from '@/services/elo.service';
import { getAllMatches } from '@/services/match.service';
import { getAllPlayers, getPlayerById } from '@/services/player.service';
import { animateVisible } from '@/utils/animate-visible.util';
import { getClassName } from '@/utils/get-class-name.util';
import { getDisplayElo } from '@/utils/get-display-elo.util';
import gsap from 'gsap';
import { Component } from '../components/component.base';
import { getInitials, renderPlayerAvatar } from '../components/player-avatar.component';
import { refreshIcons } from '../icons';

import type { IMatch } from '@/models/match.interface';
import type { IPlayer } from '@/models/player.interface';

const CLASS_COLORS: Record<number, string> = {
  0: '#FFD700',
  1: '#4A90D9',
  2: '#27AE60',
  3: '#C0C0C0',
  4: '#8B7D6B'
};

/** Only consider matches where at least one team scored exactly 8 goals
 *  and all 4 players exist in the player map (getPlayerById). */
function isValidMatch(m: IMatch): boolean {
  if (!m || !m.teamA || !m.teamB) return false;
  const a = Array.isArray(m.score) ? (m.score[0] ?? 0) : 0;
  const b = Array.isArray(m.score) ? (m.score[1] ?? 0) : 0;
  // Match must have at least one team with exactly 8 goals (user requested === 8)
  if (!(a === 8 || b === 8)) return false;
  // All four players must exist in the player map
  if (!getPlayerById(m.teamA.defence) || !getPlayerById(m.teamA.attack)) return false;
  if (!getPlayerById(m.teamB.defence) || !getPlayerById(m.teamB.attack)) return false;
  return true;
}

/** Total matches + wins across both roles */
function totalMatches(p: IPlayer): number {
  return p.matches[0] + p.matches[1];
}
function totalWins(p: IPlayer): number {
  return p.wins[0] + p.wins[1];
}
function totalGoalsFor(p: IPlayer): number {
  return p.goalsFor[0] + p.goalsFor[1];
}
function totalGoalsAgainst(p: IPlayer): number {
  return p.goalsAgainst[0] + p.goalsAgainst[1];
}
function bestElo(p: IPlayer): number {
  return Math.max(p.bestElo[0], p.bestElo[1]);
}
function bestStreak(p: IPlayer): number {
  return Math.max(p.bestWinStreak[0], p.bestWinStreak[1]);
}
function worstStreak(p: IPlayer): number {
  return Math.min(p.worstLossStreak[0], p.worstLossStreak[1]);
}
function playerClass(p: IPlayer): number {
  return Math.min(p.class[0], p.class[1]);
}

type Role = 0 | 1 | null;

/** Role-aware stat accessors (role=null → sum/max across both) */
function rMatches(p: IPlayer, role: Role): number {
  return role === null ? p.matches[0] + p.matches[1] : p.matches[role];
}
function rWins(p: IPlayer, role: Role): number {
  return role === null ? p.wins[0] + p.wins[1] : p.wins[role];
}
function rGoalsFor(p: IPlayer, role: Role): number {
  return role === null ? p.goalsFor[0] + p.goalsFor[1] : p.goalsFor[role];
}
function rGoalsAgainst(p: IPlayer, role: Role): number {
  return role === null ? p.goalsAgainst[0] + p.goalsAgainst[1] : p.goalsAgainst[role];
}
function rBestElo(p: IPlayer, role: Role): number {
  return role === null ? Math.max(p.bestElo[0], p.bestElo[1]) : p.bestElo[role];
}
function rElo(p: IPlayer, role: Role): number {
  return role === null ? Math.max(p.elo[0], p.elo[1]) : p.elo[role];
}
function rBestStreak(p: IPlayer, role: Role): number {
  return role === null ? Math.max(p.bestWinStreak[0], p.bestWinStreak[1]) : p.bestWinStreak[role];
}
function rWorstStreak(p: IPlayer, role: Role): number {
  return role === null ? Math.min(p.worstLossStreak[0], p.worstLossStreak[1]) : p.worstLossStreak[role];
}

class StatsPage extends Component {
  private cleanupObservers: (() => void)[] = [];
  private sectionRoles: Record<string, Role> = { hof: null, records: null, pairs: null, class: null };

  async render(): Promise<string> {
    const allPlayers = getAllPlayers();
    const allMatches = getAllMatches();
    const filteredMatches = allMatches.filter(isValidMatch);
    const ranked = allPlayers.filter(p => totalMatches(p) > 0);

    return `
      <div class="space-y-5 md:space-y-6" id="stats-page">
        ${this.renderPageHeader()}
        ${this.renderOverviewCards(allPlayers, filteredMatches)}
        ${this.renderClassDistribution(ranked, null)}
        ${this.renderHallOfFame(ranked, null)}
        ${this.renderPairs(allPlayers, null)}
        ${this.renderBestWorstMatches(ranked, filteredMatches)}
      </div>
    `;
  }

  override mount(): void {
    refreshIcons();
    gsap.from('.stat-card-new', { y: 15, stagger: 0.07, duration: 0.3, ease: 'power2.out' });
    this.cleanupObservers.push(
      animateVisible({ selector: '.hof-card', vars: { scale: 0.94, duration: 0.35, ease: 'back.out(1.3)', delay: 0.1 }, stagger: 0.06 }),
      animateVisible({ selector: '.pair-row', vars: { x: -10, duration: 0.25, ease: 'power2.out', delay: 0.2 }, stagger: 0.04 }),
      animateVisible({ selector: '.match-row', vars: { x: -10, duration: 0.25, ease: 'power2.out', delay: 0.2 }, stagger: 0.04 }),
      animateVisible({ selector: '.class-bar-wrap', vars: { x: -10, duration: 0.3, ease: 'power2.out', delay: 0.3 }, stagger: 0.06 })
    );
    this.$$('.stats-role-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const section = btn.dataset['section'] ?? '';
        const r = btn.dataset['role'];
        const role: Role = r === '0' ? 0 : r === '1' ? 1 : null;
        this.sectionRoles[section] = role;
        this.applySectionRole(section, role);
      });
    });
  }

  private applySectionRole(section: string, role: Role): void {
    const allPlayers = getAllPlayers();
    const ranked = allPlayers.filter(p => totalMatches(p) > 0);
    const container = this.$id(`stats-${section}-content`);
    if (container) {
      if (section === 'hof') container.innerHTML = this.renderHallOfFameContent(ranked, role);
      else if (section === 'pairs') container.innerHTML = this.renderPairsContent(allPlayers, role);
      else if (section === 'class') container.innerHTML = this.renderClassDistributionContent(ranked, role);
    }
    this.$$(`[data-section="${section}"]`).forEach((btn) => {
      const r = btn.dataset['role'];
      const active
        = (r === '' && role === null)
          || (r === String(role));
      btn.classList.toggle('role-btn-active', active);
    });
    refreshIcons();
  }

  override destroy(): void {
    for (const cleanup of this.cleanupObservers) cleanup();
    this.cleanupObservers = [];
  }

  // ── Page Header ───────────────────────────────────────────

  private renderPageHeader(): string {
    return `
      <div class="flex items-center gap-3">
        <i data-lucide="bar-chart-3" class="text-[var(--color-gold)]"
           style="width:26px;height:26px"></i>
        <div>
          <h1 class="text-white font-display"
              style="font-size:clamp(28px,6vw,42px); letter-spacing:0.12em; line-height:1">
            STATISTICHE
          </h1>
          <p class="font-ui"
             style="font-size:12px; color:rgba(255,255,255,0.5); letter-spacing:0.1em">
            SEASON 2025–2026 · DATI GLOBALI
          </p>
        </div>
      </div>
    `;
  }

  // ── Section Role Filter ───────────────────────────────────

  private renderSectionRoleFilter(section: string, activeRole: Role): string {
    const tabs = [
      { label: 'TOT', role: '' },
      { label: 'DIF', role: '0' },
      { label: 'ATT', role: '1' }
    ];
    return `
      <div class="flex gap-1">
        ${tabs.map((t) => {
          const isActive = (t.role === '' && activeRole === null) || (t.role === String(activeRole));
          return `<button
            class="stats-role-btn ${isActive ? 'role-btn-active' : ''} px-2 py-1 rounded font-ui transition-all"
            data-section="${section}" data-role="${t.role}"
            style="font-size:10px; letter-spacing:0.06em; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.55)">
            ${t.label}
          </button>`;
        }).join('')}
      </div>
      <style>
        .role-btn-active {
          background: rgba(255,200,50,0.12) !important;
          border-color: var(--color-gold) !important;
          color: var(--color-gold) !important;
        }
      </style>
    `;
  }

  // ── Overview Cards ────────────────────────────────────────

  private renderOverviewCards(allPlayers: IPlayer[], allMatches: ReturnType<typeof getAllMatches>): string {
    const total = allMatches.length;
    const totalGoals = allMatches.reduce((s, m) => s + m.score[0] + m.score[1], 0);
    const activePlayers = allPlayers.filter(p => totalMatches(p) > 0).length;
    const avgGoals = total > 0 ? (totalGoals / total).toFixed(1) : '—';

    const cards = [
      {
        icon: 'activity',
        label: 'PARTITE TOTALI',
        value: String(total),
        sub: `${totalGoals} gol totali`,
        color: 'var(--color-gold)'
      },
      {
        icon: 'users',
        label: 'GIOCATORI ATTIVI',
        value: String(activePlayers),
        sub: `su ${allPlayers.length} registrati`,
        color: 'var(--color-gold)'
      },
      {
        icon: 'target',
        label: 'MEDIA GOL / PARTITA',
        value: String(avgGoals),
        sub: `${totalGoals} gol in ${total} match`,
        color: 'var(--color-gold)'
      }
    ];

    return `
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        ${cards.map(c => `
          <div class="stat-card-new glass-card rounded-xl p-4">
            <div class="flex items-center gap-2 mb-2">
              <i data-lucide="${c.icon}" style="width:14px;height:14px;color:${c.color}"></i>
              <span class="font-ui text-xs" style="color:rgba(255,255,255,0.5); letter-spacing:0.08em">${c.label}</span>
            </div>
            <div class="font-display text-2xl" style="color:${c.color}">${c.value}</div>
            <div class="font-body text-xs" style="color:rgba(255,255,255,0.4)">${c.sub}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ── Hall of Fame ──────────────────────────────────────────

  private renderLeaderboardSection(
    icon: string, label: string, accentColor: string,
    players: IPlayer[], valueFn: (p: IPlayer) => string, subFn: (p: IPlayer) => string,
    role: Role = null
  ): string {
    const rows = players.map((p, i) => {
      const classIdx: 0 | 1 = role === 1 ? 1 : 0;
      const cls = role === null ? p.class[p.bestRole] : p.class[classIdx];
      const color = CLASS_COLORS[cls] ?? '#8B7D6B';
      const medal = i === 0 ? accentColor : i === 1 ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.2)';
      return `
        <a href="/profile/${p.id}" class="hof-card flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all hover:bg-white/5"
           style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06)">
          <span class="font-display shrink-0 w-4 text-center" style="font-size:12px; color:${medal}">${i + 1}</span>
          ${renderPlayerAvatar({ initials: getInitials(p.name), color, size: 'sm', playerId: p.id, playerClass: cls })}
          <div class="flex-1 min-w-0">
            <div class="font-ui text-white truncate" style="font-size:13px">${p.name}</div>
            <div class="font-body" style="font-size:10px; color:rgba(255,255,255,0.35)">${subFn(p)}</div>
          </div>
          <span class="font-display shrink-0" style="font-size:14px; color:${accentColor}; letter-spacing:0.05em">${valueFn(p)}</span>
        </a>
      `;
    }).join('');
    return `
      <div class="glass-card rounded-xl overflow-hidden">
        <div class="px-3 py-2 flex items-center gap-1.5"
             style="background:rgba(10,25,18,0.8); border-bottom:1px solid var(--glass-border-gold)">
          <span class="font-ui" style="font-size:11px; color:${accentColor}; letter-spacing:0.1em">${label}</span>
        </div>
        <div class="p-2 space-y-1">${rows}</div>
      </div>
    `;
  }

  private renderHallOfFame(ranked: IPlayer[], role: Role): string {
    if (ranked.length === 0) return '';
    return `
      <div class="glass-card rounded-xl overflow-hidden">
        <div class="px-4 md:px-5 py-3 flex items-center justify-between"
             style="background:rgba(10,25,18,0.8); border-bottom:1px solid var(--glass-border-gold)">
          <span class="font-ui" style="font-size:13px; color:var(--color-gold); letter-spacing:0.1em">HALL OF FAME</span>
          ${this.renderSectionRoleFilter('hof', role)}
        </div>
        <div class="p-4">
          <div id="stats-hof-content" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            ${this.renderHallOfFameContent(ranked, role)}
          </div>
        </div>
      </div>
    `;
  }

  private renderHallOfFameContent(ranked: IPlayer[], role: Role): string {
    const filteredRanked = ranked.filter(p => rMatches(p, role) >= MatchesToRank);
    if (filteredRanked.length === 0) {
      return `<div class="col-span-full text-center py-6 font-body text-xs" style="color:rgba(255,255,255,0.3)">Nessun giocatore con ${MatchesToRank}+ partite in questo ruolo</div>`;
    }
    const top5 = (arr: IPlayer[]): IPlayer[] => arr.slice(0, 5);
    const byBestElo = top5([...filteredRanked].sort((a, b) => rBestElo(b, role) - rBestElo(a, role)));
    const byWR = top5([...filteredRanked].sort((a, b) => (rWins(b, role) / rMatches(b, role)) - (rWins(a, role) / rMatches(a, role))));
    const byStreak = top5([...filteredRanked].sort((a, b) => rBestStreak(b, role) - rBestStreak(a, role)));
    const byLossStreak = top5([...filteredRanked].sort((a, b) => rWorstStreak(a, role) - rWorstStreak(b, role)));
    const byGoalRatio = top5([...filteredRanked].sort((a, b) =>
      (rGoalsFor(b, role) / Math.max(1, rGoalsAgainst(b, role))) - (rGoalsFor(a, role) / Math.max(1, rGoalsAgainst(a, role)))
    ));
    const byAvgGoalsFor = top5([...filteredRanked].sort((a, b) =>
      (rGoalsFor(b, role) / rMatches(b, role)) - (rGoalsFor(a, role) / rMatches(a, role))
    ));
    const byAvgGoalsAgainst = top5([...filteredRanked].sort((a, b) =>
      (rGoalsAgainst(a, role) / rMatches(a, role)) - (rGoalsAgainst(b, role) / rMatches(b, role))
    ));
    return `
      ${this.renderLeaderboardSection('zap', 'BEST ELO EVER', '#F0A500', byBestElo,
        p => String(Math.round(rBestElo(p, role))),
        p => `${rMatches(p, role)}P · ${Math.round((rWins(p, role) / rMatches(p, role)) * 100)}% WR`, role)}
      ${this.renderLeaderboardSection('award', 'MIGLIOR WINRATE', 'var(--color-win)', byWR,
        p => `${Math.round((rWins(p, role) / rMatches(p, role)) * 100)}%`,
        p => `${rWins(p, role)}V su ${rMatches(p, role)}P`, role)}
      ${this.renderLeaderboardSection('flame', 'WIN STREAK', 'var(--color-win)', byStreak,
        p => `${rBestStreak(p, role)}`,
        p => `${rMatches(p, role)}P · ${Math.round((rWins(p, role) / rMatches(p, role)) * 100)}% WR`, role)}
      ${this.renderLeaderboardSection('skull', 'LOSS STREAK', 'var(--color-loss)', byLossStreak,
        p => rWorstStreak(p, role) !== 0 ? `${rWorstStreak(p, role)}` : '–',
        p => `${rMatches(p, role)}P · ${Math.round((rWins(p, role) / rMatches(p, role)) * 100)}% WR`, role)}
      ${this.renderLeaderboardSection('crosshair', 'GOAL RATIO', '#F0A500', byGoalRatio,
        p => (rGoalsFor(p, role) / Math.max(1, rGoalsAgainst(p, role))).toFixed(2),
        p => `${rGoalsFor(p, role)} f / ${rGoalsAgainst(p, role)} a`, role)}
      ${this.renderLeaderboardSection('target', 'MEDIA GOL/PARTITA', '#F0A500', byAvgGoalsFor,
        p => (rGoalsFor(p, role) / rMatches(p, role)).toFixed(1),
        p => `${rGoalsFor(p, role)} gol in ${rMatches(p, role)}P`, role)}
      ${this.renderLeaderboardSection('shield-off', 'MEDIA SUBITI/PARTITA', 'var(--color-loss)', byAvgGoalsAgainst,
        p => (rGoalsAgainst(p, role) / rMatches(p, role)).toFixed(1),
        p => `${rGoalsAgainst(p, role)} subiti in ${rMatches(p, role)}P`, role)}
    `;
  }

  // ── Best / Worst Pairs (Top 10) ───────────────────────────

  private processPairEntry(
    p: IPlayer, tid: number, role: 0 | 1,
    stats: Record<number, { delta: number; matches: number; wins: number }>,
    pairMap: Map<string, { def: IPlayer; att: IPlayer; delta: number; matches: number; wins: number }>
  ): void {
    if (Number.isNaN(tid)) return;
    const teammate = getPlayerById(tid);
    if (!teammate) return;
    const entry = stats[tid];
    if (!entry || typeof entry !== 'object' || !('delta' in entry)) return;
    const key = role === 0 ? `${p.id}-${tid}` : `${tid}-${p.id}`;
    if (pairMap.has(key)) return;
    const def = role === 0 ? p : teammate;
    const att = role === 0 ? teammate : p;
    pairMap.set(key, { def, att, delta: entry.delta, matches: entry.matches, wins: entry.wins });
  }

  private addRolePairsToMap(
    p: IPlayer,
    role: 0 | 1,
    pairMap: Map<string, { def: IPlayer; att: IPlayer; delta: number; matches: number; wins: number }>
  ): void {
    const stats = p.teammatesStats[role] as Record<number, { delta: number; matches: number; wins: number }>;
    if (!stats) return;
    for (const tidStr of Object.keys(stats)) {
      this.processPairEntry(p, Number(tidStr), role, stats, pairMap);
    }
  }

  private buildPairMap(
    allPlayers: IPlayer[], roleFilter: Role
  ): Map<string, { def: IPlayer; att: IPlayer; delta: number; matches: number; wins: number }> {
    const pairMap = new Map<string, { def: IPlayer; att: IPlayer; delta: number; matches: number; wins: number }>();
    for (const p of allPlayers) {
      if (roleFilter === null || roleFilter === 0) this.addRolePairsToMap(p, 0, pairMap);
      if (roleFilter === null || roleFilter === 1) this.addRolePairsToMap(p, 1, pairMap);
    }
    return pairMap;
  }

  private renderPairs(allPlayers: IPlayer[], role: Role): string {
    return `
      <div class="glass-card rounded-xl overflow-hidden">
        <div class="px-4 md:px-5 py-3 flex items-center justify-between"
             style="background:rgba(10,25,18,0.8); border-bottom:1px solid var(--glass-border-gold)">
          <span class="font-ui" style="font-size:13px; color:var(--color-gold); letter-spacing:0.1em">TOP COPPIE</span>
        </div>
        <div class="p-4" id="stats-pairs-content">
          ${this.renderPairsContent(allPlayers, role)}
        </div>
      </div>
    `;
  }

  private renderPairsContent(allPlayers: IPlayer[], role: Role): string {
    const pairMap = this.buildPairMap(allPlayers, role);

    const pairs = [...pairMap.values()];
    const best10 = [...pairs].sort((a, b) => b.delta - a.delta).slice(0, 5);
    const worst10 = [...pairs].sort((a, b) => a.delta - b.delta).slice(0, 5);

    const renderPairRow = (pr: typeof pairs[0], idx: number, positive: boolean): string => {
      const dColor = positive ? 'var(--color-win)' : 'var(--color-loss)';
      const sign = pr.delta >= 0 ? '+' : '';
      const wr = pr.matches > 0 ? Math.round((pr.wins / pr.matches) * 100) : 0;
      return `
        <div class="pair-row flex items-center gap-2 px-3 py-2.5 rounded-lg"
             style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06)">
          <span class="font-display shrink-0 w-5 text-center" style="font-size:13px; color:rgba(255,255,255,0.25)">${idx + 1}</span>
          <div class="flex items-center gap-1.5 flex-1 min-w-0">
            ${renderPlayerAvatar({ initials: getInitials(pr.def.name), color: CLASS_COLORS[pr.def.class[0]] ?? '#8B7D6B', size: 'sm', playerId: pr.def.id, playerClass: pr.def.class[0] })}
            <span class="font-ui text-xs text-white truncate max-w-[60px] sm:max-w-none hidden sm:inline">${pr.def.name}</span>
            <span class="font-body" style="font-size:9px; color:rgba(255,255,255,0.25)">+</span>
            ${renderPlayerAvatar({ initials: getInitials(pr.att.name), color: CLASS_COLORS[pr.att.class[1]] ?? '#8B7D6B', size: 'sm', playerId: pr.att.id, playerClass: pr.att.class[1] })}
            <span class="font-ui text-xs text-white truncate max-w-[60px] sm:max-w-none hidden sm:inline">${pr.att.name}</span>
          </div>
          <div class="shrink-0 text-right">
            <div class="font-display" style="font-size:15px; color:${dColor}; letter-spacing:0.05em">${sign}${Math.round(pr.delta)}</div>
            <div class="font-body" style="font-size:11px; color:rgba(255,255,255,0.3)">${pr.matches}P · ${wr}%</div>
          </div>
        </div>
      `;
    };

    const empty = '<div class="text-center py-6 font-body text-xs" style="color:rgba(255,255,255,0.3)">Nessun dato</div>';

    return `
      <div class="grid md:grid-cols-2 gap-4">
        <div class="glass-card rounded-xl overflow-hidden">
          <div class="px-4 py-3 flex items-center gap-2"
               style="background:rgba(10,25,18,0.8); border-bottom:1px solid var(--glass-border-gold)">
            <span class="font-ui" style="font-size:13px; color:var(--color-win); letter-spacing:0.1em">TOP 5 COPPIE MIGLIORI</span>
          </div>
          <div class="p-3 space-y-1.5">
            ${best10.length > 0 ? best10.map((pr, i) => renderPairRow(pr, i, true)).join('') : empty}
          </div>
        </div>
        <div class="glass-card rounded-xl overflow-hidden">
          <div class="px-4 py-3 flex items-center gap-2"
               style="background:rgba(10,25,18,0.8); border-bottom:1px solid var(--glass-border-gold)">
            <span class="font-ui" style="font-size:13px; color:var(--color-loss); letter-spacing:0.1em">TOP 5 COPPIE PEGGIORI</span>
          </div>
          <div class="p-3 space-y-1.5">
            ${worst10.length > 0 ? worst10.map((pr, i) => renderPairRow(pr, i, false)).join('') : empty}
          </div>
        </div>
      </div>
    `;
  }

  // ── Best / Worst Matches ──────────────────────────────────

  private renderBestWorstMatches(ranked: IPlayer[], allMatches: IMatch[]): string {
    if (allMatches.length === 0) return '';

    // Biggest upset: highest ELO swing
    const byEloSwing = [...allMatches].sort((a, b) => Math.abs(b.deltaELO[0]) - Math.abs(a.deltaELO[0]));
    // Biggest win margin
    const byMargin = [...allMatches].sort((a, b) =>
      Math.abs(b.score[0] - b.score[1]) - Math.abs(a.score[0] - a.score[1])
    );
    // Biggest upsets: won with lowest expected score (winner had < 50% expected)
    const biggestUpsets = [...allMatches]
      .filter(m => m.deltaELO[0] !== 0 && m.score[0] !== m.score[1])
      .sort((a, b) => {
        const winnerExpA = a.score[0] > a.score[1] ? a.expectedScore[0] : a.expectedScore[1];
        const winnerExpB = b.score[0] > b.score[1] ? b.expectedScore[0] : b.expectedScore[1];
        return winnerExpA - winnerExpB;
      });

    const pClass = (p: IPlayer, role: 0 | 1): number => p.class[role];
    const pColor = (p: IPlayer, role: 0 | 1): string => CLASS_COLORS[pClass(p, role)] ?? '#8B7D6B';

    const renderMatchRow = (m: IMatch, label: string, color: string, highlightValue: string): string => {
      const defA = getPlayerById(m.teamA.defence);
      const attA = getPlayerById(m.teamA.attack);
      const defB = getPlayerById(m.teamB.defence);
      const attB = getPlayerById(m.teamB.attack);
      const delta = m.deltaELO[0] > 0 ? m.deltaELO[0] : m.deltaELO[1];
      const winA = m.score[0] > m.score[1];

      // Mostra sempre difensore a sinistra e attaccante a destra
      const avatars = (def: IPlayer | null, att: IPlayer | null): string => `
        <div class="flex flex-row items-center gap-1">
          ${def ? renderPlayerAvatar({ initials: getInitials(def.name), color: pColor(def, 0), size: 'sm', playerId: def.id, playerClass: pClass(def, 0) }) : ''}
          ${att ? renderPlayerAvatar({ initials: getInitials(att.name), color: pColor(att, 1), size: 'sm', playerId: att.id, playerClass: pClass(att, 1) }) : ''}
        </div>
      `;

      const winColorA = winA ? 'var(--color-win)' : 'rgba(255,255,255,0.35)';
      const winColorB = winA ? 'rgba(255,255,255,0.35)' : 'var(--color-win)';
      const expA = Math.round(m.expectedScore[0] * 100);
      const expB = Math.round(m.expectedScore[1] * 100);

      return `
      <div class="match-row rounded-xl overflow-hidden" style="border:1px solid rgba(255,255,255,0.07)">
          <div class="flex items-center justify-between px-2.5 py-1" style="background:rgba(${color === '#F0A500' ? '240,165,0' : color === 'var(--color-win)' ? '39,174,96' : '155,89,182'},0.12); border-bottom:1px solid rgba(255,255,255,0.06)">
            <span class="font-ui" style="font-size:10px; color:${color}; letter-spacing:0.1em">${label}</span>
            <span class="font-display font-bold" style="font-size:14px; color:${color}">${highlightValue}</span>
          </div>
          <div class="flex items-center justify-between px-2.5 py-2.5 gap-1" style="background:rgba(255,255,255,0.02)">
            ${avatars(defA ?? null, attA ?? null)}
            <div class="flex flex-col items-center shrink-0">
              <div class="flex items-center gap-1.5">
                <span class="font-display" style="font-size:20px; color:${winColorA}; line-height:1">${m.score[0]}</span>
                <span class="font-body" style="font-size:10px; color:rgba(255,255,255,0.2)">–</span>
                <span class="font-display" style="font-size:20px; color:${winColorB}; line-height:1">${m.score[1]}</span>
              </div>
              <div class="font-body mt-0.5" style="font-size:10px; color:rgba(255,255,255,0.25)">${expA}% – ${expB}%</div>
            </div>
            ${avatars(defB ?? null, attB ?? null)}
          </div>
          <div class="px-2.5 py-1 font-body flex items-center justify-between" style="font-size:8px; color:rgba(255,255,255,0.2); border-top:1px solid rgba(255,255,255,0.04); background:rgba(0,0,0,0.15)">
            <span>${Math.round(m.teamELO[0])}</span>
            <span>ELO ±${Math.round(Math.abs(delta))}</span>
            <span>${Math.round(m.teamELO[1])}</span>
          </div>
        </div>
      `;
    };

    const top3Swing = byEloSwing.slice(0, 5);
    const top3Margin = byMargin.slice(0, 5);
    const top3Upsets = biggestUpsets.slice(0, 5);

    return `
      <div class="glass-card rounded-xl overflow-hidden">
        <div class="px-4 md:px-5 py-3 flex items-center gap-2"
             style="background:rgba(10,25,18,0.8); border-bottom:1px solid var(--glass-border-gold)">
          <span class="font-ui" style="font-size:13px; color:var(--color-gold); letter-spacing:0.1em">PARTITE MEMORABILI</span>
        </div>
        <div class="p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <!-- Bigger ELO swings -->
          <div class="space-y-1.5">
            <div class="font-ui text-xs mb-1.5" style="color:#F0A500; letter-spacing:0.08em">
              MAGGIOR VARIAZIONE ELO
            </div>
            ${top3Swing.map(m => renderMatchRow(m, 'ELO SWING', '#F0A500', `±${Math.round(Math.abs(m.deltaELO[0]))}`)).join('')}
          </div>
          <!-- Biggest margin -->
          <div class="space-y-1.5">
            <div class="font-ui text-xs mb-1.5" style="color:var(--color-win); letter-spacing:0.08em">
              VITTORIA PIÙ NETTA
            </div>
            ${top3Margin.map(m => renderMatchRow(m, 'SCARTO', 'var(--color-win)', `+${Math.abs(m.score[0] - m.score[1])}`)).join('')}
          </div>
          <!-- Biggest upsets -->
          <div class="space-y-1.5">
            <div class="font-ui text-xs mb-1.5" style="color:#9b59b6; letter-spacing:0.08em">
              VITTORIE A SORPRESA
            </div>
            ${top3Upsets.map((m) => {
              const winnerExp = m.score[0] > m.score[1] ? m.expectedScore[0] : m.expectedScore[1];
              return renderMatchRow(m, 'UPSET', '#9b59b6', `${Math.round(winnerExp * 100)}%`);
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // ── Class Distribution ────────────────────────────────────

  private renderClassDistributionContent(ranked: IPlayer[], role: Role): string {
    if (ranked.length === 0) return '';

    const classCounts = new Map<number, { count: number; players: IPlayer[] }>();
    for (const p of ranked) {
      const cls = role === null ? p.class[p.bestRole] : p.class[role];
      const entry = classCounts.get(cls) ?? { count: 0, players: [] };
      entry.count++;
      entry.players.push(p);
      classCounts.set(cls, entry);
    }

    const maxCount = Math.max(...[...classCounts.values()].map(v => v.count), 1);

    const rows = [5, 4, 3, 2, 1, 0].map((cls) => {
      const entry = classCounts.get(cls);
      const count = entry?.count ?? 0;
      const pct = (count / maxCount) * 100;
      const color = CLASS_COLORS[cls] ?? '#8B7D6B';
      const avgElo = entry
        ? Math.round(entry.players.reduce((s, p) => s + getDisplayElo(p), 0) / entry.players.length)
        : 0;
      return `
        <div class="class-bar-wrap flex items-center gap-3 py-2">
          <div class="shrink-0 w-24 font-ui text-xs truncate" style="color:${count > 0 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)'}">${getClassName(cls)}</div>
          <div class="flex-1 h-2 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.08)">
            <div class="h-full rounded-full transition-all" style="width:${pct}%; background:${color}; opacity:${count > 0 ? 1 : 0.2}"></div>
          </div>
          <div class="shrink-0 font-display text-sm w-6 text-right" style="color:${count > 0 ? color : 'rgba(255,255,255,0.2)'}; opacity:${count > 0 ? 1 : 0.5}">${count}</div>
          <div class="shrink-0 font-body text-xs w-20 text-right hidden sm:block" style="color:rgba(255,255,255,0.3)">
            ${count > 0 ? `avg ${avgElo}` : '—'}
          </div>
        </div>
      `;
    }).join('');

    return rows;
  }

  private renderClassDistribution(ranked: IPlayer[], role: Role): string {
    if (ranked.length === 0) return '';

    const rows = this.renderClassDistributionContent(ranked, role);
    if (!rows.length) return '';

    return `
      <div class="glass-card rounded-xl overflow-hidden">
        <div class="px-4 md:px-5 py-3 flex items-center justify-between"
             style="background:rgba(10,25,18,0.8); border-bottom:1px solid var(--glass-border-gold)">
          <span class="font-ui" style="font-size:13px; color:var(--color-gold); letter-spacing:0.1em">DISTRIBUZIONE CLASSI</span>
          ${this.renderSectionRoleFilter('class', role)}
        </div>
        <div class="px-5 py-4" id="stats-class-content">
          ${rows}
        </div>
      </div>
    `;
  }
}

export default StatsPage;
