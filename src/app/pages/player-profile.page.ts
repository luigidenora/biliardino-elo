/**
 * PlayerProfilePage — Full-screen profile for a single player.
 *
 * Route: /profile/:id
 * Redesigned for the new design system; logic and data identical to legacy.
 * Additions: relation tables (teammates/opponents) with role filter + sort,
 * history role filter, ELO chart with moving-average and trend overlays,
 * full 6-item highlight grid (incl. by expected%), accessibility improvements.
 */

import { IMatch } from '@/models/match.interface';
import { IPlayer } from '@/models/player.interface';
import { getAllPlayers, getBonusK, getPlayerById } from '@/services/player.service';
import { getClassName } from '@/utils/get-class-name.util';
import { Chart, registerables } from 'chart.js';
import gsap from 'gsap';
import { Component } from '../components/component.base';
import { getInitials, renderPlayerAvatar } from '../components/player-avatar.component';
import { renderRoleBadge } from '../components/role-badge.component';
import { refreshIcons } from '../icons';
import { html, rawHtml } from '../utils/html-template.util';
import template from './player-profile.page.html?raw';

// ── Types ─────────────────────────────────────────────────────

type RelationSortKey = 'name' | 'matches' | 'winrate' | 'delta' | 'avgDelta';
type RoleFilter = 0 | 1 | 2; // 0=defence, 1=attack, 2=total

interface RelationRow {
  id: number;
  name: string;
  matches: number;
  wins: number;
  losses: number;
  winrate: number;
  delta: number;
  avgDelta: number;
}

// ── Constants ─────────────────────────────────────────────────

const CLASS_COLORS: Record<number, string> = {
  0: '#FFD700', 1: '#4A90D9', 2: '#27AE60', 3: '#C0C0C0', 4: '#8B7D6B'
};

function getPlayerColor(player: IPlayer): string {
  const cls = player.class[player.bestRole as 0 | 1];
  return CLASS_COLORS[cls] ?? '#FFFFFF';
}

function getRankMedal(rank: number): string {
  if (rank === 1) return '&#x1F947;';
  if (rank === 2) return '&#x1F948;';
  if (rank === 3) return '&#x1F949;';
  return '';
}

function formatShortDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

function formatFullDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

function movingAverage(data: number[], window: number): number[] {
  return data.map((_, i) => {
    const actualWindow = Math.min(window, i + 1);
    const slice = data.slice(i - actualWindow + 1, i + 1);
    return Math.round(slice.reduce((a, b) => a + b, 0) / actualWindow);
  });
}

function linearRegressionPoints(data: number[]): number[] {
  const n = data.length;
  if (n < 2) return data.slice();
  const xMean = (n - 1) / 2;
  const yMean = data.reduce((a, b) => a + b, 0) / n;
  const denom = data.reduce((acc, _, i) => acc + (i - xMean) ** 2, 0);
  const slope = denom === 0 ? 0 : data.reduce((acc, y, i) => acc + (i - xMean) * (y - yMean), 0) / denom;
  return data.map((_, i) => Math.round(yMean + slope * (i - xMean)));
}

// ── Page Component ────────────────────────────────────────────

export default class PlayerProfilePage extends Component {
  private chart: Chart | null = null;
  private radarChart: Chart | null = null;
  private radarData: number[] = [];
  private gsapCtx: gsap.Context | null = null;
  private chartRole: 0 | 1 = 0;
  private readonly showMovingAvg = true;
  private readonly showTrend = true;
  private tmSort: RelationSortKey = 'delta';
  private tmSortAsc = false;
  private oppSort: RelationSortKey = 'delta';
  private oppSortAsc = false;
  private relationFilter: RoleFilter = 2;
  private oppRelationFilter: RoleFilter = 2;
  private historyFilter: RoleFilter = 2;
  private recordSharedFilter: RoleFilter = 2;

  // ── Computed stats helpers ────────────────────────────────

  private computeBasicStats(player: IPlayer): { totalMatches: number; totalWins: number; totalLosses: number; winRate: string; winRateColor: string } {
    const totalMatches = player.matches[0] + player.matches[1];
    const totalWins = player.wins[0] + player.wins[1];
    const totalLosses = totalMatches - totalWins;
    const winRate = totalMatches > 0 ? ((totalWins / totalMatches) * 100).toFixed(1) : '0.0';
    const winRateNum = Number.parseFloat(winRate);
    const winRateColor = winRateNum >= 50
      ? 'var(--color-win)'
      : winRateNum >= 40
        ? 'var(--color-draw)'
        : 'var(--color-loss)';
    return { totalMatches, totalWins, totalLosses, winRate, winRateColor };
  }

  override render(): string {
    const id = Number(this.params.id);
    const player = getPlayerById(id);

    if (!player) {
      return `
        <div class="flex flex-col items-center justify-center py-20 text-center gap-4">
          <i data-lucide="user-x" style="width:52px;height:52px;color:var(--color-gold)"></i>
          <p class="font-display text-4xl tracking-wide" style="color:var(--color-gold)">GIOCATORE NON TROVATO</p>
          <p class="font-body text-sm" style="color:var(--color-text-secondary)">
            Il giocatore con ID ${id} non esiste.
          </p>
          <a href="/" class="btn-gold px-6 py-2.5 text-sm rounded-lg">
            TORNA ALLA CLASSIFICA
          </a>
        </div>
      `;
    }

    const color = getPlayerColor(player);
    const bestRole = player.bestRole as 0 | 1;

    // Rank
    const rankGeneral = player.rank[2];
    const rankDefence = player.rank[0];
    const rankAttack = player.rank[1];

    // Class
    const bestClass = player.class[bestRole];
    const className = bestClass >= 0 ? getClassName(bestClass) : 'Non classificato';

    // Chart default role
    this.chartRole = bestRole;

    // Radar data
    this.radarData = this.computeRadarData(player);

    // Match history — combined, sorted chronologically, then reversed (newest first)
    const combinedHistory = [...player.history[0], ...player.history[1]]
      .sort((a, b) => a.createdAt - b.createdAt)
      .reverse();

    // Relation tables (initial render with default filter=total)
    const tmRows = this.sortRelationRows(this.buildRelationRows(player.teammatesStats, 2), this.tmSort, this.tmSortAsc);
    const oppRows = this.sortRelationRows(this.buildRelationRows(player.opponentsStats, 2), this.oppSort, this.oppSortAsc);

    return html(template, {
      pageHeader: rawHtml(this.renderPageHeader()),
      playerColor: color,
      avatar: rawHtml(renderPlayerAvatar({
        initials: getInitials(player.name),
        color,
        size: 'xxl',
        playerId: id,
        playerClass: player.class[bestRole]
      })),
      rankBadge: rawHtml(rankGeneral <= 3 && rankGeneral > 0
        ? `<span class="absolute -top-1 -right-1 text-xl leading-none">${getRankMedal(rankGeneral)}</span>`
        : ''),
      playerName: player.name.toUpperCase(),
      className: className.toUpperCase(),
      rankWatermark: rankGeneral > 0 ? String(rankGeneral) : '---',
      rankGeneral: rankGeneral > 0 ? String(rankGeneral) : '---',
      rankDefence: rankDefence > 0 ? String(rankDefence) : '---',
      rankAttack: rankAttack > 0 ? String(rankAttack) : '---',
      // Chart toggle initial styles
      chartBtnDefStyle: bestRole === 0
        ? 'background:linear-gradient(135deg,var(--color-gold),var(--color-gold-secondary));color:var(--color-bg-deep);font-weight:700'
        : 'background:transparent;color:var(--color-text-muted)',
      chartBtnAttStyle: bestRole === 1
        ? 'background:linear-gradient(135deg,var(--color-gold),var(--color-gold-secondary));color:var(--color-bg-deep);font-weight:700'
        : 'background:transparent;color:var(--color-text-muted)',
      // Sections
      companionCards: rawHtml(this.renderCompanionCards(player, this.recordSharedFilter)),
      bestWorstMatches: rawHtml(this.renderBestWorstMatches(player, id, this.recordSharedFilter)),
      // Relation cards
      teammateTbody: rawHtml(this.renderRelationCards(tmRows)),
      opponentTbody: rawHtml(this.renderRelationCards(oppRows)),
      tmCount: tmRows.length,
      oppCount: oppRows.length,
      // History
      matchCount: combinedHistory.length,
      tableRows: rawHtml(this.renderTableRows(combinedHistory, id, player)),
      mobileMatchCards: rawHtml(this.renderMobileMatchCards(combinedHistory, id, player))
    });
  }

