/**
 * LeaderboardPage — Podium, tabella classifica, stats, ultime partite.
 *
 * Design fedele al Figma React (Leaderboard.tsx):
 *   - Podium con emoji medaglie, gradient cards, layout mobile-first
 *   - Tabella CSS Grid (non <table>) con progress bar WR
 *   - Banner promemoria identità giocatore
 *
 * Route: / (default, public)
 */

import { MatchHistoryComponent, renderMatchHistory } from '@/app/components/match-history.component';
import { refreshCoreData, registerAppRefreshHandler } from '@/services/app-refresh.service';
import { expectedScore, MatchesToRank } from '@/services/elo.service';
import { getAllMatches } from '@/services/match.service';
import { getAllPlayers, getBonusK, getPlayerById } from '@/services/player.service';
import { fetchRunningMatch } from '@/services/repository.service';
import { animateVisible } from '@/utils/animate-visible.util';
import { getClassName } from '@/utils/get-class-name.util';
import gsap from 'gsap';
import { Component } from '../components/component.base';
import { getInitials, renderPlayerAvatar } from '../components/player-avatar.component';
import { renderRoleBadge } from '../components/role-badge.component';
import { userDropdown } from '../components/user-dropdown.component';
import { refreshIcons } from '../icons';

import type { IPlayer } from '@/models/player.interface';

const CLASS_COLORS: Record<number, string> = {
  0: '#FFD700',
  1: '#4A90D9',
  2: '#27AE60',
  3: '#C0C0C0',
  4: '#8B7D6B'
};

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

const MEDAL_BORDER: Record<number, string> = {
  1: 'rgba(255,215,0,0.55)',
  2: 'rgba(192,192,192,0.50)',
  3: 'rgba(205,127,50,0.50)'
};

const MEDAL_ELO_COLOR: Record<number, string> = {
  1: '#FFD700',
  2: '#C0C0C0',
  3: '#CD7F32'
};

const MEDAL_SHADOW: Record<number, string> = {
  1: '0 0 40px rgba(255,215,0,0.20), inset 0 0 24px rgba(255,215,0,0.06)',
  2: '0 0 24px rgba(192,192,192,0.14)',
  3: '0 0 24px rgba(205,127,50,0.14)'
};

type SortKey = 'rank' | 'name' | 'elo' | 'matches' | 'winrate';
type LeaderboardType = 'overall' | 'defence' | 'attack';

const RECENT_MATCHES_COUNT = 30;

class LeaderboardPage extends Component {
  private sortKey: SortKey = 'rank';
  private sortAsc = false;
  private currentLeaderboard: LeaderboardType = 'overall';
  private matchHistory: MatchHistoryComponent | null = null;
  private unregisterRefreshHandler: (() => void) | null = null;
  private isDestroyed = false;
  private heroContent: 'podium' | 'live-match' = 'podium';
  private cleanupObservers: (() => void)[] = [];

  async render(): Promise<string> {
    return `
      <div class="space-y-5 md:space-y-6" id="leaderboard-page">
        ${this.renderPageHeader()}
        ${this.renderReminderBanner()}
        ${this.renderIdentityBanner()}
        ${this.renderLeaderboardSelector()}
        <div id="leaderboard-hero-slot" data-hero-content="podium">
          ${this.renderPodium()}
        </div>
        <div id="leaderboard-table-slot">
          <div class="rounded-xl" style="background:rgba(15,42,32,0.75); border:1px solid rgba(255,255,255,0.08); backdrop-filter:blur(8px); height:200px; display:flex; align-items:center; justify-content:center">
            <div style="color:rgba(255,255,255,0.3); font-family:var(--font-ui); letter-spacing:0.1em; font-size:13px">CARICAMENTO CLASSIFICA...</div>
          </div>
        </div>
        <div id="leaderboard-history-slot">
          <div style="color:rgba(255,255,255,0.3); font-family:var(--font-ui); letter-spacing:0.1em; font-size:13px; padding:20px; text-align:center">CARICAMENTO PARTITE...</div>
        </div>
      </div>
    `;
  }

