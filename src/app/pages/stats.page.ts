/**
 * StatsPage — Statistiche globali della season.
 *
 * Sezioni:
 *   - Overview cards (partite, gol, giocatori attivi, media gol)
 *   - Hall of Fame (record individuali: ELO, win, WR, streak, match)
 *   - Migliori e peggiori coppie
 *   - Distribuzione classi
 *
 * Route: /stats (public)
 */

import { getAllMatches } from '@/services/match.service';
import { getAllPlayers, getPlayerById, getRank } from '@/services/player.service';
import { getClassName } from '@/utils/get-class-name.util';
import { getDisplayElo } from '@/utils/get-display-elo.util';
import gsap from 'gsap';
import { Component } from '../components/component.base';
import { getInitials, renderPlayerAvatar } from '../components/player-avatar.component';
import { refreshIcons } from '../icons';

import type { IPlayer } from '@/models/player.interface';

const CLASS_COLORS: Record<number, string> = {
  0: '#FFD700',
  1: '#4A90D9',
  2: '#27AE60',
  3: '#C0C0C0',
  4: '#8B7D6B'
};

class StatsPage extends Component {
  async render(): Promise<string> {
    const allPlayers = getAllPlayers();
    const allMatches = getAllMatches();
    const ranked = allPlayers.filter(p => p.matches > 0);

    return `
      <div class="space-y-5 md:space-y-6" id="stats-page">
        ${this.renderPageHeader()}
        ${this.renderOverviewCards(allPlayers, allMatches)}
        ${this.renderHallOfFame(ranked)}
        ${this.renderPairs(allPlayers)}
        ${this.renderClassDistribution(ranked)}
      </div>
    `;
  }

  mount(): void {
    refreshIcons();
    gsap.from('.stat-card-new', { y: 15, stagger: 0.07, duration: 0.3, ease: 'power2.out' });
    gsap.from('.hof-card', { scale: 0.94, stagger: 0.06, duration: 0.35, ease: 'back.out(1.3)', delay: 0.1 });
    gsap.from('.pair-row', { x: -10, stagger: 0.04, duration: 0.25, ease: 'power2.out', delay: 0.2 });
    gsap.from('.class-bar-wrap', { x: -10, stagger: 0.06, duration: 0.3, ease: 'power2.out', delay: 0.3 });
  }

  destroy(): void { }

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

  // ── Overview Cards ────────────────────────────────────────

