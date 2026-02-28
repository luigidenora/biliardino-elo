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

import { BASE_PATH } from '@/config/env.config';
import { expectedScore, getMatchPlayerElo } from '@/services/elo.service';
import { getAllMatches } from '@/services/match.service';
import { getAllPlayers, getBonusK, getPlayerById, getRank } from '@/services/player.service';
import { fetchRunningMatch } from '@/services/repository.service';
import { formatDate } from '@/utils/format-date.util';
import { getClassName } from '@/utils/get-class-name.util';
import { getDisplayElo } from '@/utils/get-display-elo.util';
import gsap from 'gsap';
import { Component } from '../components/component.base';
import { getInitials, renderPlayerAvatar } from '../components/player-avatar.component';
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

const RECENT_MATCHES_COUNT = 30;

class LeaderboardPage extends Component {
  private sortKey: SortKey = 'rank';
  private sortAsc = false;

  async render(): Promise<string> {
    let runningMatch;
    try { runningMatch = await fetchRunningMatch(); } catch { runningMatch = null; }
    const hasMatch = !!runningMatch;
    return `
      <div class="space-y-5 md:space-y-6" id="leaderboard-page">
        ${this.renderPageHeader()}
        ${this.renderReminderBanner()}
        ${this.renderIdentityBanner()}
        ${this.renderLiveMatch(runningMatch ?? null)}
        ${hasMatch ? '' : this.renderPodium()}
        ${this.renderRankingTable()}
        ${this.renderRecentMatches()}
      </div>
    `;
  }

  override mount(): void {
    refreshIcons();

    // Identity banner CTA
    document.getElementById('identity-banner-btn')?.addEventListener('click', () => {
      userDropdown.open();
    });

    // Bind sortable headers
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

    // GSAP animations — header + components (parent #app-content handles page fade)
    gsap.from('#leaderboard-page .page-header', { opacity: 0, y: -20, duration: 0.4, ease: 'power2.out' });
    gsap.from('.podium-card', { scale: 0.9, y: 12, stagger: 0.1, duration: 0.45, ease: 'back.out(1.4)', clearProps: 'transform' });
    gsap.from('.stat-card-new', { y: 15, stagger: 0.08, duration: 0.3, ease: 'power2.out', delay: 0.1 });
    gsap.from('.ranking-row', { x: -10, stagger: 0.03, duration: 0.25, ease: 'power2.out', delay: 0.3 });
    gsap.from('.match-row', { x: -10, stagger: 0.03, duration: 0.25, ease: 'power2.out', delay: 0.4 });
  }

  override destroy(): void { }

  // ── Helpers ───────────────────────────────────────────────

  private getAllRankedPlayers(): IPlayer[] {
    return getAllPlayers().filter(p => p.matches > 0);
  }

