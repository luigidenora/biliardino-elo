import { IPlayer } from '@/models/player.interface';
import { getDisplayElo } from '@/utils/get-display-elo.util';
import { PlayerService } from '../services/player.service';

/**
 * Columns available for sorting in the ranking view.
 */
enum RankingSortColumn {
  Name = 'name',
  Elo = 'elo',
  Matches = 'matches'
}

/**
 * Renders and handles UI interactions for the ranking table.
 */
export class RankingView {
  /**
   * Currently selected column to sort by.
   */
  private static _sortCol: RankingSortColumn = RankingSortColumn.Elo;
  /**
   * Whether sorting is descending.
   */
  private static _sortDesc: boolean = true;

  /**
   * Initialize the ranking UI.
   *
   * Renders the initial table and attaches sorting handlers.
   */
  public static init(): void {
    RankingView.render();
    RankingView.attachSortHandlers();
  }

  /**
   * Attach click handlers to sortable table headers.
   *
   * Toggles ordering and triggers a re-render when clicked.
   */
  private static attachSortHandlers(): void {
    const headers = RankingView.getSortableHeaders();
    for (const th of headers) {
      th.addEventListener('click', () => {
        const col = th.dataset.sort as RankingSortColumn;
        if (col === RankingView._sortCol) {
          RankingView._sortDesc = !RankingView._sortDesc;
        } else {
          RankingView._sortCol = col;
          RankingView._sortDesc = true;
        }

        RankingView.render();
      });
    }
  }

  /**
   * Render the ranking view.
   *
   * Sorts the players, sets indicators, and populates table rows.
   */
  private static render(): void {
    const allPlayers = PlayerService.getAllPlayers();
    const playersWithMatches = allPlayers.filter(player => player.matches > 0);
    const players = RankingView.toSort(playersWithMatches);
    RankingView.renderSortIndicators();
    RankingView.renderrRows(players);
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
      // Same elo = same rank
      if (previousElo !== null && elo !== previousElo) {
        rank++;
      }

      const isFirst = rank === 1;
      const isLast = i === players.length - 1;
      const emoji = isFirst ? ' 🏆' : (isLast ? ' 💩' : '');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <tr>
        <td>${rank}${emoji}</td>
        <td><a href="./players.html?id=${player.id}">${player.name}</a></td>
        <td>${elo}</td>
        <td>${player.matches}</td>
        </tr>
      `;
      fragment.appendChild(tr);

      previousElo = elo;
    }

    tbody.innerHTML = '';
    tbody.appendChild(fragment);
  }

  /**
   * Adjust sorting indicator arrow (▲ or ▼) in headers.
   */
  private static renderSortIndicators(): void {
    const headers = RankingView.getSortableHeaders();

    for (const th of headers) {
      const indicator = th.querySelector<HTMLSpanElement>('.sort-indicator')!;

      if (th.dataset.sort === RankingView._sortCol) {
        indicator.textContent = RankingView._sortDesc ? '▼' : '▲';
      } else {
        indicator.textContent = '';
      }
    }
  }

  /**
   * Sort a list of players based on the active ranking column.
   *
   * Sorting handles both string and numeric fields.
   *
   * @param players - Array of players to sort.
   * @returns The sorted player array (new array, original preserved).
   */
  private static toSort(players: IPlayer[]): IPlayer[] {
    return players.toSorted((a, b) => {
      const valA = a[RankingView._sortCol];
      const valB = b[RankingView._sortCol];

      if (typeof valA === 'string' && typeof valB === 'string') {
        return RankingView._sortDesc
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      } else {
        const numA = valA as number;
        const numB = valB as number;
        return RankingView._sortDesc
          ? numB - numA
          : numA - numB;
      }
    });
  }

  private static getSortableHeaders(): HTMLTableCellElement[] {
    const table = RankingView.getTable();
    const sortHeaders = table.querySelectorAll<HTMLTableCellElement>('th[data-sort]');
    return Array.from(sortHeaders);
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
}
