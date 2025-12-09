import { IPlayer } from '@/models/player.interface';
import { MatchService } from '@/services/match.service';
import { StatsService } from '@/services/stats.service';
import { getDisplayElo } from '@/utils/get-display-elo.util';
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
   * Initialize the view by populating selections nd attaching event handlers.
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
      container.innerHTML = '';
      return;
    }

    const stats = StatsService.getPlayerStats(player.id, MatchService.getAllMatches());

    container.innerHTML = `
      <ul>
        <li><strong>Name:</strong> ${player.name}</li>
        <li><strong>Rank:</strong> ${PlayerService.getRank(player.id)}</li>
        <li><strong>ELO:</strong> ${getDisplayElo(player)}</li>
        <li><strong>Matches played:</strong> ${player.matches}</li>
      </ul>
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
