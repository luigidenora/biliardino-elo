import { IPlayer } from '@/models/player.interface';
import { expectedScore } from '@/services/elo.service';
import { getBonusK } from '@/services/player.service';
import { formatRank } from '@/utils/format-rank.util';
import { getClassName } from '@/utils/get-class-name.util';
import { getDisplayElo } from '@/utils/get-display-elo.util';
import { BASE_PATH } from '../config/env.config';
import { getAllMatches } from '../services/match.service';
import { getAllPlayers, getPlayerById } from '../services/player.service';
import { fetchRunningMatch } from '../services/repository.service';

/**
 * Renders and handles UI interactions for the ranking table.
 */
type SortKey = 'rank' | 'name' | 'elo' | 'matches' | 'winrate' | 'goaldiff';
type PlayerRole = -1 | 0 | 1;
type LeaderboardType = 'overall' | 'defence' | 'attack';

export class RankingView {
  private static readonly ROLE_ICONS: [string, string] = ['🛡️', '⚔️'];
  private static currentLeaderboard: LeaderboardType = 'overall';

  private static getBestElo(player: IPlayer): number {
    const role = RankingView.getRankingRole(player);
    return player.elo[role];
  }

  private static getRankingRole(player: IPlayer): 0 | 1 {
    if (RankingView.currentLeaderboard === 'defence') return 0;
    if (RankingView.currentLeaderboard === 'attack') return 1;
    return player.bestRole === 1 ? 1 : 0;
  }

  private static getRankingClass(player: IPlayer): number {
    return player.class[RankingView.getRankingRole(player)];
  }

  private static getPlayerRank(player: IPlayer): number {
    if (RankingView.currentLeaderboard === 'defence') return player.rank[0];
    if (RankingView.currentLeaderboard === 'attack') return player.rank[1];
    return player.rank[2];
  }

  private static getPlayerRankByRole(playerId: number, role: 0 | 1): number {
    const player = getPlayerById(playerId);
    if (!player) return 0;
    return player.rank[role];
  }

  private static getHighlightedEloRoles(player: IPlayer): [boolean, boolean] {
    if (RankingView.currentLeaderboard === 'defence') return [true, false];
    if (RankingView.currentLeaderboard === 'attack') return [false, true];
    return player.bestRole === 1 ? [false, true] : [true, false];
  }

  private static getTodayDeltaForLeaderboard(
    info: { delta: [number, number]; matches: [number, number] } | undefined
  ): { delta: number; matches: number } {
    if (!info) return { delta: 0, matches: 0 };
    if (RankingView.currentLeaderboard === 'defence') {
      return { delta: info.delta[0], matches: info.matches[0] };
    }
    if (RankingView.currentLeaderboard === 'attack') {
      return { delta: info.delta[1], matches: info.matches[1] };
    }
    return {
      delta: info.delta[0] + info.delta[1],
      matches: info.matches[0] + info.matches[1]
    };
  }

