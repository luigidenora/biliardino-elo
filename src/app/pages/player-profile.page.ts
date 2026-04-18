/**
 * PlayerProfilePage -- Full-screen profile for a single player.
 *
 * Route: /profile/:id
 * Displays hero card, ELO stats, chart, role stats, goal stats,
 * streaks, teammates/opponents, best/worst matches, and full match history table.
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

const CLASS_COLORS: Record<number, string> = {
  0: '#12d9ff',
  1: '#008fff',
  2: '#FFD700',
  3: '#C0C0C0',
  4: '#8B7D6B'
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

// ── Page Component ────────────────────────────────────────────

export default class PlayerProfilePage extends Component {
  private chart: Chart | null = null;
  private radarChart: Chart | null = null;
  private radarData: number[] = [];
  private gsapCtx: gsap.Context | null = null;
  private chartRole: 0 | 1 = 0;

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

    const color = getPlayerColor(player);
    const bestRole = player.bestRole as 0 | 1;

    // Rank
    const rankGeneral = player.rank[2];
    const rankDefence = player.rank[0];
    const rankAttack = player.rank[1];

    // ELO
    const displayElo = Math.round(player.elo[bestRole]);

    // Totals
    const totalMatches = player.matches[0] + player.matches[1];
    const totalWins = player.wins[0] + player.wins[1];
    const totalLosses = totalMatches - totalWins;
    const winRate = totalMatches > 0 ? ((totalWins / totalMatches) * 100).toFixed(1) : '0.0';

    // ELO per ruolo
    const eloDef = Math.round(player.elo[0]);
    const eloAtt = Math.round(player.elo[1]);
    const bestEloDef = Math.round(player.bestElo[0]);
    const worstEloDef = Math.round(player.worstElo[0]);
    const bestEloAtt = Math.round(player.bestElo[1]);
    const worstEloAtt = Math.round(player.worstElo[1]);

    // Role stats
    const winsAsDefence = player.wins[0];
    const lossesAsDefence = player.matches[0] - player.wins[0];
    const defenceWinRate = player.matches[0] > 0 ? Math.round((player.wins[0] / player.matches[0]) * 100) : 0;
    const winsAsAttack = player.wins[1];
    const lossesAsAttack = player.matches[1] - player.wins[1];
    const attackWinRate = player.matches[1] > 0 ? Math.round((player.wins[1] / player.matches[1]) * 100) : 0;
    const defenceRolePct = totalMatches > 0 ? Math.round((player.matches[0] / totalMatches) * 100) : 0;
    const attackRolePct = totalMatches > 0 ? Math.round((player.matches[1] / totalMatches) * 100) : 0;

    // Goals
    const totalGoalsFor = player.goalsFor[0] + player.goalsFor[1];
    const totalGoalsAgainst = player.goalsAgainst[0] + player.goalsAgainst[1];
    const goalRatio = totalGoalsAgainst > 0
      ? (totalGoalsFor / totalGoalsAgainst).toFixed(2)
      : totalGoalsFor > 0 ? '∞' : '0.00';
    const goalsPerMatch = totalMatches > 0 ? (totalGoalsFor / totalMatches).toFixed(1) : '0.0';
    const concededPerMatch = totalMatches > 0 ? (totalGoalsAgainst / totalMatches).toFixed(1) : '0.0';

    // Streaks per role
    const bestWinStreakDef = player.bestWinStreak[0];
    const bestWinStreakAtt = player.bestWinStreak[1];
    const worstLossStreakDef = Math.abs(player.worstLossStreak[0]);
    const worstLossStreakAtt = Math.abs(player.worstLossStreak[1]);

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
      onlineBadge: rawHtml(''),
      className: className.toUpperCase(),
      rankWatermark: rankGeneral > 0 ? String(rankGeneral) : '---',
      rankGeneral: rankGeneral > 0 ? String(rankGeneral) : '---',
      rankDefence: rankDefence > 0 ? String(rankDefence) : '---',
      rankAttack: rankAttack > 0 ? String(rankAttack) : '---',
      displayElo,
      matches: totalMatches,
      wins: totalWins,
      losses: totalLosses,
      winRate,
      // ELO per ruolo
      eloDef,
      eloAtt,
      bestEloDef,
      worstEloDef,
      bestEloAtt,
      worstEloAtt,
      // Ruolo
      matchesAsDefence: player.matches[0],
      defenceRolePct,
      matchesAsAttack: player.matches[1],
      attackRolePct,
      winsAsAttack,
      lossesAsAttack,
      attackWinRate,
      winsAsDefence,
      lossesAsDefence,
      defenceWinRate,
      // Goals totali
      goalsFor: totalGoalsFor,
      goalsAgainst: totalGoalsAgainst,
      goalRatio,
      goalsPerMatch,
      concededPerMatch,
      // Goals per ruolo
      goalsForDef: player.goalsFor[0],
      goalsAgainstDef: player.goalsAgainst[0],
      goalsForAtt: player.goalsFor[1],
      goalsAgainstAtt: player.goalsAgainst[1],
      // Streaks
      bestWinStreakDef,
      bestWinStreakAtt,
      worstLossStreakDef,
      worstLossStreakAtt,
      // Chart toggle initial styles
      chartBtnDefStyle: bestRole === 0
        ? 'background:linear-gradient(135deg,#FFD700,#F0A500);color:var(--color-bg-deep);font-weight:700'
        : 'background:transparent;color:rgba(255,255,255,0.6)',
      chartBtnAttStyle: bestRole === 1
        ? 'background:linear-gradient(135deg,#FFD700,#F0A500);color:var(--color-bg-deep);font-weight:700'
        : 'background:transparent;color:rgba(255,255,255,0.6)',
      // Sections
      companionCards: rawHtml(this.renderCompanionCards(player)),
      bestWorstMatches: rawHtml(this.renderBestWorstMatches(player, id)),
      matchCount: combinedHistory.length,
      tableRows: rawHtml(this.renderTableRows(combinedHistory, id, player)),
      mobileMatchCards: rawHtml(this.renderMobileMatchCards(combinedHistory, id, player))
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

  private renderCompanionCards(player: IPlayer): string {
    const role = player.bestRole as 0 | 1;
    const cards: { label: string; name: string; subtitle: string; color?: string }[] = [];

    const bt = player.bestTeammate[role];
    if (bt) {
      const p = getPlayerById(bt.player);
      if (p) cards.push({ label: 'MIGLIOR COMPAGNO', name: p.name, subtitle: `+${Math.round(bt.value)}`, color: 'var(--color-win)' });
    }
    const wt = player.worstTeammate[role];
    if (wt) {
      const p = getPlayerById(wt.player);
      if (p) cards.push({ label: 'PEGGIOR COMPAGNO', name: p.name, subtitle: `${Math.round(wt.value)}`, color: 'var(--color-loss)' });
    }
    const btc = player.bestTeammateCount[role];
    if (btc) {
      const p = getPlayerById(btc.player);
      if (p) cards.push({ label: 'COMPAGNO FREQUENTE', name: p.name, subtitle: `${Math.round(btc.value)} partite` });
    }
    const bo = player.bestOpponent[role];
    if (bo) {
      const p = getPlayerById(bo.player);
      if (p) cards.push({ label: 'AVVERSARIO PIÙ FORTE', name: p.name, subtitle: `${Math.round(bo.value)}`, color: 'var(--color-loss)' });
    }
    const wo = player.worstOpponent[role];
    if (wo) {
      const p = getPlayerById(wo.player);
      if (p) cards.push({ label: 'AVVERSARIO PIÙ SCARSO', name: p.name, subtitle: `+${Math.round(wo.value)}`, color: 'var(--color-win)' });
    }
    const avgTeam = player.avgTeamElo[role];
    const avgOpp = player.avgOpponentElo[role];
    if (avgTeam != null && avgOpp != null) {
      cards.push({ label: 'ELO MEDIO', name: `Squadra: ${Math.round(avgTeam)}`, subtitle: `Avversari: ${Math.round(avgOpp)}` });
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

  private renderBestWorstMatches(player: IPlayer, playerId: number): string {
    type MS = { match: IMatch; value: number } | null;
    const pick = (a: MS, b: MS, dir: 'max' | 'min'): MS => {
      if (!a) return b;
      if (!b) return a;
      return dir === 'max' ? (a.value >= b.value ? a : b) : (a.value <= b.value ? a : b);
    };

    const items: { label: string; ms: MS }[] = [
      { label: 'MIGLIORE VITTORIA (ELO)', ms: pick(player.bestVictoryByElo[0], player.bestVictoryByElo[1], 'max') },
      { label: 'PEGGIORE SCONFITTA (ELO)', ms: pick(player.worstDefeatByElo[0], player.worstDefeatByElo[1], 'min') },
      { label: 'MIGLIORE VITTORIA (PUNTEGGIO)', ms: pick(player.bestVictoryByScore[0], player.bestVictoryByScore[1], 'max') },
      { label: 'PEGGIORE SCONFITTA (PUNTEGGIO)', ms: pick(player.worstDefeatByScore[0], player.worstDefeatByScore[1], 'min') }
    ];

    return items.map((item) => {
      if (!item.ms) {
        return `
          <div class="rounded-lg p-3" style="background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.04)">
            <p class="font-ui text-[10px] uppercase tracking-widest mb-1" style="color:var(--color-text-muted)">${item.label}</p>
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

  private renderTableRows(matches: IMatch[], playerId: number, player: IPlayer): string {
    const eloMap = this.buildEloMap(player, playerId);

    return matches.map((m, idx) => {
      const inTeamA = m.teamA.defence === playerId || m.teamA.attack === playerId;
      const team = inTeamA ? 0 : 1;
      const delta = m.deltaELO[team];
      const roundedDelta = Math.round(delta);
      const deltaSign = roundedDelta >= 0 ? '+' : '';
      const deltaColor = roundedDelta >= 0 ? 'var(--color-win)' : 'var(--color-loss)';
      const deltaBg = roundedDelta >= 0 ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)';

      const eloInfo = eloMap.get(m.id);
      const teamElo = Math.round(m.teamELO[team]);
      const oppTeamElo = Math.round(m.teamELO[team ^ 1]);
      const kMultiplier = teamElo > 0 ? (oppTeamElo / teamElo).toFixed(2) : '1.00';

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
            <p class="font-body text-[10px]" style="color:var(--color-text-dim)">(${teammateElo})</p>
          </td>
          <td class="px-3 py-3 text-center">
            <p class="font-display text-base" style="color:#fff">${score}</p>
            <p class="font-body text-[10px]" style="color:var(--color-text-dim)">${winPct}%</p>
          </td>
          <td class="px-3 py-3">
            <p class="font-body text-xs" style="color:rgba(255,255,255,0.7)">${opp1?.name ?? '?'} (${opp1 ? Math.round(opp1.elo[0]) : '?'})</p>
            <p class="font-body text-xs" style="color:rgba(255,255,255,0.7)">${opp2?.name ?? '?'} (${opp2 ? Math.round(opp2.elo[1]) : '?'})</p>
          </td>
          <td class="px-3 py-3 text-center">
            <span class="font-body text-xs" style="color:rgba(255,255,255,0.7)">${oppTeamElo}</span>
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
      const score = inTeamA ? `${m.score[0]}-${m.score[1]}` : `${m.score[1]}-${m.score[0]}`;

      return `
        <div class="rounded-lg overflow-hidden" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05)">
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

  // ── Mount ─────────────────────────────────────────────────

  override mount(): void {
    const id = Number(this.params.id);
    const player = getPlayerById(id);
    if (!player) return;

    Chart.register(...registerables);
    refreshIcons();

    this.chartRole = player.bestRole as 0 | 1;
    this.mountEloChart(id, player, this.chartRole);
    this.mountRadarChart(id, player);
    this.mountAnimations(player);
    this.bindChartToggle(id, player);
  }

  private bindChartToggle(id: number, player: IPlayer): void {
    const btns = this.$$<HTMLButtonElement>('.js-chart-role-btn');
    for (const btn of btns) {
      btn.addEventListener('click', () => {
        const role = Number(btn.dataset.role) as 0 | 1;
        if (this.chartRole === role) return;
        this.chartRole = role;

        for (const b of btns) {
          const isActive = Number(b.dataset.role) === role;
          b.style.background = isActive ? 'linear-gradient(135deg,#FFD700,#F0A500)' : 'transparent';
          b.style.color = isActive ? 'var(--color-bg-deep)' : 'rgba(255,255,255,0.6)';
          b.style.fontWeight = isActive ? '700' : 'normal';
        }

        if (this.chart) {
          this.chart.destroy();
          this.chart = null;
        }
        this.mountEloChart(id, player, role);
      });
    }
  }

  private mountEloChart(id: number, player: IPlayer, role: 0 | 1): void {
    const history = player.history[role];
    const startElo = this.computeStartElo(player, role);

    const labels: string[] = ['Inizio'];
    const eloData: number[] = [Math.round(startElo)];
    let currentElo = startElo;

    for (let i = 0; i < history.length; i++) {
      const match = history[i];
      const isTeamA = match.teamA.defence === id || match.teamA.attack === id;
      const delta = (isTeamA ? match.deltaELO[0] : match.deltaELO[1]) * getBonusK(i);
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

  private mountAnimations(player: IPlayer): void {
    const totalMatches = player.matches[0] + player.matches[1];
    const defPct = totalMatches > 0 ? Math.round((player.matches[0] / totalMatches) * 100) : 0;
    const attPct = totalMatches > 0 ? Math.round((player.matches[1] / totalMatches) * 100) : 0;

    this.gsapCtx = gsap.context(() => {
      gsap.from('#hero-card', { opacity: 0, y: 30, duration: 0.6, ease: 'power3.out' });
      gsap.from('.hero-avatar', { scale: 0.92, opacity: 0, duration: 0.45, ease: 'back.out(1.2)' });
      gsap.from('#elo-stats-row > div', { opacity: 0, y: 20, duration: 0.4, stagger: 0.08, delay: 0.15, ease: 'power2.out' });
      gsap.from('#chart-section', { opacity: 0, y: 25, duration: 0.5, delay: 0.2, ease: 'power3.out' });
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
    if (this.radarChart) {
      this.radarChart.destroy();
      this.radarChart = null;
    }
    if (this.gsapCtx) {
      this.gsapCtx.revert();
      this.gsapCtx = null;
    }
  }
}
