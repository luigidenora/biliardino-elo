/**
 * PlayerProfilePage -- Full-screen profile for a single player.
 *
 * Route: /profile/:id
 * Displays hero card, ELO stats, chart, role stats, goal stats,
 * streaks, teammates/opponents, best/worst matches, and full match history table.
 */

import { IMatch } from '@/models/match.interface';
import { IPlayer } from '@/models/player.interface';
import { getAllMatches } from '@/services/match.service';
import { getPlayerById, getRank } from '@/services/player.service';
import { getPlayerStats, PlayerStats } from '@/services/stats.service';
import { getClassName } from '@/utils/get-class-name.util';
import { getDisplayElo } from '@/utils/get-display-elo.util';
import { Chart, registerables } from 'chart.js';
import gsap from 'gsap';
import { Component } from '../components/component.base';
import { getInitials, renderPlayerAvatar } from '../components/player-avatar.component';
import { renderRoleBadge } from '../components/role-badge.component';
import { refreshIcons } from '../icons';
import { html, rawHtml } from '../utils/html-template.util';
import template from './player-profile.page.html?raw';

// ── Player color palette ──────────────────────────────────────

const PLAYER_COLORS = [
  '#E8A020', '#4A90D9', '#50C878', '#E74C3C', '#9B59B6',
  '#1ABC9C', '#E67E22', '#3498DB', '#2ECC71', '#E91E63'
];

function getPlayerColor(id: number): string {
  return PLAYER_COLORS[id % 10];
}

// ── Helpers ───────────────────────────────────────────────────

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

// ── Page Component ────────────────────────────────────────────

export default class PlayerProfilePage extends Component {
  private chart: Chart | null = null;
  private gsapCtx: gsap.Context | null = null;

  override render(): string {
    const id = Number(this.params.id);
    const player = getPlayerById(id);

    if (!player) {
      return `
        <div class="text-center py-20">
          <p class="font-display text-4xl" style="color: var(--color-gold)">GIOCATORE NON TROVATO</p>
          <p class="font-body mt-2" style="color: var(--color-text-secondary)">
            Il giocatore con ID ${id} non esiste.
          </p>
          <a href="/" class="inline-block mt-6 font-ui text-sm px-5 py-2 rounded-lg"
             style="background: var(--color-gold-muted); color: var(--color-gold); letter-spacing: 0.08em">
            TORNA ALLA CLASSIFICA
          </a>
        </div>
      `;
    }

    const color = getPlayerColor(player.id);
    const rank = getRank(player.id);
    const displayElo = getDisplayElo(player);
    const stats = getPlayerStats(id);
    const className = player.class >= 0 ? getClassName(player.class) : 'Non classificato';
    const losses = player.matches - player.wins;
    const winRate = player.matches > 0 ? ((player.wins / player.matches) * 100).toFixed(1) : '0.0';
    const goalsPerMatch = player.matches > 0 ? (player.goalsFor / player.matches).toFixed(1) : '0.0';
    const concededPerMatch = player.matches > 0 ? (player.goalsAgainst / player.matches).toFixed(1) : '0.0';
    const goalRatio = player.goalsAgainst > 0
      ? (player.goalsFor / player.goalsAgainst).toFixed(2)
      : player.goalsFor > 0 ? '∞' : '0.00';

    const bestElo = stats.bestElo === -Infinity ? displayElo : Math.round(stats.bestElo);
    const worstElo = stats.worstElo === Infinity ? displayElo : Math.round(stats.worstElo);
    const eloRange = bestElo - worstElo;

    const defenceRolePct = player.matches > 0
      ? Math.round((stats.matchesAsDefence / player.matches) * 100)
      : 0;
    const attackRolePct = player.matches > 0
      ? Math.round((stats.matchesAsAttack / player.matches) * 100)
      : 0;
    const attackWinRate = stats.matchesAsAttack > 0
      ? Math.round((stats.winsAsAttack / stats.matchesAsAttack) * 100)
      : 0;
    const defenceWinRate = stats.matchesAsDefence > 0
      ? Math.round((stats.winsAsDefence / stats.matchesAsDefence) * 100)
      : 0;

    // Match history (newest first)
    const playerMatches = stats.history.slice().reverse();

    return html(template, {
      pageHeader: rawHtml(this.renderPageHeader()),
      playerColor: color,
      avatar: rawHtml(renderPlayerAvatar({
        initials: getInitials(player.name),
        color,
        size: 'xxl',
        playerId: id,
        playerClass: player.class
      })),
      rankBadge: rawHtml(rank <= 3 && rank > 0
        ? `<span class="absolute -top-1 -right-1 text-xl leading-none">${getRankMedal(rank)}</span>`
        : ''),
      playerName: player.name.toUpperCase(),
      onlineBadge: rawHtml(''),
      className: `${className.toUpperCase()}`,
      rank: rank > 0 ? String(rank) : '---',
      displayElo,
      matches: player.matches,
      wins: player.wins,
      losses,
      winRate,
      bestElo,
      worstElo,
      eloRange,
      matchesAsDefence: stats.matchesAsDefence,
      defenceRolePct,
      matchesAsAttack: stats.matchesAsAttack,
      attackRolePct,
      winsAsAttack: stats.winsAsAttack,
      lossesAsAttack: stats.lossesAsAttack,
      attackWinRate,
      winsAsDefence: stats.winsAsDefence,
      lossesAsDefence: stats.lossesAsDefence,
      defenceWinRate,
      goalsFor: player.goalsFor,
      goalsAgainst: player.goalsAgainst,
      goalRatio,
      goalsPerMatch,
      concededPerMatch,
      bestWinStreak: stats.bestWinStreak,
      worstLossStreak: stats.worstLossStreak,
      companionCards: rawHtml(this.renderCompanionCards(stats)),
      bestWorstMatches: rawHtml(this.renderBestWorstMatches(stats, id)),
      matchCount: playerMatches.length,
      tableRows: rawHtml(this.renderTableRows(playerMatches, id)),
      mobileMatchCards: rawHtml(this.renderMobileMatchCards(playerMatches, id))
    });
  }

