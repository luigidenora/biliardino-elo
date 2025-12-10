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

    const getPlayerName = (id: string) => {
      if (!id) return 'N/A';
      const p = PlayerService.getPlayerById(id);
      return p ? p.name : 'N/A';
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
            <span class="stat-label">Vittorie</span>
            <span class="stat-value positive">${stats.wins} <span class="percentage">(${winPercentage}%)</span></span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Vittorie Attacco</span>
            <span class="stat-value">${stats.winsAsAttack} <span class="percentage">(${winPercentageAttack}%)</span></span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Vittorie Difesa</span>
            <span class="stat-value">${stats.winsAsDefence} <span class="percentage">(${winPercentageDefence}%)</span></span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Sconfitte</span>
            <span class="stat-value negative">${stats.losses}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Sconfitte Attacco</span>
            <span class="stat-value">${stats.lossesAsAttack}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Sconfitte Difesa</span>
            <span class="stat-value">${stats.lossesAsDefence}</span>
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
            <span class="stat-value positive">${getPlayerName(stats.bestTeammate)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Peggior Compagno</span>
            <span class="stat-value negative">${getPlayerName(stats.worstTeammate)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Miglior Avversario</span>
            <span class="stat-value positive">${getPlayerName(stats.bestOpponent)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Peggior Avversario</span>
            <span class="stat-value negative">${getPlayerName(stats.worstOpponent)}</span>
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
