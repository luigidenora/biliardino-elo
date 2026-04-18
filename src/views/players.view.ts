import { BASE_PATH } from '@/config/env.config';
import { IMatch } from '@/models/match.interface';
import { IPlayer, MatchPlayerStats, PlayerStats as PlayerRefStats } from '@/models/player.interface';
import { getAllMatches } from '@/services/match.service';
import { getBonusK, getPlayerById } from '@/services/player.service';
import { formatRank } from '@/utils/format-rank.util';
import { getClassName } from '@/utils/get-class-name.util';
import { getGoalRatioColor, getWinRateColor } from '@/utils/stats-thresholds.util';

type RoleScope = 'all' | 0 | 1;
type ScopeSection = 'stats' | 'teammates' | 'opponents' | 'chart' | 'history';
type SortDirection = 'asc' | 'desc';
type StatsSortKey = 'label' | 'defence' | 'attack' | 'total';
type RelationSortKey = 'name' | 'matches' | 'wins' | 'losses' | 'winRate' | 'delta';

type MatchResultRef = {
  player: { name: string };
  score: number;
} | null;

type MatchSummary = {
  matches: number;
  wins: number;
  losses: number;
  matchesAsDefence: number;
  matchesAsAttack: number;
  winsAsDefence: number;
  winsAsAttack: number;
  lossesAsDefence: number;
  lossesAsAttack: number;
  totalGoalsFor: number;
  totalGoalsAgainst: number;
};

type RelationshipRow = {
  id: number;
  avatar: string;
  name: string;
  matches: number;
  wins: number;
  losses: number;
  winRate: string;
  delta: number;
};

type CompactStatRow = {
  label: string;
  hint: string;
  defence: string | number;
  attack: string | number;
  total: string | number;
};

type RelationshipSummary = {
  bestTeammateCount: MatchResultRef;
  bestTeammate: MatchResultRef;
  worstTeammate: MatchResultRef;
  bestOpponent: MatchResultRef;
  worstOpponent: MatchResultRef;
};

type ExtremesSummary = {
  bestVictoryByElo: IMatch | null;
  worstDefeatByElo: IMatch | null;
  bestVictoryByScore: IMatch | null;
  worstDefeatByScore: IMatch | null;
  bestByExpected: IMatch | null;
  worstByExpected: IMatch | null;
};

type ChartTooltipPlayer = {
  id: number;
  name: string;
  avatar: string;
};

type ChartTooltipData = {
  matchNumber: number;
  myScore: number;
  opponentScore: number;
  myExpected: number | null;
  opponentExpected: number | null;
  myTeamElo: number;
  opponentTeamElo: number;
  playerElo: number;
  baseDelta: number;
  totalDelta: number;
  multiplier: number;
  myTeam: [ChartTooltipPlayer, ChartTooltipPlayer];
  opponents: [ChartTooltipPlayer, ChartTooltipPlayer];
};

type ChartProgressPoint = {
  value: number;
  label: string;
  tooltip: ChartTooltipData | null;
};

/**
 * Handles UI display for player details.
 */
export class PlayersView {
  private static sectionScopes: Record<ScopeSection, RoleScope> = {
    stats: 'all',
    teammates: 'all',
    opponents: 'all',
    chart: 0,
    history: 'all'
  };

  private static scopeDefaultsAppliedForPlayer: number | null = null;
  private static statsSortKey: StatsSortKey = 'label';
  private static statsSortDirection: SortDirection = 'asc';
  private static teammatesSortKey: RelationSortKey = 'matches';
  private static teammatesSortDirection: SortDirection = 'desc';
  private static opponentsSortKey: RelationSortKey = 'matches';
  private static opponentsSortDirection: SortDirection = 'desc';

  /**
   * Initialize the view by reading player from query string and rendering stats.
   */
  public static init(): void {
    try {
      const urlParams = new URLSearchParams(globalThis.location.search);
      const playerId = Number.parseInt(urlParams.get('id') || '', 10);

      if (!playerId) {
        PlayersView.renderError('Nessun giocatore specificato. Aggiungi ?id=PLAYER_ID all\'URL.');
        return;
      }

      const player = getPlayerById(playerId);
      if (!player) {
        PlayersView.renderError('Giocatore non trovato.');
        return;
      }

      PlayersView.renderPlayerStats(player);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
      PlayersView.renderError(`Errore: ${errorMessage}`);
    }
  }

  /**
   * Render error message.
   */
  private static renderError(message: string): void {
    const container = document.getElementById('player-stats');
    if (container) {
      container.innerHTML = `<div class="empty-state">${message}</div>`;
    }
  }