  // ── Page Header ───────────────────────────────────────────

  private renderPageHeader(): string {
    return `
      <div class="page-header flex items-center gap-3">
        <i data-lucide="circle-user" class="text-(--color-gold)"
           style="width:26px;height:26px"></i>
        <div>
          <h1 class="text-white font-display"
              style="font-size:clamp(28px,6vw,42px); letter-spacing:0.12em; line-height:1">
            PROFILO GIOCATORE
          </h1>
          <p class="font-ui"
             style="font-size:12px; color:rgba(255,255,255,0.5); letter-spacing:0.1em">
            STATISTICHE COMPLETE · STAGIONE 2025–2026
          </p>
        </div>
      </div>
    `;
  }

  // ── Companion / Opponent Cards ────────────────────────────

  private renderCompanionCards(stats: PlayerStats): string {
    const cards: { label: string; name: string; subtitle: string; color?: string }[] = [];

    if (stats.bestTeammateCount?.player) {
      cards.push({
        label: 'COMPAGNO FREQUENTE',
        name: stats.bestTeammateCount.player.name,
        subtitle: `${stats.bestTeammateCount.score} partite`
      });
    }
    if (stats.bestTeammate?.player) {
      cards.push({
        label: 'MIGLIOR COMPAGNO',
        name: stats.bestTeammate.player.name,
        subtitle: `+${Math.round(stats.bestTeammate.score)}`,
        color: 'var(--color-win)'
      });
    }
    if (stats.worstTeammate?.player) {
      cards.push({
        label: 'PEGGIOR COMPAGNO',
        name: stats.worstTeammate.player.name,
        subtitle: `${Math.round(stats.worstTeammate.score)}`,
        color: 'var(--color-loss)'
      });
    }
    if (stats.bestOpponent?.player) {
      cards.push({
        label: 'AVVERSARIO PIÙ FORTE',
        name: stats.bestOpponent.player.name,
        subtitle: `${Math.round(stats.bestOpponent.score)}`,
        color: 'var(--color-loss)'
      });
    }
    if (stats.worstOpponent?.player) {
      cards.push({
        label: 'AVVERSARIO PIÙ SCARSO',
        name: stats.worstOpponent.player.name,
        subtitle: `+${Math.round(stats.worstOpponent.score)}`,
        color: 'var(--color-win)'
      });
    }
    if (stats.avgTeamElo != null && stats.avgOpponentElo != null) {
      cards.push({
        label: 'ELO MEDIO',
        name: `Squadra: ${Math.round(stats.avgTeamElo)}`,
        subtitle: `Avversari: ${Math.round(stats.avgOpponentElo)}`
      });
    }

    return cards.map(c => `
      <div class="rounded-lg p-3" style="background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.04)">
        <p class="font-ui text-[10px] uppercase tracking-widest mb-1" style="color:var(--color-text-muted)">${c.label}</p>
        <p class="font-body text-sm" style="color:#fff">${c.name}</p>
        <p class="font-body text-xs mt-0.5" style="color:${c.color ?? 'var(--color-text-dim)'}">${c.subtitle}</p>
      </div>
    `).join('');
  }

