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
import { MatchesToRank } from '@/services/elo.service';
import { getAllPlayers, getBonusK, getPlayerById } from '@/services/player.service';
import { getClassName } from '@/utils/get-class-name.util';
import { getAvgAgainstColor, getAvgForColor, getGoalRatioColor, getWinRateColor } from '@/utils/stats-thresholds.util';
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

function getRankMedal(_rank: number): string {
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
  private radarDataDif: number[] = [];
  private radarDataAtt: number[] = [];
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
  private statsFilter: RoleFilter = 2;

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
    const radarRanges = this.computeRadarRanges();
    this.radarDataDif = this.computeRadarDataForRole(player, 0, radarRanges);
    this.radarDataAtt = this.computeRadarDataForRole(player, 1, radarRanges);

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
      rankBadge: rawHtml(''),
      playerName: player.name.toUpperCase(),
      className: className.toUpperCase(),
      rankWatermark: rankGeneral > 0 ? String(rankGeneral) : '---',
      rankGeneral: rankGeneral > 0 ? String(rankGeneral) : '---',
      rankDefence: (rankDefence > 0 && player.matches[0] >= MatchesToRank) ? String(rankDefence) : '---',
      rankAttack: (rankAttack > 0 && player.matches[1] >= MatchesToRank) ? String(rankAttack) : '---',
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
      teammateTbody: rawHtml(this.renderRelationCards(tmRows, this.tmAvatarRole())),
      opponentTbody: rawHtml(this.renderRelationCards(oppRows)),
      tmCount: tmRows.length,
      oppCount: oppRows.length,
      // History
      matchCount: combinedHistory.length,
      tableRows: rawHtml(this.renderTableRows(combinedHistory, id, player)),
      mobileMatchCards: rawHtml(this.renderMobileMatchCards(combinedHistory, id, player)),
      statsSection: rawHtml(this.renderStatsSection(player, this.statsFilter))
    });
  }

  // ── Page Header ───────────────────────────────────────────

  private computeStatsData(player: IPlayer, filter: RoleFilter): {
    matches: number; wins: number; losses: number; winRate: string; wrColor: string;
    goalsFor: number; goalsAgainst: number; avgFor: string; avgAgainst: string;
    currentElo: string; bestElo: string; worstElo: string; currentClass: string; bestClass: string;
    bestWinStreak: number; worstLossStreak: number; currentStreak: number;
    avgTeamElo: number; avgOppElo: number;
  } {
    const roles: Array<0 | 1> = filter === 2 ? [0, 1] : [filter];
    const sumR = (arr: [number, number]): number => roles.reduce<number>((s, r) => s + arr[r], 0);

    const matches = sumR(player.matches);
    const wins = sumR(player.wins);
    const losses = matches - wins;
    const winRate = matches > 0 ? ((wins / matches) * 100).toFixed(1) : '–';
    const goalsFor = sumR(player.goalsFor);
    const goalsAgainst = sumR(player.goalsAgainst);
    const avgFor = matches > 0 ? (goalsFor / matches).toFixed(2) : '–';
    const avgAgainst = matches > 0 ? (goalsAgainst / matches).toFixed(2) : '–';

    const eloRole: 0 | 1 = filter === 2 ? player.bestRole as 0 | 1 : filter;
    const eloStr = (v: number): string => isFinite(v) && v > 0 ? String(Math.round(v)) : '–';

    const bestWinStreak = Math.max(...roles.map(r => player.bestWinStreak[r]));
    const worstLossStreak = Math.max(...roles.map(r => player.worstLossStreak[r]));
    const currentStreak = player.streak[eloRole];
    const avgTeamElo = sumR(player.avgTeamElo) / roles.length;
    const avgOppElo = sumR(player.avgOpponentElo) / roles.length;
    const wrColor = matches > 0
      ? (Number(winRate) >= 50 ? 'var(--color-win)' : Number(winRate) >= 40 ? 'var(--color-draw)' : 'var(--color-loss)')
      : 'var(--color-text-muted)';

    return {
      matches, wins, losses, winRate, wrColor,
      goalsFor, goalsAgainst, avgFor, avgAgainst,
      currentElo: eloStr(player.elo[eloRole]),
      bestElo: eloStr(player.bestElo[eloRole]),
      worstElo: eloStr(player.worstElo[eloRole]),
      currentClass: player.class[eloRole] >= 0 ? getClassName(player.class[eloRole]).toUpperCase() : '–',
      bestClass: player.bestClass[eloRole] >= 0 ? getClassName(player.bestClass[eloRole]).toUpperCase() : '–',
      bestWinStreak, worstLossStreak, currentStreak, avgTeamElo, avgOppElo
    };
  }

  private renderStatsSection(player: IPlayer, _filter: RoleFilter): string {
    const dif = this.computeStatsData(player, 0);
    const att = this.computeStatsData(player, 1);
    const tot = this.computeStatsData(player, 2);

    const noDif = player.matches[0] === 0;
    const noAtt = player.matches[1] === 0;
    const muted = 'var(--color-text-muted)';
    // Wrappers: return '–' and muted color if role has no matches
    const dv = (val: string): string => noDif ? '–' : val;
    const av = (val: string): string => noAtt ? '–' : val;
    const dc = (color: string): string => noDif ? muted : color;
    const ac = (color: string): string => noAtt ? muted : color;

    const ratio = (gf: number, ga: number): string => ga > 0 ? (gf / ga).toFixed(2) : '–';

    // Column headers — 2 cols (DIF/ATT) for ELO card, 3 cols (DIF/ATT/TOT) for others
    const colHeader2 = (): string =>
      `<div class="grid grid-cols-3 gap-2 mb-2">
        <div></div>
        <span class="font-ui text-[9px] uppercase tracking-widest text-center" style="color:var(--color-text-muted)">DIF</span>
        <span class="font-ui text-[9px] uppercase tracking-widest text-center" style="color:var(--color-text-muted)">ATT</span>
      </div>`;

    const colHeader3 = (): string =>
      `<div class="grid grid-cols-4 gap-2 mb-2">
        <div></div>
        <span class="font-ui text-[9px] uppercase tracking-widest text-center" style="color:var(--color-text-muted)">DIF</span>
        <span class="font-ui text-[9px] uppercase tracking-widest text-center" style="color:var(--color-text-muted)">ATT</span>
        <span class="font-ui text-[9px] uppercase tracking-widest text-center" style="color:var(--color-gold)">TOT</span>
      </div>`;

    // 2-col row (no TOT)
    const row2 = (label: string, vDif: string, vAtt: string, cDif = 'var(--color-text-primary)', cAtt = 'var(--color-text-primary)'): string =>
      `<div class="grid grid-cols-3 items-center gap-2 py-1.5" style="border-top:1px solid rgba(255,255,255,0.05)">
        <span class="font-ui text-[9px] uppercase tracking-widest" style="color:var(--color-text-muted)">${label}</span>
        <span class="font-display text-sm text-center" style="color:${cDif}">${vDif}</span>
        <span class="font-display text-sm text-center" style="color:${cAtt}">${vAtt}</span>
      </div>`;

    // 3-col row (with TOT)
    const row = (label: string, vDif: string, vAtt: string, vTot: string, cDif = 'var(--color-text-primary)', cAtt = 'var(--color-text-primary)', cTot = 'var(--color-text-primary)'): string =>
      `<div class="grid grid-cols-4 items-center gap-2 py-1.5" style="border-top:1px solid rgba(255,255,255,0.05)">
        <span class="font-ui text-[9px] uppercase tracking-widest" style="color:var(--color-text-muted)">${label}</span>
        <span class="font-display text-sm text-center" style="color:${cDif}">${vDif}</span>
        <span class="font-display text-sm text-center" style="color:${cAtt}">${vAtt}</span>
        <span class="font-display text-sm text-center font-semibold" style="color:${cTot}">${vTot}</span>
      </div>`;

    // Card with custom header/rows HTML
    const groupCard = (icon: string, title: string, header: string, rows: string): string =>
      `<div class="rounded-xl px-4 py-3" style="background:rgba(255,255,255,0.04);border:1px solid var(--glass-border);min-width:0">
        <div class="flex items-center gap-1.5 mb-2">
          <i data-lucide="${icon}" class="w-3.5 h-3.5 shrink-0" style="color:var(--color-gold)" aria-hidden="true"></i>
          <span class="font-ui text-[10px] uppercase tracking-widest" style="color:var(--color-gold)">${title}</span>
        </div>
        ${header}
        ${rows}
      </div>`;

    const win = 'var(--color-win)';
    const loss = 'var(--color-loss)';
    const gold = 'var(--color-gold)';

    const eloRows = [
      row2('Attuale', dv(dif.currentElo), av(att.currentElo)),
      row2('Massimo', dv(dif.bestElo), av(att.bestElo), dc(win), ac(win)),
      row2('Minimo', dv(dif.worstElo), av(att.worstElo), dc(loss), ac(loss)),
      row2('Classe', dv(dif.currentClass), av(att.currentClass), dc(gold), ac(gold)),
      row2('ELO Compagno', dv(dif.avgTeamElo > 0 ? Math.round(dif.avgTeamElo).toString() : '–'), av(att.avgTeamElo > 0 ? Math.round(att.avgTeamElo).toString() : '–')),
      row2('ELO Avversario', dv(dif.avgOppElo > 0 ? Math.round(dif.avgOppElo).toString() : '–'), av(att.avgOppElo > 0 ? Math.round(att.avgOppElo).toString() : '–'))
    ].join('');

    const matchRows = [
      row('Partite', dv(String(dif.matches)), av(String(att.matches)), String(tot.matches)),
      row('Vittorie', dv(String(dif.wins)), av(String(att.wins)), String(tot.wins), dc(win), ac(win), win),
      row('Sconfitte', dv(String(dif.losses)), av(String(att.losses)), String(tot.losses), dc(loss), ac(loss), loss),
      row('Win Rate', dv(`${dif.winRate}%`), av(`${att.winRate}%`), `${tot.winRate}%`, dc(getWinRateColor(Number(dif.winRate))), ac(getWinRateColor(Number(att.winRate))), getWinRateColor(Number(tot.winRate))),
      row('Best Streak', dv(dif.bestWinStreak > 0 ? `+${dif.bestWinStreak}` : '–'), av(att.bestWinStreak > 0 ? `+${att.bestWinStreak}` : '–'), '–', dc(win), ac(win)),
      row('Worst Streak', dv(dif.worstLossStreak !== 0 ? `${dif.worstLossStreak}` : '–'), av(att.worstLossStreak !== 0 ? `${att.worstLossStreak}` : '–'), '–', dc(loss), ac(loss))
    ].join('');

    const goalRows = [
      row('Fatti', dv(String(dif.goalsFor)), av(String(att.goalsFor)), String(tot.goalsFor), dc(win), ac(win), win),
      row('Subiti', dv(String(dif.goalsAgainst)), av(String(att.goalsAgainst)), String(tot.goalsAgainst), dc(loss), ac(loss), loss),
      row('Ratio', dv(ratio(dif.goalsFor, dif.goalsAgainst)), av(ratio(att.goalsFor, att.goalsAgainst)), ratio(tot.goalsFor, tot.goalsAgainst), dc(getGoalRatioColor(dif.goalsAgainst > 0 ? dif.goalsFor / dif.goalsAgainst : 0)), ac(getGoalRatioColor(att.goalsAgainst > 0 ? att.goalsFor / att.goalsAgainst : 0)), getGoalRatioColor(tot.goalsAgainst > 0 ? tot.goalsFor / tot.goalsAgainst : 0)),
      row('Media Fatti', dv(dif.avgFor), av(att.avgFor), tot.avgFor, dc(getAvgForColor(Number(dif.avgFor))), ac(getAvgForColor(Number(att.avgFor))), getAvgForColor(Number(tot.avgFor))),
      row('Media Subiti', dv(dif.avgAgainst), av(att.avgAgainst), tot.avgAgainst, dc(getAvgAgainstColor(Number(dif.avgAgainst))), ac(getAvgAgainstColor(Number(att.avgAgainst))), getAvgAgainstColor(Number(tot.avgAgainst)))
    ].join('');

    return `
      <div id="stats-body" class="p-3" style="border-top:1px solid var(--glass-border)">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-2 items-start">
          ${groupCard('trending-up', 'ELO', colHeader2(), eloRows)}
          ${groupCard('activity', 'Partite', colHeader3(), matchRows)}
          ${groupCard('target', 'Goal', colHeader3(), goalRows)}
        </div>
      </div>`;
  }

  private renderPageHeader(): string {
    return '';
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

  private renderRelationCards(rows: RelationRow[], avatarRole: 0 | 1 | null = null): string {
    if (rows.length === 0) {
      return `<p class="col-span-full py-6 text-center font-body text-sm"
               style="color:var(--color-text-muted)">Nessun dato disponibile</p>`;
    }

    return rows.map((r) => {
      const deltaColor = r.delta >= 0 ? 'var(--color-win)' : 'var(--color-loss)';
      const deltaSign = r.delta >= 0 ? '+' : '';
      const wrColor = r.winrate >= 50 ? 'var(--color-win)' : r.winrate >= 40 ? 'var(--color-draw)' : 'var(--color-loss)';
      const p = getPlayerById(r.id);
      const role: 0 | 1 = avatarRole !== null ? avatarRole : (p ? p.bestRole as 0 | 1 : 0);
      const avatarColor = p ? (CLASS_COLORS[p.class[role]] ?? '#FFFFFF') : '#888888';
      const avatarHtml = p
        ? renderPlayerAvatar({ initials: getInitials(p.name), color: avatarColor, size: 'md', playerId: r.id, playerClass: p.class[role] })
        : '';
      return `
        <a href="/profile/${r.id}"
           class="flex flex-col items-center gap-1 p-2 rounded-lg transition-all"
           style="background:rgba(255,255,255,0.03);border:1px solid var(--glass-border)">
          <div class="shrink-0 mt-1">${avatarHtml}</div>
          <p class="font-body text-xs text-center leading-tight w-full truncate"
             style="color:var(--color-text-secondary)">${r.name}</p>
          <div class="grid grid-cols-3 gap-0 w-full text-center border-t pt-1 mt-0.5"
               style="border-color:rgba(255,255,255,0.07)">
            <div>
              <p class="font-display text-sm leading-none"
                 style="color:var(--color-text-primary)">${r.matches}</p>
              <p class="font-ui text-[10px] uppercase"
                 style="color:var(--color-text-dim)">Match</p>
            </div>
            <div>
              <p class="font-display text-sm leading-none"
                 style="color:${wrColor}">${r.winrate.toFixed(0)}%</p>
              <p class="font-ui text-[10px] uppercase"
                 style="color:var(--color-text-dim)">WIN</p>
            </div>
            <div>
              <p class="font-display text-sm leading-none"
                 style="color:${deltaColor}">${deltaSign}${Math.round(r.delta)}</p>
              <p class="font-ui text-[10px] uppercase"
                 style="color:var(--color-text-dim)">\u0394ELO</p>
            </div>
          </div>
        </a>
      `;
    }).join('');
  }

  // ── Radar data ────────────────────────────────────────────

  private computeRadarRanges(): {
    minElo: [number, number]; maxElo: [number, number];
    minWR: [number, number]; maxWR: [number, number];
    minRatio: [number, number]; maxRatio: [number, number];
    minOppElo: [number, number]; maxOppElo: [number, number];
    minForma: [number, number]; maxForma: [number, number];
  } {
    const all = getAllPlayers();
    const toRatio = (p: IPlayer, r: 0 | 1): number =>
      p.goalsAgainst[r] > 0 ? p.goalsFor[r] / p.goalsAgainst[r] : (p.goalsFor[r] > 0 ? 999 : 1);

    const recentWinRate = (p: IPlayer, r: 0 | 1): number => {
      const recent = [...(p.history[r] ?? [])].sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
      if (recent.length === 0) return 0;
      const wins = recent.filter((m) => {
        const inTeamA = m.teamA.defence === p.id || m.teamA.attack === p.id;
        const ti = inTeamA ? 0 : 1;
        return m.score[ti] > m.score[ti ^ 1];
      }).length;
      return wins / recent.length;
    };

    const ranges = [0, 1].map((r) => {
      const pool = all.filter(p => p.matches[r as 0 | 1] >= MatchesToRank);
      if (pool.length === 0) return { minElo: 0, maxElo: 0, minWR: 0, maxWR: 0, minRatio: 0, maxRatio: 0, minOppElo: 0, maxOppElo: 0, minForma: 0, maxForma: 1 };
      const elos = pool.map(p => p.elo[r as 0 | 1]);
      const wrs = pool.map(p => p.wins[r as 0 | 1] / p.matches[r as 0 | 1]);
      const ratios = pool.map(p => toRatio(p, r as 0 | 1));
      const oppElos = pool.map(p => p.avgOpponentElo[r as 0 | 1]);
      const formas = pool.map(p => recentWinRate(p, r as 0 | 1));
      return {
        minElo: Math.min(...elos), maxElo: Math.max(...elos),
        minWR: Math.min(...wrs), maxWR: Math.max(...wrs),
        minRatio: Math.min(...ratios), maxRatio: Math.max(...ratios),
        minOppElo: Math.min(...oppElos), maxOppElo: Math.max(...oppElos),
        minForma: Math.min(...formas), maxForma: Math.max(...formas)
      };
    });

    // Usa il range globale (unione dei due ruoli) come riferimento comune
    return {
      minElo: [ranges[0].minElo, ranges[1].minElo],
      maxElo: [ranges[0].maxElo, ranges[1].maxElo],
      minWR: [ranges[0].minWR, ranges[1].minWR],
      maxWR: [ranges[0].maxWR, ranges[1].maxWR],
      minRatio: [ranges[0].minRatio, ranges[1].minRatio],
      maxRatio: [ranges[0].maxRatio, ranges[1].maxRatio],
      minOppElo: [ranges[0].minOppElo, ranges[1].minOppElo],
      minForma: [ranges[0].minForma, ranges[1].minForma],
      maxForma: [ranges[0].maxForma, ranges[1].maxForma],
      maxOppElo: [ranges[0].maxOppElo, ranges[1].maxOppElo]
    };
  }

  private computeRadarDataForRole(player: IPlayer, role: 0 | 1, ranges: ReturnType<typeof this.computeRadarRanges>): number[] {
    // Normalizza tra 20 e 100 (20%-100%)
    const norm = (v: number, min: number, max: number): number => {
      if (max > min) {
        const raw = (v - min) / (max - min);
        // Scala da 20 a 100
        return Math.max(20, Math.min(100, raw * 80 + 20));
      }
      return 60; // fallback: centro
    };

    const globalMinElo = Math.min(ranges.minElo[0], ranges.minElo[1]);
    const globalMaxElo = Math.max(ranges.maxElo[0], ranges.maxElo[1]);
    const globalMinWR = Math.min(ranges.minWR[0], ranges.minWR[1]);
    const globalMaxWR = Math.max(ranges.maxWR[0], ranges.maxWR[1]);
    const globalMinRatio = Math.min(ranges.minRatio[0], ranges.minRatio[1]);
    const globalMaxRatio = Math.max(ranges.maxRatio[0], ranges.maxRatio[1]);
    const globalMinOppElo = Math.min(ranges.minOppElo[0], ranges.minOppElo[1]);
    const globalMaxOppElo = Math.max(ranges.maxOppElo[0], ranges.maxOppElo[1]);
    const globalMinForma = Math.min(ranges.minForma[0], ranges.minForma[1]);
    const globalMaxForma = Math.max(ranges.maxForma[0], ranges.maxForma[1]);

    const eloScore = norm(player.elo[role], globalMinElo, globalMaxElo);

    const myWR = player.matches[role] > 0 ? player.wins[role] / player.matches[role] : 0;
    const winRate = norm(myWR, globalMinWR, globalMaxWR);

    const myRatio = player.goalsAgainst[role] > 0
      ? player.goalsFor[role] / player.goalsAgainst[role]
      : (player.goalsFor[role] > 0 ? 999 : 1);
    const goalRatioScore = norm(myRatio, globalMinRatio, globalMaxRatio);

    // Forma: win rate nelle ultime 10 partite per questo ruolo, normalizzata sul range globale
    const recentHistory = [...(player.history[role] ?? [])]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10);
    const recentWins = recentHistory.filter((m) => {
      const inTeamA = m.teamA.defence === player.id || m.teamA.attack === player.id;
      const teamIdx = inTeamA ? 0 : 1;
      return m.score[teamIdx] > m.score[teamIdx ^ 1];
    }).length;
    const myForma = recentHistory.length > 0 ? recentWins / recentHistory.length : 0;
    const formaScore = norm(myForma, globalMinForma, globalMaxForma);

    // Difficoltà: ELO medio degli avversari affrontati, normalizzato
    const difficoltaScore = norm(player.avgOpponentElo[role], globalMinOppElo, globalMaxOppElo);

    const costanzaScore = norm(this.computeCostanza(player, role), 0, 100);

    return [eloScore, winRate, goalRatioScore, formaScore, difficoltaScore, costanzaScore];
  }

  private computeCostanza(player: IPlayer, role: 0 | 1): number {
    const history = player.history[role] ?? [];
    if (history.length < 5) return 50;

    // Ricostruiamo la serie ELO cronologica
    const sorted = [...history].sort((a, b) => a.createdAt - b.createdAt);
    let elo = player.elo[role];
    const raw: number[] = new Array(sorted.length + 1);
    raw[sorted.length] = elo;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const m = sorted[i];
      const teamIdx = (m.teamA.defence === player.id || m.teamA.attack === player.id) ? 0 : 1;
      elo -= m.deltaELO[teamIdx];
      raw[i] = elo;
    }

    // Media mobile (window=10) per filtrare il rumore partita-per-partita
    const W = Math.min(10, Math.floor(raw.length / 2));
    const smooth: number[] = [];
    for (let i = 0; i < raw.length; i++) {
      const start = Math.max(0, i - Math.floor(W / 2));
      const end = Math.min(raw.length, start + W);
      const slice = raw.slice(start, end);
      smooth.push(slice.reduce<number>((s, v) => s + v, 0) / slice.length);
    }

    // Monotonicity della media mobile: quanto la MA va in una direzione sola.
    // Sommiamo separatamente i tratti in salita e in discesa della MA.
    let sumUp = 0;
    let sumDown = 0;
    for (let i = 1; i < smooth.length; i++) {
      const diff = smooth[i] - smooth[i - 1];
      if (diff > 0) sumUp += diff;
      else sumDown -= diff;
    }
    const totalPath = sumUp + sumDown;

    // Se la MA si muove pochissimo → giocatore stabile → costanza massima
    if (totalPath < 5) return 100;

    // Frazione del percorso nella direzione dominante: 0.5 = perfettamente sinusoidale, 1.0 = monotòna
    const dominantFraction = Math.max(sumUp, sumDown) / totalPath;

    // Scaliamo 0.5→0, 1.0→100
    return Math.max(Math.round((dominantFraction - 0.5) / 0.5 * 100), 0);
  }

  // ── Companion Cards ───────────────────────────────────────

  private renderCompanionCards(player: IPlayer, filter: RoleFilter = 2): string {
    const role: 0 | 1 = filter === 2 ? (player.bestRole as 0 | 1) : filter;

    type CardDef = { icon: string; label: string; stat: { player: number; value: number } | null; fmt: (v: number) => string; color?: string };

    // When filter=2 (total), merge stats from both roles and find best/worst by summed value
    type MergedEntry = { id: number; delta: number; matches: number };
    type MergedStat = { player: number; delta: number; matches: number } | null;

    const buildMergedMap = (statsPerRole: [{ [x: number]: any }, { [x: number]: any }]): Map<number, MergedEntry> => {
      const map = new Map<number, MergedEntry>();
      for (const r of [0, 1] as const) {
        for (const [idStr, s] of Object.entries(statsPerRole[r])) {
          if (!s || !('matches' in s)) continue;
          const id = Number(idStr);
          if (!Number.isInteger(id) || id <= 0 || !getPlayerById(id)) continue;
          const stat = s as { matches: number; delta: number };
          const ex = map.get(id);
          if (ex) {
            ex.delta += stat.delta;
            ex.matches += stat.matches;
          } else {
            map.set(id, { id, delta: stat.delta, matches: stat.matches });
          }
        }
      }
      return map;
    };
    const pickBest = (
      map: Map<number, MergedEntry>,
      cmp: (a: MergedEntry, b: MergedEntry) => boolean
    ): MergedStat => {
      let best: MergedEntry | null = null;
      for (const entry of map.values()) {
        if (!best || cmp(entry, best)) best = entry;
      }
      return best ? { player: best.id, delta: best.delta, matches: best.matches } : null;
    };
    const toStat = (r: MergedStat, key: 'delta' | 'matches'): { player: number; value: number } | null =>
      r ? { player: r.player, value: r[key] } : null;

    const tmMap = filter === 2 ? buildMergedMap(player.teammatesStats) : null;
    const oppMap = filter === 2 ? buildMergedMap(player.opponentsStats) : null;

    const bestTm = tmMap
      ? toStat(pickBest(tmMap, (a, b) => a.delta > b.delta), 'delta')
      : player.bestTeammate[role];
    const worstTm = tmMap
      ? toStat(pickBest(tmMap, (a, b) => a.delta < b.delta), 'delta')
      : player.worstTeammate[role];
    const bestOpp = oppMap
      ? toStat(pickBest(oppMap, (a, b) => a.delta < b.delta), 'delta')
      : player.bestOpponent[role];
    const worstOpp = oppMap
      ? toStat(pickBest(oppMap, (a, b) => a.delta > b.delta), 'delta')
      : player.worstOpponent[role];
    const bestTmCount = tmMap
      ? toStat(pickBest(tmMap, (a, b) => a.matches > b.matches), 'matches')
      : player.bestTeammateCount[role];
    const bestOppCount = oppMap
      ? toStat(pickBest(oppMap, (a, b) => a.matches > b.matches), 'matches')
      : player.bestOpponentCount[role];

    // Pairs: [left, right] — rendered as 2-column grid row-by-row
    const pairs: [CardDef, CardDef][] = [
      [
        { icon: 'users', label: 'MIGLIOR COMPAGNO', stat: bestTm, fmt: v => `+${Math.round(v)} ELO`, color: 'var(--color-win)' },
        { icon: 'users', label: 'PEGGIOR COMPAGNO', stat: worstTm, fmt: v => `${Math.round(v)} ELO`, color: 'var(--color-loss)' }
      ],
      [
        { icon: 'sword', label: 'MIGLIOR AVVERSARIO', stat: bestOpp, fmt: v => `${Math.round(v)} ELO`, color: 'var(--color-loss)' },
        { icon: 'sword', label: 'PEGGIOR AVVERSARIO', stat: worstOpp, fmt: v => `+${Math.round(v)} ELO`, color: 'var(--color-win)' }
      ],
      [
        { icon: 'user-check', label: 'COMPAGNO FREQ.', stat: bestTmCount, fmt: v => `${Math.round(v)} partite` },
        { icon: 'repeat', label: 'AVVERSARIO FREQ.', stat: bestOppCount, fmt: v => `${Math.round(v)} partite` }
      ]
    ];

    const makeCard = (def: CardDef): string => {
      const p = def.stat ? getPlayerById(def.stat.player) : null;
      const avatar = p
        ? renderPlayerAvatar({ initials: getInitials(p.name), color: getPlayerColor(p), size: 'sm', playerId: p.id, hideFrame: true })
        : '';
      const name = p ? p.name : '—';
      const subtitle = def.stat ? def.fmt(def.stat.value) : '';
      const avatarEl = avatar ? `<a href="/profile/${p!.id}" class="shrink-0">${avatar}</a>` : '';
      return `
        <div class="rounded-xl p-3" style="background:rgba(0,0,0,0.25);border:1px solid var(--glass-border)">
          <div class="flex items-center gap-1.5 mb-2">
            <i data-lucide="${def.icon}" style="width:11px;height:11px;color:var(--color-text-muted)" aria-hidden="true"></i>
            <p class="font-ui text-[10px] uppercase tracking-widest" style="color:var(--color-text-muted)">${def.label}</p>
          </div>
          <div class="flex items-center gap-2">
            ${avatarEl}
            <div class="min-w-0">
              <a href="/profile/${p?.id ?? ''}" class="font-body text-xs font-medium truncate block" style="color:var(--color-text-primary)">${name}</a>
              <p class="font-body text-[10px] mt-0.5" style="color:${def.color ?? 'var(--color-text-secondary)'}">${subtitle}</p>
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
      const avatar = renderPlayerAvatar({
        initials: getInitials(p?.name ?? '?'),
        color: p ? getPlayerColor(p) : '#888',
        size: 'sm',
        playerId: pid,
        hideFrame: true
      });
      return `<a href="/profile/${pid}" class="shrink-0">${avatar}</a>`;
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
              <i data-lucide="${item.icon}" style="width:11px;height:11px;color:var(--color-text-muted);flex-shrink:0" aria-hidden="true"></i>
              <p class="font-ui text-[10px] uppercase tracking-widest truncate" style="color:var(--color-text-muted)">${item.label}</p>
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
              <span class="font-body text-[10px]" style="color:rgba(255,255,255,0.35)">${expectedPct}% \u00b7 ${oppExpectedPct}%</span>
            </div>
            <div class="flex items-center gap-0.5 shrink-0">
              ${makeAvatar(oppTeam.defence)}${makeAvatar(oppTeam.attack)}
            </div>
          </div>
          <div class="flex items-center justify-between">
            <span class="font-ui text-[10px]" style="color:rgba(255,255,255,0.35)">${myElo} ELO</span>
            <span class="font-ui text-[10px]" style="color:rgba(255,255,255,0.35)">${oppElo} ELO</span>
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

  private bindStatsFilter(player: IPlayer): void {
    const btns = this.$$('.js-stats-filter') as HTMLButtonElement[];
    for (const btn of btns) {
      btn.addEventListener('click', () => {
        this.statsFilter = Number(btn.dataset.filter) as RoleFilter;
        for (const b of btns) {
          const active = Number(b.dataset.filter) === this.statsFilter;
          b.style.background = active ? 'linear-gradient(135deg,var(--color-gold),var(--color-gold-secondary))' : 'rgba(255,255,255,0.06)';
          b.style.color = active ? 'var(--color-bg-deep)' : 'var(--color-text-muted)';
          b.style.fontWeight = active ? '700' : 'normal';
        }
        const body = this.$id('stats-body');
        if (body) {
          body.outerHTML = this.renderStatsSection(player, this.statsFilter);
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
    inTeamA: boolean;
    team: number;
    roundedDelta: number;
    deltaSign: string;
    deltaColor: string;
    deltaBg: string;
    eloInfo: { before: number; after: number } | undefined;
    teamElo: number;
    oppTeamElo: number;
    isDefence: boolean;
    teammate: IPlayer | null | undefined;
    opp1: IPlayer | null | undefined;
    opp2: IPlayer | null | undefined;
    teammateElo: number;
    opp1Elo: number;
    opp2Elo: number;
    score: string;
    winPct: number;
    expectedPct: number;
    rowBg: string;
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
    // ELO snapshot per compagno e avversari dalla partita
    let teammateElo = 0;
    let opp1Elo = 0;
    let opp2Elo = 0;
    if (inTeamA) {
      teammateElo = isDefence ? (m.teamAELO[1]) : (m.teamAELO[0]);
      opp1Elo = m.teamBELO[0];
      opp2Elo = m.teamBELO[1];
    } else {
      teammateElo = isDefence ? (m.teamBELO[1]) : (m.teamBELO[0]);
      opp1Elo = m.teamAELO[0];
      opp2Elo = m.teamAELO[1];
    }
    const score = inTeamA ? `${m.score[0]}-${m.score[1]}` : `${m.score[1]}-${m.score[0]}`;
    const totalGoals = m.score[0] + m.score[1];
    const myGoals = inTeamA ? m.score[0] : m.score[1];
    const winPct = totalGoals > 0 ? Math.round((myGoals / totalGoals) * 100) : 0;
    const expectedPct = Math.round(m.expectedScore[team] * 100);
    const rowBg = idx % 2 === 0 ? 'background:transparent' : 'background:rgba(255,255,255,0.02)';
    return { inTeamA, team, roundedDelta, deltaSign, deltaColor, deltaBg, eloInfo, teamElo, oppTeamElo, isDefence, teammate, opp1, opp2, teammateElo, opp1Elo, opp2Elo, score, winPct, expectedPct, rowBg };
  }

  private renderTableRows(matches: IMatch[], playerId: number, player: IPlayer): string {
    const eloMap = this.buildEloMap(player, playerId);

    return matches.map((m, idx) => {
      const c = this.buildRowContext(m, playerId, idx, eloMap);
      const isWin = c.roundedDelta >= 0;
      const resultColor = isWin ? 'var(--color-win)' : 'var(--color-loss)';
      const myExp = c.expectedPct;
      const oppExp = 100 - myExp;
      const expBold = (pct: number): boolean => pct >= 60 || pct <= 40;
      const rowAccent = isWin ? 'rgba(74,222,128,0.06)' : 'rgba(248,113,113,0.06)';
      const rowBorder = isWin ? 'rgba(74,222,128,0.7)' : 'rgba(248,113,113,0.7)';
      return `
        <tr style="background:${rowAccent}; border-bottom:1px solid rgba(255,255,255,0.04); box-shadow:inset 3px 0 0 ${rowBorder}">
          <td class="px-3 py-2.5">
            <div class="flex items-center gap-1.5">
              <span class="font-body text-xs" style="color:var(--color-text-secondary)">${c.eloInfo?.before ?? '?'} → ${c.eloInfo?.after ?? '?'}</span>
              <span class="font-ui text-[10px] px-1.5 py-0.5 rounded-md" style="background:${c.deltaBg};color:${c.deltaColor}">${c.deltaSign}${c.roundedDelta}</span>
            </div>
          </td>
          <td class="px-3 py-2.5 text-center">
            ${renderRoleBadge({ role: c.isDefence ? 'defence' : 'attack', size: 'base', showPct: false })}
          </td>
          <td class="px-3 py-2.5 text-center">
            <p class="font-body text-xs" style="color:var(--color-text-secondary)">${c.teamElo}</p>
          </td>
          <td class="px-3 py-2.5">
            <p class="font-body text-xs" style="color:var(--color-text-secondary)">${c.teammate?.name ?? '?'} <span style="color:var(--color-text-muted);font-size:0.625rem">(${Math.round(c.teammateElo)})</span></p>
          </td>
          <td class="px-3 py-2.5 text-center">
            <p class="font-display text-base" style="color:${resultColor}">${c.score}</p>
            <div class="flex items-center justify-center gap-1 mt-0.5">
              <span class="${expBold(myExp) ? 'font-bold' : 'font-body'} text-[10px]" style="color:${resultColor}">${myExp}%</span>
              <span class="font-body text-[10px]" style="color:var(--color-text-muted)">–</span>
              <span class="${expBold(oppExp) ? 'font-bold' : 'font-body'} text-[10px]" style="color:${isWin ? 'var(--color-loss)' : 'var(--color-win)'}">${oppExp}%</span>
            </div>
          </td>
          <td class="px-3 py-2.5">
            <p class="font-body text-xs" style="color:var(--color-text-secondary)">${c.opp1?.name ?? '?'} <span style="color:var(--color-text-muted);font-size:0.625rem">(${Math.round(c.opp1Elo)})</span></p>
            <p class="font-body text-xs" style="color:var(--color-text-secondary)">${c.opp2?.name ?? '?'} <span style="color:var(--color-text-muted);font-size:0.625rem">(${Math.round(c.opp2Elo)})</span></p>
          </td>
          <td class="px-3 py-2.5 text-center">
            <p class="font-body text-xs" style="color:var(--color-text-secondary)">${c.oppTeamElo}</p>
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
      const roundedDelta = Math.round(m.deltaELO[team]);
      const deltaSign = roundedDelta >= 0 ? '+' : '';
      const isWin = roundedDelta >= 0;
      const winColor = isWin ? 'var(--color-win)' : 'var(--color-loss)';
      const winBg = isWin ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)';
      const deltaBg = isWin ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)';
      const rowAccent = isWin ? 'rgba(74,222,128,0.06)' : 'rgba(248,113,113,0.06)';
      const rowBorder = isWin ? 'rgba(74,222,128,0.7)' : 'rgba(248,113,113,0.7)';

      const eloInfo = eloMap.get(m.id);
      const myTeam = inTeamA ? m.teamA : m.teamB;
      const oppTeam = inTeamA ? m.teamB : m.teamA;
      const isDefence = myTeam.defence === playerId;
      const teammate = isDefence ? getPlayerById(myTeam.attack) : getPlayerById(myTeam.defence);
      const opp1 = getPlayerById(oppTeam.defence);
      const opp2 = getPlayerById(oppTeam.attack);
      // ELO snapshot per compagno e avversari dalla partita
      let teammateElo = 0;
      let opp1Elo = 0;
      let opp2Elo = 0;
      if (inTeamA) {
        teammateElo = isDefence ? (m.teamAELO[1]) : (m.teamAELO[0]);
        opp1Elo = m.teamBELO[0];
        opp2Elo = m.teamBELO[1];
      } else {
        teammateElo = isDefence ? (m.teamBELO[1]) : (m.teamBELO[0]);
        opp1Elo = m.teamAELO[0];
        opp2Elo = m.teamAELO[1];
      }
      const score = inTeamA ? `${m.score[0]}–${m.score[1]}` : `${m.score[1]}–${m.score[0]}`;
      const teamElo = Math.round(m.teamELO[team]);
      const oppTeamElo = Math.round(m.teamELO[team ^ 1]);
      const myExp = Math.round(m.expectedScore[team] * 100);
      const oppExp = 100 - myExp;
      const expBold = (pct: number): boolean => pct >= 60 || pct <= 40;

      return `
        <div class="rounded-xl overflow-hidden" style="background:${rowAccent}; border:1px solid var(--glass-border); box-shadow:inset 3px 0 0 ${rowBorder}">
          <!-- Header row: WIN/LOSS + score + delta ELO -->
          <div class="flex items-center gap-2 px-3 py-2" style="border-bottom:1px solid rgba(255,255,255,0.05)">
            <span class="font-ui text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0"
                  style="background:${winBg}; color:${winColor}; letter-spacing:0.08em}">${isWin ? 'WIN' : 'LOSS'}</span>
            <span class="font-display text-base flex-1" style="color:${winColor}">${score}</span>
            <span class="font-body text-[10px]" style="color:var(--color-text-muted)">
              <span class="${expBold(myExp) ? 'font-bold' : ''}" style="color:${winColor}">${myExp}%</span>
              <span style="color:var(--color-text-muted)"> – </span>
              <span class="${expBold(oppExp) ? 'font-bold' : ''}" style="color:${isWin ? 'var(--color-loss)' : 'var(--color-win)'}">${oppExp}%</span>
            </span>
            <span class="font-ui text-[10px] px-1.5 py-0.5 rounded-md shrink-0"
                  style="background:${deltaBg};color:${winColor}">${deltaSign}${roundedDelta}</span>
          </div>
          <!-- Body: 2-col grid -->
          <div class="grid grid-cols-2 gap-x-3 gap-y-1.5 px-3 py-2 text-[11px]">
            <div>
              <span class="font-ui text-[9px] uppercase tracking-widest" style="color:var(--color-text-muted)">ELO Δ</span>
              <p class="font-body text-xs" style="color:var(--color-text-secondary)">${eloInfo?.before ?? '?'} → ${eloInfo?.after ?? '?'}</p>
            </div>
            <div>
              <span class="font-ui text-[9px] uppercase tracking-widest" style="color:var(--color-text-muted)">RUOLO</span>
              <div class="mt-0.5">${renderRoleBadge({ role: isDefence ? 'defence' : 'attack', size: 'lg', showLabel: true })}</div>
            </div>
            <div>
              <span class="font-ui text-[9px] uppercase tracking-widest" style="color:var(--color-text-muted)">ELO TEAM / OPP</span>
              <p class="font-body text-xs" style="color:var(--color-text-secondary)">${teamElo} <span style="color:var(--color-text-muted)">vs</span> ${oppTeamElo}</p>
            </div>
            <div>
              <span class="font-ui text-[9px] uppercase tracking-widest" style="color:var(--color-text-muted)">COMPAGNO</span>
              <p class="font-body text-xs" style="color:var(--color-text-secondary)">${teammate?.name ?? '?'} <span style="color:var(--color-text-muted);font-size:0.625rem">(${Math.round(teammateElo)})</span></p>
            </div>
            <div class="col-span-2">
              <span class="font-ui text-[9px] uppercase tracking-widest" style="color:var(--color-text-muted)">AVVERSARI</span>
              <p class="font-body text-xs" style="color:var(--color-text-secondary)">
                ${opp1?.name ?? '?'} <span style="color:var(--color-text-muted);font-size:0.625rem">(${Math.round(opp1Elo)})</span>
                &nbsp;&amp;&nbsp;
                ${opp2?.name ?? '?'} <span style="color:var(--color-text-muted);font-size:0.625rem">(${Math.round(opp2Elo)})</span>
              </p>
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
    this.bindStatsFilter(player);
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
    for (const type of ['tm', 'opp', 'record', 'chart', 'history', 'stats'] as const) {
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

  private tmAvatarRole(): 0 | 1 | null {
    if (this.relationFilter === 2) return null; // total → bestRole
    return this.relationFilter === 0 ? 1 : 0; // player is DIF → teammate is ATT, and vice-versa
  }

  private rerenderTeammateTable(player: IPlayer): void {
    const grid = this.$id('tm-grid');
    if (!grid) return;
    const rows = this.sortRelationRows(this.buildRelationRows(player.teammatesStats, this.relationFilter), this.tmSort, this.tmSortAsc);
    grid.innerHTML = this.renderRelationCards(rows, this.tmAvatarRole());
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

    // On mobile, hide tooltip when the finger is lifted
    const hideTooltip = (): void => { tooltipEl.style.opacity = '0'; };
    canvas.addEventListener('touchend', hideTooltip, { passive: true });
    canvas.addEventListener('touchcancel', hideTooltip, { passive: true });
  }

  private mountRadarChart(id: number, player: IPlayer): void {
    const radarCanvas = this.$id('radar-chart') as HTMLCanvasElement | null;
    if (!radarCanvas) return;

    const rCtx = radarCanvas.getContext('2d');
    if (!rCtx) return;

    const hasDif = player.matches[0] > 0;
    const hasAtt = player.matches[1] > 0;

    type RadarDataset = {
      label: string; data: number[]; backgroundColor: string; borderColor: string;
      borderWidth: number; pointBackgroundColor: string; pointBorderColor: string;
      pointRadius: number; pointHoverRadius: number;
    };
    const datasets: RadarDataset[] = [];
    if (hasDif) {
      datasets.push({
        label: 'Difesa',
        data: this.radarDataDif,
        backgroundColor: 'rgba(59,130,246,0.18)',
        borderColor: 'rgba(59,130,246,0.85)',
        borderWidth: 2,
        pointBackgroundColor: 'rgba(59,130,246,0.9)',
        pointBorderColor: 'rgba(59,130,246,0.9)',
        pointRadius: 1,
        pointHoverRadius: 3
      });
    }
    if (hasAtt) {
      datasets.push({
        label: 'Attacco',
        data: this.radarDataAtt,
        backgroundColor: 'rgba(239,68,68,0.18)',
        borderColor: 'rgba(239,68,68,0.85)',
        borderWidth: 2,
        pointBackgroundColor: 'rgba(239,68,68,0.9)',
        pointBorderColor: 'rgba(239,68,68,0.9)',
        pointRadius: 1,
        pointHoverRadius: 3
      });
    }

    this.radarChart = new Chart(rCtx, {
      type: 'radar',
      data: {
        labels: ['ELO', 'Win Rate', 'Ratio Goal', 'Forma', 'Avversari', 'Costanza'],
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              color: 'rgba(255,255,255,0.7)',
              font: { family: 'Oswald', size: 11 },
              boxWidth: 12,
              padding: 12
            }
          },
          tooltip: {
            backgroundColor: 'rgba(15,42,32,0.95)',
            titleFont: { family: 'Oswald', size: 11 },
            bodyFont: { family: 'Inter', size: 12 },
            titleColor: 'rgba(255,255,255,0.5)',
            bodyColor: 'rgba(255,255,255,0.85)',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            padding: 10,
            displayColors: true,
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.r.toFixed(1)}`
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