  /**
   * Render player details into the container element.
   */
  private static renderPlayerStats(player: IPlayer): void {
    const container = document.getElementById('player-stats');
    if (!container) {
      throw new Error('Player stats container not found');
    }

    getAllMatches(); // Ensure matches are loaded before rendering stats

    if (PlayersView.scopeDefaultsAppliedForPlayer !== player.id) {
      const defaultChartScope: 0 | 1 = player.bestRole === 1 ? 1 : 0;
      PlayersView.sectionScopes = {
        stats: 'all',
        teammates: 'all',
        opponents: 'all',
        chart: defaultChartScope,
        history: 'all'
      };

      PlayersView.scopeDefaultsAppliedForPlayer = player.id;
    }

    const statsScope = PlayersView.sectionScopes.stats;
    const teammatesScope = PlayersView.sectionScopes.teammates;
    const opponentsScope = PlayersView.sectionScopes.opponents;
    const chartScope = PlayersView.sectionScopes.chart;
    const historyScope = PlayersView.sectionScopes.history;

    const teammatesScopeLabel = PlayersView.getScopeLabel(teammatesScope);
    const opponentsScopeLabel = PlayersView.getScopeLabel(opponentsScope);
    const chartScopeLabel = PlayersView.getScopeLabel(chartScope);
    const historyScopeLabel = PlayersView.getScopeLabel(historyScope);

    const defSummary = PlayersView.buildMatchSummary(player, 0);
    const attSummary = PlayersView.buildMatchSummary(player, 1);
    const totalSummary = PlayersView.buildMatchSummary(player, 'all');

    const scopeExtremes = PlayersView.buildExtremes(player, statsScope);

    const historyByScope = PlayersView.getHistoryByScope(player, historyScope);
    const chartHistoryByScope = PlayersView.getHistoryByScope(player, chartScope);

    const teammateRows = PlayersView.buildRelationshipRows(player, teammatesScope, 'teammates');
    const opponentRows = PlayersView.buildRelationshipRows(player, opponentsScope, 'opponents');

    const currentRank = player.rank[2];
    const bestRoleLabel = player.bestRole === 1 ? 'Ruolo preferito ⚔️ Attacco' : 'Ruolo preferito 🛡️ Difesa';
    const roleStatValue = (role: 0 | 1, value: string | number): string | number => {
      if (role === 0 && defSummary.matches <= 0) return '-';
      if (role === 1 && attSummary.matches <= 0) return '-';
      return value;
    };
    const colorizeStatValue = (value: string | number, color: string): string | number => {
      if (value === '-') return value;
      return `<span style="color:${color};">${value}</span>`;
    };
    const formatWinRateStyled = (wins: number, matches: number): string => {
      if (matches <= 0) return '-';
      const rate = Math.round((wins / matches) * 100);
      const color = getWinRateColor(rate);
      return `<span style="color:${color};">${rate}%</span>`;
    };
    const formatGoalRatioStyled = (goalsFor: number, goalsAgainst: number, matches: number): string => {
      if (matches <= 0) return '-';
      const ratio = goalsAgainst > 0 ? goalsFor / goalsAgainst : (goalsFor > 0 ? Infinity : 0);
      if (ratio === Infinity) {
        return '<span style="color:green;">∞</span>';
      }
      if (ratio <= 0) return '-';
      const roundedRatio = Number.parseFloat(ratio.toFixed(2));
      const color = getGoalRatioColor(roundedRatio);
      return `<span style="color:${color};">${roundedRatio.toFixed(2)}</span>`;
    };
    const pickPlayerStatByScope = (
      values: [PlayerRefStats | null, PlayerRefStats | null],
      currentScope: RoleScope,
      direction: 'max' | 'min'
    ): PlayerRefStats | null => {
      if (currentScope === 0 || currentScope === 1) {
        return values[currentScope];
      }

      const [defenceValue, attackValue] = values;
      if (!defenceValue) return attackValue;
      if (!attackValue) return defenceValue;

      if (direction === 'max') {
        return defenceValue.value >= attackValue.value ? defenceValue : attackValue;
      }

      return defenceValue.value <= attackValue.value ? defenceValue : attackValue;
    };
    const resolveHighlightRow = (selected: PlayerRefStats | null, target: 'teammates' | 'opponents'): RelationshipRow | null => {
      if (!selected || selected.player < 0) return null;

      const related = getPlayerById(selected.player);
      if (!related) return null;

      const roleMaps = target === 'teammates' ? player.teammatesStats : player.opponentsStats;
      const merged = PlayersView.mergeStatsByScope(roleMaps, statsScope);
      const stats = merged.get(selected.player);
      const matches = stats?.matches ?? 0;
      const wins = stats?.wins ?? 0;

      return {
        id: selected.player,
        avatar: `${BASE_PATH}avatars/${selected.player}.webp`,
        name: related.name,
        matches,
        wins,
        losses: Math.max(matches - wins, 0),
        winRate: PlayersView.formatPercentage(wins, matches),
        delta: Math.round(selected.value)
      };
    };
    const formatRelationshipHighlight = (row: RelationshipRow | null): string => {
      if (!row) return '-';
      const deltaSign = row.delta >= 0 ? '+' : '';
      const deltaClass = row.delta >= 0 ? 'positive' : 'negative';
      const winRateNum = row.matches > 0 ? Math.round((row.wins / row.matches) * 100) : 0;
      const winRateColor = getWinRateColor(winRateNum);
      return `
        <span class="highlight-player-ref">
          <img
            src="${row.avatar}"
            alt="${row.name}"
            title="${row.name}"
            class="highlight-player-avatar"
            onerror="this.src='${PlayersView.fallbackAvatar()}'"
          />
          <span class="highlight-player-info">
            <span class="highlight-player-name">${row.name}</span>
            <span class="highlight-player-stats">
              <span style="color:${winRateColor};">Win Rate: ${winRateNum}%</span>
              <span class="highlight-player-stat-sep">·</span>
              <strong class="${deltaClass}">${deltaSign}${row.delta} ELO</strong>
            </span>
          </span>
        </span>
      `;
    };
    const formatRelationshipCountHighlight = (row: RelationshipRow | null): string => {
      if (!row) return '-';
      const winRateNum = row.matches > 0 ? Math.round((row.wins / row.matches) * 100) : 0;
      const winRateColor = getWinRateColor(winRateNum);
      return `
        <span class="highlight-player-ref">
          <img
            src="${row.avatar}"
            alt="${row.name}"
            title="${row.name}"
            class="highlight-player-avatar"
            onerror="this.src='${PlayersView.fallbackAvatar()}'"
          />
          <span class="highlight-player-info">
            <span class="highlight-player-name">${row.name}</span>
            <span class="highlight-player-stats">
              <span style="color:${winRateColor};">Win Rate: ${winRateNum}%</span>
              <span class="highlight-player-stat-sep">·</span>
              <span><strong>${row.matches}</strong> partite</span>
            </span>
          </span>
        </span>
      `;
    };
    const formatHighlightMatch = (match: IMatch | null): string => {
      if (!match) return '-';

      const isTeamA = match.teamA.attack === player.id || match.teamA.defence === player.id;
      const myTeam = isTeamA ? match.teamA : match.teamB;
      const opponentTeam = isTeamA ? match.teamB : match.teamA;
      const myDefence = getPlayerById(myTeam.defence);
      const myAttack = getPlayerById(myTeam.attack);
      const oppDefence = getPlayerById(opponentTeam.defence);
      const oppAttack = getPlayerById(opponentTeam.attack);
      const myScore = isTeamA ? match.score[0] : match.score[1];
      const oppScore = isTeamA ? match.score[1] : match.score[0];

      const renderRoleAvatar = (target: IPlayer | null | undefined): string => `
        <span class="highlight-match-role-slot ${target?.id === player.id ? 'is-self' : ''}">
          <img
            src="${target ? `${BASE_PATH}avatars/${target.id}.webp` : PlayersView.fallbackAvatar()}"
            alt="${target?.name || '?'}"
            title="${target?.name || '?'}"
            class="highlight-match-avatar"
            onerror="this.src='${PlayersView.fallbackAvatar()}'"
          />
        </span>
      `;

      const delta = getMatchDelta(match);
      const deltaSign = delta === null || delta < 0 ? '' : '+';
      const deltaClass = delta === null || delta < 0 ? 'negative' : 'positive';
      const deltaHtml = delta === null
        ? ''
        : `<span class="highlight-match-delta ${deltaClass}">${deltaSign}${delta} ELO</span>`;
      const myWinPct = Math.round((isTeamA ? match.expectedScore[0] : match.expectedScore[1]) * 100);
      const oppWinPct = 100 - myWinPct;
      const myTeamElo = Math.round(isTeamA ? match.teamELO[0] : match.teamELO[1]);
      const oppTeamElo = Math.round(isTeamA ? match.teamELO[1] : match.teamELO[0]);

      return `
        <div class="highlight-match-ref">
          <div class="highlight-match-line">
            <span class="highlight-match-team">
              ${renderRoleAvatar(myDefence)}
              ${renderRoleAvatar(myAttack)}
            </span>
            <span class="highlight-match-score"><strong>${myScore}-${oppScore}</strong></span>
            <span class="highlight-match-team">
              ${renderRoleAvatar(oppDefence)}
              ${renderRoleAvatar(oppAttack)}
            </span>
          </div>
          <div class="highlight-match-footer">
            <span class="highlight-match-pct">${myWinPct}% <span class="highlight-match-elo">(${myTeamElo})</span></span>
            ${deltaHtml}
            <span class="highlight-match-pct">${oppWinPct}% <span class="highlight-match-elo">(${oppTeamElo})</span></span>
          </div>
        </div>
      `;
    };
    const getMatchDelta = (match: IMatch | null): number | null => {
      if (!match) return null;
      const isTeamA = match.teamA.attack === player.id || match.teamA.defence === player.id;
      return isTeamA ? Math.round(match.deltaELO[0]) : Math.round(match.deltaELO[1]);
    };

    const bestTeammateByDelta = resolveHighlightRow(
      pickPlayerStatByScope(player.bestTeammate, statsScope, 'max'),
      'teammates'
    );
    const worstTeammateByDelta = resolveHighlightRow(
      pickPlayerStatByScope(player.worstTeammate, statsScope, 'min'),
      'teammates'
    );
    const bestTeammateByCount = resolveHighlightRow(
      pickPlayerStatByScope(player.bestTeammateCount, statsScope, 'max'),
      'teammates'
    );
    const bestOpponentByDelta = resolveHighlightRow(
      pickPlayerStatByScope(player.bestOpponent, statsScope, 'max'),
      'opponents'
    );
    const worstOpponentByDelta = resolveHighlightRow(
      pickPlayerStatByScope(player.worstOpponent, statsScope, 'min'),
      'opponents'
    );
    const bestOpponentByCount = resolveHighlightRow(
      pickPlayerStatByScope(player.bestOpponentCount, statsScope, 'max'),
      'opponents'
    );

    const compactStatsHtml = `
      <section class="player-card stats-list-card">
        <details class="card-collapsible" open>
        <summary>Statistiche Principali</summary>
        <div class="stats-groups">
          <div class="stats-group-card">
            <h3 class="stats-group-title">Partite ⚽</h3>
            <div class="stats-group-rows">
              <div class="stats-group-header"><span></span><span>🛡️</span><span>⚔️</span><span>Totale</span></div>
              <div class="stats-group-row"><span>Giocate</span><span>${roleStatValue(0, defSummary.matches)}</span><span>${roleStatValue(1, attSummary.matches)}</span><span>${totalSummary.matches}</span></div>
              <div class="stats-group-row"><span>Vittorie</span><span>${roleStatValue(0, defSummary.wins)}</span><span>${roleStatValue(1, attSummary.wins)}</span><span>${totalSummary.wins}</span></div>
              <div class="stats-group-row"><span>Sconfitte</span><span>${roleStatValue(0, defSummary.losses)}</span><span>${roleStatValue(1, attSummary.losses)}</span><span>${totalSummary.losses}</span></div>
              <div class="stats-group-row"><span>Win%</span><span>${roleStatValue(0, formatWinRateStyled(defSummary.wins, defSummary.matches))}</span><span>${roleStatValue(1, formatWinRateStyled(attSummary.wins, attSummary.matches))}</span><span>${formatWinRateStyled(totalSummary.wins, totalSummary.matches)}</span></div>
            </div>
          </div>
          <div class="stats-group-card">
            <h3 class="stats-group-title">Goal 🎯</h3>
            <div class="stats-group-rows">
              <div class="stats-group-header"><span></span><span>🛡️</span><span>⚔️</span><span>Totale</span></div>
              <div class="stats-group-row"><span>Fatti</span><span>${roleStatValue(0, defSummary.totalGoalsFor)}</span><span>${roleStatValue(1, attSummary.totalGoalsFor)}</span><span>${totalSummary.totalGoalsFor}</span></div>
              <div class="stats-group-row"><span>Subiti</span><span>${roleStatValue(0, defSummary.totalGoalsAgainst)}</span><span>${roleStatValue(1, attSummary.totalGoalsAgainst)}</span><span>${totalSummary.totalGoalsAgainst}</span></div>
              <div class="stats-group-row"><span>Ratio</span><span>${roleStatValue(0, formatGoalRatioStyled(defSummary.totalGoalsFor, defSummary.totalGoalsAgainst, defSummary.matches))}</span><span>${roleStatValue(1, formatGoalRatioStyled(attSummary.totalGoalsFor, attSummary.totalGoalsAgainst, attSummary.matches))}</span><span>${formatGoalRatioStyled(totalSummary.totalGoalsFor, totalSummary.totalGoalsAgainst, totalSummary.matches)}</span></div>
              <div class="stats-group-row"><span>Media Fatti</span><span>${roleStatValue(0, PlayersView.formatAverage(defSummary.totalGoalsFor, defSummary.matches))}</span><span>${roleStatValue(1, PlayersView.formatAverage(attSummary.totalGoalsFor, attSummary.matches))}</span><span>${PlayersView.formatAverage(totalSummary.totalGoalsFor, totalSummary.matches)}</span></div>
              <div class="stats-group-row"><span>Media Subiti</span><span>${roleStatValue(0, PlayersView.formatAverage(defSummary.totalGoalsAgainst, defSummary.matches))}</span><span>${roleStatValue(1, PlayersView.formatAverage(attSummary.totalGoalsAgainst, attSummary.matches))}</span><span>${PlayersView.formatAverage(totalSummary.totalGoalsAgainst, totalSummary.matches)}</span></div>
            </div>
          </div>
          <div class="stats-group-card">
            <h3 class="stats-group-title">ELO 📈</h3>
            <div class="stats-group-rows-three">
              <div class="stats-group-header"><span></span><span>🛡️</span><span>⚔️</span></div>
              <div class="stats-group-row"><span>Attuale</span><span><strong>${roleStatValue(0, PlayersView.roundValue(player.elo[0]))}</strong></span><span><strong>${roleStatValue(1, PlayersView.roundValue(player.elo[1]))}</strong></span></div>
              <div class="stats-group-row"><span>Migliore</span><span>${colorizeStatValue(roleStatValue(0, PlayersView.roundValue(player.bestElo[0])), 'green')}</span><span>${colorizeStatValue(roleStatValue(1, PlayersView.roundValue(player.bestElo[1])), 'green')}</span></div>
              <div class="stats-group-row"><span>Peggiore</span><span>${colorizeStatValue(roleStatValue(0, PlayersView.roundValue(player.worstElo[0])), 'red')}</span><span>${colorizeStatValue(roleStatValue(1, PlayersView.roundValue(player.worstElo[1])), 'red')}</span></div>
              <div class="stats-group-row"><span>Media Team</span><span>${roleStatValue(0, PlayersView.roundValue(player.avgTeamElo[0]))}</span><span>${roleStatValue(1, PlayersView.roundValue(player.avgTeamElo[1]))}</span></div>
              <div class="stats-group-row"><span>Media Avversari</span><span>${roleStatValue(0, PlayersView.roundValue(player.avgOpponentElo[0]))}</span><span>${roleStatValue(1, PlayersView.roundValue(player.avgOpponentElo[1]))}</span></div>
            </div>
          </div>
          <div class="stats-group-card stats-group-card-classifica">
            <h3 class="stats-group-title">Classifica 🏅</h3>
            <div class="stats-group-rows">
              <div class="stats-group-header"><span></span><span>🛡️</span><span>⚔️</span><span>Totale</span></div>
              <div class="stats-group-row stats-group-row-rank"><span>Rank</span><span>${formatRank(player.rank[0])}</span><span>${formatRank(player.rank[1])}</span><span>${formatRank(player.rank[2])}</span></div>
              <div class="stats-group-row stats-group-row-class"><span class="stats-class-row-span">Classe</span><span class="stats-class-row-span">${roleStatValue(0, player.class[0] === -1 ? '-' : `<img src="/class/${player.class[0]}.webp" alt="Class ${player.class[0]}" title="${getClassName(player.class[0])}" class="stats-class-badge" />`)}</span><span class="stats-class-row-span">${roleStatValue(1, player.class[1] === -1 ? '-' : `<img src="/class/${player.class[1]}.webp" alt="Class ${player.class[1]}" title="${getClassName(player.class[1])}" class="stats-class-badge" />`)}</span><span class="stats-class-row-span"></span></div>
              <div class="stats-group-row stats-group-row-win-streak"><span>Win Streak</span><span>${colorizeStatValue(roleStatValue(0, player.bestWinStreak[0]), 'green')}</span><span>${colorizeStatValue(roleStatValue(1, player.bestWinStreak[1]), 'green')}</span><span></span></div>
              <div class="stats-group-row stats-group-row-loss-streak"><span>Loss Streak</span><span>${colorizeStatValue(roleStatValue(0, Math.abs(player.worstLossStreak[0])), 'red')}</span><span>${colorizeStatValue(roleStatValue(1, Math.abs(player.worstLossStreak[1])), 'red')}</span><span></span></div>
            </div>
          </div>
        </div>
        </details>
      </section>
    `;

    const profileCardHtml = `
      <div class="pp-row">
        <div class="player-card pp-card">
          <div class="pp-avatar">
            <img
              src="${BASE_PATH}avatars/${player.id}.webp"
              alt="${player.name}"
              class="pp-avatar-img"
              onerror="this.src='${PlayersView.fallbackAvatar()}'"
            />
          </div>

          <div class="pp-content">
            <div class="pp-header">
              <div class="pp-name-wrapper">
                <h2 class="pp-name">${player.name}</h2>
              </div>
              <div class="pp-badges">
                <span class="pp-rank-badge">${formatRank(currentRank)}</span>
                <span class="pp-bestrole-badge ${player.bestRole === 1 ? 'pp-bestrole-badge-attack' : ''}">${bestRoleLabel}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = `
      ${profileCardHtml}
      ${compactStatsHtml}

      <section class="player-card highlights-list-card">
        <details class="card-collapsible" open>
        <summary>Highlights</summary>
        ${PlayersView.renderRoleFilters(statsScope, 'stats')}
        <div class="highlights-columns">
          <div class="highlights-column highlights-column-players">
            <div class="stats-grid highlights-player-grid">
              <div class="stat-item">
                <span class="stat-label">Miglior Compagno</span>
                <span class="stat-value">${formatRelationshipHighlight(bestTeammateByDelta)}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Peggior Compagno</span>
                <span class="stat-value">${formatRelationshipHighlight(worstTeammateByDelta)}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Avversario più forte</span>
                <span class="stat-value">${formatRelationshipHighlight(bestOpponentByDelta)}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Avversario più debole</span>
                <span class="stat-value">${formatRelationshipHighlight(worstOpponentByDelta)}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Compagno Più Frequente</span>
                <span class="stat-value">${formatRelationshipCountHighlight(bestTeammateByCount)}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Avversario Più Frequente</span>
                <span class="stat-value">${formatRelationshipCountHighlight(bestOpponentByCount)}</span>
              </div>
            </div>
          </div>
          <div class="highlights-column highlights-column-matches">
            <div class="stats-grid">
              <div class="stat-item">
                <span class="stat-label">Miglior Vittoria (ELO)</span>
                <span class="stat-value">${formatHighlightMatch(scopeExtremes.bestVictoryByElo)}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Peggior Sconfitta (ELO)</span>
                <span class="stat-value">${formatHighlightMatch(scopeExtremes.worstDefeatByElo)}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Miglior Vittoria (Scarto)</span>
                <span class="stat-value">${formatHighlightMatch(scopeExtremes.bestVictoryByScore)}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Peggior Sconfitta (Scarto)</span>
                <span class="stat-value">${formatHighlightMatch(scopeExtremes.worstDefeatByScore)}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Miglior Vittoria (Percentuale)</span>
                <span class="stat-value">${formatHighlightMatch(scopeExtremes.bestByExpected)}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Peggior Sconfitta (Percentuale)</span>
                <span class="stat-value">${formatHighlightMatch(scopeExtremes.worstByExpected)}</span>
              </div>
            </div>
          </div>
        </div>
        </details>
      </section>

      <section class="player-card relation-list-card">
        <details class="card-collapsible" open>
        <summary>Compagni (${teammatesScopeLabel})</summary>
        ${PlayersView.renderRelationshipTable(
      teammateRows,
      'Nessun compagno nel filtro selezionato',
      'teammates',
      PlayersView.teammatesSortKey,
      PlayersView.teammatesSortDirection,
      teammatesScope,
      'teammates'
    )}
        </details>
      </section>

      <section class="player-card relation-list-card">
        <details class="card-collapsible" open>
        <summary>Avversari (${opponentsScopeLabel})</summary>
        ${PlayersView.renderRelationshipTable(
      opponentRows,
      'Nessun avversario nel filtro selezionato',
      'opponents',
      PlayersView.opponentsSortKey,
      PlayersView.opponentsSortDirection,
      opponentsScope,
      'opponents'
    )}
        </details>
      </section>

      <div class="player-card chart-card">
        <details class="card-collapsible" open>
        <summary>Andamento ELO (${chartScopeLabel})</summary>
        ${PlayersView.renderRoleFilters(chartScope, 'chart', true)}
        <div class="chart-wrapper" id="elo-chart"></div>
        </details>
      </div>

      <div class="player-card history-card">
        <details class="card-collapsible" open>
        <summary>Storico Partite (${historyScopeLabel})</summary>
        ${PlayersView.renderRoleFilters(historyScope, 'history')}
        <div class="match-history">
          ${historyByScope.length === 0
        ? '<p class="empty-state">Nessuna partita giocata nel filtro selezionato</p>'
        : PlayersView.renderHistoryTable(player, historyByScope)}
        </div>
        </details>
      </div>
    `;

    PlayersView.bindRoleFilters(player);
    PlayersView.bindSortControls(player);
    const chartRole: 0 | 1 = chartScope === 'all' ? (player.bestRole === 1 ? 1 : 0) : chartScope;
    PlayersView.renderEloChart(player, chartHistoryByScope, chartRole);
  }

  private static bindRoleFilters(player: IPlayer): void {
    const buttons = document.querySelectorAll<HTMLButtonElement>('.js-role-filter');
    for (const button of buttons) {
      button.addEventListener('click', () => {
        const rawScope = button.dataset.scope;
        const section = button.dataset.section as ScopeSection | undefined;
        if (!section) return;

        let nextScope: RoleScope = 'all';
        if (rawScope === '0') nextScope = 0;
        if (rawScope === '1') nextScope = 1;

        PlayersView.sectionScopes[section] = nextScope;
        PlayersView.renderPlayerStats(player);
      });
    }
  }

  private static bindSortControls(player: IPlayer): void {
    const statsSortButtons = document.querySelectorAll<HTMLButtonElement>('.js-sort-stats');
    for (const button of statsSortButtons) {
      button.addEventListener('click', () => {
        const key = button.dataset.key as StatsSortKey | undefined;
        if (!key) return;

        if (PlayersView.statsSortKey === key) {
          PlayersView.statsSortDirection = PlayersView.statsSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          PlayersView.statsSortKey = key;
          PlayersView.statsSortDirection = key === 'label' ? 'asc' : 'desc';
        }

        PlayersView.renderPlayerStats(player);
      });
    }

    const relationSortButtons = document.querySelectorAll<HTMLButtonElement>('.js-sort-relation');
    for (const button of relationSortButtons) {
      button.addEventListener('click', () => {
        const key = button.dataset.key as RelationSortKey | undefined;
        const table = button.dataset.table as 'teammates' | 'opponents' | undefined;
        if (!key || !table) return;

        const isTeammates = table === 'teammates';
        const currentKey = isTeammates ? PlayersView.teammatesSortKey : PlayersView.opponentsSortKey;
        const currentDirection = isTeammates ? PlayersView.teammatesSortDirection : PlayersView.opponentsSortDirection;

        const nextDirection: SortDirection = currentKey === key
          ? (currentDirection === 'asc' ? 'desc' : 'asc')
          : (key === 'name' ? 'asc' : 'desc');

        if (isTeammates) {
          PlayersView.teammatesSortKey = key;
          PlayersView.teammatesSortDirection = nextDirection;
        } else {
          PlayersView.opponentsSortKey = key;
          PlayersView.opponentsSortDirection = nextDirection;
        }

        PlayersView.renderPlayerStats(player);
      });
    }
  }

  private static renderRoleFilters(scope: RoleScope, section: ScopeSection, hideAll = false): string {
    return `
      <div class="role-filter role-filter-inline" role="tablist" aria-label="Filtro statistiche per ruolo">
        ${hideAll ? '' : `<button class="role-filter-btn js-role-filter ${scope === 'all' ? 'is-active' : ''}" data-section="${section}" data-scope="all" role="tab" aria-selected="${scope === 'all'}">Totale</button>`}
        <button class="role-filter-btn js-role-filter ${scope === 0 ? 'is-active' : ''}" data-section="${section}" data-scope="0" role="tab" aria-selected="${scope === 0}">Difesa</button>
        <button class="role-filter-btn js-role-filter ${scope === 1 ? 'is-active' : ''}" data-section="${section}" data-scope="1" role="tab" aria-selected="${scope === 1}">Attacco</button>
      </div>
    `;
  }

  private static renderRoleFilterButtons(scope: RoleScope, section: ScopeSection): string {
    const all = scope === 'all' ? 'is-active' : '';
    const def = scope === 0 ? 'is-active' : '';
    const att = scope === 1 ? 'is-active' : '';
    return (
      `<button class="role-filter-btn js-role-filter ${all}" data-section="${section}" data-scope="all" role="tab" aria-selected="${String(scope === 'all')}">Totale</button>`
      + `<button class="role-filter-btn js-role-filter ${def}" data-section="${section}" data-scope="0" role="tab" aria-selected="${String(scope === 0)}">Difesa</button>`
      + `<button class="role-filter-btn js-role-filter ${att}" data-section="${section}" data-scope="1" role="tab" aria-selected="${String(scope === 1)}">Attacco</button>`
    );
  }

  private static renderSortIcon<T extends string>(activeKey: T, key: T, direction: SortDirection): string {
    if (activeKey !== key) return '↕';
    return direction === 'asc' ? '↑' : '↓';
  }

  private static getScopeLabel(scope: RoleScope): string {
    if (scope === 0) return 'Difesa';
    if (scope === 1) return 'Attacco';
    return 'Totale';
  }

  private static fallbackAvatar(): string {
    return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJncmFkIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgeDE9IjAlIiB5MT0iMCUiIHgyPSIwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNlMGUwZTA7c3RvcC1vcGFjaXR5OjEiIC8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdHlsZT0ic3RvcC1jb2xvcjojZjVmNWY1O3N0b3Atb3BhY2l0eToxIiAvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgZmlsbD0idXJsKCNncmFkKSIvPjxjaXJjbGUgY3g9IjI0IiBjeT0iMTUiIHI9IjciIGZpbGw9IiM3OTdhYjEiLz48cGF0aCBkPSJNIDEwIDMwIEMgMTAgMjQgMTYgMjAgMjQgMjAgQyAzMiAyMCAzOCAyNCAzOCAzMCBDIDM4IDM4IDMyIDQyIDI0IDQyIEMgMTYgNDIgMTAgMzggMTAgMzAiIGZpbGw9IiM3OTdhYjEiLz48L3N2Zz4=';
  }

  private static weightedAverageByScope(values: [number, number], matches: [number, number], scope: RoleScope): number {
    if (scope === 0 || scope === 1) {
      return values[scope];
    }

    const totalMatches = matches[0] + matches[1];
    if (totalMatches === 0) return 0;
    return ((values[0] * matches[0]) + (values[1] * matches[1])) / totalMatches;
  }

  private static formatPercentage(value: number, total: number): string {
    if (total <= 0) return '0%';
    return `${Math.round((value / total) * 100)}%`;
  }

  private static formatAverage(value: number, total: number): string {
    if (total <= 0) return '-';
    return (value / total).toFixed(2);
  }

  private static formatGoalRatio(goalsFor: number, goalsAgainst: number): string {
    if (goalsAgainst <= 0) {
      if (goalsFor <= 0) return '-';
      return 'INF';
    }

    return (goalsFor / goalsAgainst).toFixed(2);
  }

  private static parseSortableValue(value: string | number): number {
    if (typeof value === 'number') return value;
    const numeric = Number.parseFloat(value.replace('%', '').replace('°', '').replace(',', '.'));
    if (Number.isFinite(numeric)) return numeric;
    return 0;
  }

  private static sortCompactStatRows(rows: CompactStatRow[]): CompactStatRow[] {
    const key = PlayersView.statsSortKey;
    const direction = PlayersView.statsSortDirection;
    const factor = direction === 'asc' ? 1 : -1;

    return rows.slice().sort((a, b) => {
      if (key === 'label') {
        return a.label.localeCompare(b.label, 'it') * factor;
      }

      const av = PlayersView.parseSortableValue(a[key]);
      const bv = PlayersView.parseSortableValue(b[key]);
      return (av - bv) * factor;
    });
  }

  private static buildRelationshipRows(player: IPlayer, scope: RoleScope, target: 'teammates' | 'opponents'): RelationshipRow[] {
    const source = target === 'teammates' ? player.teammatesStats : player.opponentsStats;
    const merged = PlayersView.mergeStatsByScope(source, scope);

    return [...merged.entries()]
      .map(([id, stats]) => {
        const related = getPlayerById(id);
        if (!related) return null;

        const wins = stats.wins;
        const losses = Math.max(stats.matches - wins, 0);

        return {
          id,
          avatar: `${BASE_PATH}avatars/${id}.webp`,
          name: related.name,
          matches: stats.matches,
          wins,
          losses,
          winRate: PlayersView.formatPercentage(wins, stats.matches),
          delta: Math.round(stats.delta)
        } as RelationshipRow;
      })
      .filter((entry): entry is RelationshipRow => Boolean(entry));
  }

  private static sortRelationshipRows(rows: RelationshipRow[], key: RelationSortKey, direction: SortDirection): RelationshipRow[] {
    const factor = direction === 'asc' ? 1 : -1;

    return rows.slice().sort((a, b) => {
      if (key === 'name') return a.name.localeCompare(b.name, 'it') * factor;
      if (key === 'winRate') return (PlayersView.parseSortableValue(a.winRate) - PlayersView.parseSortableValue(b.winRate)) * factor;
      return (a[key] - b[key]) * factor;
    });
  }

  private static renderRelationshipTable(
    rows: RelationshipRow[],
    emptyMessage: string,
    table: 'teammates' | 'opponents',
    sortKey: RelationSortKey,
    sortDirection: SortDirection,
    scope: RoleScope,
    section: ScopeSection
  ): string {
    const toolbar = `
      <div class="relation-toolbar">
        <div class="relation-toolbar-group">
          ${PlayersView.renderRoleFilterButtons(scope, section)}
        </div>
        <div class="relation-toolbar-divider"></div>
        <div class="relation-toolbar-group">
          <button class="js-sort-relation relation-sort-btn ${sortKey === 'name' ? 'is-active-sort' : ''}" data-table="${table}" data-key="name">Nome ${PlayersView.renderSortIcon(sortKey, 'name', sortDirection)}</button>
          <button class="js-sort-relation relation-sort-btn ${sortKey === 'matches' ? 'is-active-sort' : ''}" data-table="${table}" data-key="matches">Match ${PlayersView.renderSortIcon(sortKey, 'matches', sortDirection)}</button>
          <button class="js-sort-relation relation-sort-btn ${sortKey === 'winRate' ? 'is-active-sort' : ''}" data-table="${table}" data-key="winRate">Win% ${PlayersView.renderSortIcon(sortKey, 'winRate', sortDirection)}</button>
          <button class="js-sort-relation relation-sort-btn ${sortKey === 'delta' ? 'is-active-sort' : ''}" data-table="${table}" data-key="delta">ELO Δ ${PlayersView.renderSortIcon(sortKey, 'delta', sortDirection)}</button>
        </div>
      </div>
    `;

    if (rows.length === 0) {
      return `${toolbar}<p class="empty-state">${emptyMessage}</p>`;
    }

    const sortedRows = PlayersView.sortRelationshipRows(rows, sortKey, sortDirection);

    return `
      ${toolbar}
      <div class="relation-list">
        ${sortedRows.map(row => `
          <a class="relation-card" href="./players.html?id=${row.id}">
            <img
              src="${row.avatar}"
              alt="${row.name}"
              class="relation-avatar"
              onerror="this.src='${PlayersView.fallbackAvatar()}'"
            />
            <h3 class="relation-name">${row.name}</h3>
            <div class="relation-meta">
              <span><small>Match</small><strong>${row.matches}</strong></span>
              <span><small>Win%</small><strong class="${(row.matches > 0 ? Math.round((row.wins / row.matches) * 100) : 0) >= 50 ? 'positive' : 'negative'}">${row.winRate}</strong></span>
              <span><small>ELO Δ</small><strong class="${row.delta >= 0 ? 'positive' : 'negative'}">${row.delta >= 0 ? '+' : ''}${row.delta}</strong></span>
            </div>
          </a>
        `).join('')}
      </div>
    `;
  }

  private static sumByScope(values: [number, number], scope: RoleScope): number {
    if (scope === 0 || scope === 1) {
      return values[scope];
    }
    return values[0] + values[1];
  }

  private static roundValue(value: number): number | string {
    if (value === -Infinity || value === Infinity || Number.isNaN(value)) return '-';
    if (!Number.isFinite(value)) return 'N/A';
    return Math.round(value);
  }

  private static getRoleInMatch(playerId: number, match: IMatch): 0 | 1 {
    return (match.teamA.defence === playerId || match.teamB.defence === playerId) ? 0 : 1;
  }

  private static isMatchInScope(playerId: number, match: IMatch, scope: RoleScope): boolean {
    if (scope === 'all') return true;
    return PlayersView.getRoleInMatch(playerId, match) === scope;
  }

  private static getHistoryByScope(player: IPlayer, scope: RoleScope): IMatch[] {
    if (scope === 0 || scope === 1) {
      return player.history[scope];
    }

    return [...player.history[0], ...player.history[1]].toSorted((a, b) => a.createdAt - b.createdAt);
  }

  private static buildMatchSummary(player: IPlayer, scope: RoleScope): MatchSummary {
    const matchesAsDefence = PlayersView.sumByScope([player.matches[0], 0], scope);
    const matchesAsAttack = PlayersView.sumByScope([0, player.matches[1]], scope);
    const winsAsDefence = PlayersView.sumByScope([player.wins[0], 0], scope);
    const winsAsAttack = PlayersView.sumByScope([0, player.wins[1]], scope);

    const matches = PlayersView.sumByScope(player.matches, scope);
    const wins = PlayersView.sumByScope(player.wins, scope);

    return {
      matches,
      wins,
      losses: matches - wins,
      matchesAsDefence,
      matchesAsAttack,
      winsAsDefence,
      winsAsAttack,
      lossesAsDefence: matchesAsDefence - winsAsDefence,
      lossesAsAttack: matchesAsAttack - winsAsAttack,
      totalGoalsFor: PlayersView.sumByScope(player.goalsFor, scope),
      totalGoalsAgainst: PlayersView.sumByScope(player.goalsAgainst, scope)
    };
  }

  private static mapToResult(stat: PlayerRefStats | null): MatchResultRef {
    if (!stat || stat.player < 0) return null;
    const foundPlayer = getPlayerById(stat.player);
    if (!foundPlayer) return null;

    return {
      player: { name: foundPlayer.name },
      score: stat.value
    };
  }

  private static mergeStatsByScope(
    roleMaps: [{ [x: number]: MatchPlayerStats }, { [x: number]: MatchPlayerStats }],
    scope: RoleScope
  ): Map<number, MatchPlayerStats> {
    const merged = new Map<number, MatchPlayerStats>();

    const mergeRole = (roleMap: { [x: number]: MatchPlayerStats }): void => {
      for (const [rawId, values] of Object.entries(roleMap)) {
        const id = Number(rawId);
        const current = merged.get(id) || { matches: 0, wins: 0, delta: 0 };
        merged.set(id, {
          matches: current.matches + values.matches,
          wins: current.wins + values.wins,
          delta: current.delta + values.delta
        });
      }
    };

    if (scope === 'all') {
      mergeRole(roleMaps[0]);
      mergeRole(roleMaps[1]);
    } else {
      mergeRole(roleMaps[scope]);
    }

    return merged;
  }

  private static getBestByMetric(
    statsMap: Map<number, MatchPlayerStats>,
    metric: 'matches' | 'delta',
    direction: 'max' | 'min'
  ): MatchResultRef {
    let bestId = -1;
    let bestValue = direction === 'max' ? -Infinity : Infinity;

    for (const [id, stats] of statsMap.entries()) {
      const value = stats[metric];
      if ((direction === 'max' && value > bestValue) || (direction === 'min' && value < bestValue)) {
        bestValue = value;
        bestId = id;
      }
    }

    if (bestId < 0 || !Number.isFinite(bestValue)) return null;

    const player = getPlayerById(bestId);
    if (!player) return null;

    return {
      player: { name: player.name },
      score: bestValue
    };
  }

  private static buildRelationships(player: IPlayer, scope: RoleScope): RelationshipSummary {
    if (scope === 0 || scope === 1) {
      return {
        bestTeammateCount: PlayersView.mapToResult(player.bestTeammateCount[scope]),
        bestTeammate: PlayersView.mapToResult(player.bestTeammate[scope]),
        worstTeammate: PlayersView.mapToResult(player.worstTeammate[scope]),
        bestOpponent: PlayersView.mapToResult(player.bestOpponent[scope]),
        worstOpponent: PlayersView.mapToResult(player.worstOpponent[scope])
      };
    }

    const teammates = PlayersView.mergeStatsByScope(player.teammatesStats, scope);
    const opponents = PlayersView.mergeStatsByScope(player.opponentsStats, scope);

    return {
      bestTeammateCount: PlayersView.getBestByMetric(teammates, 'matches', 'max'),
      bestTeammate: PlayersView.getBestByMetric(teammates, 'delta', 'max'),
      worstTeammate: PlayersView.getBestByMetric(teammates, 'delta', 'min'),
      bestOpponent: PlayersView.getBestByMetric(opponents, 'delta', 'min'),
      worstOpponent: PlayersView.getBestByMetric(opponents, 'delta', 'max')
    };
  }

  private static getTeamContext(matches: IMatch[], matchIndex: number, playerId: number): { teamId: 0 | 1; myScore: number; opponentScore: number; myDelta: number } {
    const match = matches[matchIndex];

    if (!match) {
      return {
        teamId: 0,
        myScore: 0,
        opponentScore: 0,
        myDelta: 0
      };
    }

    const isTeamA = match.teamA.attack === playerId || match.teamA.defence === playerId;
    const teamId: 0 | 1 = isTeamA ? 0 : 1;
    return {
      teamId,
      myScore: match.score[teamId],
      opponentScore: match.score[teamId ^ 1],
      myDelta: match.deltaELO[teamId]
    };
  }

  private static buildExtremes(player: IPlayer, scope: RoleScope): ExtremesSummary {
    type MS = import('@/models/player.interface').MatchStats | null;
    const pick = (a: MS, b: MS, direction: 'max' | 'min'): IMatch | null => {
      if (!a) return b?.match ?? null;
      if (!b) return a.match;
      return direction === 'max'
        ? (a.value >= b.value ? a.match : b.match)
        : (a.value <= b.value ? a.match : b.match);
    };

    if (scope === 0 || scope === 1) {
      return {
        bestVictoryByElo: player.bestVictoryByElo[scope]?.match ?? null,
        worstDefeatByElo: player.worstDefeatByElo[scope]?.match ?? null,
        bestVictoryByScore: player.bestVictoryByScore[scope]?.match ?? null,
        worstDefeatByScore: player.worstDefeatByScore[scope]?.match ?? null,
        bestByExpected: player.bestVictoryByPercentage[scope]?.match ?? null,
        worstByExpected: player.worstDefeatByPercentage[scope]?.match ?? null
      };
    }

    return {
      bestVictoryByElo: pick(player.bestVictoryByElo[0], player.bestVictoryByElo[1], 'max'),
      worstDefeatByElo: pick(player.worstDefeatByElo[0], player.worstDefeatByElo[1], 'min'),
      bestVictoryByScore: pick(player.bestVictoryByScore[0], player.bestVictoryByScore[1], 'max'),
      worstDefeatByScore: pick(player.worstDefeatByScore[0], player.worstDefeatByScore[1], 'min'),
      bestByExpected: pick(player.bestVictoryByPercentage[0], player.bestVictoryByPercentage[1], 'min'),
      worstByExpected: pick(player.worstDefeatByPercentage[0], player.worstDefeatByPercentage[1], 'max')
    };
  }

  private static buildStreakSummary(history: IMatch[], playerId: number): { bestWinStreak: number; worstLossStreak: number } {
    let current = 0;
    let bestWinStreak = 0;
    let worstLossStreak = 0;

    for (let i = 0; i < history.length; i++) {
      const context = PlayersView.getTeamContext(history, i, playerId);
      const isWin = context.myScore > context.opponentScore;

      if (isWin) {
        current = current > 0 ? current + 1 : 1;
      } else {
        current = current < 0 ? current - 1 : -1;
      }

      bestWinStreak = Math.max(bestWinStreak, current, 0);
      worstLossStreak = Math.min(worstLossStreak, current, 0);
    }

    return { bestWinStreak, worstLossStreak };
  }

  private static formatPlayerResult(result: MatchResultRef): string {
    if (!result?.player) return '-';
    return `${result.player.name} (${result.score > 0 ? '+' : ''}${result.score.toFixed(0)})`;
  }

  private static formatMatchScore(match: IMatch | null, playerId: number): string {
    if (!match) return '-';
    const isTeamA = match.teamA.attack === playerId || match.teamA.defence === playerId;
    const score = isTeamA
      ? `${match.score[0]}-${match.score[1]}`
      : `${match.score[1]}-${match.score[0]}`;

    return `<strong>${score}</strong>`;
  }

  private static formatMatchDetails(match: IMatch | null, playerId: number): string {
    if (!match) return '';

    const isTeamA = match.teamA.attack === playerId || match.teamA.defence === playerId;
    const myTeam = isTeamA ? match.teamA : match.teamB;
    const opponentTeam = isTeamA ? match.teamB : match.teamA;

    const teammate = getPlayerById(myTeam.attack === playerId ? myTeam.defence : myTeam.attack);
    const opp1 = getPlayerById(opponentTeam.attack);
    const opp2 = getPlayerById(opponentTeam.defence);

    const teammateName = teammate?.name || '?';
    const opponentsNames = `${opp1?.name || '?'} & ${opp2?.name || '?'}`;
    const delta = isTeamA ? match.deltaELO[0] : match.deltaELO[1];

    return `<small>vs ${opponentsNames}</small><br><small>con ${teammateName} (${delta > 0 ? '+' : ''}${delta.toFixed(0)} ELO)</small>`;
  }

  private static renderHistoryTable(player: IPlayer, history: IMatch[]): string {
    const roleCounters: [number, number] = [0, 0];
    const rowsChronological: string[] = [];

    for (const match of history) {
      const role = PlayersView.getRoleInMatch(player.id, match);
      rowsChronological.push(PlayersView.formatMatchHistory(match, player, roleCounters[role]));
      roleCounters[role] += 1;
    }

    return `
      <table class="match-history-table">
        <thead>
          <tr>
            <th>Elo</th>
            <th>Elo Team</th>
            <th>Ruolo</th>
            <th>Compagno</th>
            <th>Risultato</th>
            <th>Avversari</th>
            <th>Elo Avversari</th>
          </tr>
        </thead>
        <tbody>
          ${rowsChronological.slice().reverse().join('')}
        </tbody>
      </table>
    `;
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity
  private static formatMatchHistory(match: IMatch, player: IPlayer, matchesPlayedInRole: number): string {
    const isTeamA = match.teamA.attack === player.id || match.teamA.defence === player.id;
    const myTeam = isTeamA ? match.teamA : match.teamB;
    const opponentTeam = isTeamA ? match.teamB : match.teamA;

    const teammate = getPlayerById(myTeam.attack === player.id ? myTeam.defence : myTeam.attack);
    const oppDefence = getPlayerById(opponentTeam.defence);
    const oppAttack = getPlayerById(opponentTeam.attack);

    const teamAELO = match.teamAELO || [undefined, undefined];
    const teamBELO = match.teamBELO || [undefined, undefined];

    const playerWithElo = (p: IPlayer | undefined, elo: number | undefined): string => {
      if (!p || elo === undefined) return '?';
      return `${p.name} <strong>(${Math.round(elo)})</strong>`;
    };

    let teammateElo: number | undefined;
    if (isTeamA) {
      teammateElo = myTeam.defence === player.id ? teamAELO[1] : teamAELO[0];
    } else {
      teammateElo = myTeam.defence === player.id ? teamBELO[1] : teamBELO[0];
    }

    const teammateNames = playerWithElo(teammate, teammateElo);
    const oppDefenceElo = isTeamA ? teamBELO[0] : teamAELO[0];
    const oppAttackElo = isTeamA ? teamBELO[1] : teamAELO[1];
    const opponentsNames = `${playerWithElo(oppDefence, oppDefenceElo)} & ${playerWithElo(oppAttack, oppAttackElo)}`;

    const myScore = isTeamA ? match.score[0] : match.score[1];
    const oppScore = isTeamA ? match.score[1] : match.score[0];
    const isWin = myScore > oppScore;

    const isAttack = myTeam.attack === player.id;
    const myRole = isAttack
      ? '<span style="font-size:1em;" title="Attacco">⚔️</span>'
      : '<span style="font-size:1em;" title="Difesa">🛡️</span>';

    const myTeamElo = isTeamA ? Math.round(match.teamELO[0]) : Math.round(match.teamELO[1]);
    const oppTeamElo = isTeamA ? Math.round(match.teamELO[1]) : Math.round(match.teamELO[0]);

    const myDelta = isTeamA ? Math.round(match.deltaELO[0]) : Math.round(match.deltaELO[1]);
    const deltaColor = myDelta >= 0 ? 'green' : 'red';

    const myExpected = isTeamA ? match.expectedScore[0] : match.expectedScore[1];
    const oppExpected = isTeamA ? match.expectedScore[1] : match.expectedScore[0];
    const myExpectedPercent = typeof myExpected === 'number' ? Math.round(myExpected * 100) : '?';
    const oppExpectedPercent = typeof oppExpected === 'number' ? Math.round(oppExpected * 100) : '?';

    const myExpColor = myExpectedPercent === '?' ? 'inherit' : (myExpectedPercent > 50 ? 'green' : myExpectedPercent < 50 ? 'red' : 'inherit');
    const oppExpColor = oppExpectedPercent === '?' ? 'inherit' : (oppExpectedPercent > 50 ? 'green' : oppExpectedPercent < 50 ? 'red' : 'inherit');

    const roleIndex = isAttack ? 1 : 0;
    const playerEloBefore = isTeamA ? (roleIndex === 0 ? teamAELO[0] : teamAELO[1]) : (roleIndex === 0 ? teamBELO[0] : teamBELO[1]);
    const eloWithMalus = playerEloBefore === undefined ? '?' : Math.round(playerEloBefore);

    const delta = isTeamA ? match.deltaELO[0] : match.deltaELO[1];
    const multiplier = getBonusK(matchesPlayedInRole);
    const totalDelta = Math.round(delta * multiplier);
    const deltaRounded = Math.round(delta);

    const myDeltaFormatted = multiplier !== 1
      ? `<span style="color:${deltaColor};">${totalDelta >= 0 ? '+' : ''}${totalDelta} <span style="font-size:0.85em;">(x${multiplier.toFixed(2)})</span></span>`
      : `<span style="color:${deltaColor};">${deltaRounded >= 0 ? '+' : ''}${deltaRounded}</span>`;

    return `
      <tr class="${isWin ? 'match-win' : 'match-loss'}">
        <td><strong>${eloWithMalus}</strong> ${myDeltaFormatted}</td>
        <td><strong>${myTeamElo}</strong></td>
        <td>${myRole}</td>
        <td>${teammateNames}</td>
        <td><span style="color:${myExpColor};font-size:0.85em;">${myExpectedPercent === '?' || (myExpectedPercent >= 40 && myExpectedPercent <= 60) ? `(${myExpectedPercent}%)` : `<strong>(${myExpectedPercent}%)</strong>`}</span> <strong>${myScore}-${oppScore}</strong> <span style="color:${oppExpColor};font-size:0.85em;">${oppExpectedPercent === '?' || (oppExpectedPercent >= 40 && oppExpectedPercent <= 60) ? `(${oppExpectedPercent}%)` : `<strong>(${oppExpectedPercent}%)</strong>`}</span></td>
        <td>${opponentsNames}</td>
        <td><strong>${oppTeamElo}</strong></td>
      </tr>
    `;
  }

  /**
   * Render the Elo progression chart at the bottom of the page.
   */
  private static renderEloChart(player: IPlayer, historyByScope: IMatch[], roleForChart: 0 | 1): void {
    const chartContainer = document.getElementById('elo-chart');
    if (!chartContainer) {
      return;
    }

    const roleHistory = historyByScope.filter(match => PlayersView.getRoleInMatch(player.id, match) === roleForChart);

    const progression = PlayersView.buildEloProgression(roleHistory, player, roleForChart);
    if (progression.length === 0) {
      chartContainer.innerHTML = '<p class="empty-state">Nessuna partita per calcolare l\'andamento ELO nel ruolo selezionato.</p>';
      return;
    }

    const values = progression.map(point => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const yStep = PlayersView.getYStep(max - min);
    const tickMin = Math.floor(min / yStep) * yStep;
    const tickMax = Math.ceil(max / yStep) * yStep;
    const range = Math.max(tickMax - tickMin, 1);
    const width = Math.min(Math.max(progression.length * 55, 600), 1200);
    const height = 260;
    const padding = 40;

    const points = progression.map((point, index) => {
      const x = padding + (index / Math.max(progression.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - ((point.value - tickMin) / range) * (height - padding * 2);
      return { ...point, x, y };
    });

    const movingAverageValues = PlayersView.calculateMovingAverage(values, 10);
    const movingAveragePoints = movingAverageValues.map((value, index) => {
      const x = padding + (index / Math.max(movingAverageValues.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - ((value - tickMin) / range) * (height - padding * 2);
      return { x, y };
    });

    const regressionPoints = PlayersView.calculateLinearRegression(values, padding, height, tickMin, range, width);

    const path = PlayersView.createSmoothPath(points);
    const areaPath = `${path} L ${points.at(-1)?.x ?? padding} ${height - padding} L ${points[0]?.x ?? padding} ${height - padding} Z`;
    const movingAveragePath = PlayersView.createSmoothPath(movingAveragePoints);
    const regressionPath = PlayersView.createLinePath(regressionPoints);

    const labelStep = Math.max(1, Math.ceil(progression.length / 8));
    const labels = points.map((point, idx) => {
      if (idx % labelStep !== 0 && idx !== points.length - 1) return '';
      return `<text x="${point.x}" y="${height - padding + 18}" class="chart-label" text-anchor="middle">${point.label}</text>`;
    }).join('');

    const circles = points.map((point, index) => {
      const eloValue = Math.round(point.value);
      const ariaLabel = point.tooltip
        ? `Partita ${point.tooltip.matchNumber}: ${point.tooltip.myScore}-${point.tooltip.opponentScore}, ELO ${eloValue}`
        : `ELO iniziale ${eloValue}`;
      return `<circle cx="${point.x}" cy="${point.y}" r="3" class="chart-point" data-elo="${eloValue}" data-index="${index}" tabindex="0" aria-label="${ariaLabel}"></circle>`;
    }).join('');

    chartContainer.innerHTML = `
      <div class="chart-meta">
        <span>Min: ${Math.round(min)}</span>
        <span>Max: ${Math.round(max)}</span>
        <span>Ultimo: ${Math.round(values[values.length - 1])}</span>
      </div>
      <div class="chart-legend">
        <span class="legend-item"><span class="legend-color" style="background-color: #4a5568;"></span>Andamento reale</span>
        <span class="legend-item"><span class="legend-color" style="background-color: #f59e0b;"></span>Media mobile (10)</span>
        <span class="legend-item"><span class="legend-color" style="background-color: #10b981;"></span>Trend generale</span>
      </div>
      <div class="chart-tooltip" id="elo-chart-tooltip" aria-hidden="true"></div>
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Andamento ELO nel tempo">
        <defs>
          <linearGradient id="eloGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#4a5568" stop-opacity="0.3" />
            <stop offset="100%" stop-color="#2d3748" stop-opacity="0.05" />
          </linearGradient>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#4a5568" />
            <stop offset="100%" stop-color="#2d3748" />
          </linearGradient>
        </defs>
        ${PlayersView.renderYTicks(tickMin, tickMax, yStep, height, padding, width)}
        <path d="${areaPath}" class="chart-area" />
        <path d="${path}" class="chart-line" />
        <path d="${movingAveragePath}" class="chart-trend" style="stroke: #f59e0b; stroke-width: 2; fill: none;" />
        <path d="${regressionPath}" class="chart-regression" style="stroke: #10b981; stroke-width: 2.5; fill: none; stroke-dasharray: 5,5;" />
        ${circles}
        ${labels}
        <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" class="chart-axis" />
        <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" class="chart-axis" />
      </svg>
    `;

    PlayersView.bindEloChartTooltip(chartContainer, points);
  }

  private static renderYTicks(min: number, max: number, step: number, height: number, padding: number, width: number): string {
    const ticks: string[] = [];
    for (let value = max; value >= min; value -= step) {
      const ratio = (value - min) / Math.max(max - min, 1);
      const y = padding + (1 - ratio) * (height - padding * 2);
      ticks.push(`
        <line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" class="chart-grid" />
        <text x="${padding - 10}" y="${y + 4}" text-anchor="end" class="chart-tick">${value}</text>
      `);
    }
    return ticks.join('');
  }

  private static getYStep(range: number): number {
    if (range <= 150) return 25;
    if (range <= 300) return 50;
    if (range <= 600) return 100;
    if (range <= 1000) return 150;
    return 200;
  }

  private static buildEloProgression(history: IMatch[], player: IPlayer, role: 0 | 1): ChartProgressPoint[] {
    if (history.length === 0) return [];

    const currentElo = player.elo[role];
    let totalDelta = 0;

    for (let i = 0; i < history.length; i++) {
      const match = history[i];
      const isTeamA = player.id === match.teamA.attack || player.id === match.teamA.defence;
      const delta = isTeamA ? match.deltaELO[0] : match.deltaELO[1];
      totalDelta += delta * getBonusK(i);
    }

    const startElo = currentElo - totalDelta;

    const progression: ChartProgressPoint[] = [{ value: startElo, label: '0', tooltip: null }];
    let elo = startElo;
    for (let i = 0; i < history.length; i++) {
      const match = history[i];
      const isTeamA = player.id === match.teamA.attack || player.id === match.teamA.defence;
      const delta = isTeamA ? match.deltaELO[0] : match.deltaELO[1];
      const eloBefore = elo;
      elo += delta * getBonusK(i);
      progression.push({
        value: elo,
        label: `${i + 1}`,
        tooltip: PlayersView.buildEloTooltipData(match, player, i, Math.round(eloBefore))
      });
    }

    return progression;
  }

  private static buildEloTooltipData(match: IMatch, player: IPlayer, roleMatchIndex: number, playerElo: number): ChartTooltipData {
    const isTeamA = player.id === match.teamA.attack || player.id === match.teamA.defence;
    const myTeam = isTeamA ? match.teamA : match.teamB;
    const opponentTeam = isTeamA ? match.teamB : match.teamA;
    const myScore = isTeamA ? match.score[0] : match.score[1];
    const opponentScore = isTeamA ? match.score[1] : match.score[0];
    const myExpectedRaw = isTeamA ? match.expectedScore[0] : match.expectedScore[1];
    const opponentExpectedRaw = isTeamA ? match.expectedScore[1] : match.expectedScore[0];
    const myExpected = Number.isFinite(myExpectedRaw) ? Math.round(myExpectedRaw * 100) : null;
    const opponentExpected = Number.isFinite(opponentExpectedRaw) ? Math.round(opponentExpectedRaw * 100) : null;
    const myTeamElo = Math.round(isTeamA ? match.teamELO[0] : match.teamELO[1]);
    const opponentTeamElo = Math.round(isTeamA ? match.teamELO[1] : match.teamELO[0]);
    const delta = isTeamA ? match.deltaELO[0] : match.deltaELO[1];
    const multiplier = getBonusK(roleMatchIndex);
    const totalDelta = Math.round(delta * multiplier);
    const myDefence = getPlayerById(myTeam.defence);
    const myAttack = getPlayerById(myTeam.attack);
    const oppDefence = getPlayerById(opponentTeam.defence);
    const oppAttack = getPlayerById(opponentTeam.attack);

    const resolvePlayer = (id: number, fallbackName: string, p?: IPlayer): ChartTooltipPlayer => ({
      id,
      name: p?.name || fallbackName,
      avatar: `${BASE_PATH}avatars/${id}.webp`
    });

    return {
      matchNumber: roleMatchIndex + 1,
      myScore,
      opponentScore,
      myExpected,
      opponentExpected,
      myTeamElo,
      opponentTeamElo,
      playerElo,
      baseDelta: Math.round(delta),
      totalDelta,
      multiplier,
      myTeam: [
        resolvePlayer(myTeam.defence, 'Difensore', myDefence),
        resolvePlayer(myTeam.attack, 'Attaccante', myAttack)
      ],
      opponents: [
        resolvePlayer(opponentTeam.defence, 'Difensore', oppDefence),
        resolvePlayer(opponentTeam.attack, 'Attaccante', oppAttack)
      ]
    };
  }

  private static renderEloTooltipContent(point: ChartProgressPoint): string {
    if (!point.tooltip) {
      return `
        <div class="chart-tooltip-header">Punto iniziale</div>
        <div class="chart-tooltip-kpi">ELO: <strong>${Math.round(point.value)}</strong></div>
      `;
    }

    const t = point.tooltip;
    let myExp = '-';
    if (t.myExpected !== null) {
      myExp = `${t.myExpected}%`;
    }

    let oppExp = '-';
    if (t.opponentExpected !== null) {
      oppExp = `${t.opponentExpected}%`;
    }
    const deltaClass = t.totalDelta >= 0 ? 'is-positive' : 'is-negative';
    const deltaLabel = `${t.totalDelta >= 0 ? '+' : ''}${t.totalDelta}`;
    const multiplierLabel = t.multiplier === 1 ? '' : ` (x${t.multiplier.toFixed(2)})`;

    return `
      <div class="chart-tooltip-header">
        <span>Partita #${t.matchNumber}</span>
      </div>
      <div class="chart-tooltip-teams">
        <div class="chart-tooltip-team">
          <img src="${t.myTeam[0].avatar}" alt="${t.myTeam[0].name}" class="chart-tooltip-avatar" onerror="this.src='${PlayersView.fallbackAvatar()}'" />
          <img src="${t.myTeam[1].avatar}" alt="${t.myTeam[1].name}" class="chart-tooltip-avatar" onerror="this.src='${PlayersView.fallbackAvatar()}'" />
        </div>
        <div class="chart-tooltip-score">${t.myScore}-${t.opponentScore}</div>
        <div class="chart-tooltip-team">
          <img src="${t.opponents[0].avatar}" alt="${t.opponents[0].name}" class="chart-tooltip-avatar" onerror="this.src='${PlayersView.fallbackAvatar()}'" />
          <img src="${t.opponents[1].avatar}" alt="${t.opponents[1].name}" class="chart-tooltip-avatar" onerror="this.src='${PlayersView.fallbackAvatar()}'" />
        </div>
      </div>
      <div class="chart-tooltip-grid">
        <span>ELO personale</span><strong>${t.playerElo}</strong>
        <span>ELO squadre</span><strong>${t.myTeamElo} / ${t.opponentTeamElo}</strong>
        <span>Percentuali</span><strong>${myExp} / ${oppExp}</strong>
        <span>Delta</span><strong class="${deltaClass}">${deltaLabel}${multiplierLabel}</strong>
      </div>
    `;
  }

  private static bindEloChartTooltip(chartContainer: HTMLElement, points: Array<ChartProgressPoint & { x: number; y: number }>): void {
    const tooltip = chartContainer.querySelector<HTMLElement>('#elo-chart-tooltip');
    const circles = chartContainer.querySelectorAll<SVGCircleElement>('.chart-point');
    if (!tooltip || circles.length === 0) {
      return;
    }

    const hideTooltip = (): void => {
      tooltip.classList.remove('is-visible');
      tooltip.setAttribute('aria-hidden', 'true');
    };

    const showTooltip = (index: number, clientX: number, clientY: number): void => {
      const point = points[index];
      if (!point) return;

      tooltip.innerHTML = PlayersView.renderEloTooltipContent(point);
      tooltip.classList.add('is-visible');
      tooltip.setAttribute('aria-hidden', 'false');

      const chartRect = chartContainer.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const x = Math.min(
        Math.max(clientX - chartRect.left + 14, 8),
        chartRect.width - tooltipRect.width - 8
      );
      const y = Math.max(clientY - chartRect.top - tooltipRect.height - 14, 8);

      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
    };

    for (const circle of circles) {
      const index = Number.parseInt(circle.dataset.index || '-1', 10);
      if (index < 0) continue;

      circle.addEventListener('mouseenter', (event) => {
        showTooltip(index, event.clientX, event.clientY);
      });

      circle.addEventListener('mousemove', (event) => {
        showTooltip(index, event.clientX, event.clientY);
      });

      circle.addEventListener('focus', () => {
        const bounds = circle.getBoundingClientRect();
        showTooltip(index, bounds.left + bounds.width / 2, bounds.top);
      });

      circle.addEventListener('mouseleave', hideTooltip);
      circle.addEventListener('blur', hideTooltip);
    }

    chartContainer.addEventListener('mouseleave', hideTooltip);
  }

  private static calculateMovingAverage(values: number[], windowSize: number): number[] {
    if (values.length === 0) return [];

    const result: number[] = [];
    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - windowSize + 1);
      const window = values.slice(start, i + 1);
      const avg = window.reduce((sum, val) => sum + val, 0) / window.length;
      result.push(avg);
    }

    return result;
  }

  private static calculateLinearRegression(values: number[], padding: number, height: number, tickMin: number, range: number, width: number): { x: number; y: number }[] {
    if (values.length < 2) return [];

    const n = values.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return [];

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    return [
      {
        x: padding,
        y: height - padding - ((intercept - tickMin) / range) * (height - padding * 2)
      },
      {
        x: width - padding,
        y: height - padding - (((slope * (n - 1) + intercept) - tickMin) / range) * (height - padding * 2)
      }
    ];
  }

  private static createLinePath(points: { x: number; y: number }[]): string {
    if (points.length < 2) return '';
    return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} L ${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}`;
  }

  private static createSmoothPath(points: { x: number; y: number }[]): string {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
    if (points.length === 2) return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} L ${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}`;

    let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
    const tension = 0.3;

    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      const prev = i > 0 ? points[i - 1] : current;
      const afterNext = i < points.length - 2 ? points[i + 2] : next;

      const cp1x = current.x + (next.x - prev.x) * tension;
      const cp1y = current.y + (next.y - prev.y) * tension;
      const cp2x = next.x - (afterNext.x - current.x) * tension;
      const cp2y = next.y - (afterNext.y - current.y) * tension;

      path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
    }

    return path;
  }
}