  // ── Best/Worst Matches ────────────────────────────────────

  private renderBestWorstMatches(stats: PlayerStats, playerId: number): string {
    const items: { label: string; match: IMatch | null; isWin: boolean }[] = [
      { label: 'MIGLIORE VITTORIA (ELO)', match: stats.bestVictoryByElo, isWin: true },
      { label: 'PEGGIORE SCONFITTA (ELO)', match: stats.worstDefeatByElo, isWin: false },
      { label: 'MIGLIORE VITTORIA (PUNTEGGIO)', match: stats.bestVictoryByScore, isWin: true },
      { label: 'PEGGIORE SCONFITTA (PUNTEGGIO)', match: stats.worstDefeatByScore, isWin: false }
    ];

    return items.map((item) => {
      if (!item.match) {
        return `
          <div class="rounded-lg p-3" style="background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.04)">
            <p class="font-ui text-[10px] uppercase tracking-widest mb-1" style="color:var(--color-text-muted)">${item.label}</p>
            <p class="font-body text-xs" style="color:var(--color-text-dim)">Nessun dato</p>
          </div>
        `;
      }

      const m = item.match;
      const inTeamA = m.teamA.defence === playerId || m.teamA.attack === playerId;
      const team = inTeamA ? 0 : 1;
      const delta = Math.round(m.deltaELO[team]);
      const deltaSign = delta >= 0 ? '+' : '';
      const deltaColor = delta >= 0 ? 'var(--color-win)' : 'var(--color-loss)';

      const myTeam = inTeamA ? m.teamA : m.teamB;
      const oppTeam = inTeamA ? m.teamB : m.teamA;
      const teammate = myTeam.defence === playerId
        ? getPlayerById(myTeam.attack)
        : getPlayerById(myTeam.defence);
      const opp1 = getPlayerById(oppTeam.defence);
      const opp2 = getPlayerById(oppTeam.attack);

      return `
        <div class="rounded-lg p-3" style="background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.04)">
          <p class="font-ui text-[10px] uppercase tracking-widest mb-2" style="color:var(--color-text-muted)">${item.label}</p>
          <div class="flex items-center justify-between mb-2">
            <span class="font-display text-2xl" style="color:#fff">${m.score[0]}-${m.score[1]}</span>
            <span class="font-ui text-xs px-2 py-0.5 rounded"
                  style="background:${delta >= 0 ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)'}; color:${deltaColor}">
              ${deltaSign}${delta}
            </span>
          </div>
          <p class="font-body text-xs" style="color:rgba(255,255,255,0.6)">vs ${opp1?.name ?? '?'} &amp; ${opp2?.name ?? '?'}</p>
          <p class="font-body text-xs" style="color:var(--color-text-dim)">con ${teammate?.name ?? '?'}</p>
        </div>
      `;
    }).join('');
  }

  // ── Desktop Table Rows ────────────────────────────────────

