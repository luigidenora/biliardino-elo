import { IMatch } from '@/models/match.interface';
import { IPlayer } from '@/models/player.interface';
import { MatchService } from '@/services/match.service';
import { StatsService } from '@/services/stats.service';
import { PlayerService } from '../services/player.service';

/**
 * Ids of the <select> elements used for choosing players.
 *
 * Each value must match an existing element id in the DOM.
 * Used by {@link PlayersView} to resolve the selects programmatically.
 */
const PLAYER_SELECT_IDS = ['player1', 'player2'] as const;

/**
 * Handles UI display for player details panels.
 */
export class PlayersView {
  /**
   * Initialize the view by populating selections and attaching event handlers.
   */
  public static init(): void {
    PlayersView.populateSelects();
    PlayersView.bindSelectEvents();
  }

  /**
   * Populate player selects with all players from {@link PlayerService}.
   */
  private static populateSelects(): void {
    const selects = PlayersView.getPlayerSelects();

    for (const player of PlayerService.getAllPlayers()) {
      for (const select of selects) {
        const option = document.createElement('option');
        option.value = player.id;
        option.textContent = player.name;
        select.appendChild(option);
      }
    }
  }

  /**
   * Attach change listeners to all player selects.
   *
   * When a selection changes, the stats view will update.
   */
  private static bindSelectEvents(): void {
    const selects = PlayersView.getPlayerSelects();

    for (const select of selects) {
      select.addEventListener('change', PlayersView.handleSelectionChange);
    }
  }

  /**
   * Handle selection change from a player select.
   *
   * Resolves the related stats container id and triggers rendering.
   *
   * @param event - The change event from the select element.
   */
  private static handleSelectionChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const containerId = `${target.id}-stats`;
    const playerId = target.value;

    PlayersView.renderPlayerStats(containerId, PlayerService.getPlayerById(playerId));
  }

  /**
   * Render player details into the specified container element.
   *
   * If no player is provided, the container is cleared.
   *
   * @param containerId - DOM id of the container to update.
   * @param player - Player to display, or `undefined`.
   */
  private static renderPlayerStats(containerId: string, player: IPlayer | undefined): void {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error('Wrong player container id');
    }

    if (!player) {
      container.innerHTML = '<div class="empty-state">Seleziona un giocatore per visualizzare le statistiche</div>';
      return;
    }

    const stats = StatsService.getPlayerStats(player.id, MatchService.getAllMatches());

    if (!stats) {
      container.innerHTML = '<div class="empty-state">Nessuna statistica disponibile</div>';
      return;
    }

    const winPercentage = stats.matches > 0 ? ((stats.wins / stats.matches) * 100).toFixed(1) : '0.0';
    const winPercentageAttack = stats.matchesAsAttack > 0 ? ((stats.winsAsAttack / stats.matchesAsAttack) * 100).toFixed(1) : '0.0';
    const winPercentageDefence = stats.matchesAsDefence > 0 ? ((stats.winsAsDefence / stats.matchesAsDefence) * 100).toFixed(1) : '0.0';

    const formatElo = (value: number) => {
      if (!isFinite(value)) return 'N/A';
      return Math.round(value);
    };

    const formatPlayerResult = (result: { player: { name: string }; score: number } | null) => {
      if (!result) return 'N/A';
      return `${result.player.name} (${result.score > 0 ? '+' : ''}${result.score.toFixed(0)})`;
    };

    const formatMatchResult = (result: { match: IMatch; delta: number } | null, playerId: string) => {
      if (!result) return 'N/A';
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

      return `<strong>${score}</strong><br><small>vs ${opponentsNames}</small><br><small>con ${teammateName} (${result.delta > 0 ? '+' : ''}${result.delta.toFixed(0)} ELO)</small>`;
    };

    const formatMatchByScore = (match: IMatch | null, playerId: string) => {
      if (!match) return 'N/A';
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

      return `<strong>${scoreFor}-${scoreAgainst}</strong><br><small>vs ${opponentsNames}</small><br><small>con ${teammateName} (${diff > 0 ? '+' : ''}${diff})</small>`;
    };

    container.innerHTML = `
      <div class="stats-section">
        <h3>📊 Generale</h3>
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

      <div class="stats-section">
        <h3>🎮 Partite</h3>
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

      <div class="stats-section">
        <h3>🏆 Vittorie e Sconfitte</h3>
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

      <div class="stats-section">
        <h3>🔥 Streak</h3>
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

      <div class="stats-section">
        <h3>⚽ Goal</h3>
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
            <span class="stat-label">Media Goal Fatti</span>
            <span class="stat-value">${(stats.totalGoalsFor / stats.matches).toFixed(2)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Media Goal Subiti</span>
            <span class="stat-value">${(stats.totalGoalsAgainst / stats.matches).toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div class="stats-section">
        <h3>👥 Compagni e Avversari</h3>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">Miglior Compagno</span>
            <span class="stat-value positive">${formatPlayerResult(stats.bestTeammate)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Peggior Compagno</span>
            <span class="stat-value negative">${formatPlayerResult(stats.worstTeammate)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Miglior Avversario</span>
            <span class="stat-value positive">${formatPlayerResult(stats.bestOpponent)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Peggior Avversario</span>
            <span class="stat-value negative">${formatPlayerResult(stats.worstOpponent)}</span>
          </div>
        </div>
      </div>

      <div class="stats-section">
        <h3>🏅 Migliori e Peggiori Partite</h3>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">Migliore Vittoria (ELO)</span>
            <span class="stat-value positive">${formatMatchResult(stats.bestVictoryByElo, player.id)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Peggiore Sconfitta (ELO)</span>
            <span class="stat-value negative">${formatMatchResult(stats.worstDefeatByElo, player.id)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Migliore Vittoria (Punteggio)</span>
            <span class="stat-value positive">${formatMatchByScore(stats.bestVictoryByScore, player.id)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Peggiore Sconfitta (Punteggio)</span>
            <span class="stat-value negative">${formatMatchByScore(stats.worstDefeatByScore, player.id)}</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Resolve all player selects from the DOM.
   *
   * @returns The list of `<select>` elements in the order:
   *          [player1, player2]
   * @throws If any of the expected select elements is not found.
   */
  private static getPlayerSelects(): HTMLSelectElement[] {
    return PLAYER_SELECT_IDS.map((id) => {
      const select = document.getElementById(id) as HTMLSelectElement | null;
      if (!select) {
        throw new Error(`Wrong player select id: ${id}`);
      }
      return select;
    });
  }
}
