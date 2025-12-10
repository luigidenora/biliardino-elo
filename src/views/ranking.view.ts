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
      const isLast = i === players.length - 1;
      const emoji = isFirst ? ' 🏆' : (isLast ? ' 💩' : '');

      // Usa dati precalcolati per il ruolo
      const attackCount = player.matchesAsAttacker || 0;
      const defenceCount = player.matchesAsDefender || 0;
      const attackPercentage = player.matches > 0 ? attackCount / player.matches : 0;
      const defencePercentage = player.matches > 0 ? defenceCount / player.matches : 0;
      let role = '<span style="font-size:0.8em;color:#666;">DIF, ATT</span>';
      if (attackPercentage >= 0.67) role = '<span style="font-size:0.8em;color:#dc3545;">ATT</span>';
      else if (defencePercentage >= 0.67) role = '<span style="font-size:0.8em;color:#0077cc;">DIF</span>';

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
      tr.addEventListener('click', () => {
        window.location.href = `./players.html?id=${player.id}`;
      });
      tr.innerHTML = `
        <td><strong>${rankDisplay}° ${emoji}</strong></td>
        <td>${player.name}</td>
        <td><strong>${elo}</strong></td>
        <td>${role}</td>
        <td>${player.matches}</td>
        <td>${record}</td>
        <td>${winRate}%</td>
        <td>${goalDiff}</td>
        <td>${last5Results || '-'} ${last5Results ? eloGainedFormatted : ''}</td>
      `;
      fragment.appendChild(tr);

      previousElo = elo;
    }

    tbody.innerHTML = '';
    tbody.appendChild(fragment);
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
      .slice(0, 20);
    if (!matches.length) return;

    const container = document.querySelector('.tables-container');
    if (!container) return;

    // Remove old table if exists
    const oldTable = document.getElementById('recent-matches-table');
    if (oldTable) oldTable.remove();

    // Nuova tabella compatta
    const table = document.createElement('table');
    table.id = 'recent-matches-table';
    table.style.marginTop = '2.5rem';
    table.innerHTML = `
      <caption style="caption-side:top;font-weight:700;font-size:1.2rem;margin-bottom:0.5rem;text-align:left;color:#0077cc;">Ultime 20 partite giocate</caption>
      <thead>
        <tr>
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

      // Risultato con percentuali integrate
      const score = `${scoreA} - ${scoreB}`;
      const resultWithPercentages = `<span style="font-size:0.85em;color:${colorA};">(${expA_percent}%)</span> <strong>${score}</strong> <span style="font-size:0.85em;color:${colorB};">(${expB_percent}%)</span>`;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${eloA}</strong> ${deltaA_formatted}</td>
        <td>${teamA}</td>
        <td>${resultWithPercentages}</td>
        <td>${teamB}</td>
        <td><strong>${eloB}</strong> ${deltaB_formatted}</td>
      `;
      tbody.appendChild(tr);
    }

    container.appendChild(table);
  }
}