  private renderOverviewCards(allPlayers: IPlayer[], allMatches: ReturnType<typeof getAllMatches>): string {
    const totalMatches = allMatches.length;
    const totalGoals = allMatches.reduce((s, m) => s + m.score[0] + m.score[1], 0);
    const activePlayers = allPlayers.filter(p => p.matches > 0).length;
    const avgGoals = totalMatches > 0 ? (totalGoals / totalMatches).toFixed(1) : '—';

    // All-time best ELO ever recorded
    let maxEloPlayer: IPlayer | null = null;
    let maxElo = 0;
    for (const p of allPlayers) {
      if (p.bestElo > maxElo) { maxElo = p.bestElo; maxEloPlayer = p; }
    }

    // Longest active streak
    let bestStreakPlayer: IPlayer | null = null;
    let bestStreak = 0;
    for (const p of allPlayers) {
      const streak = (p as IPlayer & { streak?: number }).streak ?? 0;
      if (streak > bestStreak) { bestStreak = streak; bestStreakPlayer = p; }
    }

    const cards = [
      {
        icon: 'activity',
        label: 'PARTITE TOTALI',
        value: String(totalMatches),
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
        sub: `${totalGoals} gol in ${totalMatches} match`,
        color: 'var(--color-gold)'
      },
      {
        icon: 'zap',
        label: 'BEST ELO ALL TIME',
        value: maxEloPlayer ? String(Math.round(maxElo)) : '—',
        sub: maxEloPlayer?.name ?? '—',
        color: '#FFD700'
      }
    ];

    return `
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
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

  private renderHallOfFame(ranked: IPlayer[]): string {
    if (ranked.length === 0) return '';

    const byElo = [...ranked].sort((a, b) => b.elo - a.elo)[0];
    const byBestElo = [...ranked].sort((a, b) => b.bestElo - a.bestElo)[0];
    const byWins = [...ranked].sort((a, b) => (b.wins || 0) - (a.wins || 0))[0];
    const byMatches = [...ranked].sort((a, b) => b.matches - a.matches)[0];
    const byWR = [...ranked.filter(p => p.matches >= 5)]
      .sort((a, b) => ((b.wins || 0) / b.matches) - ((a.wins || 0) / a.matches))[0] ?? null;

    const records: Array<{ icon: string; label: string; player: IPlayer; value: string; sub: string; color: string }> = [
      {
        icon: 'trophy',
        label: 'ELO ATTUALE',
        player: byElo,
        value: String(getDisplayElo(byElo)),
        sub: `#${getRank(byElo.id)} in classifica`,
        color: '#FFD700'
      },
      {
        icon: 'zap',
        label: 'BEST ELO EVER',
        player: byBestElo,
        value: String(Math.round(byBestElo.bestElo)),
        sub: 'Massimo storico',
        color: '#F0A500'
      },
      {
        icon: 'trending-up',
        label: 'PIÙ VITTORIE',
        player: byWins,
        value: `${byWins.wins || 0}W`,
        sub: `${byWins.matches} match giocati`,
        color: 'var(--color-win)'
      },
      {
        icon: 'activity',
        label: 'PIÙ PARTITE',
        player: byMatches,
        value: String(byMatches.matches),
        sub: `${byMatches.wins || 0}W / ${byMatches.matches - (byMatches.wins || 0)}S`,
        color: 'var(--color-gold)'
      },
      ...(byWR
        ? [{
            icon: 'award',
            label: 'MIGLIOR WINRATE',
            player: byWR,
            value: `${Math.round(((byWR.wins || 0) / byWR.matches) * 100)}%`,
            sub: `min. 5 partite`,
            color: 'var(--color-win)'
          }]
        : [])
    ];

    return `
      <div class="glass-card rounded-xl overflow-hidden">
        <div class="px-4 md:px-5 py-3 flex items-center gap-2"
             style="background:rgba(10,25,18,0.8); border-bottom:1px solid var(--glass-border-gold)">
          <i data-lucide="award" style="width:14px;height:14px;color:var(--color-gold)"></i>
          <span class="font-ui" style="font-size:13px; color:var(--color-gold); letter-spacing:0.1em">HALL OF FAME</span>
        </div>
        <div class="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          ${records.map(r => this.renderHofCard(r)).join('')}
        </div>
      </div>
    `;
  }

  private renderHofCard(r: {
    icon: string; label: string; player: IPlayer; value: string; sub: string; color: string;
  }): string {
    const color = CLASS_COLORS[r.player.class] ?? '#8B7D6B';
    return `
      <a href="/profile/${r.player.id}"
         class="hof-card flex flex-col items-center gap-2 p-3 rounded-xl transition-all hover:bg-white/5"
         style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07)">
        <div class="flex items-center gap-1.5 self-start">
          <i data-lucide="${r.icon}" style="width:12px;height:12px;color:${r.color}"></i>
          <span class="font-ui" style="font-size:9px; color:${r.color}; letter-spacing:0.1em">${r.label}</span>
        </div>
        ${renderPlayerAvatar({ initials: getInitials(r.player.name), color, size: 'md' })}
        <div class="text-center">
          <div class="font-ui text-white truncate" style="font-size:13px; max-width:90px">${r.player.name}</div>
          <div class="font-body" style="font-size:10px; color:rgba(255,255,255,0.4)">${getClassName(r.player.class)}</div>
        </div>
        <div class="text-center mt-auto">
          <div class="font-display" style="font-size:22px; color:${r.color}; letter-spacing:0.08em">${r.value}</div>
          <div class="font-body" style="font-size:9px; color:rgba(255,255,255,0.35)">${r.sub}</div>
        </div>
      </a>
    `;
  }

  // ── Best / Worst Pairs ────────────────────────────────────

  private renderPairs(allPlayers: IPlayer[]): string {
    // Collect unique pairs with their net delta
    const pairMap = new Map<string, { p1: IPlayer; p2: IPlayer; delta: number }>();

    for (const p of allPlayers) {
      if (!p.teammatesDelta) continue;
      for (const [tid, delta] of p.teammatesDelta) {
        const t = getPlayerById(tid);
        if (!t) continue;
        const key = [Math.min(p.id, tid), Math.max(p.id, tid)].join('-');
        if (!pairMap.has(key)) {
          pairMap.set(key, { p1: p, p2: t, delta });
        }
      }
    }

    const pairs = [...pairMap.values()].sort((a, b) => b.delta - a.delta);
    const best = pairs.slice(0, 5);
    const worst = [...pairs].sort((a, b) => a.delta - b.delta).slice(0, 5);

    const renderList = (list: typeof pairs, positive: boolean) => list.map((pr) => {
      const dColor = positive ? 'var(--color-win)' : 'var(--color-loss)';
      const sign = positive ? '+' : '';
      return `
        <div class="pair-row flex items-center gap-3 px-4 py-2.5 rounded-lg"
             style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06)">
          <div class="flex items-center gap-2 flex-1 min-w-0">
            ${renderPlayerAvatar({ initials: getInitials(pr.p1.name), color: CLASS_COLORS[pr.p1.class] ?? '#8B7D6B', size: 'xs' })}
            <span class="font-ui text-xs text-white truncate">${pr.p1.name}</span>
            <span class="font-body text-xs" style="color:rgba(255,255,255,0.3)">+</span>
            ${renderPlayerAvatar({ initials: getInitials(pr.p2.name), color: CLASS_COLORS[pr.p2.class] ?? '#8B7D6B', size: 'xs' })}
            <span class="font-ui text-xs text-white truncate">${pr.p2.name}</span>
          </div>
          <span class="font-display text-sm flex-shrink-0" style="color:${dColor}; letter-spacing:0.05em">
            ${sign}${Math.round(pr.delta)}
          </span>
        </div>
      `;
    }).join('');

    return `
      <div class="grid md:grid-cols-2 gap-4">
        <!-- Best pairs -->
        <div class="glass-card rounded-xl overflow-hidden">
          <div class="px-4 py-3 flex items-center gap-2"
               style="background:rgba(10,25,18,0.8); border-bottom:1px solid var(--glass-border-gold)">
            <i data-lucide="trending-up" style="width:14px;height:14px;color:var(--color-win)"></i>
            <span class="font-ui" style="font-size:13px; color:var(--color-win); letter-spacing:0.1em">MIGLIORI COPPIE</span>
          </div>
          <div class="p-3 space-y-2">
            ${best.length > 0 ? renderList(best, true) : '<div class="text-center py-6 font-body text-xs" style="color:rgba(255,255,255,0.3)">Nessun dato</div>'}
          </div>
        </div>

        <!-- Worst pairs -->
        <div class="glass-card rounded-xl overflow-hidden">
          <div class="px-4 py-3 flex items-center gap-2"
               style="background:rgba(10,25,18,0.8); border-bottom:1px solid var(--glass-border-gold)">
            <i data-lucide="trending-down" style="width:14px;height:14px;color:var(--color-loss)"></i>
            <span class="font-ui" style="font-size:13px; color:var(--color-loss); letter-spacing:0.1em">PEGGIORI COPPIE</span>
          </div>
          <div class="p-3 space-y-2">
            ${worst.length > 0 ? renderList(worst, false) : '<div class="text-center py-6 font-body text-xs" style="color:rgba(255,255,255,0.3)">Nessun dato</div>'}
          </div>
        </div>
      </div>
    `;
  }

  // ── Class Distribution ────────────────────────────────────

  private renderClassDistribution(ranked: IPlayer[]): string {
    if (ranked.length === 0) return '';

    const classCounts = new Map<number, { count: number; players: IPlayer[] }>();
    for (const p of ranked) {
      const entry = classCounts.get(p.class) ?? { count: 0, players: [] };
      entry.count++;
      entry.players.push(p);
      classCounts.set(p.class, entry);
    }

    const maxCount = Math.max(...[...classCounts.values()].map(v => v.count));

    const rows = [0, 1, 2, 3, 4].map((cls) => {
      const entry = classCounts.get(cls);
      if (!entry) return '';
      const pct = maxCount > 0 ? (entry.count / maxCount) * 100 : 0;
      const color = CLASS_COLORS[cls] ?? '#8B7D6B';
      const topPlayer = [...entry.players].sort((a, b) => b.elo - a.elo)[0];
      return `
        <div class="class-bar-wrap flex items-center gap-3 py-2">
          <div class="flex-shrink-0 w-24 font-ui text-xs truncate" style="color:rgba(255,255,255,0.7)">${getClassName(cls)}</div>
          <div class="flex-1 h-2 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.08)">
            <div class="h-full rounded-full transition-all" style="width:${pct}%; background:${color}"></div>
          </div>
          <div class="flex-shrink-0 font-display text-sm w-6 text-right" style="color:${color}">${entry.count}</div>
          <div class="flex-shrink-0 font-body text-xs w-28 truncate" style="color:rgba(255,255,255,0.4)">
            top: ${topPlayer?.name ?? '—'}
          </div>
        </div>
      `;
    }).filter(Boolean).join('');

    return `
      <div class="glass-card rounded-xl overflow-hidden">
        <div class="px-4 md:px-5 py-3 flex items-center gap-2"
             style="background:rgba(10,25,18,0.8); border-bottom:1px solid var(--glass-border-gold)">
          <i data-lucide="shield" style="width:14px;height:14px;color:var(--color-gold)"></i>
          <span class="font-ui" style="font-size:13px; color:var(--color-gold); letter-spacing:0.1em">DISTRIBUZIONE CLASSI</span>
        </div>
        <div class="px-5 py-4">
          ${rows}
        </div>
      </div>
    `;
  }
}

export default StatsPage;