  // ── Page Header ───────────────────────────────────────────

  private renderPageHeader(): string {
    return `
      <div class="page-header flex items-center gap-3">
        <i data-lucide="circle-user" style="width:26px;height:26px;color:var(--color-gold)" aria-hidden="true"></i>
        <div>
          <h1 class="text-white font-display"
              style="font-size:clamp(28px,6vw,42px); letter-spacing:0.12em; line-height:1">
            PROFILO GIOCATORE
          </h1>
          <p class="font-ui"
             style="font-size:12px; color:var(--color-text-muted); letter-spacing:0.1em">
            STATISTICHE COMPLETE · STAGIONE 2025–2026
          </p>
        </div>
      </div>
    `;
  }

  // ── Relation Table Helpers ────────────────────────────────

  private buildRelationRows(
    statsPerRole: [{ [x: number]: any }, { [x: number]: any }],
    filter: RoleFilter
  ): RelationRow[] {
    const merged = new Map<number, { matches: number; wins: number; delta: number }>();
    const roles: Array<0 | 1> = filter === 2 ? [0, 1] : [filter];

    for (const role of roles) {
      for (const [idStr, stats] of Object.entries(statsPerRole[role])) {
        if (!stats || typeof stats !== 'object' || !('matches' in stats)) continue;
        const id = Number(idStr);
        if (!Number.isInteger(id) || id <= 0) continue;
        const s = stats as { matches: number; wins: number; delta: number };
        const existing = merged.get(id);
        if (existing) {
          existing.matches += s.matches;
          existing.wins += s.wins;
          existing.delta += s.delta;
        } else {
          merged.set(id, { matches: s.matches, wins: s.wins, delta: s.delta });
        }
      }
    }

    return Array.from(merged.entries())
      .filter(([id]) => getPlayerById(id) !== undefined)
      .map(([id, s]) => {
        const p = getPlayerById(id)!;
        return {
          id,
          name: p.name,
          matches: s.matches,
          wins: s.wins,
          losses: s.matches - s.wins,
          winrate: s.matches > 0 ? (s.wins / s.matches) * 100 : 0,
          delta: s.delta,
          avgDelta: s.matches > 0 ? s.delta / s.matches : 0
        };
      });
  }

  private sortRelationRows(rows: RelationRow[], sort: RelationSortKey, asc: boolean): RelationRow[] {
    return [...rows].sort((a, b) => {
      let diff = 0;
      switch (sort) {
        case 'name':
          diff = a.name.localeCompare(b.name);
          break;
        case 'matches':
          diff = a.matches - b.matches;
          break;
        case 'winrate':
          diff = a.winrate - b.winrate;
          break;
        case 'delta':
          diff = a.delta - b.delta;
          break;
        case 'avgDelta':
          diff = a.avgDelta - b.avgDelta;
          break;
      }
      return asc ? diff : -diff;
    });
  }

  private renderRelationCards(rows: RelationRow[]): string {
    if (rows.length === 0) {
      return `<p class="col-span-full py-6 text-center font-body text-sm"
               style="color:var(--color-text-muted)">Nessun dato disponibile</p>`;
    }

    return rows.map((r) => {
      const deltaColor = r.delta >= 0 ? 'var(--color-win)' : 'var(--color-loss)';
      const deltaSign = r.delta >= 0 ? '+' : '';
      const wrColor = r.winrate >= 50 ? 'var(--color-win)' : r.winrate >= 40 ? 'var(--color-draw)' : 'var(--color-loss)';
      const p = getPlayerById(r.id);
      const avatarHtml = p
        ? renderPlayerAvatar({ initials: getInitials(p.name), color: getPlayerColor(p), size: 'sm', playerId: r.id })
        : '';
      return `
        <a href="/profile/${r.id}"
           class="flex flex-col items-center gap-1 p-2 rounded-lg transition-all"
           style="background:rgba(255,255,255,0.03);border:1px solid var(--glass-border)">
          <div class="shrink-0 mt-1">${avatarHtml}</div>
          <p class="font-body text-[10px] text-center leading-tight w-full truncate"
             style="color:var(--color-text-secondary)">${r.name}</p>
          <div class="grid grid-cols-3 gap-0 w-full text-center border-t pt-1 mt-0.5"
               style="border-color:rgba(255,255,255,0.07)">
            <div>
              <p class="font-display text-sm leading-none"
                 style="color:var(--color-text-primary)">${r.matches}</p>
              <p class="font-ui text-[8px] uppercase"
                 style="color:var(--color-text-dim)">Match</p>
            </div>
            <div>
              <p class="font-display text-sm leading-none"
                 style="color:${wrColor}">${r.winrate.toFixed(0)}%</p>
              <p class="font-ui text-[8px] uppercase"
                 style="color:var(--color-text-dim)">WIN</p>
            </div>
            <div>
              <p class="font-display text-sm leading-none"
                 style="color:${deltaColor}">${deltaSign}${Math.round(r.delta)}</p>
              <p class="font-ui text-[8px] uppercase"
                 style="color:var(--color-text-dim)">\u0394ELO</p>
            </div>
          </div>
        </a>
      `;
    }).join('');
  }

  // ── Radar data ────────────────────────────────────────────