  private getSortedPlayers(): IPlayer[] {
    const filtered = [...this.getAllRankedPlayers()];

    const { sortKey, sortAsc } = this;
    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'rank':
          cmp = getRank(a.id) - getRank(b.id);
          break;
        case 'name': cmp = a.name.localeCompare(b.name);
          break;
        case 'elo': cmp = b.elo - a.elo;
          break;
        case 'matches': cmp = b.matches - a.matches;
          break;
        case 'winrate': {
          const aR = a.matches > 0 ? (a.wins || 0) / a.matches : 0;
          const bR = b.matches > 0 ? (b.wins || 0) / b.matches : 0;
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

  // ── Section Renderers ──────────────────────────────────────

  private renderPageHeader(): string {
    return `
      <div class="page-header flex items-center gap-3">
        <i data-lucide="trophy" class="text-[var(--color-gold)]"
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
                style="background:linear-gradient(135deg,#FFD700,#F0A500); color:#0F2A20; letter-spacing:0.06em">
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

      const avgEloA = Math.round((getMatchPlayerElo(defA, true) + getMatchPlayerElo(attA, false)) / 2);
      const avgEloB = Math.round((getMatchPlayerElo(defB, true) + getMatchPlayerElo(attB, false)) / 2);
      const winProbA = expectedScore(avgEloA, avgEloB);
      const winProbB = 1 - winProbA;
      const isLive = this.isLiveNow();

      const renderLivePlayer = (p: IPlayer, role: string): string => {
        const color = CLASS_COLORS[p.class] ?? '#8B7D6B';
        return `
          <a href="/profile/${p.id}" class="flex items-center gap-2 hover:bg-white/5 rounded-lg p-1.5 transition-colors">
            ${renderPlayerAvatar({ initials: getInitials(p.name), color, size: 'sm', playerId: p.id })}
            <div class="min-w-0">
              <div class="text-white font-ui text-xs truncate">${p.name}</div>
              <div class="font-body" style="font-size:10px; color:rgba(255,255,255,0.4)">${role} · ${Math.round(getMatchPlayerElo(p, role === 'DIF'))}</div>
            </div>
          </a>
        `;
      };

      return `
        <div class="glass-card-gold rounded-xl overflow-hidden">
          <div class="px-4 md:px-5 py-3 flex items-center gap-2"
               style="background:rgba(10,25,18,0.8); border-bottom:1px solid var(--glass-border-gold)">
            ${isLive ? '<div class="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div>' : ''}
            <span class="font-ui" style="font-size:13px; color:var(--color-gold); letter-spacing:0.1em">
              ${isLive ? 'PARTITA IN CORSO' : 'PROSSIMA PARTITA'}
            </span>
          </div>
          <div class="p-4 md:p-5">
            <div class="flex items-center justify-between gap-4">
              <div class="flex-1">
                <div class="font-ui text-xs mb-2" style="color:rgba(255,255,255,0.9); letter-spacing:0.1em">TEAM BIANCO</div>
                <div class="space-y-1">
                  ${renderLivePlayer(defA, 'DIF')}
                  ${renderLivePlayer(attA, 'ATT')}
                </div>
                <div class="mt-2 font-ui text-xs" style="color:rgba(255,255,255,0.4)">
                  ELO: <span style="color:rgba(255,255,255,0.9)">${avgEloA}</span>
                </div>
              </div>
              <div class="text-center shrink-0">
                <div class="font-display text-xl mb-2" style="color:var(--color-gold)">VS</div>
                <div class="space-y-1">
                  <div class="font-display text-sm" style="color:rgba(255,255,255,0.9)">${(winProbA * 100).toFixed(1)}%</div>
                  <div class="flex rounded-full overflow-hidden h-1.5 w-16">
                    <div style="width:${winProbA * 100}%; background:rgba(255,255,255,0.75)"></div>
                    <div style="width:${winProbB * 100}%; background:var(--color-team-red)"></div>
                  </div>
                  <div class="font-display text-sm" style="color:var(--color-team-red)">${(winProbB * 100).toFixed(1)}%</div>
                </div>
              </div>
              <div class="flex-1 text-right">
                <div class="font-ui text-xs mb-2" style="color:var(--color-team-red); letter-spacing:0.1em">TEAM ROSSO</div>
                <div class="space-y-1">
                  ${renderLivePlayer(defB, 'DIF')}
                  ${renderLivePlayer(attB, 'ATT')}
                </div>
                <div class="mt-2 font-ui text-xs" style="color:rgba(255,255,255,0.4)">
                  ELO: <span style="color:var(--color-team-red)">${avgEloB}</span>
                </div>
              </div>
            </div>
          </div>
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

  // ── Podium (fedele al React Figma) ──────────────────────────

  private renderPodium(): string {
    const players = this.getAllRankedPlayers()
      .sort((a, b) => getRank(a.id) - getRank(b.id));

    const top3 = players.filter(p => getRank(p.id) <= 3).slice(0, 3);
    if (top3.length < 3) return '';

    const first = top3.find(p => getRank(p.id) === 1)!;
    const second = top3.find(p => getRank(p.id) === 2)!;
    const third = top3.find(p => getRank(p.id) === 3)!;

    const card = (p: IPlayer, rank: number, elevated = false): string => {
      const elo = getDisplayElo(p);
      const wins = p.wins || 0;
      const winRate = p.matches > 0 ? Math.round((wins / p.matches) * 100) : 0;
      const eloColor = MEDAL_ELO_COLOR[rank] ?? '#8B7D6B';
      const border = MEDAL_BORDER[rank] ?? 'rgba(255,255,255,0.08)';
      const shadow = MEDAL_SHADOW[rank] ?? 'none';
      const medal = MEDALS[rank];
      const color = CLASS_COLORS[p.class] ?? '#8B7D6B';
      const initials = getInitials(p.name);
      const elevatedStyle = elevated ? 'min-height:290px' : '';
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
           class="podium-card group flex flex-col items-center p-4 md:p-5 gap-2 md:gap-3 rounded-xl"
           style="
             ${elevatedStyle};
             background: ${bg};
             border: 1px solid ${border};
             box-shadow: ${shadow};
             backdrop-filter: blur(8px);
           "
        >
        
        <!-- Avatar -->
        <div class="relative mb-7">
        ${renderPlayerAvatar({ initials, color, size: 'lg', playerId: p.id })}
          <!-- Medal emoji -->
          <span class="absolute -bottom-7 left-1/2 -translate-x-1/2" style="font-size:28px; line-height:1">${medal}</span>
          </div>
            
          <!-- Name -->
          <div class="text-center flex flex-col items-center gap-1">
            <div class="text-white"
                 style="font-family:var(--font-ui); font-size:15px; font-weight:600">
              ${p.name}
            </div>
          </div>

          <!-- ELO -->
          <div class="text-center">
            <div style="font-family:var(--font-display); font-size:26px; color:${eloColor}; letter-spacing:0.1em; line-height:1">
              ${elo}
            </div>
            <div style="font-family:var(--font-ui); font-size:10px; color:rgba(255,255,255,0.4); letter-spacing:0.1em">
              ELO RATING
            </div>
          </div>

          <!-- Stats: WR | Matches -->
          <div class="flex gap-4 text-center">
            <div>
              <div style="font-family:var(--font-ui); font-size:14px; color:white">${winRate}%</div>
              <div style="font-size:10px; color:rgba(255,255,255,0.4); font-family:var(--font-ui)">WIN RATE</div>
            </div>
            <div style="width:1px; background:rgba(255,255,255,0.15)"></div>
            <div>
              <div style="font-family:var(--font-ui); font-size:14px; color:white">${p.matches}</div>
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

    const rows = players.map((p, idx) =>
      this.renderRankingRow(p, idx, players.length, todayDeltas, selectedPlayerId)
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
      <div class="rounded-xl overflow-hidden"
           style="background:rgba(15,42,32,0.75); border:1px solid rgba(255,255,255,0.08); backdrop-filter:blur(8px)">

        <!-- Desktop header -->
        <div class="hidden md:grid gap-3 px-5 py-3 sort-header-row"
             style="
               grid-template-columns: 48px 1fr 90px 90px 110px 90px;
               background: rgba(10,25,18,0.8);
               border-bottom: 1px solid rgba(255,215,0,0.2);
             ">
          <div class="sort-header cursor-pointer hover:text-(--color-gold) transition-colors"
               data-sort-key="rank"
               style="font-family:var(--font-ui); font-size:11px; letter-spacing:0.12em; color:rgba(255,215,0,0.7)">#</div>
          <div class="sort-header cursor-pointer hover:text-(--color-gold) transition-colors"
               data-sort-key="name"
               style="font-family:var(--font-ui); font-size:11px; letter-spacing:0.12em; color:rgba(255,215,0,0.7)">GIOCATORE</div>
          <div class="sort-header cursor-pointer hover:text-(--color-gold) transition-colors"
               data-sort-key="elo"
               style="font-family:var(--font-ui); font-size:11px; letter-spacing:0.12em; color:rgba(255,215,0,0.7)">ELO</div>
          <div class="sort-header cursor-pointer hover:text-(--color-gold) transition-colors"
               data-sort-key="matches"
               style="font-family:var(--font-ui); font-size:11px; letter-spacing:0.12em; color:rgba(255,215,0,0.7)">MATCH</div>
          <div style="font-family:var(--font-ui); font-size:11px; letter-spacing:0.12em; color:rgba(255,215,0,0.7)">V / S</div>
          <div class="sort-header cursor-pointer hover:text-(--color-gold) transition-colors"
               data-sort-key="winrate"
               style="font-family:var(--font-ui); font-size:11px; letter-spacing:0.12em; color:rgba(255,215,0,0.7)">WIN RATE</div>
        </div>

        <!-- Mobile header -->
        <div class="md:hidden grid gap-2 px-4 py-2.5"
             style="
               grid-template-columns: 36px 1fr 52px 48px;
               background: rgba(10,25,18,0.8);
               border-bottom: 1px solid rgba(255,215,0,0.2);
             ">
          ${['#', 'GIOCATORE', 'ELO', 'WR'].map(col => `
            <div style="font-family:var(--font-ui); font-size:10px; letter-spacing:0.12em; color:rgba(255,215,0,0.7)">${col}</div>
          `).join('')}
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
    selectedPlayerId: number
  ): string {
    const rank = getRank(player.id);
    const elo = getDisplayElo(player);
    const color = CLASS_COLORS[player.class] ?? '#8B7D6B';
    const wins = player.wins || 0;
    const losses = player.matches - wins;
    const winRate = player.matches > 0 ? Math.round((wins / player.matches) * 100) : 0;
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

    const rankDisplay = rank <= 3
      ? `<span style="font-size:${rank === 1 ? '18px' : '16px'}">${MEDALS[rank]}</span>`
      : `<span style="font-family:var(--font-display); font-size:16px; color:rgba(255,255,255,0.5)">${rank}</span>`;

    const isSelected = selectedPlayerId && player.id === selectedPlayerId;
    const rowBg = isSelected
      ? 'background:rgba(255,215,0,0.06); border-left:2px solid var(--color-gold)'
      : idx % 2 === 0 ? 'background:rgba(255,255,255,0.02)' : 'background:transparent';
    const borderBottom = idx < total - 1 ? 'border-bottom:1px solid rgba(255,255,255,0.05)' : '';
    const eloColor = rank <= 3 ? '#FFD700' : 'white';

    const displayName = player.name;

    const classBadgeDesktop = player.class >= 0
      ? `<img src="${BASE_PATH}class/${player.class}.webp" alt="${getClassName(player.class)}"
              title="${getClassName(player.class)}"
              class="shrink-0" style="width:40px;height:40px;object-fit:contain" />`
      : '<div class="shrink-0" style="width:40px;height:40px"></div>';
    const classBadgeMobile = player.class >= 0
      ? `<img src="${BASE_PATH}class/${player.class}.webp" alt="${getClassName(player.class)}"
              title="${getClassName(player.class)}"
              class="shrink-0" style="width:40px;height:40px;object-fit:contain" />`
      : '<div class="shrink-0" style="width:40px;height:40px"></div>';

    const avatarAndNameDesktop = `
      <div class="flex items-center gap-3 min-w-0">
        ${classBadgeDesktop}
        ${renderPlayerAvatar({ initials: getInitials(player.name), color, size: 'base', playerId: player.id })}
        <div class="min-w-0">
          <div class="text-white group-hover:text-(--color-gold) transition-colors truncate"
               style="font-family:var(--font-ui); font-size:14px; font-weight:600">
            ${displayName}
          </div>
        </div>
      </div>
    `;

    const avatarAndNameMobile = `
      <div class="flex items-center gap-1.5 min-w-0">
        ${classBadgeMobile}
        ${renderPlayerAvatar({ initials: getInitials(player.name), color, size: 'base', playerId: player.id })}
        <div class="min-w-0">
          <div class="text-white group-hover:text-(--color-gold) transition-colors truncate"
               style="font-family:var(--font-ui); font-size:13px; font-weight:600">
            ${displayName}
          </div>
        </div>
      </div>
    `;

    const winRateBar = `
      <div class="flex items-center gap-2">
        <div class="flex-1 h-1.5 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.1)">
          <div class="h-full rounded-full" style="width:${winRate}%; background:${wrColor}"></div>
        </div>
        <span style="font-family:var(--font-ui); font-size:13px; color:${wrColor}; min-width:36px">${winRate}%</span>
      </div>
    `;

    const winLoss = `
      <div class="flex items-center gap-1.5">
        <span style="font-family:var(--font-ui); font-size:14px; color:#4ADE80">${wins}W</span>
        <span style="color:rgba(255,255,255,0.3); font-size:12px">/</span>
        <span style="font-family:var(--font-ui); font-size:14px; color:#F87171">${losses}S</span>
      </div>
    `;

    return `
      <a href="/profile/${player.id}"
         class="ranking-row group block"
         style="${rowBg}; ${borderBottom}">

        <!-- Desktop row -->
        <div class="hidden md:grid gap-3 px-5 py-3.5 items-center transition-all duration-200 hover:bg-white/5"
             style="grid-template-columns: 48px 1fr 90px 90px 110px 90px">
          <div>${rankDisplay}</div>
          <div>${avatarAndNameDesktop}</div>
          <div>
            <span style="font-family:var(--font-display); font-size:20px; color:${eloColor}; letter-spacing:0.05em">${elo}</span>${todayBadge}
          </div>
          <div style="font-family:var(--font-ui); font-size:14px; color:rgba(255,255,255,0.7)">${player.matches}</div>
          <div>${winLoss}</div>
          <div>${winRateBar}</div>
        </div>

        <!-- Mobile row -->
        <div class="md:hidden grid gap-2 px-4 py-3 items-center transition-all duration-200 hover:bg-white/5"
             style="grid-template-columns: 36px 1fr 52px 48px">
          <div>${rankDisplay}</div>
          <div class="min-w-0 overflow-hidden">${avatarAndNameMobile}</div>
          <div>
            <span style="font-family:var(--font-display); font-size:17px; color:${eloColor}">${elo}</span>${todayBadge}
          </div>
          <div>
            <div style="font-family:var(--font-ui); font-size:13px; color:${wrColor}">${winRate}%</div>
            <div class="h-1 rounded-full overflow-hidden mt-0.5" style="background:rgba(255,255,255,0.1); max-width:42px">
              <div class="h-full rounded-full" style="width:${winRate}%; background:${wrColor}"></div>
            </div>
          </div>
        </div>
      </a>
    `;
  }

  // ── Recent Matches ─────────────────────────────────────────

  private renderRecentMatches(): string {
    const allMatches = getAllMatches();
    const matches = allMatches.toSorted((a, b) => b.createdAt - a.createdAt).slice(0, RECENT_MATCHES_COUNT);
    if (matches.length === 0) return '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rows = matches.map((m) => {
      const matchDate = new Date(m.createdAt);
      matchDate.setHours(0, 0, 0, 0);
      const isToday = matchDate.getTime() === today.getTime();

      const ad = getPlayerById(m.teamA.defence);
      const aa = getPlayerById(m.teamA.attack);
      const bd = getPlayerById(m.teamB.defence);
      const ba = getPlayerById(m.teamB.attack);

      const teamANames = `${ad?.name ?? '?'} & ${aa?.name ?? '?'}`;
      const teamBNames = `${bd?.name ?? '?'} & ${ba?.name ?? '?'}`;

      let scoreA = m.score[0], scoreB = m.score[1];
      let tA = teamANames, tB = teamBNames;
      let eloA = Math.round(m.teamELO[0]), eloB = Math.round(m.teamELO[1]);
      let deltaA = Math.round(m.deltaELO[0]), deltaB = Math.round(m.deltaELO[1]);
      let expA = m.expectedScore[0], expB = m.expectedScore[1];
      const aWon = scoreA > scoreB;

      if (!aWon) {
        [tA, tB] = [tB, tA];
        [eloA, eloB] = [eloB, eloA];
        [deltaA, deltaB] = [deltaB, deltaA];
        [expA, expB] = [expB, expA];
        [scoreA, scoreB] = [scoreB, scoreA];
      }

      const avgRating = (eloA + eloB) / 2;
      let ratingBorder = 'rgba(255,255,255,0.06)';
      if (avgRating >= 1150) ratingBorder = 'rgba(74,144,217,0.4)';
      else if (avgRating >= 1100) ratingBorder = 'rgba(74,144,217,0.2)';
      else if (avgRating <= 900) ratingBorder = 'rgba(229,62,62,0.3)';

      const dAColor = deltaA >= 0 ? 'var(--color-win)' : 'var(--color-loss)';
      const dBColor = deltaB >= 0 ? 'var(--color-win)' : 'var(--color-loss)';

      return `
        <div class="match-row flex items-center justify-between p-2.5 md:p-3 rounded-lg"
             style="background:rgba(255,255,255,0.03); border:1px solid ${ratingBorder}">
          <div class="flex items-center gap-2 min-w-0 flex-1">
            ${isToday
          ? '<div class="w-2 h-2 rounded-full shrink-0" style="background:var(--color-team-blue); box-shadow:0 0 4px var(--color-team-blue)"></div>'
          : '<div class="w-2"></div>'
        }
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-ui text-xs" style="color:var(--color-win)">${tA}</span>
                <span class="font-display text-sm" style="color:rgba(255,255,255,0.7)">${scoreA} - ${scoreB}</span>
                <span class="font-ui text-xs" style="color:var(--color-loss)">${tB}</span>
              </div>
              <div class="flex items-center gap-3 mt-0.5">
                <span class="font-body" style="font-size:10px; color:rgba(255,255,255,0.3)">${formatDate(m.createdAt)}</span>
                <span class="font-body" style="font-size:10px; color:rgba(255,255,255,0.25)">
                  ${Math.round(expA * 100)}% vs ${Math.round(expB * 100)}%
                </span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-3 shrink-0 ml-2">
            <div class="text-right">
              <div class="font-display text-sm" style="color:rgba(255,255,255,0.5)">${Math.round(avgRating)}</div>
              <div class="font-body" style="font-size:10px; color:rgba(255,255,255,0.25)">avg</div>
            </div>
            <div class="text-right">
              <span class="font-body text-xs" style="color:${dAColor}">${deltaA >= 0 ? '+' : ''}${deltaA}</span>
              <span class="font-body text-xs" style="color:rgba(255,255,255,0.2)"> / </span>
              <span class="font-body text-xs" style="color:${dBColor}">${deltaB >= 0 ? '+' : ''}${deltaB}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="glass-card rounded-xl overflow-hidden">
        <div class="px-4 md:px-5 py-3 flex items-center justify-between"
             style="background:rgba(10,25,18,0.8); border-bottom:1px solid var(--glass-border-gold)">
          <div class="flex items-center gap-2">
            <i data-lucide="target" style="width:14px;height:14px;color:var(--color-gold)"></i>
            <span class="font-ui" style="font-size:13px; color:var(--color-gold); letter-spacing:0.1em">
              ULTIME PARTITE
            </span>
          </div>
          <span class="font-ui" style="font-size:11px; color:rgba(255,255,255,0.4)">
            ${matches.length} partite
          </span>
        </div>
        <div class="p-3 space-y-2 overflow-y-auto" style="max-height:600px">
          ${rows}
        </div>
      </div>
    `;
  }

  // ── Dynamic Updates ─────────────────────────────────────────

  private refreshTable(): void {
    const tbody = this.$('#ranking-tbody');
    if (!tbody) return;

    const players = this.getSortedPlayers();
    const todayDeltas = this.getTodayEloDeltas();
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
      this.renderRankingRow(p, idx, players.length, todayDeltas, selectedPlayerId)
    ).join('');

    refreshIcons();
  }

  private updateSortIndicators(): void {
    const headers = this.$$('.sort-header');
    for (const th of headers) {
      const key = (th as HTMLElement).dataset.sortKey;
      if (!key) continue;
      const text = th.textContent?.replace(/[↑↓]/g, '').trim() ?? '';
      if (this.sortKey === key) {
        th.innerHTML = `${text} ${this.sortAsc ? '↑' : '↓'}`;
        (th as HTMLElement).style.color = 'var(--color-gold)';
      } else {
        th.textContent = text;
        (th as HTMLElement).style.color = '';
      }
    }
  }
}

export default LeaderboardPage;
