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

    console.log('Best victory by elo: ', stats?.bestVictoryByElo);
    console.log('Best victory by score: ', stats?.bestVictoryByScore);
    console.log('Worst victory by elo: ', stats?.worstDefeatByElo);
    console.log('Worst victory by score: ', stats?.worstDefeatByScore);

    container.innerHTML = `
      <ul>
        <li><strong>Best Elo:</strong> ${stats?.bestElo}</li>
        <li><strong>Best opponent:</strong> ${stats?.bestOpponent}</li>
        <li><strong>Best teammate:</strong> ${stats?.bestTeammate}</li>
        <li><strong>Best victory by elo:</strong> ${stats?.bestVictoryByElo}</li>
        <li><strong>Best victory by score:</strong> ${stats?.bestVictoryByScore}</li>
        <li><strong>Best win streak:</strong> ${stats?.bestWinStreak}</li>
        <li><strong>Elo:</strong> ${stats?.elo}</li>
        <li><strong>Losses:</strong> ${stats?.losses}</li>
        <li><strong>Losses as attack:</strong> ${stats?.lossesAsAttack}</li>
        <li><strong>Losses as defence:</strong> ${stats?.lossesAsDefence}</li>
        <li><strong>Matches:</strong> ${stats?.matches}</li>        
        <li><strong>Matches as attack:</strong> ${stats?.matchesAsAttack}</li>        
        <li><strong>Matches as defence:</strong> ${stats?.matchesAsDefence}</li>
        <li><strong>Total goals against:</strong> ${stats?.totalGoalsAgainst}</li>        
        <li><strong>Total goals for:</strong> ${stats?.totalGoalsFor}</li>        
        <li><strong>Wins:</strong> ${stats?.wins}</li>        
        <li><strong>Wins as attack:</strong> ${stats?.winsAsAttack}</li>        
        <li><strong>Wins as defence:</strong> ${stats?.winsAsDefence}</li>        
        <li><strong>Worst defeat by elo:</strong> ${stats?.worstDefeatByElo}</li>        
        <li><strong>Worst defeat by score:</strong> ${stats?.worstDefeatByScore}</li>        
        <li><strong>Worst elo:</strong> ${stats?.worstElo}</li>        
        <li><strong>Worst loss streak:</strong> ${stats?.worstLossStreak}</li>        
        <li><strong>Worst opponent:</strong> ${stats?.worstOpponent}</li>        
        <li><strong>Worst teammate:</strong> ${stats?.worstTeammate}</li>        
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
