import { IPlayer } from '@/models/player.interface';
import { createPlayerDTO, getAllPlayers } from '@/services/player.service';
import { savePlayer } from '@/services/repository.service';

/**
 * Handles UI display and interaction for adding players.
 */
export class AddPlayerView {
  /**
   * Initialize the view: bind form events and render existing players.
   */
  public static init(): void {
    AddPlayerView.bindFormSubmit();
    AddPlayerView.renderAllPlayers();
  }

  /**
   * Bind submit handler on the "add player" form.
   */
  private static bindFormSubmit(): void {
    const form = AddPlayerView.getForm();
    form.addEventListener('submit', AddPlayerView.handleSubmit);
  }

  /**
   * Handle form submission: validate input, create a player, save it and update UI.
   *
   * @param event - The form submit event.
   */
  private static async handleSubmit(event: Event): Promise<void> {
    event.preventDefault();

    const messageEl = AddPlayerView.getMessageEl();
    messageEl.textContent = '';

    try {
      const nameInput = AddPlayerView.getNameInput();
      const eloSelect = AddPlayerView.getEloSelect();
      const defenceSelect = AddPlayerView.getDefenceSelect();

      const name = nameInput.value.trim();
      const elo = Number(eloSelect.value);
      const defence = Number(defenceSelect.value);

      if (!name) {
        throw new Error('Please enter a player name.');
      }

      if (!eloSelect.value) {
        throw new Error('Please select an ELO rating.');
      }

      if (!defenceSelect.value) {
        throw new Error('Please select a defence value.');
      }

      // Create new player in service
      const newPlayer = createPlayerDTO(name, elo, defence);

      // Save to database
      await savePlayer(newPlayer);

      messageEl.textContent = 'Player added successfully.';

      // Re-render table
      AddPlayerView.renderAllPlayers();

      // Reset form
      const form = event.target as HTMLFormElement;
      form.reset();
    } catch (error) {
      console.error(error);
      messageEl.textContent = error instanceof Error ? error.message : 'Failed to add player.';
    }
  }

  /**
   * Render all players from {@link PlayerService} into the "added-players" table.
   */
  private static renderAllPlayers(): void {
    const table = AddPlayerView.getAddedPlayersTable();
    const tbody = table.querySelector('tbody') ?? table.createTBody();
    tbody.innerHTML = '';

    const players = getAllPlayers();

    for (const player of players) {
      const row = AddPlayerView.createPlayerRow(player);
      tbody.appendChild(row);
    }
  }

  /**
   * Create a table row element for a given player.
   *
   * @param player - The player to render.
   * @returns The created `<tr>` element.
   */
  private static createPlayerRow(player: IPlayer): HTMLTableRowElement {
    const row = document.createElement('tr');
    row.dataset.playerId = player.id.toString();

    row.innerHTML = `
      <td>${player.name}</td>
      <td>${player.elo}</td>
      <td>${player.role * 100}</td>
    `;

    return row;
  }

  /**
   * Locate the "add player" form in the DOM.
   *
   * @returns The HTML form element.
   * @throws If the form element cannot be found.
   */
  private static getForm(): HTMLFormElement {
    const form = document.getElementById('add-player-form') as HTMLFormElement | null;
    if (!form) {
      throw new Error('Wrong add-player form id');
    }
    return form;
  }

  /**
   * Locate the player name input from the DOM.
   *
   * @returns The `<input>` element for player name.
   * @throws If the input element cannot be found.
   */
  private static getNameInput(): HTMLInputElement {
    const input = document.getElementById('player-name') as HTMLInputElement | null;
    if (!input) {
      throw new Error('Wrong player name input id');
    }
    return input;
  }

  /**
   * Locate the player ELO select from the DOM.
   *
   * @returns The `<select>` element for player ELO.
   * @throws If the select element cannot be found.
   */
  private static getEloSelect(): HTMLSelectElement {
    const select = document.getElementById('player-elo') as HTMLSelectElement | null;
    if (!select) {
      throw new Error('Wrong player ELO select id');
    }
    return select;
  }

  /**
   * Locate the player defence select from the DOM.
   *
   * @returns The `<select>` element for player defence.
   * @throws If the select element cannot be found.
   */
  private static getDefenceSelect(): HTMLSelectElement {
    const select = document.getElementById('player-defence') as HTMLSelectElement | null;
    if (!select) {
      throw new Error('Wrong player defence select id');
    }
    return select;
  }

  /**
   * Locate the message span used to display validation and success messages.
   *
   * @returns The `<span>` element for messages.
   * @throws If the message element cannot be found.
   */
  private static getMessageEl(): HTMLSpanElement {
    const messageEl = document.getElementById('message') as HTMLSpanElement | null;
    if (!messageEl) {
      throw new Error('Wrong message span id');
    }
    return messageEl;
  }

  /**
   * Locate the table used to display added players.
   *
   * @returns The HTML table element.
   * @throws If the table element cannot be found.
   */
  private static getAddedPlayersTable(): HTMLTableElement {
    const table = document.getElementById('added-players') as HTMLTableElement | null;
    if (!table) {
      throw new Error('Wrong added players table id');
    }
    return table;
  }
}
