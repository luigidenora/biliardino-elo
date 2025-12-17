import { IPlayer } from '@/models/player.interface';
import { getDisplayElo } from '@/utils/get-display-elo.util';
import { MatchService } from '../services/match.service';
import { PlayerService } from '../services/player.service';

/**
 * Renders and handles UI interactions for the ranking table.
 */
type SortKey = 'rank' | 'name' | 'elo' | 'matches' | 'winrate' | 'goaldiff' | 'form';

export class RankingView {
  private static sortKey: SortKey = 'elo';
  private static sortAsc: boolean = false;
  // Indici colonne: 0=#, 1=Nome, 2=Elo, 3=Ruolo, 4=Match, 5=V/S, 6=%Win, 7=Goal F/S, 8=Forma
  private static sortKeys: (SortKey | null)[] = [
    null, 'name', 'elo', null, 'matches', null, 'winrate', 'goaldiff', 'form'
  ];

  /**
   * Initialize the ranking UI.
   *
   * Renders the initial table.
   */
  public static init(): void {
    RankingView.render();
    RankingView.makeHeadersSortable();
  }

  /**
   * Render the ranking view.
   *
   * Sorts the players by Elo and populates table rows.
   */
  private static render(): void {
    const allPlayers = PlayerService.getAllPlayers();
    const playersWithMatches = allPlayers.filter(player => player.matches > 0);
    const players = [...playersWithMatches];

    // Sorting logic
    const { sortKey, sortAsc } = RankingView;
    players.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'rank':
          cmp = b.elo - a.elo;
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

    RankingView.renderrRows(players);
    RankingView.renderMatchStats();
    RankingView.renderRecentMatches();
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
      th.innerHTML = th.textContent!.replace(/[↑↓]/g, '').trim() + (arrows[idx] || '');
    });
  }

  /**
   * Render table rows, calculating visible rank.
   *
   * Players with the same Elo share the same rank number.
   *
   * @param players - Sorted list of players.
   */
  private static renderrRows(players: IPlayer[]): void {
    const table = RankingView.getTable();
    const tbody = table.querySelector('tbody')!;
    const fragment = document.createDocumentFragment();

    // Calcola il rank in base all'Elo decrescente, indipendentemente dall'ordinamento attivo
    const playersByElo = [...players].sort((a, b) => getDisplayElo(b) - getDisplayElo(a));
    const playerIdToRank = new Map<string, number>();
    let currentRank = 1;
    let prevElo: number | null = null;
    for (let i = 0; i < playersByElo.length; i++) {
      const p = playersByElo[i];
      const elo = getDisplayElo(p);
      if (prevElo !== null && elo === prevElo) {
        // stesso rank
      } else {
        currentRank = i + 1;
      }
      playerIdToRank.set(p.id, currentRank);
      prevElo = elo;
    }

    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      const rank = playerIdToRank.get(player.id) ?? (i + 1);

      // Conta quanti giocatori hanno lo stesso Elo (guardando avanti e indietro)
      const elo = getDisplayElo(player);
      let sameEloCount = 1;
      let rankStart = rank;
      // Conta quanti prima hanno lo stesso Elo (per trovare l'inizio del range)
      let backCount = 0;
      for (let j = i - 1; j >= 0; j--) {
        if (getDisplayElo(players[j]) === elo) {
          backCount++;
        } else {
          break;
        }
      }
      if (backCount > 0) {
        rankStart = rank;
        sameEloCount += backCount;
      }
      // Conta quanti dopo hanno lo stesso Elo
      for (let j = i + 1; j < players.length; j++) {
        if (getDisplayElo(players[j]) === elo) {
          sameEloCount++;
        } else {
          break;
        }
      }
      let rankDisplay = '';
      if (sameEloCount > 1) {
        rankDisplay = `${rankStart}-${rankStart + sameEloCount - 1}`;
      } else {
        rankDisplay = `${rank}`;
      }

      const isFirst = rank === 1;
      const isSecond = rank === 2;
      const isThird = rank === 3;

      // Usa dati precalcolati per il ruolo
      const attackCount = player.matchesAsAttacker || 0;
      const defenceCount = player.matchesAsDefender || 0;
      const attackPercentage = player.matches > 0 ? attackCount / player.matches : 0;
      const defencePercentage = player.matches > 0 ? defenceCount / player.matches : 0;

      let role = '';
      // Mostra sempre un solo ruolo - quello più frequente
      if (attackPercentage > defencePercentage) {
        role = `<span style="font-size:0.9em;color:#dc3545;">⚔️ ATT (${Math.round(attackPercentage * 100)}%)</span>`;
      } else {
        role = `<span style="font-size:0.9em;color:#0077cc;">🛡️ DIF (${Math.round(defencePercentage * 100)}%)</span>`;
      }

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
      const record = `${wins}V - ${losses}S`;

      // Usa dati precalcolati per rapporto goal fatti/subiti
      const goalsScored = player.goalsFor || 0;
      const goalsConceded = player.goalsAgainst || 0;
      const goalRatio = goalsConceded > 0 ? goalsScored / goalsConceded : (goalsScored > 0 ? Infinity : 0);
      let goalDiff = '-';
      if (goalRatio === Infinity) {
        goalDiff = '<span style="color:green;">∞</span>';
      } else if (goalRatio > 0) {
        const color = goalRatio < 0.8 ? 'red' : goalRatio > 1.2 ? 'green' : 'inherit';
        goalDiff = `<span style="color:${color};">${goalRatio.toFixed(2)}</span>`;
      }

      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';

      // Colora le prime 3 posizioni (podio)
      if (rank === 1) {
        tr.style.backgroundColor = 'rgba(255, 215, 0, 0.15)'; // oro leggero
      } else if (rank === 2) {
        tr.style.backgroundColor = 'rgba(192, 192, 192, 0.15)'; // argento leggero
      } else if (rank === 3) {
        tr.style.backgroundColor = 'rgba(205, 127, 50, 0.15)'; // bronzo leggero
      }

      if (rank === 3) {
        tr.classList.add('podium-last');
      }

      tr.addEventListener('click', () => {
        window.location.href = `./players.html?id=${player.id}`;
      });
      const playerNameDisplay = (isFirst || isSecond || isThird)
        ? `<span style="font-weight: 700;">${player.name}</span>`
        : player.name;

      const fallbackAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJncmFkIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgeDE9IjAlIiB5MT0iMCUiIHgyPSIwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNlMGUwZTA7c3RvcC1vcGFjaXR5OjEiIC8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdHlsZT0ic3RvcC1jb2xvcjojZjVmNWY1O3N0b3Atb3BhY2l0eToxIiAvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgZmlsbD0idXJsKCNncmFkKSIvPjxjaXJjbGUgY3g9IjI0IiBjeT0iMTUiIHI9IjciIGZpbGw9IiM3OTdhYjEiLz48cGF0aCBkPSJNIDEwIDMwIEMgMTAgMjQgMTYgMjAgMjQgMjAgQyAzMiAyMCAzOCAyNCAzOCAzMCBDIDM4IDM4IDMyIDQyIDI0IDQyIEMgMTYgNDIgMTAgMzggMTAgMzAiIGZpbGw9IiM3OTdhYjEiLz48L3N2Zz4=';
      const avatarHTML = `
        <div class="player-avatar">
          <img 
            src="/biliardino-elo/avatars/${player.id}.png" 
            alt="${player.name}"
            class="avatar-img"
            onerror="this.src='${fallbackAvatar}'"
          />
        </div>
      `;

      tr.innerHTML = `
        <td title="Posizione in classifica"><strong>${rankDisplay}°</strong></td>
        <td title="Nome giocatore"><div class="player-info">${avatarHTML}<span>${playerNameDisplay}</span></div></td>
        <td title="ELO rating attuale"><strong>${elo}</strong></td>
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
  }

  /**
   * Render match statistics dashboard.
   */
  private static renderMatchStats(): void {
    const allMatches = MatchService.getAllMatches();
    const totalMatches = allMatches.length;
    const allPlayers = PlayerService.getAllPlayers();

    // Calcola goal totali
    const totalGoals = allMatches.reduce((sum, match) => sum + match.score[0] + match.score[1], 0);

    // Trova il giocatore con il massimo ELO raggiunto
    let maxEloPlayer: IPlayer | null = null;
    let maxElo = 0;
    for (const player of allPlayers) {
      const bestElo = player.bestElo!;
      if (bestElo > maxElo) {
        maxElo = bestElo;
        maxEloPlayer = player;
      }
    }
    const maxEloText = maxEloPlayer ? `${maxEloPlayer.name}<br><span class="delta-badge primary">${Math.round(maxElo)}</span>` : '-';

    // Trova la migliore coppia (delta più alto)
    let bestPair = { player1: '', player2: '', delta: -Infinity };
    for (const player of allPlayers) {
      if (!player.teammatesDelta) continue;
      for (const [teammateId, delta] of player.teammatesDelta) {
        if (delta > bestPair.delta) {
          const teammate = PlayerService.getPlayerById(teammateId);
          if (teammate) {
            bestPair = { player1: player.name, player2: teammate.name, delta };
          }
        }
      }
    }
    const bestPairText = bestPair.delta !== -Infinity
      ? `${bestPair.player1}<br>${bestPair.player2}<br><span class="delta-badge positive">+${Math.round(bestPair.delta)}</span>`
      : '-';

    // Trova la peggior coppia (delta più basso)
    let worstPair = { player1: '', player2: '', delta: Infinity };
    for (const player of allPlayers) {
      if (!player.teammatesDelta) continue;
      for (const [teammateId, delta] of player.teammatesDelta) {
        if (delta < worstPair.delta) {
          const teammate = PlayerService.getPlayerById(teammateId);
          if (teammate) {
            worstPair = { player1: player.name, player2: teammate.name, delta };
          }
        }
      }
    }
    const worstPairText = worstPair.delta !== Infinity
      ? `${worstPair.player1}<br>${worstPair.player2}<br><span class="delta-badge negative">${Math.round(worstPair.delta)}</span>`
      : '-';

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
      <div class="stat-card card-gold">
        <div class="stat-icon"></div>
        <div class="stat-content">
          <div class="stat-label">Miglior Coppia</div>
          <div class="stat-value-group">
            ${bestPair.delta !== -Infinity
              ? `
              <div class="stat-pair-names">
                <div>${bestPair.player1}</div>
                <div class="pair-separator">+</div>
                <div>${bestPair.player2}</div>
              </div>
              <div class="delta-badge positive" style="margin-top: 0.5rem;">+${Math.round(bestPair.delta)}</div>
            `
              : '<div class="stat-empty">-</div>'}
          </div>
        </div>
      </div>
      <div class="stat-card card-danger">
        <div class="stat-icon">📉</div>
        <div class="stat-content">
          <div class="stat-label">Peggior Coppia</div>
          <div class="stat-value-group">
            ${worstPair.delta !== Infinity
              ? `
              <div class="stat-pair-names">
                <div>${worstPair.player1}</div>
                <div class="pair-separator">+</div>
                <div>${worstPair.player2}</div>
              </div>
              <div class="delta-badge negative" style="margin-top: 0.5rem;">${Math.round(worstPair.delta)}</div>
            `
              : '<div class="stat-empty">-</div>'}
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
    const allMatches = MatchService.getAllMatches();
    const matches = allMatches
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50);
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
      <caption style="caption-side:top;font-weight:700;font-size:1.2rem;margin-bottom:0.5rem;text-align:left;color:#2d3748;">Ultime 50 partite giocate</caption>
      <thead>
        <tr>
          <th style="width:16px;"></th>
          <th>Rating</th>
          <th>Elo Squadra A</th>
          <th>Team A</th>
          <th>Risultato</th>
          <th>Team B</th>
          <th>Elo Squadra B</th>
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
      const teamAAttack = PlayerService.getPlayerById(match.teamA.attack);
      const teamADefence = PlayerService.getPlayerById(match.teamA.defence);
      const teamBAttack = PlayerService.getPlayerById(match.teamB.attack);
      const teamBDefence = PlayerService.getPlayerById(match.teamB.defence);

      let teamA = `${teamADefence?.name || '?'} & ${teamAAttack?.name || '?'}`;
      let teamB = `${teamBDefence?.name || '?'} & ${teamBAttack?.name || '?'}`;

      // Determina la squadra vincitrice
      const teamAWon = match.score[0] > match.score[1];

      // Elo prima arrotondato
      let eloA = Math.round(match.teamELO![0]);
      let eloB = Math.round(match.teamELO![1]);

      // Delta arrotondato e formattato con colori
      let deltaA = Math.round(match.deltaELO![0]);
      let deltaB = Math.round(match.deltaELO![1]);

      // Percentuali di vittoria attesa (expA, expB)
      let expA = match.expectedScore![0];
      let expB = match.expectedScore![1];

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
      const colorA = expA_percent !== '?' ? (expA_percent > 50 ? 'green' : expA_percent < 50 ? 'red' : 'inherit') : 'inherit';
      const colorB = expB_percent !== '?' ? (expB_percent > 50 ? 'green' : expB_percent < 50 ? 'red' : 'inherit') : 'inherit';

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
      if (avgRating >= 1200) {
        rowBackgroundColor = 'background-color: rgba(0, 0, 255, 0.25);'; // blu leggero
      } else if (avgRating >= 1100) {
        rowBackgroundColor = 'background-color: rgba(0, 127, 255, 0.1);'; // azzurro chiaro
      } else if (avgRating <= 800) {
        rowBackgroundColor = 'background-color: rgba(255, 0, 0, 0.2);'; // rosso leggero
      } else if (avgRating <= 900) {
        rowBackgroundColor = 'background-color: rgba(255, 127, 0, 0.1);'; // arancione leggero
      }

      const tr = document.createElement('tr');
      // Pallino azzurro sfumato stile notifica se la partita è di oggi
      const blueDot = isToday
        ? `<span title="Partita di oggi" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:radial-gradient(circle at 40% 40%, #4fc3f7 70%, #1976d2 100%);box-shadow:0 0 4px #1976d2aa;vertical-align:middle;margin:0 2px;"></span>`
        : '';
      tr.innerHTML = `
        <td style="${rowBackgroundColor}text-align:center;">${blueDot}</td>
        <td style="${rowBackgroundColor}font-size:1.15em;font-style:italic;"><strong>${Math.round(avgRating)}</strong></td>
        <td style="${rowBackgroundColor}"><strong>${eloA}</strong> ${deltaA_formatted}</td>
        <td style="${rowBackgroundColor}">${teamA}</td>
        <td style="${rowBackgroundColor}">${resultWithPercentages}</td>
        <td style="${rowBackgroundColor}">${teamB}</td>
        <td style="${rowBackgroundColor}"><strong>${eloB}</strong> ${deltaB_formatted}</td>
      `;
      tbody.appendChild(tr);
    }

    wrapper.appendChild(table);
    container.appendChild(wrapper);
  }
}