  private static initLeaderboardSelector(): void {
    const table = RankingView.getTable();
    const wrapper = table.closest('.table-wrapper');
    if (!wrapper) return;

    if (!document.getElementById('leaderboard-selector-style')) {
      const style = document.createElement('style');
      style.id = 'leaderboard-selector-style';
      style.textContent = `
        #leaderboard-selector {
          display: flex;
          justify-content: center;
          margin-bottom: 1.1rem;
        }

        #leaderboard-selector .leaderboard-selector-track {
          display: inline-flex;
          align-items: center;
          gap: 0.22rem;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.9) 0%, rgba(245, 247, 250, 0.92) 100%);
          border: 1px solid rgba(15, 23, 42, 0.08);
          border-radius: 999px;
          padding: 0.22rem;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.85),
            0 8px 24px rgba(15, 23, 42, 0.08);
        }

        #leaderboard-selector .leaderboard-pill {
          border: none;
          border-radius: 999px;
          padding: 0.44rem 0.95rem;
          min-width: 104px;
          font-size: 0.88rem;
          font-weight: 600;
          letter-spacing: 0.01em;
          color: #475569;
          background: transparent;
          cursor: pointer;
          transition: background-color 160ms ease, color 160ms ease, box-shadow 200ms ease, transform 120ms ease;
          -webkit-tap-highlight-color: transparent;
        }

        #leaderboard-selector .leaderboard-pill:hover {
          background: rgba(148, 163, 184, 0.16);
          color: #0f172a;
        }

        #leaderboard-selector .leaderboard-pill:active {
          transform: scale(0.985);
        }

        #leaderboard-selector .leaderboard-pill:focus-visible {
          outline: 2px solid rgba(10, 132, 255, 0.55);
          outline-offset: 2px;
        }

        #leaderboard-selector .leaderboard-pill.active {
          color: #ffffff;
          background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.35),
            0 6px 14px rgba(37, 99, 235, 0.35);
        }

        @media (max-width: 640px) {
          #leaderboard-selector {
            justify-content: stretch;
          }

          #leaderboard-selector .leaderboard-selector-track {
            width: 100%;
            justify-content: space-between;
          }

          #leaderboard-selector .leaderboard-pill {
            min-width: 0;
            flex: 1;
            padding-inline: 0.55rem;
          }
        }
      `;
      document.head.appendChild(style);
    }

    let selector = document.getElementById('leaderboard-selector');
    if (!selector) {
      selector = document.createElement('div');
      selector.id = 'leaderboard-selector';
      wrapper.prepend(selector);
    }

    const options: Array<{ key: LeaderboardType; label: string }> = [
      { key: 'overall', label: 'Overall' },
      { key: 'defence', label: 'Difesa' },
      { key: 'attack', label: 'Attacco' }
    ];

    selector.innerHTML = options
      .map(({ key, label }) => {
        const isActive = RankingView.currentLeaderboard === key;
        return `
          <button
            type="button"
            class="leaderboard-pill${isActive ? ' active' : ''}"
            data-leaderboard="${key}"
            aria-pressed="${isActive ? 'true' : 'false'}"
          >${label}</button>
        `;
      })
      .join('');

    selector.innerHTML = `<div class="leaderboard-selector-track">${selector.innerHTML}</div>`;

    selector.querySelectorAll<HTMLButtonElement>('button[data-leaderboard]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.leaderboard as LeaderboardType | undefined;
        if (!mode || RankingView.currentLeaderboard === mode) return;
        RankingView.currentLeaderboard = mode;
        RankingView.sortKey = 'rank';
        RankingView.sortAsc = false;
        RankingView.initLeaderboardSelector();
        RankingView.render();
        RankingView.updateSortIndicators();
      });
    });
  }

  private static getTotalMatches(player: IPlayer): number {
    return player.matches[0] + player.matches[1];
  }

  private static getTotalWins(player: IPlayer): number {
    return player.wins[0] + player.wins[1];
  }

  private static getTotalGoalsFor(player: IPlayer): number {
    return player.goalsFor[0] + player.goalsFor[1];
  }

  private static getTotalGoalsAgainst(player: IPlayer): number {
    return player.goalsAgainst[0] + player.goalsAgainst[1];
  }

  private static getBestClass(player: IPlayer): number {
    const classes = player.class.filter(c => c !== -1);
    if (!classes.length) return -1;
    return Math.min(...classes);
  }

  private static renderStackedCell(lines: [string, string]): string {
    return `
      <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
        <span style="font-size:0.9em;display:flex;align-items:center;gap:4px;">${lines[0]}</span>
        <span style="font-size:0.9em;display:flex;align-items:center;gap:4px;">${lines[1]}</span>
      </div>
    `;
  }

  // Finestre orarie in cui la partita è LIVE (orario locale)
  private static readonly LIVE_WINDOWS: Array<{ start: number; end: number }> = [
    { start: 11 * 60, end: 11 * 60 + 15 }, // 11:00 - 11:15
    { start: 13 * 60, end: 14 * 60 }, // 13:00 - 14:00
    { start: 16 * 60, end: 16 * 60 + 15 }, // 16:00 - 16:15
    { start: 18 * 60, end: 20 * 60 } // 18:00 - 20:00
  ];

  /**
   * Ritorna true se l'orario corrente ricade in una delle finestre LIVE.
   * Confronto effettuato in minuti dal mezzanotte, con fine finestra esclusiva.
   */
  private static isLiveNow(date: Date = new Date()): boolean {
    const minutes = date.getHours() * 60 + date.getMinutes();
    return RankingView.LIVE_WINDOWS.some(w => minutes >= w.start && minutes < w.end);
  }

  /**
   * Helper per ottenere il display del ruolo (etichetta, colore e tipo)
   */
  private static getRoleDisplay(role: PlayerRole): { label: string; color: string } {
    if (role === -1) {
      return { label: '🛡️', color: '#0077cc' };
    } else if (role === 0) {
      return { label: '⚖️', color: '#6c757d' };
    } else {
      return { label: '⚔️', color: '#dc3545' };
    }
  }

  /**
   * Helper per ottenere la percentuale di difesa
   */
  private static getDefencePercentage(role: PlayerRole): number {
    if (role === -1) return 100;
    if (role === 0) return 50;
    return 0;
  }

  /**
   * Helper per ottenere la percentuale di attacco
   */
  private static getAttackPercentage(role: PlayerRole): number {
    if (role === -1) return 0;
    if (role === 0) return 50;
    return 100;
  }

  private static sortKey: SortKey = 'rank';
  private static sortAsc: boolean = false;
  // Indici colonne: 0=#, 1=Classe, 2=Nome, 3=Elo, 4=Ruolo, 5=Match, 6=V/S, 7=%Win, 8=Goal, 9=Goal F/S
  private static readonly sortKeys: (SortKey | null)[] = [
    'rank', null, 'name', 'elo', null, 'matches', null, 'winrate', null, 'goaldiff'
  ];

  /**
   * Initialize the ranking UI.
   *
   * Renders the initial table.
   */
  public static async init(): Promise<void> {
    RankingView.initLeaderboardSelector();
    RankingView.render();
    RankingView.makeHeadersSortable();
    await RankingView.renderLiveMatch();
    RankingView.initPlayButton();
  }

  /**
   * Render the ranking view.
   *
   * Sorts the players by Elo and populates table rows.
   */
  private static render(): void {
    const allPlayers = getAllPlayers();
    const playersWithMatches = allPlayers.filter((player) => {
      if (RankingView.currentLeaderboard === 'defence') {
        return player.matches[0] > 0;
      }
      if (RankingView.currentLeaderboard === 'attack') {
        return player.matches[1] > 0;
      }
      return RankingView.getTotalMatches(player) > 0;
    });
    const players = [...playersWithMatches];
    const todayDeltas = RankingView.getTodayEloDeltas();
    console.log(allPlayers);

    // Sorting logic
    const { sortKey, sortAsc } = RankingView;
    const leaderboardRole = RankingView.currentLeaderboard === 'defence'
      ? 0
      : RankingView.currentLeaderboard === 'attack'
        ? 1
        : null;
    players.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'rank': {
          const aRank = RankingView.getPlayerRank(a);
          const bRank = RankingView.getPlayerRank(b);
          const aRankSort = aRank > 0 ? aRank : Number.POSITIVE_INFINITY;
          const bRankSort = bRank > 0 ? bRank : Number.POSITIVE_INFINITY;
          cmp = aRankSort - bRankSort;
          if (cmp === 0) cmp = RankingView.getBestElo(b) - RankingView.getBestElo(a);
          break;
        }
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'elo':
          cmp = RankingView.getBestElo(b) - RankingView.getBestElo(a);
          break;
        case 'matches':
          cmp = leaderboardRole === null
            ? RankingView.getTotalMatches(b) - RankingView.getTotalMatches(a)
            : b.matches[leaderboardRole] - a.matches[leaderboardRole];
          break;
        case 'winrate': {
          const aMatches = leaderboardRole === null ? RankingView.getTotalMatches(a) : a.matches[leaderboardRole];
          const bMatches = leaderboardRole === null ? RankingView.getTotalMatches(b) : b.matches[leaderboardRole];
          const aWins = leaderboardRole === null ? RankingView.getTotalWins(a) : a.wins[leaderboardRole];
          const bWins = leaderboardRole === null ? RankingView.getTotalWins(b) : b.wins[leaderboardRole];
          const aRate = aMatches > 0 ? aWins / aMatches : 0;
          const bRate = bMatches > 0 ? bWins / bMatches : 0;
          cmp = bRate - aRate;
          break;
        }
        case 'goaldiff': {
          const aGoalsFor = leaderboardRole === null ? RankingView.getTotalGoalsFor(a) : a.goalsFor[leaderboardRole];
          const bGoalsFor = leaderboardRole === null ? RankingView.getTotalGoalsFor(b) : b.goalsFor[leaderboardRole];
          const aGoalsAgainst = leaderboardRole === null ? RankingView.getTotalGoalsAgainst(a) : a.goalsAgainst[leaderboardRole];
          const bGoalsAgainst = leaderboardRole === null ? RankingView.getTotalGoalsAgainst(b) : b.goalsAgainst[leaderboardRole];
          const aRatio = aGoalsAgainst > 0 ? aGoalsFor / aGoalsAgainst : (aGoalsFor > 0 ? Infinity : 0);
          const bRatio = bGoalsAgainst > 0 ? bGoalsFor / bGoalsAgainst : (bGoalsFor > 0 ? Infinity : 0);
          cmp = bRatio - aRatio;
          break;
        }
      }
      return sortAsc ? -cmp : cmp;
    });

    RankingView.renderrRows(players, todayDeltas);
    RankingView.renderMatchStats();
    RankingView.renderRecentMatches();
  }

  /**
   * Gets the Elo deltas for players from matches played today, separated by role.
   *
   * @returns A map of player IDs to their Elo delta per role [defence, attack] and number of matches played today.
   */
  private static getTodayEloDeltas(): Map<number, { delta: [number, number]; matches: [number, number] }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const deltas = new Map<number, { delta: [number, number]; matches: [number, number] }>();
    const playerMatchCounts = new Map<number, [number, number]>();

    const addDelta = (playerId: number, delta: number, role: number): void => {
      if (!Number.isFinite(delta)) return;
      const matchCounts = playerMatchCounts.get(playerId) ?? [0, 0];
      const matchesPlayed = matchCounts[role];
      const bonusMultiplier = getBonusK(matchesPlayed);
      const adjustedDelta = delta * bonusMultiplier;

      const entry = deltas.get(playerId) ?? { delta: [0, 0], matches: [0, 0] };
      entry.delta[role] += adjustedDelta;
      entry.matches[role] += 1;
      deltas.set(playerId, entry);

      matchCounts[role] += 1;
      playerMatchCounts.set(playerId, matchCounts);
    };

    // Ordina le partite per data per calcolare correttamente i moltiplicatori
    const allMatches = getAllMatches().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    for (const match of allMatches) {
      const matchDate = new Date(match.createdAt);
      matchDate.setHours(0, 0, 0, 0);

      if (matchDate.getTime() === today.getTime()) {
        addDelta(match.teamA.defence, match.deltaELO[0], 0);
        addDelta(match.teamA.attack, match.deltaELO[0], 1);
        addDelta(match.teamB.defence, match.deltaELO[1], 0);
        addDelta(match.teamB.attack, match.deltaELO[1], 1);
      } else {
        // Incrementa il contatore delle partite anche per i giorni precedenti
        const playersData = [
          [match.teamA.defence, 0],
          [match.teamA.attack, 1],
          [match.teamB.defence, 0],
          [match.teamB.attack, 1]
        ];
        for (const [playerId, role] of playersData) {
          const counts = playerMatchCounts.get(playerId as number) ?? [0, 0];
          counts[role as number] += 1;
          playerMatchCounts.set(playerId as number, counts);
        }
      }
    }

    return deltas;
  }

  /**
   * Renders the badge showing today's Elo delta.
   *
   * @param delta - The Elo delta for today.
   * @param matches - The number of matches played today.
   * @returns The HTML string for the badge.
   */
  private static renderTodayDeltaBadge(delta: number, matches: number): string {
    const rounded = Math.round(delta);
    const baseStyle = 'margin-left:6px;font-size:0.85em;';

    if (matches === 0) {
      return '';
    }

    if (rounded > 0) {
      return `<span class="today-delta positive" title="Oggi: +${rounded} Elo in ${matches} partite" style="${baseStyle}color:green;">▲ +${rounded}</span>`;
    }

    if (rounded < 0) {
      return `<span class="today-delta negative" title="Oggi: ${rounded} Elo in ${matches} partite" style="${baseStyle}color:#dc3545;">▼ ${rounded}</span>`;
    }

    return `<span class="today-delta neutral" title="Oggi: nessuna variazione in ${matches} partite" style="${baseStyle}color:#a0aec0;">=</span>`;
  }

  /**
   * Builds a map of player IDs to their ranks based on a given Elo retrieval function.
   *
   * @param players - The list of players to rank.
   * @param getElo - A function that retrieves the Elo rating for a player.
   * @returns A map of player IDs to their rank numbers.
   */
  private static buildRankMap(players: IPlayer[], getElo: (player: IPlayer) => number): Map<number, number> {
    const sorted = players.toSorted((a, b) => {
      const classA = RankingView.getRankingClass(a);
      const classB = RankingView.getRankingClass(b);
      const classAForSort = classA === -1 ? Number.NEGATIVE_INFINITY : classA;
      const classBForSort = classB === -1 ? Number.NEGATIVE_INFINITY : classB;
      if (classAForSort !== classBForSort) return classBForSort - classAForSort;
      return getElo(b) - getElo(a);
    });
    const ranks = new Map<number, number>();
    let currentRank = 1;
    let prevElo: number | null = null;
    let prevClass: number | null = null;

    for (let i = 0; i < sorted.length; i++) {
      const player = sorted[i];
      const elo = getElo(player);
      const playerClass = RankingView.getRankingClass(player);
      if (prevElo !== null && prevClass !== null && elo === prevElo && playerClass === prevClass) {
        // stesso rank
      } else {
        currentRank = i + 1;
      }
      ranks.set(player.id, currentRank);
      prevElo = elo;
      prevClass = playerClass;
    }

    return ranks;
  }

  /**
   * Renders the badge showing today's rank change.
   *
   * @param deltaRank - The change in rank for today.
   * @param matches - The number of matches played today.
   * @returns The HTML string for the badge.
   */
  private static renderTodayRankBadge(deltaRank: number, matches: number): string {
    const baseStyle = 'margin-left:6px;font-size:0.85em;';

    const rounded = Math.round(deltaRank);
    if (rounded > 0) {
      return `<span class="today-rank positive" title="Oggi: +${rounded} posizioni" style="${baseStyle}color:green;">▲ +${rounded}</span>`;
    }
    if (rounded < 0) {
      return `<span class="today-rank negative" title="Oggi: ${rounded} posizioni" style="${baseStyle}color:#dc3545;">▼ ${rounded}</span>`;
    }
    return matches === 0
      ? ''
      : `<span class="today-rank neutral" title="Oggi: nessuna variazione di posizione" style="${baseStyle}color:#a0aec0;">=</span>`;
  }

  /**
   * Rende le intestazioni della tabella ordinabili.
   */
  private static makeHeadersSortable(): void {
    const table = RankingView.getTable();
    const thead = table.querySelector('thead');
    if (!thead) return;
    const headers = thead.querySelectorAll('th');
    headers.forEach((th, idx) => {
      if (!RankingView.sortKeys[idx]) return;
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        if (RankingView.sortKey === RankingView.sortKeys[idx]) {
          RankingView.sortAsc = !RankingView.sortAsc;
        } else {
          RankingView.sortKey = RankingView.sortKeys[idx]!;
          RankingView.sortAsc = false;
        }
        RankingView.render();
        RankingView.updateSortIndicators();
      });
    });
    RankingView.updateSortIndicators();
  }

  /**
   * Aggiorna le frecce di ordinamento sulle intestazioni.
   */
  private static updateSortIndicators(): void {
    const table = RankingView.getTable();
    const thead = table.querySelector('thead');
    if (!thead) return;
    const headers = thead.querySelectorAll('th');
    const arrows = RankingView.sortKeys.map(k =>
      RankingView.sortKey === k ? (RankingView.sortAsc ? ' ↑' : ' ↓') : ''
    );
    headers.forEach((th, idx) => {
      // Non mostrare freccia su colonne non ordinabili
      if (!RankingView.sortKeys[idx]) return;
      const title = th.getAttribute('title');
      const text = th.textContent.replaceAll(/[↑↓]/g, '').trim();
      th.innerHTML = text + (arrows[idx] || '');
      if (title) th.setAttribute('title', title);

      // Aggiungi classe 'active' alla colonna attualmente ordinata
      if (RankingView.sortKey === RankingView.sortKeys[idx]) {
        th.classList.add('active');
      } else {
        th.classList.remove('active');
      }
    });
  }

  /**
   * Render table rows, calculating visible rank.
   *
   * Players with the same Elo share the same rank number.
   *
   * @param players - Sorted list of players.
   * @param todayDeltas - Map of player IDs to today's Elo delta info.
   */
  private static renderrRows(players: IPlayer[], todayDeltas: Map<number, { delta: [number, number]; matches: [number, number] }>): void {
    const table = RankingView.getTable();
    const tbody = table.querySelector('tbody')!;
    const fragment = document.createDocumentFragment();

    // Get the selected player ID from notifications
    const selectedPlayerId = Number(localStorage.getItem('biliardino_player_id') || 0);

    const playerIdToStartRank = RankingView.buildRankMap(
      players,
      (p) => {
        const deltasInfo = todayDeltas.get(p.id);
        const deltaForRanking = RankingView.getTodayDeltaForLeaderboard(deltasInfo).delta;
        return Math.round(RankingView.getBestElo(p) - deltaForRanking);
      }
    );

    for (const player of players) {
      const rank = RankingView.getPlayerRank(player);
      const rankDisplay = `${rank}`;

      const isFirst = rank === 1;
      const isSecond = rank === 2;
      const isThird = rank === 3;

      // Mostra il ruolo prevalente (ATT, BAL o DIF) e la percentuale
      const roleDisplay = RankingView.getRoleDisplay(player.role);
      const role = `<span style="font-size:0.9em;color:${roleDisplay.color};">${roleDisplay.label}</span>`;

      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';

      // Colora le prime 3 posizioni (podio)
      if (rank === 1) {
        tr.style.backgroundColor = 'rgba(255, 215, 0, 0.15)'; // oro leggero
        tr.classList.add('podium', 'podium-1');
      } else if (rank === 2) {
        tr.style.backgroundColor = 'rgba(192, 192, 192, 0.15)'; // argento leggero
        tr.classList.add('podium', 'podium-2');
      } else if (rank === 3) {
        tr.style.backgroundColor = 'rgba(205, 127, 50, 0.15)'; // bronzo leggero
        tr.classList.add('podium', 'podium-3', 'podium-last');
      }

      // Highlight the selected player from notifications
      if (selectedPlayerId && player.id === selectedPlayerId) {
        tr.classList.add('selected-player');
      }

      tr.addEventListener('click', () => {
        globalThis.location.href = `./players.html?id=${player.id}`;
      });
      const playerNameDisplay = (isFirst || isSecond || isThird)
        ? `<span style="font-weight: 700;">${player.name}</span>`
        : player.name;

      const fallbackAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJncmFkIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgeDE9IjAlIiB5MT0iMCUiIHgyPSIwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNlMGUwZTA7c3RvcC1vcGFjaXR5OjEiIC8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdHlsZT0ic3RvcC1jb2xvcjojZjVmNWY1O3N0b3Atb3BhY2l0eToxIiAvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgZmlsbD0idXJsKCNncmFkKSIvPjxjaXJjbGUgY3g9IjI0IiBjeT0iMTUiIHI9IjciIGZpbGw9IiM3OTdhYjEiLz48cGF0aCBkPSJNIDEwIDMwIEMgMTAgMjQgMTYgMjAgMjQgMjAgQyAzMiAyMCAzOCAyNCAzOCAzMCBDIDM4IDM4IDMyIDQyIDI0IDQyIEMgMTYgNDIgMTAgMzggMTAgMzAiIGZpbGw9IiM3OTdhYjEiLz48L3N2Zz4=';
      const avatarHTML = `
        <div class="player-avatar">
          <img 
            src="${BASE_PATH}avatars/${player.id}.webp" 
            alt="${player.name}"
            class="avatar-img"
            onerror="this.src='${fallbackAvatar}'"
          />
        </div>
      `;

      const todayDeltaInfo = todayDeltas.get(player.id);
      const todayDeltaDef = todayDeltaInfo?.delta[0] ?? 0;
      const todayMatchesDef = todayDeltaInfo?.matches[0] ?? 0;
      const todayDeltaAtt = todayDeltaInfo?.delta[1] ?? 0;
      const todayMatchesAtt = todayDeltaInfo?.matches[1] ?? 0;
      const leaderboardTodayStats = RankingView.getTodayDeltaForLeaderboard(todayDeltaInfo);
      const startRank = playerIdToStartRank.get(player.id) ?? rank;
      const rankDelta = startRank - rank;
      const todayRankBadge = RankingView.renderTodayRankBadge(rankDelta, leaderboardTodayStats.matches);
      const playerClass = RankingView.getRankingClass(player);
      const [firstRoleIndex, secondRoleIndex]: [0 | 1, 0 | 1] = [0, 1];
      const leaderboardRole = RankingView.currentLeaderboard === 'defence'
        ? 0
        : RankingView.currentLeaderboard === 'attack'
          ? 1
          : null;
      const [isDefRankingElo, isAttRankingElo] = RankingView.getHighlightedEloRoles(player);

      const winsByRole: [number, number] = [player.wins[0], player.wins[1]];
      const lossesByRole: [number, number] = [
        player.matches[0] - player.wins[0],
        player.matches[1] - player.wins[1]
      ];
      const winRateByRole: [number, number] = [
        player.matches[0] > 0 ? Math.round((player.wins[0] / player.matches[0]) * 100) : 0,
        player.matches[1] > 0 ? Math.round((player.wins[1] / player.matches[1]) * 100) : 0
      ];
      const goalsForByRole: [number, number] = [player.goalsFor[0], player.goalsFor[1]];
      const goalsAgainstByRole: [number, number] = [player.goalsAgainst[0], player.goalsAgainst[1]];
      const hasMatchesByRole: [boolean, boolean] = [player.matches[0] > 0, player.matches[1] > 0];

      const renderGoalRatio = (roleIndex: 0 | 1): string => {
        if (!hasMatchesByRole[roleIndex]) {
          return '-';
        }

        const goalsFor = goalsForByRole[roleIndex];
        const goalsAgainst = goalsAgainstByRole[roleIndex];
        const ratio = goalsAgainst > 0 ? goalsFor / goalsAgainst : (goalsFor > 0 ? Infinity : 0);
        if (ratio === Infinity) {
          return '<span style="color:green;">∞</span>';
        }
        if (ratio <= 0) {
          return '-';
        }

        const roundedRatio = parseFloat(ratio.toFixed(2));
        const color = roundedRatio <= 0.8 ? 'red' : roundedRatio >= 1.15 ? 'green' : 'inherit';
        return `<span style="color:${color};">${roundedRatio.toFixed(2)}</span>`;
      };

      // ELO display con ruoli fissi: difesa sopra, attacco sotto
      const firstRoleHasMatches = hasMatchesByRole[firstRoleIndex];
      const secondRoleHasMatches = hasMatchesByRole[secondRoleIndex];
      const eloFirstValue = Math.round(player.elo[firstRoleIndex]);
      const deltaFirstRole = firstRoleIndex === 0 ? todayDeltaDef : todayDeltaAtt;
      const matchesFirstRole = firstRoleIndex === 0 ? todayMatchesDef : todayMatchesAtt;
      const todayBadgeFirstRole = firstRoleHasMatches
        ? RankingView.renderTodayDeltaBadge(deltaFirstRole, matchesFirstRole)
        : '';
      const eloSecondValue = Math.round(player.elo[secondRoleIndex]);
      const deltaSecondRole = todayDeltaAtt;
      const matchesSecondRole = todayMatchesAtt;
      const todayBadgeSecondRole = secondRoleHasMatches
        ? RankingView.renderTodayDeltaBadge(deltaSecondRole, matchesSecondRole)
        : '';
      const firstRoleEloLabel = firstRoleHasMatches
        ? isDefRankingElo
          ? `<strong>${eloFirstValue}</strong>`
          : `${eloFirstValue}`
        : '-';
      const secondRoleEloLabel = secondRoleHasMatches
        ? isAttRankingElo
          ? `<strong>${eloSecondValue}</strong>`
          : `${eloSecondValue}`
        : '-';
      const eloDisplay = leaderboardRole === null
        ? RankingView.renderStackedCell([
          `${firstRoleEloLabel}${todayBadgeFirstRole}`,
          `${secondRoleEloLabel}${todayBadgeSecondRole}`
        ])
        : `${leaderboardRole === 0 ? firstRoleEloLabel : secondRoleEloLabel}${leaderboardRole === 0 ? todayBadgeFirstRole : todayBadgeSecondRole}`;

      const fallbackClassIcon = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSIjZjVmNWY1Ii8+PHRleHQgeD0iMjQiIHk9IjMyIiBmb250LXNpemU9IjMwIiBmb250LXdlaWdodD0iYm9sZCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzc5N2FiMSI+PzwvdGV4dD48L3N2Zz4=';
      const renderClassLine = (roleIndex: 0 | 1): string => {
        const showRoleEmoji = leaderboardRole === null;
        const roleIcon = RankingView.ROLE_ICONS[roleIndex];
        const roleClass = player.class[roleIndex];
        const classIconSize = leaderboardRole === null ? 24 : 48;
        if (roleClass === -1) {
          return showRoleEmoji ? `${roleIcon} -` : '-';
        }

        const classImage = `<img src="/class/${roleClass}.webp" alt="Class ${roleClass}" title="${getClassName(roleClass)}" onerror="this.src='${fallbackClassIcon}'" style="display:block;cursor:help;width:${classIconSize}px;height:${classIconSize}px;object-fit:contain;" />`;

        if (showRoleEmoji) {
          return `<span style="display:inline-flex;align-items:center;gap:4px;line-height:1;">${roleIcon}${classImage}</span>`;
        }

        return `<span style="display:inline-flex;align-items:center;justify-content:center;line-height:0;vertical-align:middle;">${classImage}</span>`;
      };
      const classDisplay = leaderboardRole === null
        ? RankingView.renderStackedCell([
          renderClassLine(firstRoleIndex),
          renderClassLine(secondRoleIndex)
        ])
        : renderClassLine(leaderboardRole as 0 | 1);

      const matchesFirstRoleLabel = firstRoleHasMatches ? `${player.matches[firstRoleIndex]}` : '-';
      const matchesSecondRoleLabel = secondRoleHasMatches ? `${player.matches[secondRoleIndex]}` : '-';
      const recordFirstRoleLabel = firstRoleHasMatches
        ? `${winsByRole[firstRoleIndex]} / ${lossesByRole[firstRoleIndex]}`
        : '-';
      const recordSecondRoleLabel = secondRoleHasMatches
        ? `${winsByRole[secondRoleIndex]} / ${lossesByRole[secondRoleIndex]}`
        : '-';
      const winRateFirstRoleLabel = firstRoleHasMatches ? `${winRateByRole[firstRoleIndex]}%` : '-';
      const winRateSecondRoleLabel = secondRoleHasMatches ? `${winRateByRole[secondRoleIndex]}%` : '-';
      const goalsFirstRoleLabel = firstRoleHasMatches
        ? `${goalsForByRole[firstRoleIndex]} / ${goalsAgainstByRole[firstRoleIndex]}`
        : '-';
      const goalsSecondRoleLabel = secondRoleHasMatches
        ? `${goalsForByRole[secondRoleIndex]} / ${goalsAgainstByRole[secondRoleIndex]}`
        : '-';
      const goalRatioFirstRoleLabel = firstRoleHasMatches ? `${renderGoalRatio(firstRoleIndex)}` : '-';
      const goalRatioSecondRoleLabel = secondRoleHasMatches ? `${renderGoalRatio(secondRoleIndex)}` : '-';

      const matchesDisplay = leaderboardRole === null
        ? RankingView.renderStackedCell([
          matchesFirstRoleLabel,
          matchesSecondRoleLabel
        ])
        : leaderboardRole === 0 ? matchesFirstRoleLabel : matchesSecondRoleLabel;
      const recordDisplay = leaderboardRole === null
        ? RankingView.renderStackedCell([
          recordFirstRoleLabel,
          recordSecondRoleLabel
        ])
        : leaderboardRole === 0 ? recordFirstRoleLabel : recordSecondRoleLabel;
      const winRateDisplay = leaderboardRole === null
        ? RankingView.renderStackedCell([
          winRateFirstRoleLabel,
          winRateSecondRoleLabel
        ])
        : leaderboardRole === 0 ? winRateFirstRoleLabel : winRateSecondRoleLabel;
      const goalsDisplay = leaderboardRole === null
        ? RankingView.renderStackedCell([
          goalsFirstRoleLabel,
          goalsSecondRoleLabel
        ])
        : leaderboardRole === 0 ? goalsFirstRoleLabel : goalsSecondRoleLabel;
      const goalRatioDisplay = leaderboardRole === null
        ? RankingView.renderStackedCell([
          goalRatioFirstRoleLabel,
          goalRatioSecondRoleLabel
        ])
        : leaderboardRole === 0 ? goalRatioFirstRoleLabel : goalRatioSecondRoleLabel;

      // Mostra posizione solo se ha classe
      const rankCell = playerClass === -1
        ? `<td title="Nessuna classe">${todayRankBadge}</td>`
        : `<td title="Posizione in classifica"><strong>${rankDisplay}°</strong> ${todayRankBadge}</td>`;

      tr.innerHTML = `
        ${rankCell}
        <td title="Classe per ruolo">${classDisplay}</td>
        <td title="Nome giocatore"><div class="player-info">${avatarHTML}<span>${playerNameDisplay}</span></div></td>
        <td title="ELO rating per ruolo">${eloDisplay}</td>
        <td title="Ruolo preferito e percentuale">${role}</td>
        <td title="Partite giocate per ruolo">${matchesDisplay}</td>
        <td title="Vittorie - Sconfitte per ruolo">${recordDisplay}</td>
        <td title="Percentuale di vittorie per ruolo">${winRateDisplay}</td>
        <td title="Goal fatti / goal subiti per ruolo">${goalsDisplay}</td>
        <td title="Rapporto goal fatti/subiti per ruolo">${goalRatioDisplay}</td>
      `;
      fragment.appendChild(tr);

      // previousElo non serve più
    }

    tbody.innerHTML = '';
    tbody.appendChild(fragment);

    // Scroll to selected player if exists
    if (selectedPlayerId) {
      // Use setTimeout to ensure DOM is fully rendered
      setTimeout(() => {
        const selectedRow = tbody.querySelector('tr.selected-player');
        if (selectedRow) {
          selectedRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }

  /**
   * Render match statistics dashboard.
   */
  private static renderMatchStats(): void {
    const allMatches = getAllMatches();
    const totalMatches = allMatches.length;
    const allPlayers = getAllPlayers();

    // Calcola goal totali
    const totalGoals = allMatches.reduce((sum, match) => sum + match.score[0] + match.score[1], 0);

    // Trova il giocatore con il massimo ELO raggiunto
    let maxEloPlayer: IPlayer | null = null;
    let maxElo = 0;
    for (const player of allPlayers) {
      const bestElo = Math.max(player.bestElo[0], player.bestElo[1]);
      if (bestElo > maxElo) {
        maxElo = bestElo;
        maxEloPlayer = player;
      }
    }

    // Trova la migliore coppia (delta più alto)
    let bestPair = { player1: '', player2: '', delta: -Infinity };
    for (const player of allPlayers) {
      for (const roleStats of player.teammatesStats) {
        for (const [teammateIdRaw, stats] of Object.entries(roleStats)) {
          const teammateId = Number(teammateIdRaw);
          const delta = stats.delta;
          if (delta > bestPair.delta) {
            const teammate = getPlayerById(teammateId);
            if (teammate) {
              bestPair = { player1: player.name, player2: teammate.name, delta };
            }
          }
        }
      }
    }

    // Trova la peggior coppia (delta più basso)
    let worstPair = { player1: '', player2: '', delta: Infinity };
    for (const player of allPlayers) {
      for (const roleStats of player.teammatesStats) {
        for (const [teammateIdRaw, stats] of Object.entries(roleStats)) {
          const teammateId = Number(teammateIdRaw);
          const delta = stats.delta;
          if (delta < worstPair.delta) {
            const teammate = getPlayerById(teammateId);
            if (teammate) {
              worstPair = { player1: player.name, player2: teammate.name, delta };
            }
          }
        }
      }
    }

    const statsContainer = document.createElement('div');
    statsContainer.className = 'match-stats-dashboard';
    statsContainer.innerHTML = `
      <div class="stat-card card-primary">
        <div class="stat-icon">⚽</div>
        <div class="stat-content">
          <div class="stat-label">Partite & Goal</div>
          <div class="stat-values-group">
            <div class="stat-value-row">
              <span class="stat-number">${totalMatches}</span>
              <span class="stat-unit">partite</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-value-row">
              <span class="stat-number">${totalGoals}</span>
              <span class="stat-unit">goal</span>
            </div>
          </div>
        </div>
      </div>
      <div class="stat-card card-warning">
        <div class="stat-icon">⭐</div>
        <div class="stat-content">
          <div class="stat-label">Max ELO Raggiunto</div>
          <div class="stat-value-group">
            <div class="stat-player-name">${maxEloPlayer ? maxEloPlayer.name : '-'}</div>
            ${maxEloPlayer ? `<div class="delta-badge primary" style="margin-top: 0.5rem;">${Math.round(maxElo)}</div>` : ''}
          </div>
        </div>
      </div>
      <div class="stat-card card-success">
        <div class="stat-icon">🏆</div>
        <div class="stat-content">
          <div class="stat-label">Miglior Coppia</div>
          <div class="stat-value-group">
            ${bestPair.delta === -Infinity
        ? '<div class="stat-empty">-</div>'
        : `
              <div class="stat-pair-names">
                <div>${bestPair.player1}</div>
                <div class="pair-separator">+</div>
                <div>${bestPair.player2}</div>
              </div>
              <div class="delta-badge positive" style="margin-top: 0.5rem;">+${Math.round(bestPair.delta)}</div>
            `}
          </div>
        </div>
      </div>
      <div class="stat-card card-danger">
        <div class="stat-icon">📉</div>
        <div class="stat-content">
          <div class="stat-label">Peggior Coppia</div>
          <div class="stat-value-group">
            ${worstPair.delta === Infinity
        ? '<div class="stat-empty">-</div>'
        : `
              <div class="stat-pair-names">
                <div>${worstPair.player1}</div>
                <div class="pair-separator">+</div>
                <div>${worstPair.player2}</div>
              </div>
              <div class="delta-badge negative" style="margin-top: 0.5rem;">${Math.round(worstPair.delta)}</div>
            `}
          </div>
        </div>
      </div>
    `;

    const container = document.querySelector('.tables-container');
    if (container) {
      const existingStats = document.querySelector('.match-stats-dashboard');
      if (existingStats) {
        existingStats.replaceWith(statsContainer);
      } else {
        const table = RankingView.getTable();
        table.parentElement?.insertAdjacentElement('afterend', statsContainer);
      }
    }
  }

  /**
   * Locate the ranking table in the DOM.
   *
   * @returns The HTML table element.
   * @throws If the table element cannot be found.
   */
  private static getTable(): HTMLTableElement {
    const table = document.getElementById('ranking') as HTMLTableElement | null;
    if (!table) {
      throw new Error('Wrong ranking table id');
    }
    return table;
  }

  /**
   * Render recent matches table below the ranking.
   */
  private static renderRecentMatches(): void {
    const allMatches = getAllMatches();
    const matches = allMatches.toSorted((a, b) => b.createdAt - a.createdAt).slice(0, 30);
    if (!matches.length) return;

    const container = document.querySelector('.tables-container');
    if (!container) return;

    // Remove old wrapper if exists
    const oldWrapper = document.getElementById('recent-matches-wrapper');
    if (oldWrapper) oldWrapper.remove();

    // Create wrapper for table
    const wrapper = document.createElement('div');
    wrapper.id = 'recent-matches-wrapper';
    wrapper.className = 'table-wrapper';
    wrapper.style.marginTop = '2.5rem';

    // Nuova tabella compatta
    const table = document.createElement('table');
    table.id = 'recent-matches-table';
    table.innerHTML = `
      <caption style="caption-side:top;font-weight:700;font-size:1.2rem;margin-bottom:0.5rem;text-align:left;color:#2d3748;">Ultime partite giocate</caption>
      <thead>
        <tr>
          <th style="width:16px;"></th>
          <th>Rating</th>
          <th></th>
          <th>Team A</th>
          <th>Risultato</th>
          <th>Team B</th>
          <th></th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody')!;
    // Calcola la data di oggi (solo parte data, senza orario)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const match of matches) {
      // Determina se la partita è di oggi
      const matchDate = new Date(match.createdAt);
      matchDate.setHours(0, 0, 0, 0);
      const isToday = matchDate.getTime() === today.getTime();

      // Team names
      const teamAAttack = getPlayerById(match.teamA.attack);
      const teamADefence = getPlayerById(match.teamA.defence);
      const teamBAttack = getPlayerById(match.teamB.attack);
      const teamBDefence = getPlayerById(match.teamB.defence);

      // Helper to format player name with Elo preso dal match
      function playerWithElo(player: IPlayer | undefined, elo: number | undefined): string {
        if (!player || elo === undefined) return '?';
        return `${player.name} <strong>(${Math.round(elo)})</strong>`;
      }

      // ELO dei giocatori per questa partita
      // teamAELO: [difensore, attaccante], teamBELO: [difensore, attaccante]
      const teamAELO = match.teamAELO;
      const teamBELO = match.teamBELO;

      let teamA = `${playerWithElo(teamADefence, teamAELO[0])} & ${playerWithElo(teamAAttack, teamAELO[1])}`;
      let teamB = `${playerWithElo(teamBDefence, teamBELO[0])} & ${playerWithElo(teamBAttack, teamBELO[1])}`;

      // ...le stringhe teamA e teamB sono già definite sopra

      // Determina la squadra vincitrice
      const teamAWon = match.score[0] > match.score[1];

      // Elo prima arrotondato
      let eloA = Math.round(match.teamELO[0]);
      let eloB = Math.round(match.teamELO[1]);

      // Delta arrotondato e formattato con colori
      let deltaA = Math.round(match.deltaELO[0]);
      let deltaB = Math.round(match.deltaELO[1]);

      // Percentuali di vittoria attesa (expA, expB)
      let expA = match.expectedScore[0];
      let expB = match.expectedScore[1];

      let scoreA = match.score[0];
      let scoreB = match.score[1];

      // Se la squadra B ha vinto, inverti tutto per mostrare prima il vincitore
      if (!teamAWon) {
        [teamA, teamB] = [teamB, teamA];
        [eloA, eloB] = [eloB, eloA];
        [deltaA, deltaB] = [deltaB, deltaA];
        [expA, expB] = [expB, expA];
        [scoreA, scoreB] = [scoreB, scoreA];
      }

      const deltaA_color = deltaA >= 0 ? 'green' : 'red';
      const deltaB_color = deltaB >= 0 ? 'green' : 'red';
      const deltaA_formatted = `<span style="font-size:0.85em;color:${deltaA_color};">(${deltaA >= 0 ? '+' : ''}${deltaA})</span>`;
      const deltaB_formatted = `<span style="font-size:0.85em;color:${deltaB_color};">(${deltaB >= 0 ? '+' : ''}${deltaB})</span>`;

      const expA_percent = typeof expA === 'number' ? Math.round(expA * 100) : '?';
      const expB_percent = typeof expB === 'number' ? Math.round(expB * 100) : '?';

      // Colora le percentuali in base al valore
      const colorA = expA_percent === '?' ? 'inherit' : (expA_percent > 50 ? 'green' : expA_percent < 50 ? 'red' : 'inherit');
      const colorB = expB_percent === '?' ? 'inherit' : (expB_percent > 50 ? 'green' : expB_percent < 50 ? 'red' : 'inherit');

      // Aggiungi grassetto se la percentuale è estrema (≥60 o ≤40)
      const boldA = expA_percent !== '?' && (expA_percent >= 60 || expA_percent <= 40);
      const boldB = expB_percent !== '?' && (expB_percent >= 60 || expB_percent <= 40);
      const percentA = boldA ? `<strong>(${expA_percent}%)</strong>` : `(${expA_percent}%)`;
      const percentB = boldB ? `<strong>(${expB_percent}%)</strong>` : `(${expB_percent}%)`;

      // Risultato con percentuali integrate
      const score = `${scoreA} - ${scoreB}`;
      const resultWithPercentages = `<span style="font-size:0.85em;color:${colorA};">${percentA}</span> <strong>${score}</strong> <span style="font-size:0.85em;color:${colorB};">${percentB}</span>`;

      // Calcola rating medio della partita per colorare la riga
      const avgRating = (eloA + eloB) / 2;
      let rowBackgroundColor = '';
      let rowTextColor = '';
      if (avgRating >= 1150) {
        rowBackgroundColor = 'background-color: #1e3a8a;'; // blu scuro
        rowTextColor = 'color: white;'; // scritta bianca
      } else if (avgRating >= 1100) {
        rowBackgroundColor = 'background-color: rgba(0, 0, 255, 0.25);'; // blu leggero
      } else if (avgRating >= 1050) {
        rowBackgroundColor = 'background-color: rgba(0, 127, 255, 0.1);'; // azzurro chiaro
      } else if (avgRating <= 900) {
        rowBackgroundColor = 'background-color: rgba(255, 0, 0, 0.2);'; // rosso leggero
      } else if (avgRating <= 950) {
        rowBackgroundColor = 'background-color: rgba(255, 127, 0, 0.1);'; // arancione leggero
      }

      const tr = document.createElement('tr');
      // Pallino azzurro sfumato stile notifica se la partita è di oggi
      const blueDot = isToday
        ? `<span title="Partita di oggi" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:radial-gradient(circle at 40% 40%, #4fc3f7 70%, #1976d2 100%);box-shadow:0 0 4px #1976d2aa;vertical-align:middle;margin:0 2px;"></span>`
        : '';
      const cellStyle = `${rowBackgroundColor}${rowTextColor}`;
      tr.innerHTML = `
        <td style="${cellStyle}text-align:center;">${blueDot}</td>
        <td style="${cellStyle}font-size:1.15em;font-style:italic;"><strong>${Math.round(avgRating)}</strong></td>
        <td style="${cellStyle}"><strong>${eloA}</strong> ${deltaA_formatted}</td>
        <td style="${cellStyle}">${teamA}</td>
        <td style="${cellStyle}">${resultWithPercentages}</td>
        <td style="${cellStyle}">${teamB}</td>
        <td style="${cellStyle}"><strong>${eloB}</strong> ${deltaB_formatted}</td>
      `;
      tbody.appendChild(tr);
    }

    wrapper.appendChild(table);
    container.appendChild(wrapper);
  }

  /**
   * Render the live match panel if there is a running match.
   */
  private static async renderLiveMatch(): Promise<void> {
    const container = document.getElementById('live-match-container');
    if (!container) return;

    try {
      const runningMatch = await fetchRunningMatch();
      if (!runningMatch) {
        container.innerHTML = '';
        return;
      }

      const defA = getPlayerById(runningMatch.teamA.defence);
      const attA = getPlayerById(runningMatch.teamA.attack);
      const defB = getPlayerById(runningMatch.teamB.defence);
      const attB = getPlayerById(runningMatch.teamB.attack);

      if (!defA || !attA || !defB || !attB) {
        container.innerHTML = '';
        return;
      }

      const rankDefA = RankingView.getPlayerRankByRole(runningMatch.teamA.defence, 0);
      const rankAttA = RankingView.getPlayerRankByRole(runningMatch.teamA.attack, 1);
      const rankDefB = RankingView.getPlayerRankByRole(runningMatch.teamB.defence, 0);
      const rankAttB = RankingView.getPlayerRankByRole(runningMatch.teamB.attack, 1);

      const defAElo = defA.elo[0];
      const attAElo = attA.elo[1];
      const defBElo = defB.elo[0];
      const attBElo = attB.elo[1];
      const avgEloA = Math.round((defAElo + attAElo) / 2);
      const avgEloB = Math.round((defBElo + attBElo) / 2);
      const defAClass = defA.class[0];
      const attAClass = attA.class[1];
      const defBClass = defB.class[0];
      const attBClass = attB.class[1];

      // Calcola percentuali dei ruoli
      const defPercA = RankingView.getDefencePercentage(defA.role);
      const attPercA = RankingView.getAttackPercentage(attA.role);
      const defPercB = RankingView.getDefencePercentage(defB.role);
      const attPercB = RankingView.getAttackPercentage(attB.role);

      // Calcola probabilità di vittoria
      const winProbA = expectedScore(avgEloA, avgEloB);
      const winProbB = 1 - winProbA;
      const winProbAPercent = (winProbA * 100).toFixed(1);
      const winProbBPercent = (winProbB * 100).toFixed(1);

      const getWinProbClass = (percent: string): string => {
        const value = Number.parseFloat(percent);
        if (value < 50) return 'winprob-low';
        if (value > 50) return 'winprob-high';
        return 'winprob-neutral';
      };

      const fallbackAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJncmFkIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgeDE9IjAlIiB5MT0iMCUiIHgyPSIwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNlMGUwZTA7c3RvcC1vcGFjaXR5OjEiIC8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdHlsZT0ic3RvcC1jb2xvcjojZjVmNWY1O3N0b3Atb3BhY2l0eToxIiAvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgZmlsbD0idXJsKCNncmFkKSIvPjxjaXJjbGUgY3g9IjI0IiBjeT0iMTUiIHI9IjciIGZpbGw9IiM3OTdhYjEiLz48cGF0aCBkPSJNIDEwIDMwIEMgMTAgMjQgMTYgMjAgMjQgMjAgQyAzMiAyMCAzOCAyNCAzOCAzMCBDIDM4IDM4IDMyIDQyIDI0IDQyIEMgMTYgNDIgMTAgMzggMTAgMzAiIGZpbGw9IiM3OTdhYjEiLz48L3N2Zz4=';

      const isLive = RankingView.isLiveNow();
      container.innerHTML = `
        <div class="live-match-panel">
          <div class="live-match-header">
            ${isLive ? '<span class="live-badge">LIVE</span>' : ''}
            <span class="live-title">${isLive ? 'Partita in Corso' : 'Prossima Partita'}</span>
          </div>
          <div class="live-match-content">
            <div class="live-team">
              <div class="live-team-winprob ${getWinProbClass(winProbAPercent)}">
                <span class="winprob-value">${winProbAPercent}%</span>
                <span class="team-elo-label">team elo</span>
                <span class="team-elo-value">${avgEloA}</span>
              </div>
              <div class="live-players">
                <div class="live-player">
                  <a href="./players.html?id=${defA.id}" class="live-player-link">
                    <div class="live-avatar-wrapper">
                      <img src="/avatars/${defA.id}.webp" alt="${defA.name}" class="live-avatar" onerror="this.src='${fallbackAvatar}'" />
                      ${defAClass === -1 ? '' : `<img src="/class/${defAClass}.webp" alt="Class ${defAClass}" class="live-class-icon" />`}
                    </div>
                    <div class="live-player-info">
                      <span class="live-player-name">🛡️ ${defA.name} ${defAClass === -1 ? '' : `<span style="font-size:0.9em;opacity:0.8;">(${formatRank(rankDefA)})</span>`}</span>
                      <div style="display:flex;align-items:center;gap:0.5rem;">
                        <span class="role-badge badge-def">DIF ${defPercA}%</span>
                        <span class="live-player-elo">${Math.round(defAElo)} <span style="font-size:0.85em;opacity:0.7;">(${getDisplayElo(defA)})</span></span>
                      </div>
                    </div>
                  </a>
                </div>
                <div class="live-player">
                  <a href="./players.html?id=${attA.id}" class="live-player-link">
                    <div class="live-avatar-wrapper">
                      <img src="/avatars/${attA.id}.webp" alt="${attA.name}" class="live-avatar" onerror="this.src='${fallbackAvatar}'" />
                      ${attAClass === -1 ? '' : `<img src="/class/${attAClass}.webp" alt="Class ${attAClass}" class="live-class-icon" />`}
                    </div>
                    <div class="live-player-info">
                      <span class="live-player-name">⚔️ ${attA.name} ${attAClass === -1 ? '' : `<span style="font-size:0.9em;opacity:0.8;">(${formatRank(rankAttA)})</span>`}</span>
                      <div style="display:flex;align-items:center;gap:0.5rem;">
                        <span class="role-badge badge-att">ATT ${attPercA}%</span>
                        <span class="live-player-elo">${Math.round(attAElo)} <span style="font-size:0.85em;opacity:0.7;">(${getDisplayElo(attA)})</span></span>
                      </div>
                    </div>
                  </a>
                </div>
              </div>
            </div>
            <div class="live-vs">VS</div>
            <div class="live-team">
              <div class="live-team-winprob ${getWinProbClass(winProbBPercent)}">
                <span class="winprob-value">${winProbBPercent}%</span>
                <span class="team-elo-label">team elo</span>
                <span class="team-elo-value">${avgEloB}</span>
              </div>
              <div class="live-players">
                <div class="live-player">
                  <a href="./players.html?id=${defB.id}" class="live-player-link">
                    <div class="live-avatar-wrapper">
                      <img src="/avatars/${defB.id}.webp" alt="${defB.name}" class="live-avatar" onerror="this.src='${fallbackAvatar}'" />
                      ${defBClass === -1 ? '' : `<img src="/class/${defBClass}.webp" alt="Class ${defBClass}" class="live-class-icon" />`}
                    </div>
                    <div class="live-player-info">
                      <span class="live-player-name">🛡️ ${defB.name} ${defBClass === -1 ? '' : `<span style="font-size:0.9em;opacity:0.8;">(${formatRank(rankDefB)})</span>`}</span>
                      <div style="display:flex;align-items:center;gap:0.5rem;">
                        <span class="role-badge badge-def">DIF ${defPercB}%</span>
                        <span class="live-player-elo">${Math.round(defBElo)} <span style="font-size:0.85em;opacity:0.7;">(${getDisplayElo(defB)})</span></span>
                      </div>
                    </div>
                  </a>
                </div>
                <div class="live-player">
                  <a href="./players.html?id=${attB.id}" class="live-player-link">
                    <div class="live-avatar-wrapper">
                      <img src="/avatars/${attB.id}.webp" alt="${attB.name}" class="live-avatar" onerror="this.src='${fallbackAvatar}'" />
                      ${attBClass === -1 ? '' : `<img src="/class/${attBClass}.webp" alt="Class ${attBClass}" class="live-class-icon" />`}
                    </div>
                    <div class="live-player-info">
                      <span class="live-player-name">⚔️ ${attB.name} ${attBClass === -1 ? '' : `<span style="font-size:0.9em;opacity:0.8;">(${formatRank(rankAttB)})</span>`}</span>
                      <div style="display:flex;align-items:center;gap:0.5rem;">
                        <span class="role-badge badge-att">ATT ${attPercB}%</span>
                        <span class="live-player-elo">${Math.round(attBElo)} <span style="font-size:0.85em;opacity:0.7;">(${getDisplayElo(attB)})</span></span>
                      </div>
                    </div>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    } catch (error) {
      console.error('Failed to render live match', error);
      container.innerHTML = '';
    }
  }

  /**
   * Calcola il prossimo matchTime basato sull'ora corrente
   */
  private static getNextMatchTime(): string {
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    if (mins < 660) return '11:00'; // Prima delle 11:00
    if (mins < 960) return '16:00'; // Prima delle 16:00
    return '11:00'; // Default giorno dopo
  }

  /**
   * Inizializza il pulsante "Gioca" per redirect a confirm.html
   */
  private static initPlayButton(): void {
    const playBtn = document.getElementById('play-btn');
    if (!playBtn) return;

    playBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const matchTime = RankingView.getNextMatchTime();
      window.location.href = `./confirm.html?time=${matchTime}`;
    });

    // Mostra pulsante Matchmaking solo per admin (id: 25, 18, 22, 13)
    const adminMatchmakingBtn = document.getElementById('admin-matchmaking-btn');
    if (adminMatchmakingBtn) {
      const playerId = localStorage.getItem('biliardino_player_id');
      const adminIds = [25, 18, 22, 13];

      if (playerId && adminIds.includes(Number(playerId))) {
        adminMatchmakingBtn.style.display = 'inline-block';
      }
    }
  }
}
