import { IPlayer } from '@/models/player.interface';
import { expectedScore, getMatchPlayerElo } from '@/services/elo.service';
import { getBonusK } from '@/services/player.service';
import { formatRank } from '@/utils/format-rank.util';
import { getClassName } from '@/utils/get-class-name.util';
import { getDisplayElo } from '@/utils/get-display-elo.util';
import { BASE_PATH } from '../config/env.config';
import { getAllMatches } from '../services/match.service';
import { getAllPlayers, getPlayerById, getRank } from '../services/player.service';
import { fetchRunningMatch } from '../services/repository.service';

/**
 * Renders and handles UI interactions for the ranking table.
 */
type SortKey = 'rank' | 'name' | 'elo' | 'matches' | 'winrate' | 'goaldiff' | 'form';

export class RankingView {
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

  private static sortKey: SortKey = 'rank';
  private static sortAsc: boolean = false;
  // Indici colonne: 0=#, 1=Classe, 2=Nome, 3=Elo, 4=Ruolo, 5=Match, 6=V/S, 7=%Win, 8=Goal F/S, 9=Forma
  private static readonly sortKeys: (SortKey | null)[] = [
    'rank', null, 'name', 'elo', null, 'matches', null, 'winrate', 'goaldiff', 'form'
  ];

  /**
   * Initialize the ranking UI.
   *
   * Renders the initial table.
   */
  public static async init(): Promise<void> {
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
    const playersWithMatches = allPlayers.filter(player => player.matches > 0);
    const players = [...playersWithMatches];
    const todayDeltas = RankingView.getTodayEloDeltas();

    // Sorting logic
    const { sortKey, sortAsc } = RankingView;
    players.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'rank':
          cmp = getRank(a.id) - getRank(b.id);
          break;
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'elo':
          cmp = b.elo - a.elo;
          break;
        case 'matches':
          cmp = b.matches - a.matches;
          break;
        case 'winrate': {
          const aRate = a.matches > 0 ? (a.wins || 0) / a.matches : 0;
          const bRate = b.matches > 0 ? (b.wins || 0) / b.matches : 0;
          cmp = bRate - aRate;
          break;
        }
        case 'goaldiff': {
          const aRatio = (a.goalsAgainst || 0) > 0 ? (a.goalsFor || 0) / a.goalsAgainst : ((a.goalsFor || 0) > 0 ? Infinity : 0);
          const bRatio = (b.goalsAgainst || 0) > 0 ? (b.goalsFor || 0) / b.goalsAgainst : ((b.goalsFor || 0) > 0 ? Infinity : 0);
          cmp = bRatio - aRatio;
          break;
        }
        case 'form': {
          // Elo guadagnato nelle ultime 5 partite
          const aDelta = (a.matchesDelta || []).slice(-5).reduce((sum, d) => sum + d, 0);
          const bDelta = (b.matchesDelta || []).slice(-5).reduce((sum, d) => sum + d, 0);
          cmp = bDelta - aDelta;
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
   * Gets the Elo deltas for players from matches played today.
   *
   * @returns A map of player IDs to their Elo delta and number of matches played today.
   */
  private static getTodayEloDeltas(): Map<number, { delta: number; matches: number }> {
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

    // Ordina le partite per data per calcolare correttamente i moltiplicatori
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
        // Incrementa il contatore delle partite anche per i giorni precedenti
        const players = [match.teamA.defence, match.teamA.attack, match.teamB.defence, match.teamB.attack];
        for (const playerId of players) {
          const count = playerMatchCounts.get(playerId) ?? 0;
          playerMatchCounts.set(playerId, count + 1);
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
      const classA = a.class === -1 ? Infinity : a.class;
      const classB = b.class === -1 ? Infinity : b.class;
      if (classA !== classB) return classA - classB;
      return getElo(b) - getElo(a);
    });
    const ranks = new Map<number, number>();
    let currentRank = 1;
    let prevElo: number | null = null;

    for (let i = 0; i < sorted.length; i++) {
      const player = sorted[i];
      const elo = getElo(player);
      if (prevElo !== null && elo === prevElo) {
        // stesso rank
      } else {
        currentRank = i + 1;
      }
      ranks.set(player.id, currentRank);
      prevElo = elo;
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
  private static renderrRows(players: IPlayer[], todayDeltas: Map<number, { delta: number; matches: number }>): void {
    const table = RankingView.getTable();
    const tbody = table.querySelector('tbody')!;
    const fragment = document.createDocumentFragment();

    // Get the selected player ID from notifications
    const selectedPlayerId = Number(localStorage.getItem('biliardino_player_id') || 0);

    const playerIdToStartRank = RankingView.buildRankMap(
      players,
      p => Math.round(p.elo - (todayDeltas.get(p.id)?.delta ?? 0))
    );

    for (const player of players) {
      const rank = getRank(player.id);
      const rankDisplay = `${rank}`;
      const elo = getDisplayElo(player);

      const isFirst = rank === 1;
      const isSecond = rank === 2;
      const isThird = rank === 3;

      // Mostra sempre il ruolo prevalente (ATT o DIF) e la percentuale (max 50%)
      let role = '';
      let defenceValue = player.defence * 100;
      let label = '🛡️';
      let color = '#0077cc';
      if (defenceValue === 50) {
        label = '⚖️';
        color = '#6c757d';
      }
      if (defenceValue < 50) {
        defenceValue = 100 - defenceValue;
        label = '⚔️';
        color = '#dc3545';
      }
      role = `<span style="font-size:0.9em;color:${color};">${label} ${defenceValue}%</span>`;

      // Usa matchesDelta precalcolato per ultimi 5 risultati e Elo guadagnato
      const matchesDelta = player.matchesDelta || [];
      const last5Delta = matchesDelta.slice(-5);

      let eloGainedLast5 = 0;
      last5Delta.forEach((delta) => {
        eloGainedLast5 += delta;
      });

      const last5Results = last5Delta.slice().reverse().map((delta) => {
        return delta > 0 ? '🟢' : '🔴';
      }).join('');

      const eloGainedFormatted = eloGainedLast5 >= 0
        ? `<span style="font-size:0.85em;color:green;">(+${Math.round(eloGainedLast5)})</span>`
        : `<span style="font-size:0.85em;color:red;">(${Math.round(eloGainedLast5)})</span>`;

      // Usa dati precalcolati per win rate e vittorie/sconfitte
      const wins = player.wins || 0;
      const losses = player.matches - wins;
      const winRate = player.matches > 0 ? Math.round((wins / player.matches) * 100) : 0;
      const record = `${wins} / ${losses}`;

      // Usa dati precalcolati per rapporto goal fatti/subiti
      const goalsScored = player.goalsFor || 0;
      const goalsConceded = player.goalsAgainst || 0;
      const goalRatio = goalsConceded > 0 ? goalsScored / goalsConceded : (goalsScored > 0 ? Infinity : 0);
      let goalDiff = '-';
      if (goalRatio === Infinity) {
        goalDiff = '<span style="color:green;">∞</span>';
      } else if (goalRatio > 0) {
        const roundedRatio = parseFloat(goalRatio.toFixed(2));
        const color = roundedRatio <= 0.8 ? 'red' : roundedRatio >= 1.15 ? 'green' : 'inherit';
        goalDiff = `<span style="color:${color};">${roundedRatio.toFixed(2)}</span>`;
      }

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
      const todayDelta = todayDeltaInfo?.delta ?? 0;
      const todayMatches = todayDeltaInfo?.matches ?? 0;
      const todayBadge = RankingView.renderTodayDeltaBadge(todayDelta, todayMatches);
      const startRank = playerIdToStartRank.get(player.id) ?? rank;
      const rankDelta = startRank - rank;
      const todayRankBadge = RankingView.renderTodayRankBadge(rankDelta, todayMatches);

      // Class icon
      const fallbackClassIcon = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSIjZjVmNWY1Ii8+PHRleHQgeD0iMjQiIHk9IjMyIiBmb250LXNpemU9IjMwIiBmb250LXdlaWdodD0iYm9sZCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzc5N2FiMSI+PzwvdGV4dD48L3N2Zz4=';
      const classImageHTML = player.class !== -1 ? `
        <div class="class-icon">
          <img 
            src="/class/${player.class}.webp" 
            alt="Class ${player.class}"
            title="${getClassName(player.class)}"
            onerror="this.src='${fallbackClassIcon}'"
            style="cursor: help;"
          />
        </div>
      ` : '';

      // Mostra posizione solo se ha classe
      const rankCell = player.class !== -1
        ? `<td title="Posizione in classifica"><strong>${rankDisplay}°</strong> ${todayRankBadge}</td>`
        : `<td title="Nessuna classe">${todayRankBadge}</td>`;

      tr.innerHTML = `
        ${rankCell}
        <td title="Classe">${classImageHTML}</td>
        <td title="Nome giocatore"><div class="player-info">${avatarHTML}<span>${playerNameDisplay}</span></div></td>
        <td title="ELO rating attuale"><strong>${elo}</strong> ${todayBadge}</td>
        <td title="Ruolo preferito e percentuale">${role}</td>
        <td title="Partite giocate">${player.matches}</td>
        <td title="Vittorie - Sconfitte">${record}</td>
        <td title="Percentuale di vittorie">${winRate}%</td>
        <td title="Rapporto goal fatti/subiti">${goalDiff}</td>
        <td title="Ultime 5 partite e variazione ELO">${last5Results || '-'} ${last5Results ? eloGainedFormatted : ''}</td>
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
      const bestElo = player.bestElo;
      if (bestElo > maxElo) {
        maxElo = bestElo;
        maxEloPlayer = player;
      }
    }

    // Trova la migliore coppia (delta più alto)
    let bestPair = { player1: '', player2: '', delta: -Infinity };
    for (const player of allPlayers) {
      if (!player.teammatesDelta) continue;
      for (const [teammateId, delta] of player.teammatesDelta) {
        if (delta > bestPair.delta) {
          const teammate = getPlayerById(teammateId);
          if (teammate) {
            bestPair = { player1: player.name, player2: teammate.name, delta };
          }
        }
      }
    }

    // Trova la peggior coppia (delta più basso)
    let worstPair = { player1: '', player2: '', delta: Infinity };
    for (const player of allPlayers) {
      if (!player.teammatesDelta) continue;
      for (const [teammateId, delta] of player.teammatesDelta) {
        if (delta < worstPair.delta) {
          const teammate = getPlayerById(teammateId);
          if (teammate) {
            worstPair = { player1: player.name, player2: teammate.name, delta };
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

      const rankDefA = getRank(runningMatch.teamA.defence);
      const rankAttA = getRank(runningMatch.teamA.attack);
      const rankDefB = getRank(runningMatch.teamB.defence);
      const rankAttB = getRank(runningMatch.teamB.attack);

      const avgEloA = Math.round((getMatchPlayerElo(defA, true) + getMatchPlayerElo(attA, false)) / 2);
      const avgEloB = Math.round((getMatchPlayerElo(defB, true) + getMatchPlayerElo(attB, false)) / 2);

      // Calcola percentuali dei ruoli
      const defPercA = Math.round(defA.defence * 100);
      const attPercA = 100 - Math.round(attA.defence * 100);
      const defPercB = Math.round(defB.defence * 100);
      const attPercB = 100 - Math.round(attB.defence * 100);

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
                      ${defA.class !== -1 ? `<img src="/class/${defA.class}.webp" alt="Class ${defA.class}" class="live-class-icon" />` : ''}
                    </div>
                    <div class="live-player-info">
                      <span class="live-player-name">🛡️ ${defA.name} ${defA.class !== -1 ? `<span style="font-size:0.9em;opacity:0.8;">(${formatRank(rankDefA)})</span>` : ''}</span>
                      <div style="display:flex;align-items:center;gap:0.5rem;">
                        <span class="role-badge badge-def">DIF ${defPercA}%</span>
                        <span class="live-player-elo">${Math.round(getMatchPlayerElo(defA, true))} <span style="font-size:0.85em;opacity:0.7;">(${getDisplayElo(defA)})</span></span>
                      </div>
                    </div>
                  </a>
                </div>
                <div class="live-player">
                  <a href="./players.html?id=${attA.id}" class="live-player-link">
                    <div class="live-avatar-wrapper">
                      <img src="/avatars/${attA.id}.webp" alt="${attA.name}" class="live-avatar" onerror="this.src='${fallbackAvatar}'" />
                      ${attA.class !== -1 ? `<img src="/class/${attA.class}.webp" alt="Class ${attA.class}" class="live-class-icon" />` : ''}
                    </div>
                    <div class="live-player-info">
                      <span class="live-player-name">⚔️ ${attA.name} ${attA.class !== -1 ? `<span style="font-size:0.9em;opacity:0.8;">(${formatRank(rankAttA)})</span>` : ''}</span>
                      <div style="display:flex;align-items:center;gap:0.5rem;">
                        <span class="role-badge badge-att">ATT ${attPercA}%</span>
                        <span class="live-player-elo">${Math.round(getMatchPlayerElo(attA, false))} <span style="font-size:0.85em;opacity:0.7;">(${getDisplayElo(attA)})</span></span>
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
                      ${defB.class !== -1 ? `<img src="/class/${defB.class}.webp" alt="Class ${defB.class}" class="live-class-icon" />` : ''}
                    </div>
                    <div class="live-player-info">
                      <span class="live-player-name">🛡️ ${defB.name} ${defB.class !== -1 ? `<span style="font-size:0.9em;opacity:0.8;">(${formatRank(rankDefB)})</span>` : ''}</span>
                      <div style="display:flex;align-items:center;gap:0.5rem;">
                        <span class="role-badge badge-def">DIF ${defPercB}%</span>
                        <span class="live-player-elo">${Math.round(getMatchPlayerElo(defB, true))} <span style="font-size:0.85em;opacity:0.7;">(${getDisplayElo(defB)})</span></span>
                      </div>
                    </div>
                  </a>
                </div>
                <div class="live-player">
                  <a href="./players.html?id=${attB.id}" class="live-player-link">
                    <div class="live-avatar-wrapper">
                      <img src="/avatars/${attB.id}.webp" alt="${attB.name}" class="live-avatar" onerror="this.src='${fallbackAvatar}'" />
                      ${attB.class !== -1 ? `<img src="/class/${attB.class}.webp" alt="Class ${attB.class}" class="live-class-icon" />` : ''}
                    </div>
                    <div class="live-player-info">
                      <span class="live-player-name">⚔️ ${attB.name} ${attB.class !== -1 ? `<span style="font-size:0.9em;opacity:0.8;">(${formatRank(rankAttB)})</span>` : ''}</span>
                      <div style="display:flex;align-items:center;gap:0.5rem;">
                        <span class="role-badge badge-att">ATT ${attPercB}%</span>
                        <span class="live-player-elo">${Math.round(getMatchPlayerElo(attB, false))} <span style="font-size:0.85em;opacity:0.7;">(${getDisplayElo(attB)})</span></span>
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