  private renderTableRows(matches: IMatch[], playerId: number): string {
    const runningElo = this.computeStartElo(playerId);
    const allMatches = getAllMatches();
    const eloHistory: { before: number; after: number; delta: number }[] = [];

    // Build ELO history in chronological order
    let elo = runningElo;
    for (const m of allMatches) {
      const inTeamA = m.teamA.defence === playerId || m.teamA.attack === playerId;
      const inTeamB = m.teamB.defence === playerId || m.teamB.attack === playerId;
      if (!inTeamA && !inTeamB) continue;

      const delta = inTeamA ? m.deltaELO[0] : m.deltaELO[1];
      const before = Math.round(elo);
      elo += delta;
      const after = Math.round(elo);
      eloHistory.push({ before, after, delta });
    }

    // Reverse to match the display order (newest first)
    const reversedEloHistory = eloHistory.slice().reverse();

    return matches.map((m, idx) => {
      const inTeamA = m.teamA.defence === playerId || m.teamA.attack === playerId;
      const team = inTeamA ? 0 : 1;
      const delta = m.deltaELO[team];
      const roundedDelta = Math.round(delta);
      const deltaSign = roundedDelta >= 0 ? '+' : '';
      const deltaColor = roundedDelta >= 0 ? 'var(--color-win)' : 'var(--color-loss)';
      const deltaBg = roundedDelta >= 0 ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)';

      const eloInfo = reversedEloHistory[idx];
      const teamElo = Math.round(m.teamELO[team]);
      const oppTeamElo = Math.round(m.teamELO[team ^ 1]);

      // K-factor multiplier display
      const kMultiplier = teamElo > 0 ? (oppTeamElo / teamElo).toFixed(2) : '1.00';

      const myTeam = inTeamA ? m.teamA : m.teamB;
      const oppTeam = inTeamA ? m.teamB : m.teamA;
      const isDefence = myTeam.defence === playerId;
      const teammate = isDefence
        ? getPlayerById(myTeam.attack)
        : getPlayerById(myTeam.defence);
      const opp1 = getPlayerById(oppTeam.defence);
      const opp2 = getPlayerById(oppTeam.attack);

      const score = inTeamA ? `${m.score[0]}-${m.score[1]}` : `${m.score[1]}-${m.score[0]}`;
      const totalGoals = m.score[0] + m.score[1];
      const myGoals = inTeamA ? m.score[0] : m.score[1];
      const winPct = totalGoals > 0 ? Math.round((myGoals / totalGoals) * 100) : 0;

      const rowBg = idx % 2 === 0 ? 'background:transparent' : 'background:rgba(255,255,255,0.02)';

      return `
        <tr style="${rowBg}; border-bottom:1px solid rgba(255,255,255,0.04)">
          <td class="px-3 py-3">
            <div class="flex items-center gap-1.5">
              <span class="font-body text-xs" style="color:rgba(255,255,255,0.7)">${eloInfo?.before ?? '?'} → ${eloInfo?.after ?? '?'}</span>
              <span class="font-ui text-[10px] px-1.5 py-0.5 rounded" style="background:${deltaBg}; color:${deltaColor}">${deltaSign}${roundedDelta}</span>
            </div>
          </td>
          <td class="px-3 py-3">
            <p class="font-body text-xs" style="color:rgba(255,255,255,0.7)">${teamElo}</p>
            <p class="font-body text-[10px]" style="color:var(--color-text-dim)">x${kMultiplier}</p>
          </td>
          <td class="px-3 py-3 text-center">
            ${renderRoleBadge({ role: isDefence ? 'defence' : 'attack', size: 'base', showPct: false })}
          </td>
          <td class="px-3 py-3">
            <p class="font-body text-xs" style="color:rgba(255,255,255,0.7)">${teammate?.name ?? '?'}</p>
            <p class="font-body text-[10px]" style="color:var(--color-text-dim)">(${teammate ? getDisplayElo(teammate) : '?'})</p>
          </td>
          <td class="px-3 py-3 text-center">
            <p class="font-display text-base" style="color:#fff">${score}</p>
            <p class="font-body text-[10px]" style="color:var(--color-text-dim)">${winPct}%</p>
          </td>
          <td class="px-3 py-3">
            <p class="font-body text-xs" style="color:rgba(255,255,255,0.7)">${opp1?.name ?? '?'} (${opp1 ? getDisplayElo(opp1) : '?'})</p>
            <p class="font-body text-xs" style="color:rgba(255,255,255,0.7)">${opp2?.name ?? '?'} (${opp2 ? getDisplayElo(opp2) : '?'})</p>
          </td>
          <td class="px-3 py-3 text-center">
            <span class="font-body text-xs" style="color:rgba(255,255,255,0.7)">${oppTeamElo}</span>
          </td>
        </tr>
      `;
    }).join('');
  }

  // ── Mobile Match Cards ────────────────────────────────────

  private renderMobileMatchCards(matches: IMatch[], playerId: number): string {
    let elo = this.computeStartElo(playerId);
    const allMatches = getAllMatches();
    const eloHistory: { before: number; after: number }[] = [];

    for (const m of allMatches) {
      const inTeamA = m.teamA.defence === playerId || m.teamA.attack === playerId;
      const inTeamB = m.teamB.defence === playerId || m.teamB.attack === playerId;
      if (!inTeamA && !inTeamB) continue;

      const delta = inTeamA ? m.deltaELO[0] : m.deltaELO[1];
      const before = Math.round(elo);
      elo += delta;
      eloHistory.push({ before, after: Math.round(elo) });
    }

    const reversedEloHistory = eloHistory.slice().reverse();

    return matches.map((m, idx) => {
      const inTeamA = m.teamA.defence === playerId || m.teamA.attack === playerId;
      const team = inTeamA ? 0 : 1;
      const delta = m.deltaELO[team];
      const roundedDelta = Math.round(delta);
      const deltaSign = roundedDelta >= 0 ? '+' : '';
      const isWin = roundedDelta >= 0;
      const winColor = isWin ? 'var(--color-win)' : 'var(--color-loss)';
      const winBg = isWin ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)';
      const deltaBg = isWin ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)';

      const eloInfo = reversedEloHistory[idx];

      const myTeam = inTeamA ? m.teamA : m.teamB;
      const oppTeam = inTeamA ? m.teamB : m.teamA;
      const isDefence = myTeam.defence === playerId;
      const teammate = isDefence
        ? getPlayerById(myTeam.attack)
        : getPlayerById(myTeam.defence);
      const opp1 = getPlayerById(oppTeam.defence);
      const opp2 = getPlayerById(oppTeam.attack);

      const score = inTeamA ? `${m.score[0]}-${m.score[1]}` : `${m.score[1]}-${m.score[0]}`;

      return `
        <div class="rounded-lg overflow-hidden" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05)">
          <!-- Top row: result + score + delta -->
          <div class="flex items-center gap-2 px-3 py-2" style="border-bottom:1px solid rgba(255,255,255,0.04)">
            <span class="font-ui text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style="background:${winBg}; color:${winColor}; letter-spacing:0.08em">
              ${isWin ? 'WIN' : 'LOSS'}
            </span>
            <span class="font-display text-lg flex-1" style="color:#fff">${score}</span>
            <span class="font-ui text-[10px] px-1.5 py-0.5 rounded"
                  style="background:${deltaBg}; color:${winColor}">${deltaSign}${roundedDelta}</span>
            <span class="font-body text-[10px]" style="color:var(--color-text-dim)">${formatFullDate(m.createdAt)}</span>
          </div>
          <!-- Details grid -->
          <div class="grid grid-cols-2 gap-x-3 gap-y-1.5 px-3 py-2 text-[11px]">
            <div>
              <span class="font-ui text-[9px] uppercase tracking-widest" style="color:var(--color-text-muted)">ELO</span>
              <p class="font-body" style="color:rgba(255,255,255,0.7)">${eloInfo?.before ?? '?'} → ${eloInfo?.after ?? '?'}</p>
            </div>
            <div>
              <span class="font-ui text-[9px] uppercase tracking-widest" style="color:var(--color-text-muted)">RUOLO</span>
              <div class="mt-1">${renderRoleBadge({ role: isDefence ? 'defence' : 'attack', size: 'lg', showLabel: true })}</div>
            </div>
            <div>
              <span class="font-ui text-[9px] uppercase tracking-widest" style="color:var(--color-text-muted)">COMPAGNO</span>
              <p class="font-body" style="color:rgba(255,255,255,0.7)">${teammate?.name ?? '?'}</p>
            </div>
            <div>
              <span class="font-ui text-[9px] uppercase tracking-widest" style="color:var(--color-text-muted)">AVVERSARI</span>
              <p class="font-body" style="color:rgba(255,255,255,0.7)">${opp1?.name ?? '?'} &amp; ${opp2?.name ?? '?'}</p>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ── Compute starting ELO ──────────────────────────────────

  private computeStartElo(playerId: number): number {
    return getPlayerById(playerId)?.startElo ?? 1000;
  }

  // ── Mount ─────────────────────────────────────────────────

  override mount(): void {
    const id = Number(this.params.id);
    const player = getPlayerById(id);
    if (!player) return;

    Chart.register(...registerables);
    refreshIcons();

    this.mountEloChart(id, player);
    this.mountAnimations(player);
  }

  private mountEloChart(id: number, player: IPlayer): void {
    const allMatches = getAllMatches();
    const labels: string[] = [];
    const eloData: number[] = [];
    let currentElo = player.startElo;

    for (const match of allMatches) {
      const inTeamA = match.teamA.defence === id || match.teamA.attack === id;
      const inTeamB = match.teamB.defence === id || match.teamB.attack === id;
      if (!inTeamA && !inTeamB) continue;

      const delta = inTeamA ? match.deltaELO[0] : match.deltaELO[1];
      currentElo += delta;
      labels.push(formatShortDate(match.createdAt));
      eloData.push(Math.round(currentElo));
    }

    const canvas = this.$id('elo-chart') as HTMLCanvasElement | null;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gradient = ctx.createLinearGradient(0, 0, 0, 260);
    gradient.addColorStop(0, 'rgba(255, 215, 0, 0.25)');
    gradient.addColorStop(1, 'rgba(240, 165, 0, 0.02)');

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
            backgroundColor: 'rgba(15, 42, 32, 0.95)',
            titleFont: { family: 'Oswald', size: 11 },
            bodyFont: { family: 'Inter', size: 12 },
            titleColor: 'rgba(255,255,255,0.5)',
            bodyColor: '#FFD700',
            borderColor: 'rgba(255,215,0,0.2)',
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            callbacks: { label: context => `ELO: ${context.parsed.y}` }
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

  private mountAnimations(player: IPlayer): void {
    const stats = getPlayerStats(Number(this.params.id));
    const defPct = player.matches > 0 ? Math.round((stats.matchesAsDefence / player.matches) * 100) : 0;
    const attPct = player.matches > 0 ? Math.round((stats.matchesAsAttack / player.matches) * 100) : 0;

    this.gsapCtx = gsap.context(() => {
      gsap.from('#hero-card', { opacity: 0, y: 30, duration: 0.6, ease: 'power3.out' });
      gsap.from('.hero-avatar', { scale: 0.92, opacity: 0, duration: 0.45, ease: 'back.out(1.2)' });
      gsap.from('#elo-stats-row > div', { opacity: 0, y: 20, duration: 0.4, stagger: 0.08, delay: 0.15, ease: 'power2.out' });
      gsap.from('#chart-section', { opacity: 0, y: 25, duration: 0.5, delay: 0.2, ease: 'power3.out' });

      // Role bars
      gsap.to('#defence-role-bar', { width: `${defPct}%`, duration: 0.8, delay: 0.4, ease: 'power2.out' });
      gsap.to('#attack-role-bar', { width: `${attPct}%`, duration: 0.8, delay: 0.5, ease: 'power2.out' });
    }, this.el ?? undefined);
  }

  // ── Destroy ───────────────────────────────────────────────

  override destroy(): void {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    if (this.gsapCtx) {
      this.gsapCtx.revert();
      this.gsapCtx = null;
    }
  }
}
