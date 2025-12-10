import { IMatch } from '@/models/match.interface';
import { IPlayer } from '@/models/player.interface';
import { MatchService } from '@/services/match.service';
import { StatsService } from '@/services/stats.service';
import { PlayerService } from '../services/player.service';
import { formatDate } from '../utils/format-date.util';

/**
 * Handles UI display for player details.
 */
export class PlayersView {
  /**
   * Initialize the view by reading player from query string and rendering stats.
   */
  public static init(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const playerId = urlParams.get('id');

    if (!playerId) {
      PlayersView.renderError('Nessun giocatore specificato. Aggiungi ?id=PLAYER_ID all\'URL.');
      return;
    }

    const player = PlayerService.getPlayerById(playerId);
    if (!player) {
      PlayersView.renderError('Giocatore non trovato.');
      return;
    }

    PlayersView.renderPlayerStats(player);
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
   *
   * @param player - Player to display.
   */
  private static renderPlayerStats(player: IPlayer): void {
    const container = document.getElementById('player-stats');
    if (!container) {
      throw new Error('Player stats container not found');
    }

    // Update page title with player name
    const titleElement = document.getElementById('player-name');
    if (titleElement) {
      titleElement.textContent = `Statistiche di ${player.name}`;
    }

    const stats = StatsService.getPlayerStats(player.id, MatchService.getAllMatches());

    if (!stats) {
      container.innerHTML = '<div class="empty-state">Nessuna statistica disponibile</div>';
      return;
    }

    const winPercentage = stats.matches > 0 ? ((stats.wins / stats.matches) * 100).toFixed(1) : '0.0';
    const winPercentageAttack = stats.matchesAsAttack > 0 ? ((stats.winsAsAttack / stats.matchesAsAttack) * 100).toFixed(1) : '0.0';
    const winPercentageDefence = stats.matchesAsDefence > 0 ? ((stats.winsAsDefence / stats.matchesAsDefence) * 100).toFixed(1) : '0.0';

    const formatElo = (value: number): number | string => {
      if (!isFinite(value)) return 'N/A';
      return Math.round(value);
    };

    const formatPlayerResult = (result: { player: { name: string }; score: number } | null): string => {
      if (!result) return 'N/A';
      return `${result.player.name} (${result.score > 0 ? '+' : ''}${result.score.toFixed(0)})`;
    };

    const formatMatchResult = (result: { match: IMatch; delta: number } | null, playerId: string): { score: string; details: string } => {
      if (!result) return { score: 'N/A', details: '' };
      const m = result.match;
      const isTeamA = m.teamA.attack === playerId || m.teamA.defence === playerId;
      const score = isTeamA ? `${m.score[0]}-${m.score[1]}` : `${m.score[1]}-${m.score[0]}`;

      const myTeam = isTeamA ? m.teamA : m.teamB;
      const opponentTeam = isTeamA ? m.teamB : m.teamA;

      const teammate = PlayerService.getPlayerById(myTeam.attack === playerId ? myTeam.defence : myTeam.attack);
      const opp1 = PlayerService.getPlayerById(opponentTeam.attack);
      const opp2 = PlayerService.getPlayerById(opponentTeam.defence);

      const teammateName = teammate?.name || '?';
      const opponentsNames = `${opp1?.name || '?'} & ${opp2?.name || '?'}`;

      return {
        score,
        details: `<small>vs ${opponentsNames}</small><br><small>con ${teammateName} (${result.delta > 0 ? '+' : ''}${result.delta.toFixed(0)} ELO)</small>`
      };
    };

    const formatMatchByScore = (match: IMatch | null, playerId: string): { score: string; details: string } => {
      if (!match) return { score: 'N/A', details: '' };
      const isTeamA = match.teamA.attack === playerId || match.teamA.defence === playerId;
      const scoreFor = isTeamA ? match.score[0] : match.score[1];
      const scoreAgainst = isTeamA ? match.score[1] : match.score[0];
      const diff = scoreFor - scoreAgainst;

      const myTeam = isTeamA ? match.teamA : match.teamB;
      const opponentTeam = isTeamA ? match.teamB : match.teamA;

      const teammate = PlayerService.getPlayerById(myTeam.attack === playerId ? myTeam.defence : myTeam.attack);
      const opp1 = PlayerService.getPlayerById(opponentTeam.attack);
      const opp2 = PlayerService.getPlayerById(opponentTeam.defence);

      const teammateName = teammate?.name || '?';
      const opponentsNames = `${opp1?.name || '?'} & ${opp2?.name || '?'}`;

      return {
        score: `${scoreFor}-${scoreAgainst}`,
        details: `<small>vs ${opponentsNames}</small><br><small>con ${teammateName} (${diff > 0 ? '+' : ''}${diff})</small>`
      };
    };

    const formatMatchHistory = (matchResult: { match: IMatch; delta: number }): string => {
      const match = matchResult.match;
      const isTeamA = match.teamA.attack === player.id || match.teamA.defence === player.id;
      const myTeam = isTeamA ? match.teamA : match.teamB;
      const opponentTeam = isTeamA ? match.teamB : match.teamA;

      const teammate = PlayerService.getPlayerById(myTeam.attack === player.id ? myTeam.defence : myTeam.attack);
      const oppDefence = PlayerService.getPlayerById(opponentTeam.defence);
      const oppAttack = PlayerService.getPlayerById(opponentTeam.attack);

      const myScore = isTeamA ? match.score[0] : match.score[1];
      const oppScore = isTeamA ? match.score[1] : match.score[0];
      const isWin = myScore > oppScore;

      const myRole = myTeam.attack === player.id ? 'Attacco' : 'Difesa';
      const opponentsNames = `${oppDefence?.name || '?'} & ${oppAttack?.name || '?'}`;

      return `
        <tr class="${isWin ? 'match-win' : 'match-loss'}">
          <td>${formatDate(match.createdAt)}</td>
          <td><span class="match-result ${isWin ? 'win' : 'loss'}">${isWin ? 'V' : 'S'}</span></td>
          <td><strong>${myScore}-${oppScore}</strong></td>
          <td>${myRole}</td>
          <td>${teammate?.name || '?'}</td>
          <td>${opponentsNames}</td>
          <td><span class="${matchResult.delta > 0 ? 'positive' : 'negative'}">${matchResult.delta > 0 ? '+' : ''}${matchResult.delta.toFixed(0)}</span></td>
        </tr>
      `;
    };

    container.innerHTML = `
      <div class="player-card">
        <h2>📊 Generale</h2>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">ELO Attuale</span>
            <span class="stat-value highlight">${formatElo(stats.elo)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Miglior ELO</span>
            <span class="stat-value positive">${formatElo(stats.bestElo)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Peggior ELO</span>
            <span class="stat-value negative">${formatElo(stats.worstElo)}</span>
          </div>
        </div>
      </div>

      <div class="player-card">
        <h2>🎮 Partite</h2>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">Partite Totali</span>
            <span class="stat-value">${stats.matches}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Come Attaccante</span>
            <span class="stat-value">${stats.matchesAsAttack}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Come Difensore</span>
            <span class="stat-value">${stats.matchesAsDefence}</span>
          </div>
        </div>
      </div>

      <div class="player-card">
        <h2>🏆 Vittorie e Sconfitte</h2>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">Record</span>
            <span class="stat-value">${stats.wins}V - ${stats.losses}S <span class="percentage">(${winPercentage}%)</span></span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Record Attacco</span>
            <span class="stat-value">${stats.winsAsAttack}V - ${stats.lossesAsAttack}S <span class="percentage">(${winPercentageAttack}%)</span></span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Record Difesa</span>
            <span class="stat-value">${stats.winsAsDefence}V - ${stats.lossesAsDefence}S <span class="percentage">(${winPercentageDefence}%)</span></span>
          </div>
        </div>
      </div>

      <div class="player-card">
        <h2>🔥 Streak</h2>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">Migliore Striscia Vittorie</span>
            <span class="stat-value positive">${stats.bestWinStreak}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Peggiore Striscia Sconfitte</span>
            <span class="stat-value negative">${stats.worstLossStreak}</span>
          </div>
        </div>
      </div>

      <div class="player-card">
        <h2>⚽ Goal</h2>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">Goal Totali Fatti</span>
            <span class="stat-value positive">${stats.totalGoalsFor}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Goal Totali Subiti</span>
            <span class="stat-value negative">${stats.totalGoalsAgainst}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Rapporto Goal Fatti/Subiti</span>
            <span class="stat-value">${stats.totalGoalsAgainst === 0 ? '∞' : (stats.totalGoalsFor / stats.totalGoalsAgainst).toFixed(2)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Media Goal Fatti</span>
            <span class="stat-value">${(stats.totalGoalsFor / stats.matches).toFixed(2)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Media Goal Subiti</span>
            <span class="stat-value">${(stats.totalGoalsAgainst / stats.matches).toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div class="player-card">
        <h2>👥 Compagni e Avversari</h2>
        <div class="stats-grid">
            <div class="stat-item">
              <span class="stat-label">Compagno Frequente</span>
              <span class="stat-value">${stats.bestTeammateCount ? `${stats.bestTeammateCount.player.name} (${stats.bestTeammateCount.score})` : 'N/A'}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Miglior Compagno</span>
              <span class="stat-value positive">${formatPlayerResult(stats.bestTeammate)}</span>
            </div>
          <div class="stat-item">
            <span class="stat-label">Peggior Compagno</span>
            <span class="stat-value negative">${formatPlayerResult(stats.worstTeammate)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Avversario Più Forte</span>
            <span class="stat-value negative">${formatPlayerResult(stats.bestOpponent)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Avversario Più Scarso</span>
            <span class="stat-value positive">${formatPlayerResult(stats.worstOpponent)}</span>
          </div>
        </div>
      </div>

      <div class="player-card best-worst-card">
        <h2>🏅 Migliori e Peggiori Partite</h2>
        <div class="best-worst-grid">
          <div class="best-worst-item">
            <span class="stat-label">Migliore Vittoria (ELO)</span>
            <span class="stat-score positive">${(() => { const result = formatMatchResult(stats.bestVictoryByElo, player.id); return result.score === 'N/A' ? result.score : `<strong>${result.score}</strong>`; })()}</span>
            <span class="stat-details">${formatMatchResult(stats.bestVictoryByElo, player.id).details}</span>
          </div>
          <div class="best-worst-item">
            <span class="stat-label">Peggiore Sconfitta (ELO)</span>
            <span class="stat-score negative">${(() => { const result = formatMatchResult(stats.worstDefeatByElo, player.id); return result.score === 'N/A' ? result.score : `<strong>${result.score}</strong>`; })()}</span>
            <span class="stat-details">${formatMatchResult(stats.worstDefeatByElo, player.id).details}</span>
          </div>
          <div class="best-worst-item">
            <span class="stat-label">Migliore Vittoria (Punteggio)</span>
            <span class="stat-score positive">${(() => { const result = formatMatchByScore(stats.bestVictoryByScore, player.id); return result.score === 'N/A' ? result.score : `<strong>${result.score}</strong>`; })()}</span>
            <span class="stat-details">${formatMatchByScore(stats.bestVictoryByScore, player.id).details}</span>
          </div>
          <div class="best-worst-item">
            <span class="stat-label">Peggiore Sconfitta (Punteggio)</span>
            <span class="stat-score negative">${(() => { const result = formatMatchByScore(stats.worstDefeatByScore, player.id); return result.score === 'N/A' ? result.score : `<strong>${result.score}</strong>`; })()}</span>
            <span class="stat-details">${formatMatchByScore(stats.worstDefeatByScore, player.id).details}</span>
          </div>
        </div>
      </div>

      <div class="player-card history-card">
        <h2>📜 Storico Partite</h2>
        <div class="match-history">
          ${stats.history.length === 0
            ? '<p class="empty-state">Nessuna partita giocata</p>'
            : `
            <table class="match-history-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Esito</th>
                  <th>Punteggio</th>
                  <th>Ruolo</th>
                  <th>Compagno</th>
                  <th>Avversari</th>
                  <th>ELO</th>
                </tr>
              </thead>
              <tbody>
                ${stats.history.slice().reverse().map(formatMatchHistory).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>
    `;
  }
}