  private computeRadarData(player: IPlayer): number[] {
    const activePlayers = getAllPlayers().filter(p => p.matches[0] + p.matches[1] > 0);
    const totalMatches = player.matches[0] + player.matches[1];
    const totalGoalsFor = player.goalsFor[0] + player.goalsFor[1];
    const totalGoalsAgainst = player.goalsAgainst[0] + player.goalsAgainst[1];

    const maxGPM = Math.max(...activePlayers.map((p) => {
      const m = p.matches[0] + p.matches[1];
      return m > 0 ? (p.goalsFor[0] + p.goalsFor[1]) / m : 0;
    }), 1);
    const maxGAM = Math.max(...activePlayers.map((p) => {
      const m = p.matches[0] + p.matches[1];
      return m > 0 ? (p.goalsAgainst[0] + p.goalsAgainst[1]) / m : 0;
    }), 1);

    const allElos = activePlayers.map(p => p.elo[p.bestRole as 0 | 1]);
    const minElo = Math.min(...allElos);
    const maxElo = Math.max(...allElos);

    const radarGoalsFatti = totalMatches > 0
      ? Math.min((totalGoalsFor / totalMatches) / maxGPM * 100, 100)
      : 0;
    const radarGoalsSubiti = totalMatches > 0
      ? Math.max((1 - (totalGoalsAgainst / totalMatches) / maxGAM) * 100, 0)
      : 50;
    const radarAttack = player.matches[1] > 0
      ? (player.wins[1] / player.matches[1]) * 100
      : 0;
    const radarDefence = player.matches[0] > 0
      ? (player.wins[0] / player.matches[0]) * 100
      : 0;
    const worstStreak = Math.min(player.worstLossStreak[0], player.worstLossStreak[1]);
    const radarCostanza = Math.max(100 - Math.abs(worstStreak) * 10, 0);
    const playerElo = player.elo[player.bestRole as 0 | 1];
    const radarElo = maxElo > minElo ? ((playerElo - minElo) / (maxElo - minElo)) * 100 : 50;

    const allHistory = [...player.history[0], ...player.history[1]];
    let winsVsWeaker = 0;
    let totalWins = 0;
    for (const m of allHistory) {
      const teamIdx = (m.teamA.defence === player.id || m.teamA.attack === player.id) ? 0 : 1;
      if (m.deltaELO[teamIdx] > 0) {
        totalWins++;
        if (m.teamELO[teamIdx ^ 1] < m.teamELO[teamIdx]) winsVsWeaker++;
      }
    }
    const radarQualityWins = totalWins > 0
      ? Math.max((1 - winsVsWeaker / totalWins) * 100, 0)
      : 50;

    return [radarGoalsFatti, radarGoalsSubiti, radarAttack, radarDefence, radarCostanza, radarElo, radarQualityWins];
  }

  // ── Companion Cards ───────────────────────────────────────

  private renderCompanionCards(player: IPlayer, filter: RoleFilter = 2): string {
    const role: 0 | 1 = filter === 2 ? (player.bestRole as 0 | 1) : filter;

    type CardDef = { icon: string; label: string; stat: { player: number; value: number } | null; fmt: (v: number) => string; color?: string };

    // Pairs: [left, right] — rendered as 2-column grid row-by-row
    const pairs: [CardDef, CardDef][] = [
      [
        { icon: 'users', label: 'MIGLIOR COMPAGNO', stat: player.bestTeammate[role], fmt: v => `+${Math.round(v)} ELO`, color: 'var(--color-win)' },
        { icon: 'users', label: 'PEGGIOR COMPAGNO', stat: player.worstTeammate[role], fmt: v => `${Math.round(v)} ELO`, color: 'var(--color-loss)' }
      ],
      [
        { icon: 'sword', label: 'MIGLIOR AVVERSARIO', stat: player.bestOpponent[role], fmt: v => `${Math.round(v)} ELO`, color: 'var(--color-loss)' },
        { icon: 'sword', label: 'PEGGIOR AVVERSARIO', stat: player.worstOpponent[role], fmt: v => `+${Math.round(v)} ELO`, color: 'var(--color-win)' }
      ],
      [
        { icon: 'user-check', label: 'COMPAGNO FREQ.', stat: player.bestTeammateCount[role], fmt: v => `${Math.round(v)} partite` },
        { icon: 'repeat', label: 'AVVERSARIO FREQ.', stat: player.bestOpponentCount[role], fmt: v => `${Math.round(v)} partite` }
      ]
    ];

    const makeCard = (def: CardDef): string => {
      const p = def.stat ? getPlayerById(def.stat.player) : null;
      const avatar = p
        ? renderPlayerAvatar({ initials: getInitials(p.name), color: getPlayerColor(p), size: 'xs', playerId: p.id, hideFrame: true })
        : '';
      const name = p ? p.name : '—';
      const subtitle = def.stat ? def.fmt(def.stat.value) : '';
      return `
        <div class="rounded-xl p-3" style="background:rgba(0,0,0,0.25);border:1px solid var(--glass-border)">
          <div class="flex items-center gap-1.5 mb-2">
            <i data-lucide="${def.icon}" style="width:12px;height:12px;color:var(--color-text-muted)" aria-hidden="true"></i>
            <p class="font-ui text-[9px] uppercase tracking-widest" style="color:var(--color-text-muted)">${def.label}</p>
          </div>
          <div class="flex items-center gap-2">
            ${avatar ? `<div class="shrink-0">${avatar}</div>` : ''}
            <div class="min-w-0">
              <p class="font-body text-sm font-medium truncate" style="color:var(--color-text-primary)">${name}</p>
              <p class="font-body text-xs mt-0.5" style="color:${def.color ?? 'var(--color-text-secondary)'}">${subtitle}</p>
            </div>
          </div>
        </div>
      `;
    };

    return pairs.map(([left, right]) => makeCard(left) + makeCard(right)).join('');
  }

  // ── Best/Worst Matches ────────────────────────────────────