  override mount(): void {
    this.isDestroyed = false;
    refreshIcons();

    // Leaderboard selector buttons
    document.querySelectorAll<HTMLButtonElement>('[data-leaderboard]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.leaderboard as LeaderboardType | undefined;
        if (!key || this.currentLeaderboard === key) return;
        this.currentLeaderboard = key;
        this.sortKey = 'rank';
        this.sortAsc = false;
        this.refreshPodium();
        this.refreshTable();
        this.updateLeaderboardSelector();
        this.updateSortIndicators();
      });
    });

    // Identity banner CTA
    document.getElementById('identity-banner-btn')?.addEventListener('click', () => {
      userDropdown.open();
    });

    // Get data for lazy loading (compute early but don't render yet)
    const players = this.getSortedPlayers();
    const todayDeltas = this.getTodayEloDeltas();
    const todayRankDeltas = this.getTodayRankDeltas();
    const selectedPlayerId = Number(localStorage.getItem('biliardino_player_id') || 0);

    this.unregisterRefreshHandler = registerAppRefreshHandler(() => this.handlePullRefresh());

    // GSAP animations — fast initial animations for header + podium
    gsap.from('#leaderboard-page .page-header', { opacity: 0, y: -20, duration: 0.4, ease: 'power2.out' });
    gsap.from('.podium-card', { scale: 0.9, y: 12, stagger: 0.1, duration: 0.45, ease: 'back.out(1.4)', clearProps: 'transform' });

    // Kick off live match check
    void this.refreshHeroContent();

    // === LAZY LOAD TABLE + HISTORY after animations start ===
    // Schedule render after paint using requestIdleCallback or setTimeout (for broader support)
    const scheduleLoad = () => {
      if (this.isDestroyed) return;

      // Render ranking table
      const tableSlot = this.$('#leaderboard-table-slot');
      if (tableSlot) {
        tableSlot.innerHTML = this.renderRankingTable();
        refreshIcons();

        // Bind sortable headers after table is rendered
        const headers = this.$$('.sort-header');
        for (const th of headers) {
          th.addEventListener('click', () => {
            const key = (th as HTMLElement).dataset.sortKey as SortKey;
            if (!key) return;
            if (this.sortKey === key) {
              this.sortAsc = !this.sortAsc;
            } else {
              this.sortKey = key;
              this.sortAsc = false;
            }
            this.refreshTable();
            this.updateSortIndicators();
          });
        }
        this.updateSortIndicators();

        // Animate table rows in (only visible ones)
        this.cleanupObservers.push(
          animateVisible({ selector: '.ranking-row', vars: { x: -10, duration: 0.25, ease: 'power2.out', delay: 0.1 }, stagger: 0.03 })
        );
      }

      // Render match history
      const historySlot = this.$('#leaderboard-history-slot');
      if (historySlot) {
        historySlot.innerHTML = renderMatchHistory({
          matches: getAllMatches(),
          limit: RECENT_MATCHES_COUNT,
          selectedPlayerId
        });
        if (this.matchHistory) {
          this.matchHistory.destroy();
          this.matchHistory = null;
        }
        this.matchHistory = new MatchHistoryComponent();
        this.matchHistory.mount(historySlot);
        refreshIcons();

        // Animate history rows in (only visible ones)
        this.cleanupObservers.push(
          animateVisible({ selector: '.match-history-row', vars: { x: -10, duration: 0.25, ease: 'power2.out', delay: 0.15 }, stagger: 0.03 })
        );
      }
    };

    // Use requestIdleCallback if available (modern browsers), otherwise setTimeout
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(scheduleLoad, { timeout: 1000 });
    } else {
      setTimeout(scheduleLoad, 100);
    }
  }

  override destroy(): void {
    this.isDestroyed = true;
    if (this.matchHistory) {
      this.matchHistory.destroy();
      this.matchHistory = null;
    }
    if (this.unregisterRefreshHandler) {
      this.unregisterRefreshHandler();
      this.unregisterRefreshHandler = null;
    }
    for (const cleanup of this.cleanupObservers) cleanup();
    this.cleanupObservers = [];
  }

  // ── Helpers ───────────────────────────────────────────────

  private getRoleIndex(): 0 | 1 | null {
    if (this.currentLeaderboard === 'defence') return 0;
    if (this.currentLeaderboard === 'attack') return 1;
    return null;
  }

  private getPlayerElo(player: IPlayer): number {
    const roleIdx = this.getRoleIndex();
    if (roleIdx === null) {
      const defElo = player.elo[0];
      const attElo = player.elo[1];
      return player.bestRole === 1 ? attElo : defElo;
    }
    return player.elo[roleIdx];
  }

  private getPlayerEloRounded(player: IPlayer): number {
    return Math.round(this.getPlayerElo(player));
  }

  private getPlayerRank(player: IPlayer): number {
    const roleIdx = this.getRoleIndex();
    if (roleIdx === null) return player.rank[2]; // overall
    return player.rank[roleIdx];
  }

  private getAllRankedPlayers(): IPlayer[] {
    const roleIdx = this.getRoleIndex();
    return getAllPlayers().filter((p) => {
      if (roleIdx === null) {
        // General: include players with non-zero rank[2]
        return p.rank[2] > 0;
      }
      return p.matches[roleIdx] > 0;
    });
  }

  private getSortedPlayers(): IPlayer[] {
    const filtered = [...this.getAllRankedPlayers()];
    const roleIdx = this.getRoleIndex();

    const { sortKey, sortAsc } = this;
    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'rank':
          cmp = this.getPlayerRank(a) - this.getPlayerRank(b);
          break;
        case 'name': cmp = a.name.localeCompare(b.name);
          break;
        case 'elo':
          cmp = this.getPlayerElo(b) - this.getPlayerElo(a);
          break;
        case 'matches': {
          const aMatches = roleIdx === null ? (a.matches[0] + a.matches[1]) : a.matches[roleIdx];
          const bMatches = roleIdx === null ? (b.matches[0] + b.matches[1]) : b.matches[roleIdx];
          cmp = bMatches - aMatches;
          break;
        }
        case 'winrate': {
          const aMatches = roleIdx === null ? (a.matches[0] + a.matches[1]) : a.matches[roleIdx];
          const aWins = roleIdx === null ? (a.wins[0] + a.wins[1]) : a.wins[roleIdx];
          const bMatches = roleIdx === null ? (b.matches[0] + b.matches[1]) : b.matches[roleIdx];
          const bWins = roleIdx === null ? (b.wins[0] + b.wins[1]) : b.wins[roleIdx];
          const aR = aMatches > 0 ? aWins / aMatches : 0;
          const bR = bMatches > 0 ? bWins / bMatches : 0;
          cmp = bR - aR;
          break;
        }
      }
      return sortAsc ? -cmp : cmp;
    });

    return filtered;
  }

  private getTodayEloDeltas(): Map<number, { delta: number; matches: number }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const deltas = new Map<number, { delta: number; matches: number }>();
    const playerMatchCounts = new Map<number, number>();

    const addDelta = (playerId: number, delta: number): void => {
      if (!Number.isFinite(delta)) return;
      const matchesPlayed = playerMatchCounts.get(playerId) ?? 0;
      const bonusMultiplier = getBonusK(matchesPlayed);
      const adjustedDelta = delta * bonusMultiplier;
      const entry = deltas.get(playerId) ?? { delta: 0, matches: 0 };
      entry.delta += adjustedDelta;
      entry.matches += 1;
      deltas.set(playerId, entry);
      playerMatchCounts.set(playerId, matchesPlayed + 1);
    };

    const allMatches = getAllMatches().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    for (const match of allMatches) {
      const matchDate = new Date(match.createdAt);
      matchDate.setHours(0, 0, 0, 0);
      if (matchDate.getTime() === today.getTime()) {
        addDelta(match.teamA.defence, match.deltaELO[0]);
        addDelta(match.teamA.attack, match.deltaELO[0]);
        addDelta(match.teamB.defence, match.deltaELO[1]);
        addDelta(match.teamB.attack, match.deltaELO[1]);
      } else {
        for (const pid of [match.teamA.defence, match.teamA.attack, match.teamB.defence, match.teamB.attack]) {
          playerMatchCounts.set(pid, (playerMatchCounts.get(pid) ?? 0) + 1);
        }
      }
    }
    return deltas;
  }

  private getTodayRankDeltas(): Map<number, number> {
    const players = this.getAllRankedPlayers();
    const todayDeltas = this.getTodayEloDeltas();

    // Estimate yesterday ELO = current ELO − today bonus-adjusted delta
    const yesterdayElos = new Map<number, number>();
    for (const p of players) {
      const entry = todayDeltas.get(p.id);
      const currentElo = this.getPlayerElo(p);
      yesterdayElos.set(p.id, currentElo - (entry?.delta ?? 0));
    }

    // Sort by yesterday ELO descending → yesterday ranks
    const sorted = [...players].sort(
      (a, b) => (yesterdayElos.get(b.id) ?? 0) - (yesterdayElos.get(a.id) ?? 0)
    );
    const yesterdayRanks = new Map<number, number>();
    sorted.forEach((p, i) => yesterdayRanks.set(p.id, i + 1));

    // Delta = positions gained (positive = improved)
    const result = new Map<number, number>();
    for (const p of players) {
      const entry = todayDeltas.get(p.id);
      if (entry && entry.matches > 0) {
        result.set(p.id, (yesterdayRanks.get(p.id) ?? this.getPlayerRank(p)) - this.getPlayerRank(p));
      }
    }
    return result;
  }

  // ── Section Renderers ──────────────────────────────────────

  private renderLeaderboardSelector(): string {
    const options: Array<{ key: LeaderboardType; label: string; icon: string }> = [
      { key: 'overall', label: 'GENERALE', icon: 'trophy' },
      { key: 'defence', label: 'DIFESA', icon: 'shield' },
      { key: 'attack', label: 'ATTACCO', icon: 'sword' }
    ];

    return `
      <div class="flex justify-center">
        <div class="inline-flex gap-1 p-1 rounded-xl"
             style="background:rgba(255,255,255,0.05); border:1px solid var(--glass-border); backdrop-filter:blur(8px)">
          ${options.map(({ key, label, icon }) => {
            const isActive = this.currentLeaderboard === key;
            return `
            <button
              type="button"
              data-leaderboard="${key}"
              class="leaderboard-selector-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-ui transition-all"
              style="font-size:11px; letter-spacing:0.08em;
                ${isActive
                  ? 'background:linear-gradient(135deg,var(--color-gold),var(--color-gold-secondary));color:var(--color-bg-deep);font-weight:700;box-shadow:0 2px 12px rgba(255,215,0,0.25)'
                  : 'background:transparent;color:var(--color-text-muted);border:1px solid transparent'}"
            >
              <i data-lucide="${icon}" style="width:13px;height:13px" aria-hidden="true"></i>
              ${label}
            </button>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  private renderPageHeader(): string {
    return `
      <div class="page-header flex items-center gap-3">
        <i data-lucide="trophy" class="text-(--color-gold)"
           style="width:26px;height:26px"></i>
        <div>
          <h1 class="text-white font-display"
              style="font-size:clamp(28px,6vw,42px); letter-spacing:0.12em; line-height:1">
            CLASSIFICA
          </h1>
          <p class="font-ui"
             style="font-size:12px; color:rgba(255,255,255,0.5); letter-spacing:0.1em">
            SEASON 2025–2026 · RANKING UFFICIALE
          </p>
        </div>
      </div>
    `;
  }

  private renderIdentityBanner(): string {
    const playerId = localStorage.getItem('biliardino_player_id');
    if (playerId) return '';

    return `
      <div class="rounded-xl px-4 py-3 flex items-center gap-3"
           style="background:rgba(255,215,0,0.07); border:1px solid rgba(255,215,0,0.25)">
        <div class="shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
             style="background:rgba(255,215,0,0.12)">
          <i data-lucide="user-circle" style="width:18px;height:18px;color:#FFD700"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-ui text-xs" style="color:#FFD700; letter-spacing:0.08em">CHI SEI?</div>
          <div class="font-body" style="font-size:11px; color:rgba(255,255,255,0.5)">
            Seleziona il tuo giocatore per personalizzare la classifica e ricevere notifiche push
          </div>
        </div>
        <button id="identity-banner-btn"
                class="shrink-0 px-3 py-1.5 rounded-lg font-ui text-xs whitespace-nowrap transition-all hover:brightness-110 active:scale-[0.98]"
          style="background:linear-gradient(135deg,#FFD700,#F0A500); color:var(--color-bg-deep); letter-spacing:0.06em">
          SCEGLI
        </button>
      </div>
    `;
  }

  private renderReminderBanner(): string {
    return `
      <div class="rounded-xl px-4 py-3 flex items-center gap-3"
           style="background:rgba(255,215,0,0.07); border:1px solid rgba(255,215,0,0.25)">
        <div class="shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
             style="background:rgba(255,215,0,0.12)">
        <i data-lucide="shield" style="width:18px;height:18px;color:#FFD700;flex-shrink:0;margin-top:1px"></i>
        </div>
        <div class="flex-1 min-w-0">
        
          <div class="font-ui text-xs" style="color:#FFD700; letter-spacing:0.08em">ATTENZIONE</div>
          <div class="font-body" style="font-size:11px; color:rgba(255,255,255,0.5)">
            Il biliardino non e scontato: solo in pausa e con rispetto, per evitare sanzioni.
          </div>
        </div>
      </div>
    `;
  }

  private renderLiveMatch(runningMatch: Awaited<ReturnType<typeof fetchRunningMatch>>): string {
    try {
      if (!runningMatch) return '';

      const defA = getPlayerById(runningMatch.teamA.defence);
      const attA = getPlayerById(runningMatch.teamA.attack);
      const defB = getPlayerById(runningMatch.teamB.defence);
      const attB = getPlayerById(runningMatch.teamB.attack);
      if (!defA || !attA || !defB || !attB) return '';

      const defAElo = Math.round(defA.elo[0]);
      const attAElo = Math.round(attA.elo[1]);
      const defBElo = Math.round(defB.elo[0]);
      const attBElo = Math.round(attB.elo[1]);

      const avgEloA = Math.round((defAElo + attAElo) / 2);
      const avgEloB = Math.round((defBElo + attBElo) / 2);
      const winProbA = expectedScore(avgEloA, avgEloB);
      const winProbB = 1 - winProbA;
      const winPctA = Math.round(winProbA * 100);
      const winPctB = Math.round(winProbB * 100);
      const isLive = this.isLiveNow();

      const renderLeftPlayer = (p: IPlayer, role: 'DIF' | 'ATT', elo: number): string => {
        const roleIdx = role === 'DIF' ? 0 : 1;
        const color = CLASS_COLORS[p.class[roleIdx]] ?? '#8B7D6B';
        return `
          <a href="/profile/${p.id}" class="flex items-center gap-3 rounded-xl py-2 px-3 hover:bg-white/5 transition-colors">
            <div class="relative shrink-0">
              ${renderPlayerAvatar({ initials: getInitials(p.name), color, size: 'lg', playerId: p.id, playerClass: p.class[roleIdx] })}
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-white font-ui truncate" style="font-size:15px;font-weight:600">${p.name}</div>
              <div class="flex items-center gap-1 mt-1">
                ${renderRoleBadge({ role: role === 'DIF' ? 'defence' : 'attack', size: 'lg', showLabel: true })}
              </div>
              <div class="flex items-center gap-1.5 mt-1">
                <span class="font-display" style="font-size:22px;color:#FFD700;letter-spacing:0.05em;line-height:1">${elo}</span>
                <span class="font-ui" style="font-size:9px;color:rgba(255,255,255,0.3);letter-spacing:0.08em">ELO</span>
              </div>
            </div>
          </a>
        `;
      };

      const renderRightPlayer = (p: IPlayer, role: 'DIF' | 'ATT', elo: number): string => {
        const roleIdx = role === 'DIF' ? 0 : 1;
        const color = CLASS_COLORS[p.class[roleIdx]] ?? '#8B7D6B';
        return `
          <a href="/profile/${p.id}" class="flex items-center gap-5 rounded-xl py-2 px-3 hover:bg-white/5 transition-colors flex-row-reverse">
            <div class="relative shrink-0">
              ${renderPlayerAvatar({ initials: getInitials(p.name), color, size: 'lg', playerId: p.id, playerClass: p.class[roleIdx] })}
            </div>
            <div class="min-w-0 flex-1 text-right">
              <div class="text-white font-ui truncate" style="font-size:15px;font-weight:600">${p.name}</div>
              <div class="flex items-center gap-1 mt-1 justify-end">
                ${renderRoleBadge({ role: role === 'DIF' ? 'defence' : 'attack', size: 'lg', showLabel: true })}
              </div>
              <div class="flex items-center gap-1.5 mt-1 justify-end">
                <span class="font-display" style="font-size:22px;color:#FFD700;letter-spacing:0.05em;line-height:1">${elo}</span>
                <span class="font-ui" style="font-size:9px;color:rgba(255,255,255,0.3);letter-spacing:0.08em">ELO</span>
              </div>
            </div>
          </a>
        `;
      };

      // VS divider with decorative gold lines
      const vsDivider = `
        <div class="hidden md:flex flex-col items-center shrink-0 pt-8" style="gap:4px">
          <div style="width:1px;height:48px;background:linear-gradient(to bottom,transparent,rgba(255,215,0,0.3),transparent)"></div>
          <span class="font-display" style="font-size:28px;color:#FFD700;letter-spacing:0.15em;line-height:28px">VS</span>
          <div style="width:1px;height:48px;background:linear-gradient(to bottom,transparent,rgba(255,215,0,0.3),transparent)"></div>
        </div>
      `;

      // Mobile VS divider (horizontal)
      const vsDividerMobile = `
        <div class="md:hidden flex items-center justify-center gap-3 py-2">
          <div style="height:1px;flex:1;background:linear-gradient(to right,transparent,rgba(255,215,0,0.3),transparent)"></div>
          <span class="font-display" style="font-size:22px;color:#FFD700;letter-spacing:0.15em">VS</span>
          <div style="height:1px;flex:1;background:linear-gradient(to right,transparent,rgba(255,215,0,0.3),transparent)"></div>
        </div>
      `;

      return `
        <div class="live-match-card rounded-xl overflow-hidden"
             style="border:1px solid rgba(255,215,0,0.2);
                    background:linear-gradient(174deg, rgba(15,42,32,0.92) 8%, rgba(20,55,40,0.85) 92%);
                    box-shadow:0 0 40px rgba(255,215,0,0.06)">

          <!-- Header -->
          <div class="flex items-center px-5 md:px-6"
               style="height:52px; background:rgba(10,25,18,0.8); border-bottom:1px solid rgba(255,215,0,0.15)">
            <div class="flex items-center gap-2">
              ${isLive ? '<div class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>' : ''}
              <span class="font-display" style="font-size:14px; color:#ef4444; letter-spacing:0.15em">
                ${isLive ? 'LIVE MATCH' : 'PROSSIMA PARTITA'}
              </span>
            </div>
          </div>

          <!-- Body -->
          <div class="p-5 md:p-6">

            <!-- Desktop layout: side by side -->
            <div class="hidden md:flex gap-6 items-start">

              <!-- BIANCHI (left) -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-3 mb-2">
                  <span class="font-display" style="font-size:18px;color:rgba(255,255,255,0.75);letter-spacing:0.12em">BIANCHI</span>
                  <span class="font-ui" style="font-size:10px;color:rgba(255,255,255,0.4);letter-spacing:0.08em">AVG</span>
                  <span class="font-display text-white" style="font-size:16px">${avgEloA}</span>
                </div>
                <div class="flex flex-col">
                  ${renderLeftPlayer(defA, 'DIF', defAElo)}
                  ${renderLeftPlayer(attA, 'ATT', attAElo)}
                </div>
              </div>

              ${vsDivider}

              <!-- ROSSI (right) -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-3 mb-2 justify-end">
                  <span class="font-display" style="font-size:18px;color:rgba(229,62,62,0.9);letter-spacing:0.12em">ROSSI</span>
                  <span class="font-ui" style="font-size:10px;color:rgba(255,255,255,0.4);letter-spacing:0.08em">AVG</span>
                  <span class="font-display text-white" style="font-size:16px">${avgEloB}</span>
                </div>
                <div class="flex flex-col">
                  ${renderRightPlayer(defB, 'DIF', defBElo)}
                  ${renderRightPlayer(attB, 'ATT', attBElo)}
                </div>
              </div>
            </div>

            <!-- Mobile layout: stacked -->
            <div class="md:hidden">
              <!-- BIANCHI -->
              <div class="mb-2">
                <div class="flex items-center gap-3 mb-1">
                  <span class="font-display" style="font-size:16px;color:rgba(255,255,255,0.75);letter-spacing:0.12em">BIANCHI</span>
                  <span class="font-ui" style="font-size:9px;color:rgba(255,255,255,0.4);letter-spacing:0.08em">AVG</span>
                  <span class="font-display text-white" style="font-size:14px">${avgEloA}</span>
                </div>
                ${renderLeftPlayer(defA, 'DIF', defAElo)}
                ${renderLeftPlayer(attA, 'ATT', attAElo)}
              </div>

              ${vsDividerMobile}

              <!-- ROSSI -->
              <div class="mt-2">
                <div class="flex items-center gap-3 mb-1">
                  <span class="font-display" style="font-size:16px;color:rgba(229,62,62,0.9);letter-spacing:0.12em">ROSSI</span>
                  <span class="font-ui" style="font-size:9px;color:rgba(255,255,255,0.4);letter-spacing:0.08em">AVG</span>
                  <span class="font-display text-white" style="font-size:14px">${avgEloB}</span>
                </div>
                ${renderLeftPlayer(defB, 'DIF', defBElo)}
                ${renderLeftPlayer(attB, 'ATT', attBElo)}
              </div>
            </div>

            <!-- Team Win Rate Bar -->
            <div class="mt-5 px-2">
              <div class="flex items-center justify-between mb-1.5">
                <span class="font-display" style="font-size:15px;color:#ffffff">${winPctA}%</span>
                <span class="font-ui" style="font-size:9px;color:rgba(255,255,255,0.4);letter-spacing:0.12em">TEAM WIN RATE</span>
                <span class="font-display" style="font-size:15px;color:rgba(229,62,62,0.9)">${winPctB}%</span>
              </div>
              <div class="flex rounded-full overflow-hidden h-2" style="background:rgba(255,255,255,0.06)">
                <div class="h-full rounded-l-full" style="width:${winPctA}%;background:linear-gradient(to right,#f3f4f6,#efefef)"></div>
                <div class="h-full rounded-r-full" style="width:${winPctB}%;background:linear-gradient(to left,#dc143c,#ef4444)"></div>
              </div>
            </div>
          </div>

          <!-- Inner glow overlay -->
          <div class="absolute inset-0 pointer-events-none rounded-xl" style="box-shadow:inset 0 0 30px rgba(255,215,0,0.02)"></div>
        </div>
      `;
    } catch {
      return '';
    }
  }

  private isLiveNow(): boolean {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const windows = [
      { start: 11 * 60, end: 11 * 60 + 15 },
      { start: 13 * 60, end: 14 * 60 },
      { start: 16 * 60, end: 16 * 60 + 15 },
      { start: 18 * 60, end: 20 * 60 }
    ];
    return windows.some(w => minutes >= w.start && minutes < w.end);
  }

  // ── Podium ──────────────────────────

  private renderPodium(): string {
    const players = this.getAllRankedPlayers()
      .sort((a, b) => this.getPlayerRank(a) - this.getPlayerRank(b));

    const top3 = players.filter(p => this.getPlayerRank(p) <= 3).slice(0, 3);
    if (top3.length < 3) return '';

    const [first, second, third] = top3;

    const card = (p: IPlayer, rank: number, elevated = false): string => {
      const roleIdx = this.getRoleIndex();
      const displayedRoleIdx = roleIdx ?? p.bestRole;
      const elo = this.getPlayerEloRounded(p);
      const matches = roleIdx === null ? (p.matches[0] + p.matches[1]) : p.matches[roleIdx];
      const wins = roleIdx === null ? (p.wins[0] + p.wins[1]) : p.wins[roleIdx];
      const winRate = matches > 0 ? Math.round((wins / matches) * 100) : 0;
      const eloColor = MEDAL_ELO_COLOR[rank] ?? '#8B7D6B';
      const border = MEDAL_BORDER[rank] ?? 'rgba(255,255,255,0.08)';
      const shadow = MEDAL_SHADOW[rank] ?? 'none';
      const medal = MEDALS[rank];
      const color = CLASS_COLORS[p.class[displayedRoleIdx]] ?? '#8B7D6B';
      const initials = getInitials(p.name);
      const elevatedClass = elevated ? 'transform-[translateY(-10px)]' : '';
      // Card bg: 15% white base gives ~50 RGB unit contrast over the dark field
      // (#0F2A20 → #1F5C3A); previous 8% was below perceptible threshold.
      // Medal gradient on top adds gold/silver/bronze identity.
      const bg = rank === 1
        ? 'linear-gradient(160deg, rgba(255,215,0,0.40) 0%, rgba(255,215,0,0.18) 100%), rgba(255,255,255,0.15)'
        : rank === 2
          ? 'linear-gradient(160deg, rgba(192,192,192,0.30) 0%, rgba(192,192,192,0.12) 100%), rgba(255,255,255,0.14)'
          : 'linear-gradient(160deg, rgba(205,127,50,0.30) 0%, rgba(205,127,50,0.12) 100%), rgba(255,255,255,0.14)';

      return `
        <a href="/profile/${p.id}"
           class="podium-card ${elevatedClass} group flex flex-col items-center p-4 md:p-5 gap-2 md:gap-3 rounded-xl md:max-h-[265.33px]!"
           style="
             background: ${bg};
             border: 1px solid ${border};
             box-shadow: ${shadow};
             backdrop-filter: blur(8px);
           "
        >
        
        <!-- Avatar -->
        <div class="relative flex flex-col text-center">
        ${renderPlayerAvatar({ initials, color, size: 'base', playerId: p.id, playerClass: p.class[displayedRoleIdx] })}
          <!-- Medal emoji -->
          <span class="-translate-y-1" style="font-size:28px; line-height:1">${medal}</span>
          </div>
            
          <!-- Name -->
          <div class="text-center flex flex-col items-center gap-1">
            <div class="text-white"
                 style="font-family:var(--font-ui); font-size:15px; font-weight:600">
              ${p.name}
            </div>
          </div>

          <!-- Stats: WR | ELO | Matches -->
          <div class="flex gap-2 md:gap-4  text-center">
            <div>
              <div style="font-family:var(--font-ui); font-size:14px; color:white">${winRate}%</div>
              <div style="font-size:10px; color:rgba(255,255,255,0.4); font-family:var(--font-ui)">WIN RATE</div>
            </div>
            <div style="width:1px; background:rgba(255,255,255,0.15)"></div>
             <div class="text-center">
            <div style="font-family:var(--font-display); font-size:26px; color:${eloColor}; letter-spacing:0.1em; line-height:1">
              ${elo}
            </div>
            <div style="font-family:var(--font-ui); font-size:10px; color:rgba(255,255,255,0.4); letter-spacing:0.1em">ELO</div>
          </div>
            <div style="width:1px; background:rgba(255,255,255,0.15)"></div>
            <div>
              <div style="font-family:var(--font-ui); font-size:14px; color:white">${matches}</div>
              <div style="font-size:10px; color:rgba(255,255,255,0.4); font-family:var(--font-ui)">MATCH</div>
            </div>
          </div>
        </a>
      `;
    };

    return `
      <!-- Mobile: #1 in cima, #2/#3 affiancati -->
      <div class="flex flex-col gap-3 sm:hidden">
        ${card(first, 1)}
        <div class="grid grid-cols-2 gap-3">
          ${card(second, 2)}
          ${card(third, 3)}
        </div>
      </div>

      <!-- Desktop: #2 | #1 (elevato) | #3 -->
      <div class="hidden sm:grid grid-cols-3 gap-4 items-end">
        ${card(second, 2)}
        ${card(first, 1, true)}
        ${card(third, 3)}
      </div>
    `;
  }

  // ── Ranking Table (CSS Grid, fedele al React Figma) ────────

  private renderRankingTable(): string {
    const players = this.getSortedPlayers();
    const todayDeltas = this.getTodayEloDeltas();
    const selectedPlayerId = Number(localStorage.getItem('biliardino_player_id') || 0);

    const todayRankDeltas = this.getTodayRankDeltas();

    const rows = players.map((p, idx) =>
      this.renderRankingRow(p, idx, players.length, todayDeltas, todayRankDeltas, selectedPlayerId, this.getRoleIndex())
    ).join('');

    const emptyState = players.length === 0
      ? `
      <div class="text-center py-12"
           style="color:rgba(255,255,255,0.3); font-family:var(--font-ui); letter-spacing:0.1em; font-size:13px">
        NESSUN GIOCATORE TROVATO
      </div>
    `
      : '';

    return `
      <div class="rounded-xl"
           style="background:rgba(15,42,32,0.75); border:1px solid rgba(255,255,255,0.08); backdrop-filter:blur(8px)">

        <!-- Header unificato responsive -->
        <div class="sort-header-row flex items-center gap-2 sm:gap-3 px-3 sm:px-4 lg:px-5 py-2.5 overflow-hidden rounded-t-xl"
             style="background:rgba(10,25,18,0.8); border-bottom:1px solid rgba(255,215,0,0.2); font-family:var(--font-ui); font-size:10px; letter-spacing:0.12em; color:rgba(255,215,0,0.7)">
          <div class="sort-header cursor-pointer flex-none w-7 sm:w-9 text-center" data-sort-key="rank" data-label="#">#</div>
          <div class="sort-header cursor-pointer flex-1" data-sort-key="name" data-label="GIOCATORE">GIOCATORE</div>
          <div class="sort-header cursor-pointer flex-none w-14 sm:w-[96px]" data-sort-key="elo" data-label="ELO">ELO</div>
          <div class="sort-header cursor-pointer hidden sm:block flex-none w-10 lg:w-12 text-center" data-sort-key="matches" data-label="MATCH">MATCH</div>
          <div class="hidden lg:block flex-none w-[88px]">V / S</div>
          <div class="sort-header cursor-pointer flex-none w-10 sm:w-[88px]" data-sort-key="winrate" data-label="WIN RATE">WR</div>
          <div class="hidden lg:block flex-none w-[64px] text-center">RUOLO</div>
          <div class="hidden lg:block flex-none w-[60px]">G/S</div>
          <div class="hidden sm:block flex-none w-[80px]">FORMA</div>
        </div>

        <!-- Rows -->
        <div id="ranking-tbody">
          ${rows}
          ${emptyState}
        </div>
      </div>
    `;
  }

  private renderRankingRow(
    player: IPlayer,
    idx: number,
    total: number,
    todayDeltas: Map<number, { delta: number; matches: number }>,
    rankDeltas: Map<number, number>,
    selectedPlayerId: number,
    roleForDisplay: 0 | 1 | null
  ): string {
    const rank = this.getPlayerRank(player);

    // For roleForDisplay, use specific role or best role (for overall display)
    const displayedElo = roleForDisplay === null ? player.elo[player.bestRole] : player.elo[roleForDisplay];
    const elo = Math.round(displayedElo);
    const playerClass = roleForDisplay === null ? player.class[player.bestRole] : player.class[roleForDisplay];
    const color = CLASS_COLORS[playerClass] ?? '#8B7D6B';
    const wins = roleForDisplay === null ? (player.wins[0] + player.wins[1]) : player.wins[roleForDisplay];
    const matches = roleForDisplay === null ? (player.matches[0] + player.matches[1]) : player.matches[roleForDisplay];
    const losses = matches - wins;
    const winRate = matches > 0 ? Math.round((wins / matches) * 100) : 0;
    const wrColor = winRate >= 60 ? '#4ADE80' : winRate >= 45 ? '#FFD700' : '#F87171';

    // Today delta badge
    const todayInfo = todayDeltas.get(player.id);
    const todayDelta = todayInfo?.delta ?? 0;
    const todayMatches = todayInfo?.matches ?? 0;
    let todayBadge = '';
    if (todayMatches > 0) {
      const rounded = Math.round(todayDelta);
      if (rounded > 0) todayBadge = `<span class="font-body text-xs" style="color:var(--color-win)"> +${rounded}</span>`;
      else if (rounded < 0) todayBadge = `<span class="font-body text-xs" style="color:var(--color-loss)"> ${rounded}</span>`;
      else todayBadge = `<span class="font-body text-xs" style="color:rgba(255,255,255,0.3)"> =</span>`;
    }
    // ── Rank delta — icona freccia, no box ───────────────
    const rankDelta = rankDeltas.get(player.id);
    let rankDeltaBadge = '';
    if (rankDelta !== undefined && rankDelta !== 0) {
      const arrowIcon = rankDelta > 0 ? 'arrow-up' : 'arrow-down';
      const arrowColor = rankDelta > 0 ? '#4ADE80' : '#F87171';
      const arrowVal = Math.abs(rankDelta);
      rankDeltaBadge = `
        <div class="inline-flex items-center gap-0.5 mt-0.5">
          <i data-lucide="${arrowIcon}" style="width:12px;height:12px;color:${arrowColor};flex-shrink:0"></i>
          <span style="font-size:12px;color:${arrowColor};font-family:var(--font-ui);font-weight:700;line-height:1">${arrowVal}</span>
        </div>`;
    }

    const matchesForRank = roleForDisplay === null ? player.matches[player.bestRole] : player.matches[roleForDisplay];
    const hasEnoughMatches = matchesForRank >= MatchesToRank;
    const rankDisplay = !hasEnoughMatches
      ? `<div class="flex flex-col items-center gap-0.5"><span style="font-family:var(--font-ui);font-size:14px;color:rgba(255,255,255,0.2)">\u2014</span></div>`
      : rank <= 3
        ? `<div class="flex flex-col items-center gap-0.5"><span style="font-size:${rank === 1 ? '18px' : '16px'}">${MEDALS[rank]}</span>${rankDeltaBadge}</div>`
        : `<div class="flex flex-col items-center gap-0.5"><span style="font-family:var(--font-display);font-size:16px;color:rgba(255,255,255,0.5)">${rank}</span>${rankDeltaBadge}</div>`;

    // ── Role: icona + % su una riga sola ─────────────────
    const roleCell = renderRoleBadge({ playerRole: player.role, defenceMatches: player.matches[0], attackMatches: player.matches[1], size: 'base' });

    const isOverall = roleForDisplay === null;
    const isBest = (r: 0 | 1) => player.bestRole === r;
    const opacity = (r: 0 | 1) => isBest(r) ? '1' : '0.5';
    const fw = (r: 0 | 1) => isBest(r) ? '600' : '400';
    const noRole = (r: 0 | 1) => player.matches[r] === 0;
    const dash = `<span style="font-family:var(--font-ui);font-size:12px;color:rgba(255,255,255,0.2)">—</span>`;

    // ── Matches cell ──────────────────────────────────────
    const matchesCell = isOverall
      ? `
        <div class="flex flex-col gap-0.5 text-center">
          <div style="opacity:${opacity(0)}">${noRole(0) ? dash : `<span style="font-family:var(--font-ui);font-size:13px;color:rgba(255,255,255,0.7);font-weight:${fw(0)}">${player.matches[0]}</span>`}</div>
          <div style="opacity:${opacity(1)}">${noRole(1) ? dash : `<span style="font-family:var(--font-ui);font-size:13px;color:rgba(255,255,255,0.7);font-weight:${fw(1)}">${player.matches[1]}</span>`}</div>
        </div>`
      : `<span style="font-family:var(--font-ui);font-size:14px;color:rgba(255,255,255,0.7)">${matches}</span>`;

    // ── V/S cell ──────────────────────────────────────────
    const winLoss = isOverall
      ? `
        <div class="flex flex-col gap-0.5">
          <div class="flex items-center gap-1" style="opacity:${opacity(0)}">
            ${noRole(0) ? dash : `<span style="font-family:var(--font-ui);font-size:12px;color:#4ADE80;font-weight:${fw(0)}">${player.wins[0]}W</span><span style="color:rgba(255,255,255,0.3);font-size:11px">/</span><span style="font-family:var(--font-ui);font-size:12px;color:#F87171;font-weight:${fw(0)}">${player.matches[0] - player.wins[0]}S</span>`}
          </div>
          <div class="flex items-center gap-1" style="opacity:${opacity(1)}">
            ${noRole(1) ? dash : `<span style="font-family:var(--font-ui);font-size:12px;color:#4ADE80;font-weight:${fw(1)}">${player.wins[1]}W</span><span style="color:rgba(255,255,255,0.3);font-size:11px">/</span><span style="font-family:var(--font-ui);font-size:12px;color:#F87171;font-weight:${fw(1)}">${player.matches[1] - player.wins[1]}S</span>`}
          </div>
        </div>`
      : `
        <div class="flex items-center gap-1.5">
          <span style="font-family:var(--font-ui);font-size:14px;color:#4ADE80">${wins}W</span>
          <span style="color:rgba(255,255,255,0.3);font-size:12px">/</span>
          <span style="font-family:var(--font-ui);font-size:14px;color:#F87171">${losses}S</span>
        </div>`;

    // ── Win Rate cell ─────────────────────────────────────
    const wr0 = player.matches[0] > 0 ? Math.round((player.wins[0] / player.matches[0]) * 100) : 0;
    const wr1 = player.matches[1] > 0 ? Math.round((player.wins[1] / player.matches[1]) * 100) : 0;
    const wrc0 = wr0 >= 60 ? '#4ADE80' : wr0 >= 45 ? '#FFD700' : '#F87171';
    const wrc1 = wr1 >= 60 ? '#4ADE80' : wr1 >= 45 ? '#FFD700' : '#F87171';
    const winRateBar = isOverall
      ? `
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-1.5" style="opacity:${opacity(0)}">
            ${noRole(0) ? dash : `<div class="flex-1 h-1 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.1)"><div class="h-full rounded-full" style="width:${wr0}%;background:${wrc0}"></div></div><span style="font-family:var(--font-ui);font-size:11px;color:${wrc0};min-width:28px;font-weight:${fw(0)}">${wr0}%</span>`}
          </div>
          <div class="flex items-center gap-1.5" style="opacity:${opacity(1)}">
            ${noRole(1) ? dash : `<div class="flex-1 h-1 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.1)"><div class="h-full rounded-full" style="width:${wr1}%;background:${wrc1}"></div></div><span style="font-family:var(--font-ui);font-size:11px;color:${wrc1};min-width:28px;font-weight:${fw(1)}">${wr1}%</span>`}
          </div>
        </div>`
      : `
        <div class="flex items-center gap-2">
          <div class="flex-1 h-1.5 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.1)">
            <div class="h-full rounded-full" style="width:${winRate}%;background:${wrColor}"></div>
          </div>
          <span style="font-family:var(--font-ui);font-size:13px;color:${wrColor};min-width:36px">${winRate}%</span>
        </div>`;

    // ── Goal ratio cell ────────────────────────────────────
    const gf0 = player.goalsFor[0]; const ga0 = player.goalsAgainst[0];
    const gf1 = player.goalsFor[1]; const ga1 = player.goalsAgainst[1];
    const gr0 = ga0 > 0 ? gf0 / ga0 : (gf0 > 0 ? 99 : 0);
    const gr1 = ga1 > 0 ? gf1 / ga1 : (gf1 > 0 ? 99 : 0);
    const grFmt = (v: number): string => v === 99 ? '∞' : v.toFixed(2);
    const grc0 = gr0 >= 1.1 ? '#4ADE80' : gr0 >= 0.9 ? '#FFD700' : '#F87171';
    const grc1 = gr1 >= 1.1 ? '#4ADE80' : gr1 >= 0.9 ? '#FFD700' : '#F87171';
    const goalsCell = isOverall
      ? `
        <div class="flex flex-col gap-0.5 text-center">
          <div style="opacity:${opacity(0)}">
            ${noRole(0) ? dash : `<span style="font-family:var(--font-display);font-size:13px;color:${grc0};letter-spacing:0.04em;font-weight:${fw(0)}">${grFmt(gr0)}</span><span style="font-family:var(--font-ui);font-size:9px;color:rgba(255,255,255,0.35);display:block">${gf0} / ${ga0}</span>`}
          </div>
          <div style="opacity:${opacity(1)}">
            ${noRole(1) ? dash : `<span style="font-family:var(--font-display);font-size:13px;color:${grc1};letter-spacing:0.04em;font-weight:${fw(1)}">${grFmt(gr1)}</span><span style="font-family:var(--font-ui);font-size:9px;color:rgba(255,255,255,0.35);display:block">${gf1} / ${ga1}</span>`}
          </div>
        </div>`
      : (() => {
          const goalsFor = player.goalsFor[roleForDisplay!];
          const goalsAgainst = player.goalsAgainst[roleForDisplay!];
          const ratio = goalsAgainst > 0 ? goalsFor / goalsAgainst : (goalsFor > 0 ? 99 : 0);
          const ratioColor = ratio >= 1.1 ? '#4ADE80' : ratio >= 0.9 ? '#FFD700' : '#F87171';
          return `
            <div class="flex flex-col gap-0.5 text-center">
              <span style="font-family:var(--font-display);font-size:15px;color:${ratioColor};letter-spacing:0.05em;line-height:1">${grFmt(ratio)}</span>
              <span style="font-family:var(--font-ui);font-size:10px;color:rgba(255,255,255,0.35)">${goalsFor} / ${goalsAgainst}</span>
            </div>`;
        })();

    // ── Forma cell ────────────────────────────────────────
    const makeDots = (arr: number[], size: number) => arr.map(d =>
      `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${d > 0 ? '#4ADE80' : '#F87171'};flex-shrink:0"></div>`
    ).join('');
    const makeFormaRow = (arr: number[], r: 0 | 1) => {
      if (noRole(r)) return `<div style="opacity:${opacity(r)}">${dash}</div>`;
      const last = arr.slice(-5);
      const sum = Math.round(last.reduce((a, d) => a + d, 0));
      const fc = sum > 0 ? '#4ADE80' : sum < 0 ? '#F87171' : 'rgba(255,255,255,0.3)';
      const fs = sum > 0 ? `+${sum}` : `${sum}`;
      return `
        <div class="flex flex-col gap-0.5" style="opacity:${opacity(r)}">
          <div class="flex items-center gap-1 flex-wrap">${makeDots(last, 6)}</div>
          ${last.length > 0 ? `<span style="font-family:var(--font-ui);font-size:8px;color:${fc};white-space:nowrap;font-weight:${fw(r)}">${fs} ELO</span>` : ''}
        </div>`;
    };
    const deltaArr = roleForDisplay === null ? null : (player.matchesDelta[roleForDisplay] || []);
    const last5 = deltaArr ? deltaArr.slice(-5) : [];
    const formaEloSum = last5.reduce((acc, d) => acc + d, 0);
    const formaEloRounded = Math.round(formaEloSum);
    const formaEloColor = formaEloRounded > 0 ? '#4ADE80' : formaEloRounded < 0 ? '#F87171' : 'rgba(255,255,255,0.3)';
    const formaEloStr = formaEloRounded > 0 ? `+${formaEloRounded}` : `${formaEloRounded}`;
    const formaCell = isOverall
      ? `
        <div class="flex flex-col justify-center gap-3">
          ${makeFormaRow(player.matchesDelta[0] || [], 0)}
          ${makeFormaRow(player.matchesDelta[1] || [], 1)}
        </div>`
      : `
        <div class="flex flex-col justify-center gap-1">
          <div class="flex items-center gap-1 flex-wrap">${makeDots(last5, 7)}</div>
          ${last5.length > 0 ? `<span style="font-family:var(--font-ui);font-size:9px;color:${formaEloColor};letter-spacing:0.03em;white-space:nowrap">${formaEloStr} ELO</span>` : ''}
        </div>`;

    const isSelected = selectedPlayerId && player.id === selectedPlayerId;
    const rowBg = isSelected
      ? 'background:rgba(255,215,0,0.06); border-left:2px solid var(--color-gold)'
      : idx % 2 === 0 ? 'background:rgba(255,255,255,0.02)' : 'background:transparent';
    const borderBottom = idx < total - 1 ? 'border-bottom:1px solid rgba(255,255,255,0.05)' : '';
    const eloColor = rank <= 3 ? '#FFD700' : 'white';

    // Mobile: usa sempre il best role per WR e forma
    const mobileWr = isOverall
      ? (player.matches[player.bestRole] > 0 ? Math.round((player.wins[player.bestRole] / player.matches[player.bestRole]) * 100) : 0)
      : winRate;
    const mobileWrColor = mobileWr >= 60 ? '#4ADE80' : mobileWr >= 45 ? '#FFD700' : '#F87171';
    const mobileLast5 = (roleForDisplay === null ? player.matchesDelta[player.bestRole] : player.matchesDelta[roleForDisplay] ?? []).slice(-5);
    const mobileFormaDots = makeDots(mobileLast5, 5);
    const mobileFormaSum = Math.round(mobileLast5.reduce((a, d) => a + d, 0));
    const mobileFormaColor = mobileFormaSum > 0 ? '#4ADE80' : mobileFormaSum < 0 ? '#F87171' : 'rgba(255,255,255,0.3)';
    const mobileFormaStr = mobileFormaSum > 0 ? `+${mobileFormaSum}` : `${mobileFormaSum}`;

    // ELO cell
    const eloDesktopCell = isOverall
      ? `
        <div class="flex flex-col gap-0.5">
          <div class="flex items-center gap-1.5">
            <span style="font-family:var(--font-ui);font-size:9px;color:rgba(255,255,255,0.4);width:20px">DIF</span>
            ${noRole(0) ? dash : `<span style="font-family:var(--font-display);font-size:${player.bestRole === 0 ? '17px' : '14px'};color:${player.bestRole === 0 ? eloColor : 'rgba(255,255,255,0.5)'};letter-spacing:0.05em;font-weight:${player.bestRole === 0 ? 700 : 400}">${Math.round(player.elo[0])}</span>`}
          </div>
          <div class="flex items-center gap-1.5">
            <span style="font-family:var(--font-ui);font-size:9px;color:rgba(255,255,255,0.4);width:20px">ATT</span>
            ${noRole(1) ? dash : `<span style="font-family:var(--font-display);font-size:${player.bestRole === 1 ? '17px' : '14px'};color:${player.bestRole === 1 ? eloColor : 'rgba(255,255,255,0.5)'};letter-spacing:0.05em;font-weight:${player.bestRole === 1 ? 700 : 400}">${Math.round(player.elo[1])}</span>`}
          </div>
        </div>`
      : `<div class="flex items-baseline gap-1"><span style="font-family:var(--font-display);font-size:20px;color:${eloColor};letter-spacing:0.05em">${elo}</span>${todayBadge}</div>`;

    // Mobile: subrow — badge ruolo + pallini forma
    const mobileSubRow = `
      <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
        ${renderRoleBadge({ playerRole: player.role, defenceMatches: player.matches[0], attackMatches: player.matches[1], size: 'sm' })}
        <div class="flex items-center gap-px">${mobileFormaDots}</div>
        ${mobileLast5.length > 0 ? `<span style="font-family:var(--font-ui);font-size:7px;color:${mobileFormaColor};font-weight:600">${mobileFormaStr}</span>` : ''}
      </div>`;

    const className = playerClass >= 0 ? getClassName(playerClass) : '';
    const nameRow = (sz: 'sm' | 'base', withSubrow: boolean) => `
      <div class="flex items-center gap-3.5 min-w-0">
        <div data-tooltip="${className}">
          ${renderPlayerAvatar({ initials: getInitials(player.name), color, size: sz, playerId: player.id, playerClass: playerClass })}
        </div>
        <div class="min-w-0 flex-1 relative z-10">
          <div class="text-white group-hover:text-(--color-gold) transition-colors truncate"
               style="font-family:var(--font-ui); font-size:${sz === 'sm' ? '13px' : '14px'}; font-weight:600">
            ${player.name}
          </div>
          ${withSubrow ? mobileSubRow : ''}
        </div>
      </div>`;

    return `
      <a href="/profile/${player.id}"
         class="ranking-row group block"
         style="${rowBg}; ${borderBottom}">
        <div class="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 lg:px-5 py-2.5 sm:py-3 transition-colors hover:bg-white/5">

          <!-- RANK -->
          <div class="flex-none w-7 sm:w-9 flex flex-col items-center">${rankDisplay}</div>

          <!-- AVATAR + NOME (mobile: subrow ricco; sm+: solo nome) -->
          <div class="flex-1 min-w-0">
            <div class="sm:hidden">${nameRow('sm', true)}</div>
            <div class="hidden sm:block">${nameRow('base', false)}</div>
          </div>

          <!-- ELO -->
          <div class="flex-none w-14 sm:w-[96px]">
            <div class="sm:hidden">
              <span style="font-family:var(--font-display);font-size:16px;color:${eloColor};letter-spacing:0.04em;line-height:1">${elo}</span>
              ${todayBadge ? `<div style="line-height:1;margin-top:1px">${todayBadge}</div>` : ''}
            </div>
            <div class="hidden sm:block">${eloDesktopCell}</div>
          </div>

          <!-- MATCH (da sm) -->
          <div class="hidden sm:flex flex-none w-10 lg:w-12 justify-center">${matchesCell}</div>

          <!-- V/S (da lg) -->
          <div class="hidden lg:flex flex-none w-[88px]">${winLoss}</div>

          <!-- WIN RATE -->
          <div class="flex-none w-10 sm:w-[88px]">
            <div class="sm:hidden">
              <div style="font-family:var(--font-ui);font-size:12px;color:${mobileWrColor};font-weight:600;text-align:right">${mobileWr}%</div>
              <div class="h-1 rounded-full overflow-hidden mt-0.5" style="background:rgba(255,255,255,0.1)">
                <div class="h-full rounded-full" style="width:${mobileWr}%;background:${mobileWrColor}"></div>
              </div>
            </div>
            <div class="hidden sm:block">${winRateBar}</div>
          </div>

          <!-- RUOLO (da lg) -->
          <div class="hidden lg:flex flex-none w-[64px] justify-center">${roleCell}</div>

          <!-- G/S (da lg) -->
          <div class="hidden lg:block flex-none w-[60px]">${goalsCell}</div>

          <!-- FORMA (da sm) -->
          <div class="hidden sm:block flex-none w-[80px]">${formaCell}</div>
        </div>
      </a>
    `;
  }

  private async handlePullRefresh(): Promise<void> {
    await refreshCoreData();

    if (this.isDestroyed) return;

    await this.refreshHeroContent();
    if (this.isDestroyed) return;

    this.refreshTable();
    this.refreshRecentMatches();
    this.updateSortIndicators();
  }

  // ── Dynamic Updates ─────────────────────────────────────────

  private async refreshHeroContent(): Promise<void> {
    const heroSlot = this.$('#leaderboard-hero-slot');
    if (!heroSlot) return;

    let runningMatch;
    try {
      runningMatch = await fetchRunningMatch();
    } catch {
      runningMatch = null;
    }

    // Keep the initial podium/static hero when there is no live running match.
    if (!runningMatch) return;

    if (this.isDestroyed) return;

    const nextHtml = this.renderLiveMatch(runningMatch);
    if (!nextHtml) return;

    if (this.heroContent === 'live-match' && heroSlot.innerHTML.trim() === nextHtml.trim()) {
      return;
    }

    this.heroContent = 'live-match';
    heroSlot.setAttribute('data-hero-content', 'live-match');
    heroSlot.innerHTML = nextHtml;
    refreshIcons();

    gsap.fromTo(
      heroSlot,
      { opacity: 0.92, y: 4 },
      { opacity: 1, y: 0, duration: 0.2, ease: 'power2.out', clearProps: 'opacity,transform' }
    );
  }

  private refreshPodium(): void {
    const heroSlot = this.$('#leaderboard-hero-slot');
    if (!heroSlot || heroSlot.getAttribute('data-hero-content') === 'live-match') return;

    heroSlot.innerHTML = this.renderPodium();
    refreshIcons();
    gsap.from('.podium-card', { scale: 0.9, y: 12, stagger: 0.08, duration: 0.35, ease: 'back.out(1.4)', clearProps: 'transform' });
  }

  private refreshTable(): void {
    const tbody = this.$('#ranking-tbody');
    if (!tbody) return;

    const players = this.getSortedPlayers();
    const todayDeltas = this.getTodayEloDeltas();
    const todayRankDeltas = this.getTodayRankDeltas();
    const selectedPlayerId = Number(localStorage.getItem('biliardino_player_id') || 0);

    if (players.length === 0) {
      tbody.innerHTML = `
        <div class="text-center py-12"
             style="color:rgba(255,255,255,0.3); font-family:var(--font-ui); letter-spacing:0.1em; font-size:13px">
          NESSUN GIOCATORE TROVATO
        </div>
      `;
      return;
    }

    tbody.innerHTML = players.map((p, idx) =>
      this.renderRankingRow(p, idx, players.length, todayDeltas, todayRankDeltas, selectedPlayerId, this.getRoleIndex())
    ).join('');

    refreshIcons();
  }

  private refreshRecentMatches(): void {
    const historySlot = this.$('#leaderboard-history-slot');
    if (!historySlot) return;

    if (this.matchHistory) {
      this.matchHistory.destroy();
      this.matchHistory = null;
    }

    const selectedPlayerId = Number(localStorage.getItem('biliardino_player_id') || 0);
    historySlot.innerHTML = renderMatchHistory({
      matches: getAllMatches(),
      limit: RECENT_MATCHES_COUNT,
      selectedPlayerId
    });

    this.matchHistory = new MatchHistoryComponent();
    this.matchHistory.mount(historySlot);

    refreshIcons();
  }

  private updateLeaderboardSelector(): void {
    const buttons = this.$$('[data-leaderboard]');
    for (const btn of buttons) {
      const htmlBtn = btn as HTMLButtonElement;
      const key = htmlBtn.dataset.leaderboard as LeaderboardType | undefined;
      if (!key) continue;
      if (this.currentLeaderboard === key) {
        htmlBtn.style.background = 'linear-gradient(135deg,var(--color-gold),var(--color-gold-secondary))';
        htmlBtn.style.color = 'var(--color-bg-deep)';
        htmlBtn.style.fontWeight = '700';
        htmlBtn.style.boxShadow = '0 2px 12px rgba(255,215,0,0.25)';
        htmlBtn.style.border = '1px solid transparent';
      } else {
        htmlBtn.style.background = 'transparent';
        htmlBtn.style.color = 'var(--color-text-muted)';
        htmlBtn.style.fontWeight = 'normal';
        htmlBtn.style.boxShadow = 'none';
        htmlBtn.style.border = '1px solid transparent';
      }
    }
    refreshIcons();
  }

  private updateSortIndicators(): void {
    const headers = this.$$('.sort-header');
    for (const th of headers) {
      const el = th as HTMLElement;
      const key = el.dataset.sortKey;
      if (!key) continue;
      const label = el.dataset.label ?? el.textContent?.replace(/[↑↓]/g, '').trim() ?? '';
      if (this.sortKey === key) {
        el.textContent = `${label} ${this.sortAsc ? '↑' : '↓'}`;
        el.style.color = 'var(--color-gold)';
      } else {
        el.textContent = label;
        el.style.color = '';
      }
    }
  }
}

export default LeaderboardPage;
