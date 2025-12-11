import { IPlayer } from '@/models/player.interface';
import { getDisplayElo } from '@/utils/get-display-elo.util';
import { MatchService } from '../services/match.service';
import { PlayerService } from '../services/player.service';

/**
 * Renders and handles UI interactions for the ranking table.
 */
export class RankingView {
  /**
   * Initialize the ranking UI.
   *
   * Renders the initial table.
   */
  public static init(): void {
    RankingView.render();
  }

  /**
   * Render the ranking view.
   *
   * Sorts the players by Elo and populates table rows.
   */
  private static render(): void {
    const allPlayers = PlayerService.getAllPlayers();
    const playersWithMatches = allPlayers.filter(player => player.matches > 0);
    const players = playersWithMatches.sort((a, b) => b.elo - a.elo);
    RankingView.renderrRows(players);
    RankingView.renderMatchStats();
    RankingView.renderRecentMatches();
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

    let rank = 1;
    let previousElo: number | null = null;
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      const elo = getDisplayElo(player);

      // Aggiorna il rank solo quando l'Elo cambia
      if (i > 0 && previousElo !== null && elo !== previousElo) {
        rank = i + 1;
      }

      // Conta quanti giocatori hanno lo stesso Elo (guardando avanti e indietro)
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
      const isLast = i === players.length - 1;
      const emoji = isFirst ? ' 🏆' : (isSecond ? ' 🥈' : (isThird ? ' 🥉' : (isLast ? ' 💩' : '')));

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
      tr.innerHTML = `
        <td title="Posizione in classifica"><strong>${rankDisplay}° ${emoji}</strong></td>
        <td title="Nome giocatore">${player.name}</td>
        <td title="ELO rating attuale"><strong>${elo}</strong></td>
        <td title="Ruolo preferito e percentuale">${role}</td>
        <td title="Partite giocate">${player.matches}</td>
        <td title="Vittorie - Sconfitte">${record}</td>
        <td title="Percentuale di vittorie">${winRate}%</td>
        <td title="Rapporto goal fatti/subiti">${goalDiff}</td>
        <td title="Ultime 5 partite e variazione ELO">${last5Results || '-'} ${last5Results ? eloGainedFormatted : ''}</td>
      `;
      fragment.appendChild(tr);

      previousElo = elo;
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

    // Calcola goal totali
    const totalGoals = allMatches.reduce((sum, match) => sum + match.score[0] + match.score[1], 0);

    // Trova miglior partita (ELO medio più alto)
    let bestMatch = null;
    let bestAvgElo = 0;
    for (const match of allMatches) {
      const eloA = match.teamELO ? match.teamELO[0] : 0;
      const eloB = match.teamELO ? match.teamELO[1] : 0;
      const avgElo = (eloA + eloB) / 2;
      if (avgElo > bestAvgElo) {
        bestAvgElo = avgElo;
        bestMatch = match;
      }
    }

    // Trova peggior partita (ELO medio più basso)
    let worstMatch = null;
    let worstAvgElo = Infinity;
    for (const match of allMatches) {
      const eloA = match.teamELO ? match.teamELO[0] : 0;
      const eloB = match.teamELO ? match.teamELO[1] : 0;
      const avgElo = (eloA + eloB) / 2;
      if (avgElo < worstAvgElo) {
        worstAvgElo = avgElo;
        worstMatch = match;
      }
    }

    // Formatta miglior partita
    const bestMatchText = bestMatch ? Math.round(bestAvgElo).toString() : 'N/A';

    // Formatta peggior partita
    const worstMatchText = worstMatch ? Math.round(worstAvgElo).toString() : 'N/A';

    const statsContainer = document.createElement('div');
    statsContainer.className = 'match-stats-dashboard';
    statsContainer.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon">🎮</div>
        <div class="stat-content">
          <div class="stat-label">Partite Totali</div>
          <div class="stat-value">${totalMatches}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⚽</div>
        <div class="stat-content">
          <div class="stat-label">Goal Segnati</div>
          <div class="stat-value">${totalGoals}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⭐</div>
        <div class="stat-content">
          <div class="stat-label">Miglior Partita</div>
          <div class="stat-value">${bestMatchText}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📉</div>
        <div class="stat-content">
          <div class="stat-label">Peggior Partita</div>
          <div class="stat-value">${worstMatchText}</div>
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
    for (const match of matches) {
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

      // K Factor (normalizzato: diviso per 8 per portarlo in scala 1-2)
      let kFactorA = match.kFactor![0] / 8;
      let kFactorB = match.kFactor![1] / 8;

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
        [kFactorA, kFactorB] = [kFactorB, kFactorA];
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
      if (avgRating >= 1480) {
        rowBackgroundColor = 'background-color: rgba(0, 0, 255, 0.25);'; // blu leggero
      } else if (avgRating >= 1440) {
        rowBackgroundColor = 'background-color: rgba(0, 127, 255, 0.1);'; // azzurro chiaro
      } else if (avgRating <= 1320) {
        rowBackgroundColor = 'background-color: rgba(255, 0, 0, 0.2);'; // rosso leggero
      } else if (avgRating <= 1360) {
        rowBackgroundColor = 'background-color: rgba(255, 127, 0, 0.1);'; // arancione leggero
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="${rowBackgroundColor}font-size:1.15em;font-style:italic;"><strong>${Math.round(avgRating)}</strong></td>
        <td style="${rowBackgroundColor}"><strong>${eloA}</strong> ${deltaA_formatted} <span style="font-size:0.75em;color:#666;">(K: ${kFactorA.toFixed(2)})</span></td>
        <td style="${rowBackgroundColor}">${teamA}</td>
        <td style="${rowBackgroundColor}">${resultWithPercentages}</td>
        <td style="${rowBackgroundColor}">${teamB}</td>
        <td style="${rowBackgroundColor}"><strong>${eloB}</strong> ${deltaB_formatted} <span style="font-size:0.75em;color:#666;">(K: ${kFactorB.toFixed(2)})</span></td>
      `;
      tbody.appendChild(tr);
    }

    wrapper.appendChild(table);
    container.appendChild(wrapper);
  }
}