  private renderBestWorstMatches(player: IPlayer, playerId: number, filter: RoleFilter = 2): string {
    type MS = { match: IMatch; value: number } | null;
    const pick = (a: MS, b: MS, dir: 'max' | 'min'): MS => {
      if (!a) return b;
      if (!b) return a;
      return dir === 'max' ? (a.value >= b.value ? a : b) : (a.value <= b.value ? a : b);
    };
    const sel = (arr: [MS, MS], dir: 'max' | 'min'): MS =>
      filter === 2 ? pick(arr[0], arr[1], dir) : arr[filter];

    const items: { label: string; icon: string; ms: MS }[] = [
      { label: 'MIGLIORE VITTORIA (ELO)', icon: 'trending-up', ms: sel(player.bestVictoryByElo, 'max') },
      { label: 'PEGGIORE SCONFITTA (ELO)', icon: 'trending-down', ms: sel(player.worstDefeatByElo, 'min') },
      { label: 'MIGLIORE VITTORIA (SCARTO)', icon: 'award', ms: sel(player.bestVictoryByScore, 'max') },
      { label: 'PEGGIORE SCONFITTA (SCARTO)', icon: 'alert-circle', ms: sel(player.worstDefeatByScore, 'max') },
      { label: 'VITTORIA SORPRESA (EXP%)', icon: 'sparkles', ms: sel(player.bestVictoryByPercentage, 'min') },
      { label: 'SCONFITTA DA FAVORITI (EXP%)', icon: 'frown', ms: sel(player.worstDefeatByPercentage, 'max') }
    ];

    const makeAvatar = (pid: number): string => {
      const p = getPlayerById(pid);
      return renderPlayerAvatar({
        initials: getInitials(p?.name ?? '?'),
        color: p ? getPlayerColor(p) : '#888',
        size: 'xs',
        playerId: pid,
        hideFrame: true
      });
    };

    return items.map((item) => {
      if (!item.ms) {
        return `
          <div class="rounded-xl p-3" style="background:rgba(0,0,0,0.25);border:1px solid var(--glass-border)">
            <div class="flex items-center gap-1.5 mb-2">
              <i data-lucide="${item.icon}" style="width:11px;height:11px;color:var(--color-text-muted)" aria-hidden="true"></i>
              <p class="font-ui text-[9px] uppercase tracking-widest" style="color:var(--color-text-muted)">${item.label}</p>
            </div>
            <p class="font-body text-xs" style="color:var(--color-text-dim)">Nessun dato</p>
          </div>
        `;
      }

      const m = item.ms.match;
      const inTeamA = m.teamA.defence === playerId || m.teamA.attack === playerId;
      const team = inTeamA ? 0 : 1;
      const delta = Math.round(m.deltaELO[team]);
      const deltaSign = delta >= 0 ? '+' : '';
      const deltaColor = delta >= 0 ? 'var(--color-win)' : 'var(--color-loss)';
      const deltaBg = delta >= 0 ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)';
      const expectedPct = Math.round(m.expectedScore[team] * 100);
      const myTeam = inTeamA ? m.teamA : m.teamB;
      const oppTeam = inTeamA ? m.teamB : m.teamA;
      const myScore = inTeamA ? m.score[0] : m.score[1];
      const oppScore = inTeamA ? m.score[1] : m.score[0];
      const myElo = Math.round(inTeamA ? m.teamELO[0] : m.teamELO[1]);
      const oppElo = Math.round(inTeamA ? m.teamELO[1] : m.teamELO[0]);

      const oppExpectedPct = Math.round(m.expectedScore[team === 0 ? 1 : 0] * 100);
      return `
        <div class="rounded-xl p-2.5 flex flex-col gap-2" style="background:rgba(0,0,0,0.25);border:1px solid var(--glass-border)">
          <div class="flex items-center justify-between gap-1.5">
            <div class="flex items-center gap-1 min-w-0">
              <i data-lucide="${item.icon}" style="width:10px;height:10px;color:var(--color-text-muted);flex-shrink:0" aria-hidden="true"></i>
              <p class="font-ui text-[8px] uppercase tracking-widest truncate" style="color:var(--color-text-muted)">${item.label}</p>
            </div>
            <span class="font-ui text-[9px] px-1.5 py-0.5 rounded shrink-0"
                  style="background:${deltaBg};color:${deltaColor}">${deltaSign}${delta} ELO</span>
          </div>
          <div class="flex items-center justify-between gap-1.5">
            <div class="flex items-center gap-0.5 shrink-0">
              ${makeAvatar(myTeam.defence)}${makeAvatar(myTeam.attack)}
            </div>
            <div class="flex flex-col items-center gap-0.5">
              <span class="font-display text-xl leading-none" style="color:var(--color-text-primary)">${myScore}\u2013${oppScore}</span>
              <span class="font-body text-[9px]" style="color:rgba(255,255,255,0.35)">${expectedPct}% \u00b7 ${oppExpectedPct}%</span>
            </div>
            <div class="flex items-center gap-0.5 shrink-0">
              ${makeAvatar(oppTeam.defence)}${makeAvatar(oppTeam.attack)}
            </div>
          </div>
          <div class="flex items-center justify-between">
            <span class="font-ui text-[9px]" style="color:rgba(255,255,255,0.35)">${myElo} ELO</span>
            <span class="font-ui text-[9px]" style="color:rgba(255,255,255,0.35)">${oppElo} ELO</span>
          </div>
        </div>
      `;
    }).join('');
  }

  private bindRecordSharedFilter(id: number, player: IPlayer): void {
    const btns = this.$$('.js-record-shared-filter') as HTMLButtonElement[];
    for (const btn of btns) {
      btn.addEventListener('click', () => {
        this.recordSharedFilter = Number(btn.dataset.filter) as RoleFilter;
        for (const b of btns) {
          const active = Number(b.dataset.filter) === this.recordSharedFilter;
          b.style.background = active ? 'linear-gradient(135deg,var(--color-gold),var(--color-gold-secondary))' : 'rgba(255,255,255,0.06)';
          b.style.color = active ? 'var(--color-bg-deep)' : 'var(--color-text-muted)';
          b.style.fontWeight = active ? '700' : 'normal';
        }
        const companionGrid = this.$id('companion-cards-grid');
        if (companionGrid) {
          companionGrid.innerHTML = this.renderCompanionCards(player, this.recordSharedFilter);
          refreshIcons();
        }
        const matchesGrid = this.$id('record-matches-grid');
        if (matchesGrid) {
          matchesGrid.innerHTML = this.renderBestWorstMatches(player, id, this.recordSharedFilter);
          refreshIcons();
        }
      });
    }
  }

  // ── ELO start computation ─────────────────────────────────

  private computeStartElo(player: IPlayer, role: 0 | 1): number {
    const history = player.history[role];
    const currentElo = player.elo[role];
    let totalDelta = 0;
    for (let i = 0; i < history.length; i++) {
      const isTeamA = player.id === history[i].teamA.attack || player.id === history[i].teamA.defence;
      const delta = isTeamA ? history[i].deltaELO[0] : history[i].deltaELO[1];
      totalDelta += delta * getBonusK(i);
    }
    return currentElo - totalDelta;
  }

  // ── ELO snapshot map per match ────────────────────────────

  private buildEloMap(player: IPlayer, playerId: number): Map<number, { before: number; after: number }> {
    const eloMap = new Map<number, { before: number; after: number }>();

    for (const role of [0, 1] as const) {
      const history = player.history[role];
      let elo = this.computeStartElo(player, role);
      for (let i = 0; i < history.length; i++) {
        const m = history[i];
        const isTeamA = m.teamA.defence === playerId || m.teamA.attack === playerId;
        const delta = (isTeamA ? m.deltaELO[0] : m.deltaELO[1]) * getBonusK(i);
        eloMap.set(m.id, { before: Math.round(elo), after: Math.round(elo + delta) });
        elo += delta;
      }
    }

    return eloMap;
  }

  // ── Desktop Table Rows ────────────────────────────────────

  private buildRowContext(m: IMatch, playerId: number, idx: number, eloMap: Map<number, { before: number; after: number }>): {
    inTeamA: boolean; team: number; roundedDelta: number; deltaSign: string; deltaColor: string; deltaBg: string;
    eloInfo: { before: number; after: number } | undefined; teamElo: number; oppTeamElo: number; isDefence: boolean;
    teammate: IPlayer | null | undefined; opp1: IPlayer | null | undefined; opp2: IPlayer | null | undefined; teammateElo: number;
    score: string; winPct: number; expectedPct: number; rowBg: string;
  } {
    const inTeamA = m.teamA.defence === playerId || m.teamA.attack === playerId;
    const team = inTeamA ? 0 : 1;
    const roundedDelta = Math.round(m.deltaELO[team]);
    const deltaSign = roundedDelta >= 0 ? '+' : '';
    const deltaColor = roundedDelta >= 0 ? 'var(--color-win)' : 'var(--color-loss)';
    const deltaBg = roundedDelta >= 0 ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)';
    const eloInfo = eloMap.get(m.id);
    const teamElo = Math.round(m.teamELO[team]);
    const oppTeamElo = Math.round(m.teamELO[team ^ 1]);
    const myTeam = inTeamA ? m.teamA : m.teamB;
    const oppTeam = inTeamA ? m.teamB : m.teamA;
    const isDefence = myTeam.defence === playerId;
    const teammate = isDefence ? getPlayerById(myTeam.attack) : getPlayerById(myTeam.defence);
    const opp1 = getPlayerById(oppTeam.defence);
    const opp2 = getPlayerById(oppTeam.attack);
    const teammateElo = teammate ? Math.round(teammate.elo[isDefence ? 1 : 0]) : 0;
    const score = inTeamA ? `${m.score[0]}-${m.score[1]}` : `${m.score[1]}-${m.score[0]}`;
    const totalGoals = m.score[0] + m.score[1];
    const myGoals = inTeamA ? m.score[0] : m.score[1];
    const winPct = totalGoals > 0 ? Math.round((myGoals / totalGoals) * 100) : 0;
    const expectedPct = Math.round(m.expectedScore[team] * 100);
    const rowBg = idx % 2 === 0 ? 'background:transparent' : 'background:rgba(255,255,255,0.02)';
    return { inTeamA, team, roundedDelta, deltaSign, deltaColor, deltaBg, eloInfo, teamElo, oppTeamElo, isDefence, teammate, opp1, opp2, teammateElo, score, winPct, expectedPct, rowBg };
  }

  private renderTableRows(matches: IMatch[], playerId: number, player: IPlayer): string {
    const eloMap = this.buildEloMap(player, playerId);

    return matches.map((m, idx) => {
      const c = this.buildRowContext(m, playerId, idx, eloMap);
      return `
        <tr style="${c.rowBg}; border-bottom:1px solid rgba(255,255,255,0.04)">
          <td class="px-3 py-2.5">
            <span class="font-body text-[10px]" style="color:var(--color-text-muted)">${formatShortDate(m.createdAt)}</span>
          </td>
          <td class="px-3 py-2.5">
            <div class="flex items-center gap-1.5">
              <span class="font-body text-xs" style="color:var(--color-text-secondary)">${c.eloInfo?.before ?? '?'} → ${c.eloInfo?.after ?? '?'}</span>
              <span class="font-ui text-[10px] px-1.5 py-0.5 rounded-md" style="background:${c.deltaBg};color:${c.deltaColor}">${c.deltaSign}${c.roundedDelta}</span>
            </div>
          </td>
          <td class="px-3 py-2.5 text-center">
            ${renderRoleBadge({ role: c.isDefence ? 'defence' : 'attack', size: 'base', showPct: false })}
          </td>
          <td class="px-3 py-2.5">
            <p class="font-body text-xs" style="color:var(--color-text-secondary)">${c.teammate?.name ?? '?'}</p>
            <p class="font-body text-[10px]" style="color:var(--color-text-muted)">(${c.teammateElo})</p>
          </td>
          <td class="px-3 py-2.5 text-center">
            <p class="font-display text-base" style="color:var(--color-text-primary)">${c.score}</p>
            <p class="font-body text-[10px]" style="color:var(--color-text-muted)">${c.winPct}%</p>
          </td>
          <td class="px-3 py-2.5">
            <p class="font-body text-xs" style="color:var(--color-text-secondary)">${c.opp1?.name ?? '?'} (${c.opp1 ? Math.round(c.opp1.elo[0]) : '?'})</p>
            <p class="font-body text-xs" style="color:var(--color-text-secondary)">${c.opp2?.name ?? '?'} (${c.opp2 ? Math.round(c.opp2.elo[1]) : '?'})</p>
          </td>
          <td class="px-3 py-2.5 text-center">
            <p class="font-body text-xs" style="color:var(--color-text-secondary)">${c.teamElo}</p>
            <p class="font-body text-[10px]" style="color:var(--color-text-muted)">opp: ${c.oppTeamElo}</p>
          </td>
          <td class="px-3 py-2.5 text-center">
            <span class="font-body text-xs" style="color:var(--color-text-muted)">${c.expectedPct}%</span>
          </td>
        </tr>
      `;
    }).join('');
  }

  // ── Mobile Match Cards ────────────────────────────────────

  private renderMobileMatchCards(matches: IMatch[], playerId: number, player: IPlayer): string {
    const eloMap = this.buildEloMap(player, playerId);

    return matches.map((m) => {
      const inTeamA = m.teamA.defence === playerId || m.teamA.attack === playerId;
      const team = inTeamA ? 0 : 1;
      const delta = m.deltaELO[team];
      const roundedDelta = Math.round(delta);
      const deltaSign = roundedDelta >= 0 ? '+' : '';
      const isWin = roundedDelta >= 0;
      const winColor = isWin ? 'var(--color-win)' : 'var(--color-loss)';
      const winBg = isWin ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)';
      const deltaBg = isWin ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)';

      const eloInfo = eloMap.get(m.id);
      const myTeam = inTeamA ? m.teamA : m.teamB;
      const oppTeam = inTeamA ? m.teamB : m.teamA;
      const isDefence = myTeam.defence === playerId;
      const teammate = isDefence ? getPlayerById(myTeam.attack) : getPlayerById(myTeam.defence);
      const opp1 = getPlayerById(oppTeam.defence);
      const opp2 = getPlayerById(oppTeam.attack);
      const score = inTeamA ? `${m.score[0]}–${m.score[1]}` : `${m.score[1]}–${m.score[0]}`;
      const expectedPct = Math.round(m.expectedScore[team] * 100);

      return `
        <div class="rounded-xl overflow-hidden" style="background:rgba(255,255,255,0.03); border:1px solid var(--glass-border)">
          <div class="flex items-center gap-2 px-3 py-2.5" style="border-bottom:1px solid rgba(255,255,255,0.05)">
            <span class="font-ui text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                  style="background:${winBg}; color:${winColor}; letter-spacing:0.08em">
              ${isWin ? 'WIN' : 'LOSS'}
            </span>
            <span class="font-display text-lg flex-1" style="color:var(--color-text-primary)">${score}</span>
            <span class="font-ui text-[10px] px-1.5 py-0.5 rounded-md"
                  style="background:${deltaBg};color:${winColor}">${deltaSign}${roundedDelta}</span>
            <span class="font-body text-[10px]" style="color:var(--color-text-muted)">${formatFullDate(m.createdAt)}</span>
          </div>
          <div class="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-2.5 text-[11px]">
            <div>
              <span class="font-ui text-[9px] uppercase tracking-widest" style="color:var(--color-text-muted)">ELO</span>
              <p class="font-body" style="color:var(--color-text-secondary)">${eloInfo?.before ?? '?'} → ${eloInfo?.after ?? '?'}</p>
            </div>
            <div>
              <span class="font-ui text-[9px] uppercase tracking-widest" style="color:var(--color-text-muted)">RUOLO</span>
              <div class="mt-1">${renderRoleBadge({ role: isDefence ? 'defence' : 'attack', size: 'lg', showLabel: true })}</div>
            </div>
            <div>
              <span class="font-ui text-[9px] uppercase tracking-widest" style="color:var(--color-text-muted)">COMPAGNO</span>
              <p class="font-body" style="color:var(--color-text-secondary)">${teammate?.name ?? '?'}</p>
            </div>
            <div>
              <span class="font-ui text-[9px] uppercase tracking-widest" style="color:var(--color-text-muted)">AVVERSARI</span>
              <p class="font-body" style="color:var(--color-text-secondary)">${opp1?.name ?? '?'} &amp; ${opp2?.name ?? '?'}</p>
            </div>
            <div>
              <span class="font-ui text-[9px] uppercase tracking-widest" style="color:var(--color-text-muted)">ATTESO</span>
              <p class="font-body" style="color:var(--color-text-muted)">${expectedPct}%</p>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ── Mount ─────────────────────────────────────────────────

  override mount(): void {
    const id = Number(this.params.id);
    const player = getPlayerById(id);
    if (!player) return;

    Chart.register(...registerables);
    refreshIcons();

    this.chartRole = player.bestRole as 0 | 1;
    this.mountEloChart(id, player, this.chartRole);
    this.applyChartOverlays(id, player, this.chartRole);
    this.mountRadarChart(id, player);
    this.mountAnimations(player);
    this.bindChartToggle(id, player);
    this.bindRelationTables(player);
    this.bindHistoryFilter(id, player);
    this.bindRecordSharedFilter(id, player);
  }

  private bindChartToggle(id: number, player: IPlayer): void {
    const btns = this.$$('.js-chart-role-btn') as HTMLButtonElement[];
    for (const btn of btns) {
      btn.addEventListener('click', () => {
        const role = Number(btn.dataset.role) as 0 | 1;
        if (this.chartRole === role) return;
        this.chartRole = role;

        for (const b of btns) {
          const isActive = Number(b.dataset.role) === role;
          b.style.background = isActive ? 'linear-gradient(135deg,var(--color-gold),var(--color-gold-secondary))' : 'transparent';
          b.style.color = isActive ? 'var(--color-bg-deep)' : 'var(--color-text-muted)';
          b.style.fontWeight = isActive ? '700' : 'normal';
        }

        if (this.chart) {
          this.chart.destroy();
          this.chart = null;
        }
        // Tooltip was created inside the old canvas parent — let mountEloChart re-create it
        if (this.tooltipEl) {
          this.tooltipEl.remove();
          this.tooltipEl = null;
        }
        this.mountEloChart(id, player, role);
        // Re-apply overlays after chart rebuild
        if (this.showMovingAvg || this.showTrend) {
          this.applyChartOverlays(id, player, this.chartRole);
        }
      });
    }
  }

  private applyChartOverlays(id: number, player: IPlayer, role: 0 | 1): void {
    if (!this.chart) return;
    const history = player.history[role];
    const startElo = this.computeStartElo(player, role);
    const eloData: number[] = [Math.round(startElo)];
    let currentElo = startElo;
    for (let i = 0; i < history.length; i++) {
      const match = history[i];
      const isTeamA = match.teamA.defence === id || match.teamA.attack === id;
      const delta = (isTeamA ? match.deltaELO[0] : match.deltaELO[1]) * getBonusK(i);
      currentElo += delta;
      eloData.push(Math.round(currentElo));
    }

    // Keep only the main dataset (index 0)
    this.chart.data.datasets = [this.chart.data.datasets[0]];

    if (this.showMovingAvg) {
      const maData = movingAverage(eloData, 10);
      this.chart.data.datasets.push({
        label: 'Media Mobile (10)',
        data: maData,
        borderColor: '#60A5FA',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [4, 3],
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
        tension: 0.3
      } as any);
    }

    if (this.showTrend) {
      const trendData = linearRegressionPoints(eloData);
      this.chart.data.datasets.push({
        label: 'Trend',
        data: trendData,
        borderColor: '#FB923C',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [6, 4],
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
        tension: 0
      } as any);
    }

    this.chart.update('none');
  }

  private bindRelationTables(player: IPlayer): void {
    // Collapse toggles (relation tables + record section)
    for (const type of ['tm', 'opp', 'record', 'chart', 'history'] as const) {
      const btn = this.$id(`${type}-collapse-btn`) as HTMLButtonElement | null;
      const body = this.$id(`${type}-body`);
      const chevron = this.$id(`${type}-chevron`);
      if (!btn || !body) continue;
      btn.addEventListener('click', () => {
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!expanded));
        body.style.display = expanded ? 'none' : '';
        if (chevron) chevron.style.transform = expanded ? 'rotate(-90deg)' : 'rotate(0deg)';
      });
    }

    // Filter buttons — teammates
    const tmFilterBtns = this.$$('.js-tm-relation-filter') as HTMLButtonElement[];
    for (const btn of tmFilterBtns) {
      btn.addEventListener('click', () => {
        this.relationFilter = Number(btn.dataset.filter) as RoleFilter;
        for (const b of tmFilterBtns) {
          const isActive = Number(b.dataset.filter) === this.relationFilter;
          b.style.background = isActive ? 'linear-gradient(135deg,var(--color-gold),var(--color-gold-secondary))' : 'rgba(255,255,255,0.06)';
          b.style.color = isActive ? 'var(--color-bg-deep)' : 'var(--color-text-muted)';
          b.style.fontWeight = isActive ? '700' : 'normal';
        }
        this.rerenderTeammateTable(player);
      });
    }

    // Filter buttons — opponents
    const oppFilterBtns = this.$$('.js-opp-relation-filter') as HTMLButtonElement[];
    for (const btn of oppFilterBtns) {
      btn.addEventListener('click', () => {
        this.oppRelationFilter = Number(btn.dataset.filter) as RoleFilter;
        for (const b of oppFilterBtns) {
          const isActive = Number(b.dataset.filter) === this.oppRelationFilter;
          b.style.background = isActive ? 'linear-gradient(135deg,var(--color-gold),var(--color-gold-secondary))' : 'rgba(255,255,255,0.06)';
          b.style.color = isActive ? 'var(--color-bg-deep)' : 'var(--color-text-muted)';
          b.style.fontWeight = isActive ? '700' : 'normal';
        }
        this.rerenderOpponentTable(player);
      });
    }

    // Teammate sort buttons
    for (const btn of this.$$('[data-tm-sort]')) {
      btn.addEventListener('click', () => {
        const col = btn.dataset['tmSort'] as RelationSortKey;
        if (this.tmSort === col) {
          this.tmSortAsc = !this.tmSortAsc;
        } else {
          this.tmSort = col;
          this.tmSortAsc = false;
        }
        this.rerenderTeammateTable(player);
        this.updateSortIndicators('tm', this.tmSort, this.tmSortAsc);
      });
    }

    // Opponent sort buttons
    for (const btn of this.$$('[data-opp-sort]')) {
      btn.addEventListener('click', () => {
        const col = btn.dataset['oppSort'] as RelationSortKey;
        if (this.oppSort === col) {
          this.oppSortAsc = !this.oppSortAsc;
        } else {
          this.oppSort = col;
          this.oppSortAsc = false;
        }
        this.rerenderOpponentTable(player);
        this.updateSortIndicators('opp', this.oppSort, this.oppSortAsc);
      });
    }

    this.updateSortIndicators('tm', this.tmSort, this.tmSortAsc);
    this.updateSortIndicators('opp', this.oppSort, this.oppSortAsc);
  }

  private rerenderRelationTables(player: IPlayer): void {
    this.rerenderTeammateTable(player);
    this.rerenderOpponentTable(player);
  }

  private rerenderTeammateTable(player: IPlayer): void {
    const grid = this.$id('tm-grid');
    if (!grid) return;
    const rows = this.sortRelationRows(this.buildRelationRows(player.teammatesStats, this.relationFilter), this.tmSort, this.tmSortAsc);
    grid.innerHTML = this.renderRelationCards(rows);
    refreshIcons();
  }

  private rerenderOpponentTable(player: IPlayer): void {
    const grid = this.$id('opp-grid');
    if (!grid) return;
    const rows = this.sortRelationRows(this.buildRelationRows(player.opponentsStats, this.oppRelationFilter), this.oppSort, this.oppSortAsc);
    grid.innerHTML = this.renderRelationCards(rows);
    refreshIcons();
  }

  private applyRelationSortStyle(el: HTMLElement, isActive: boolean, asc: boolean): void {
    const arrow = el.querySelector<HTMLElement>('.sort-arrow');
    let arrowText = '↕';
    if (isActive) arrowText = asc ? '↑' : '↓';
    if (arrow) arrow.textContent = arrowText;
    el.style.background = isActive ? 'rgba(255,215,0,0.1)' : 'transparent';
    el.style.color = isActive ? 'var(--color-gold)' : 'var(--color-text-muted)';
    el.style.borderColor = isActive ? 'rgba(255,215,0,0.3)' : 'var(--glass-border)';
  }

  private updateSortIndicators(type: 'tm' | 'opp', activeSort: RelationSortKey, asc: boolean): void {
    const attr = type === 'tm' ? 'data-tm-sort' : 'data-opp-sort';
    const getCol = (el: HTMLElement): RelationSortKey =>
      (type === 'tm' ? el.dataset['tmSort'] : el.dataset['oppSort']) as RelationSortKey;
    for (const el of this.$$(`[${attr}]`)) {
      this.applyRelationSortStyle(el, getCol(el) === activeSort, asc);
    }
  }

  private bindHistoryFilter(id: number, player: IPlayer): void {
    const btns = this.$$('.js-history-filter') as HTMLButtonElement[];
    for (const btn of btns) {
      btn.addEventListener('click', () => {
        this.historyFilter = Number(btn.dataset.filter) as RoleFilter;
        for (const b of btns) {
          const isActive = Number(b.dataset.filter) === this.historyFilter;
          b.style.background = isActive ? 'linear-gradient(135deg,var(--color-gold),var(--color-gold-secondary))' : 'transparent';
          b.style.color = isActive ? 'var(--color-bg-deep)' : 'var(--color-text-muted)';
          b.style.fontWeight = isActive ? '700' : 'normal';
        }
        this.rerenderHistory(id, player);
      });
    }
  }

  private rerenderHistory(id: number, player: IPlayer): void {
    let history: IMatch[];
    if (this.historyFilter === 2) {
      history = [...player.history[0], ...player.history[1]];
    } else {
      history = [...player.history[this.historyFilter]];
    }
    history = history.toSorted((a, b) => a.createdAt - b.createdAt).reverse();

    const countEl = this.$id('history-match-count');
    if (countEl) countEl.textContent = `${history.length} partite`;

    const desktopTbody = this.$id('history-desktop-tbody');
    if (desktopTbody) desktopTbody.innerHTML = this.renderTableRows(history, id, player);

    const mobileContainer = this.$id('history-mobile-cards');
    if (mobileContainer) mobileContainer.innerHTML = this.renderMobileMatchCards(history, id, player);

    refreshIcons();
  }

  private tooltipEl: HTMLElement | null = null;

  private getOrCreateTooltipEl(): HTMLElement {
    if (!this.tooltipEl || !document.body.contains(this.tooltipEl)) {
      this.tooltipEl?.remove();
      const el = document.createElement('div');
      el.style.cssText = [
        'position:fixed',
        'pointer-events:none',
        'opacity:0',
        'transition:opacity 0.12s ease',
        'z-index:9999',
        'background:rgba(9,25,18,0.97)',
        'border:1px solid rgba(255,215,0,0.25)',
        'border-radius:10px',
        'padding:10px',
        'min-width:180px',
        'max-width:240px'
      ].join(';');
      document.body.appendChild(el);
      this.tooltipEl = el;
    }
    return this.tooltipEl;
  }

  private mountEloChart(id: number, player: IPlayer, role: 0 | 1): void {
    const history = player.history[role];
    const startElo = this.computeStartElo(player, role);

    const labels: string[] = ['Inizio'];
    const eloData: number[] = [Math.round(startElo)];
    const matchMeta: Array<{ match: IMatch; delta: number; expectedPct: number } | null> = [null];
    let currentElo = startElo;

    for (let i = 0; i < history.length; i++) {
      const match = history[i];
      const isTeamA = match.teamA.defence === id || match.teamA.attack === id;
      const teamIdx = isTeamA ? 0 : 1;
      const delta = (isTeamA ? match.deltaELO[0] : match.deltaELO[1]) * getBonusK(i);
      currentElo += delta;
      labels.push(`${i + 1}`);
      eloData.push(Math.round(currentElo));
      matchMeta.push({
        match,
        delta: Math.round(match.deltaELO[teamIdx]),
        expectedPct: Math.round(match.expectedScore[teamIdx] * 100)
      });
    }

    const canvas = this.$id('elo-chart') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const tooltipEl = this.getOrCreateTooltipEl();

    const gradient = ctx.createLinearGradient(0, 0, 0, 280);
    gradient.addColorStop(0, 'rgba(255,215,0,0.22)');
    gradient.addColorStop(1, 'rgba(255,215,0,0.02)');

    const makeAvatarRow = (playerId: number): string => {
      const p = getPlayerById(playerId);
      const name = p?.name ?? '?';
      return renderPlayerAvatar({
        initials: getInitials(name),
        color: p ? getPlayerColor(p) : '#888888',
        size: 'xs',
        playerId,
        hideFrame: true
      });
    };

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'ELO',
          data: eloData,
          borderColor: '#FFD700',
          backgroundColor: gradient,
          borderWidth: 2,
          pointBackgroundColor: '#FFD700',
          pointBorderColor: '#FFD700',
          pointRadius: eloData.length > 30 ? 0 : 3,
          pointHoverRadius: 5,
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external: (context) => {
              const tooltipModel = context.tooltip;

              if (tooltipModel.opacity === 0 || !tooltipModel.dataPoints?.length) {
                tooltipEl.style.opacity = '0';
                return;
              }

              const dataIndex = tooltipModel.dataPoints[0].dataIndex;
              const meta = matchMeta[dataIndex];

              if (!meta) {
                tooltipEl.style.opacity = '0';
                return;
              }

              const m = meta.match;
              const inTeamA = m.teamA.defence === id || m.teamA.attack === id;
              const myTeam = inTeamA ? m.teamA : m.teamB;
              const oppTeam = inTeamA ? m.teamB : m.teamA;
              const sign = meta.delta >= 0 ? '+' : '';
              const deltaColor = meta.delta >= 0 ? '#4ADE80' : '#F87171';
              const deltaBg = meta.delta >= 0 ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)';
              const myScore = inTeamA ? m.score[0] : m.score[1];
              const oppScore = inTeamA ? m.score[1] : m.score[0];
              const won = myScore > oppScore;
              const resultText = won ? 'VITTORIA' : 'SCONFITTA';
              const myTeamElo = Math.round(inTeamA ? m.teamELO[0] : m.teamELO[1]);
              const oppTeamElo = Math.round(inTeamA ? m.teamELO[1] : m.teamELO[0]);
              const oppExpectedPct = 100 - meta.expectedPct;

              tooltipEl.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:7px">
                  <span style="font-family:Oswald,sans-serif;font-size:8px;letter-spacing:0.08em;color:rgba(255,255,255,0.35)">${resultText}</span>
                  <span style="font-family:Oswald,sans-serif;font-size:10px;padding:2px 6px;border-radius:4px;background:${deltaBg};color:${deltaColor};white-space:nowrap">${sign}${meta.delta} ELO</span>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px">
                  <div style="display:flex;align-items:center;gap:2px">
                    ${makeAvatarRow(myTeam.defence)}${makeAvatarRow(myTeam.attack)}
                  </div>
                  <span style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:#fff;line-height:1">${myScore}–${oppScore}</span>
                  <div style="display:flex;align-items:center;gap:2px">
                    ${makeAvatarRow(oppTeam.defence)}${makeAvatarRow(oppTeam.attack)}
                  </div>
                </div>
                <div style="display:flex;align-items:center;justify-content:center;gap:4px;margin-bottom:6px">
                  <span style="font-family:Inter,sans-serif;font-size:9px;color:rgba(255,255,255,0.35)">${meta.expectedPct}% · ${oppExpectedPct}%</span>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid rgba(255,255,255,0.08);padding-top:5px">
                  <span style="font-family:Oswald,sans-serif;font-size:9px;color:rgba(255,255,255,0.3)">${myTeamElo} ELO</span>
                  <span style="font-family:Oswald,sans-serif;font-size:9px;color:rgba(255,255,255,0.3)">${oppTeamElo} ELO</span>
                </div>
              `;

              // Fixed viewport positioning
              const rect = canvas.getBoundingClientRect();
              const caretX = tooltipModel.caretX;
              const caretY = tooltipModel.caretY;
              const absX = rect.left + caretX;
              const absY = rect.top + caretY;
              const vw = window.innerWidth;
              const tooltipW = 180;
              const tooltipH = 130;

              let left = absX - tooltipW / 2;
              if (left < 6) left = 6;
              if (left + tooltipW > vw - 6) left = vw - tooltipW - 6;

              const top = absY > tooltipH + 12 ? absY - tooltipH - 12 : absY + 20;

              tooltipEl.style.left = `${left}px`;
              tooltipEl.style.top = `${top}px`;
              tooltipEl.style.opacity = '1';
            }
          }
        },
        scales: {
          x: {
            ticks: { font: { family: 'Oswald', size: 10 }, color: 'rgba(255,255,255,0.4)', maxRotation: 45, maxTicksLimit: 12 },
            grid: { color: 'rgba(255,255,255,0.06)' },
            border: { display: false }
          },
          y: {
            ticks: { font: { family: 'Oswald', size: 10 }, color: 'rgba(255,255,255,0.4)' },
            grid: { color: 'rgba(255,255,255,0.06)' },
            border: { display: false }
          }
        }
      }
    });
  }

  private mountRadarChart(id: number, player: IPlayer): void {
    const radarCanvas = this.$id('radar-chart') as HTMLCanvasElement | null;
    if (!radarCanvas) return;

    const rCtx = radarCanvas.getContext('2d');
    if (!rCtx) return;

    const color = getPlayerColor(player);
    this.radarChart = new Chart(rCtx, {
      type: 'radar',
      data: {
        labels: ['Gol Fatti', 'Gol Subiti', 'Attacco', 'Difesa', 'Costanza', 'ELO', 'Qualità Win'],
        datasets: [{
          label: player.name,
          data: this.radarData,
          backgroundColor: `${color}33`,
          borderColor: color,
          borderWidth: 2,
          pointBackgroundColor: color,
          pointBorderColor: color,
          pointRadius: 3,
          pointHoverRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 42, 32, 0.95)',
            titleFont: { family: 'Oswald', size: 11 },
            bodyFont: { family: 'Inter', size: 12 },
            titleColor: 'rgba(255,255,255,0.5)',
            bodyColor: color,
            borderColor: `${color}33`,
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            callbacks: {
              label: ctx => `${ctx.parsed.r.toFixed(1)}`
            }
          }
        },
        scales: {
          r: {
            beginAtZero: true,
            max: 100,
            ticks: { stepSize: 20, display: false },
            grid: { color: 'rgba(255,255,255,0.08)' },
            angleLines: { color: 'rgba(255,255,255,0.08)' },
            pointLabels: {
              font: { family: 'Oswald', size: 11 },
              color: 'rgba(255,255,255,0.6)'
            }
          }
        }
      }
    });
  }

  private mountAnimations(_player: IPlayer): void {
    this.gsapCtx = gsap.context(() => {
      gsap.from('#hero-card', { opacity: 0, y: 30, duration: 0.6, ease: 'power3.out' });
      gsap.from('.hero-avatar', { scale: 0.92, opacity: 0, duration: 0.45, ease: 'back.out(1.2)' });
      gsap.from('#elo-stats-row > div', { opacity: 0, y: 20, duration: 0.4, stagger: 0.08, delay: 0.15, ease: 'power2.out' });
      gsap.from('#chart-section', { opacity: 0, y: 25, duration: 0.5, delay: 0.2, ease: 'power3.out' });
    }, this.el ?? undefined);
  }

  // ── Destroy ───────────────────────────────────────────────

  override destroy(): void {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    if (this.radarChart) {
      this.radarChart.destroy();
      this.radarChart = null;
    }
    if (this.gsapCtx) {
      this.gsapCtx.revert();
      this.gsapCtx = null;
    }
    if (this.tooltipEl) {
      this.tooltipEl.remove();
      this.tooltipEl = null;
    }
  }
}
