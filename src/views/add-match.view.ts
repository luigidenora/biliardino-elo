import { IMatch, IMatchDTO, ITeam } from '@/models/match.interface';
import { saveMatch } from '@/services/repository.service';
import { formatDate } from '@/utils/format-date.util';
import { addMatch, editMatch, getAllMatches } from '../services/match.service';
import { getAllPlayers, getPlayerById } from '../services/player.service';

/**
 * IDs of the `<select>` elements used for choosing players for teams.
 *
 * Order is important and must match the layout:
 * [teamA-defence, teamA-attack, teamB-defence, teamB-attack]
 */
const TEAM_SELECT_IDS = ['teamA-defence', 'teamA-attack', 'teamB-defence', 'teamB-attack'] as const;
/**
 * IDs of the `<input>` elements used for typing scores for each team.
 *
 * Order is important and must match the layout:
 * [scoreA, scoreB]
 */
const SCORE_INPUT_IDS = ['scoreA', 'scoreB'] as const;

/**
 * Handles UI display and interaction for adding and editing matches.
 */
export class AddMatchView {
  /**
   * Id of the match currently being edited, or `null` if creating a new one.
   */
  private static _editingMatchId: number | null = null;

  /**
   * Initialize the view: populate player selects, bind form events and render existing matches.
   */
  public static init(): void {
    AddMatchView.populateSelects();
    AddMatchView.bindFormSubmit();
    AddMatchView.renderAllMatches();
  }

  /**
   * Populate all team player selects with players from {@link PlayerService}.
   *
   * Existing options are cleared, and a placeholder option is added
   * before inserting all players.
   */
  private static populateSelects(): void {
    const players = getAllPlayers();
    // Sort players alphabetically by name
    const sortedPlayers = [...players].sort((a, b) => a.name.localeCompare(b.name));
    const selects = AddMatchView.getAllTeamSelects();

    for (const select of selects) {
      select.innerHTML = '<option value="">-- select player --</option>';

      for (const player of sortedPlayers) {
        const option = document.createElement('option');
        option.value = player.id.toString();
        option.textContent = player.name;
        select.appendChild(option);
      }
    }
  }

  /**
   * Bind submit handler on the "add match" form.
   */
  private static bindFormSubmit(): void {
    const form = AddMatchView.getForm();
    form.addEventListener('submit', AddMatchView.handleSubmit);
  }

  /**
   * Handle form submission: validate input, build or update a match, save it and update UI.
   *
   * @param event - The form submit event.
   */
  private static async handleSubmit(event: Event): Promise<void> {
    event.preventDefault();

    const messageEl = AddMatchView.getMessageEl();
    messageEl.textContent = '';

    try {
      const teamSelects = AddMatchView.getAllTeamSelects();

      const teamADef = Number.parseInt(teamSelects[0].value);
      const teamAAtt = Number.parseInt(teamSelects[1].value);
      const teamBDef = Number.parseInt(teamSelects[2].value);
      const teamBAtt = Number.parseInt(teamSelects[3].value);

      if (!teamADef || !teamAAtt || !teamBDef || !teamBAtt) {
        throw new Error('Please select all four players.');
      }

      const scoreInputs = AddMatchView.getScoreInputs();

      const scoreA = Number(scoreInputs[0].value);
      const scoreB = Number(scoreInputs[1].value);

      if (Number.isNaN(scoreA) || Number.isNaN(scoreB)) {
        throw new TypeError('Please enter valid numeric scores.');
      }

      // Prevent same player in multiple positions
      const ids = [teamADef, teamAAtt, teamBDef, teamBAtt];
      const uniqueIds = new Set(ids);
      if (uniqueIds.size !== ids.length) {
        throw new Error('The same player cannot be selected more than once in the match.');
      }

      const teamA: ITeam = {
        defence: teamADef,
        attack: teamAAtt
      };

      const teamB: ITeam = {
        defence: teamBDef,
        attack: teamBAtt
      };

      const editingId = AddMatchView._editingMatchId as unknown as number; // TODO
      let match: IMatchDTO;

      if (editingId) {
        // ✏️ EDIT EXISTING MATCH
        const match = editMatch(editingId, teamA, teamB, [scoreA, scoreB]);

        await saveMatch(match, true);

        messageEl.textContent = 'Match updated successfully.';
      } else {
        // ➕ CREATE NEW MATCH
        match = addMatch(teamA, teamB, [scoreA, scoreB]);
        await saveMatch(match);

        messageEl.textContent = 'Match saved successfully.';
      }

      // Reset editing state
      AddMatchView._editingMatchId = null;

      // Re-render table from MatchService state
      AddMatchView.renderAllMatches();

      // Reset form
      const form = event.target as HTMLFormElement;
      form.reset();
    } catch (error) {
      console.error(error);
      messageEl.textContent = error instanceof Error ? error.message : 'Failed to save match.';
    }
  }

  /**
   * Render all matches from {@link MatchService} into the "added-matches" table.
   *
   * Adds an "Edit" button for each row.
   */
  private static renderAllMatches(): void {
    const table = AddMatchView.getAddedMatchesTable();
    const tbody = table.querySelector('tbody') ?? table.createTBody();
    tbody.innerHTML = '';

    const matches = getAllMatches();

    for (const match of matches) {
      const row = AddMatchView.createMatchRow(match);
      tbody.appendChild(row);
    }
  }

  /**
   * Create a table row element for a given match, including an Edit button.
   *
   * @param match - The match to render.
   * @returns The created `<tr>` element.
   */
  private static createMatchRow(match: IMatch): HTMLTableRowElement {
    const row = document.createElement('tr');
    row.dataset.matchId = match.id.toString();

    const teamAP1 = getPlayerById(match.teamA.defence)!.name;
    const teamAP2 = getPlayerById(match.teamA.attack)!.name;

    const teamBP1 = getPlayerById(match.teamB.defence)!.name;
    const teamBP2 = getPlayerById(match.teamB.attack)!.name;

    row.innerHTML = `
      <td>${teamAP1} / ${teamAP2}</td>
      <td>${teamBP1} / ${teamBP2}</td>
      <td>${match.score[0]} - ${match.score[1]}</td>
      <td>${formatDate(match.createdAt)}</td>
      <td><button type="button" class="edit-match">Edit</button></td>
    `;

    const editButton = row.querySelector<HTMLButtonElement>('.edit-match');
    if (editButton) {
      editButton.addEventListener('click', () => AddMatchView.startEditing(match.id));
    }

    if (AddMatchView._editingMatchId === match.id) {
      row.classList.add('editing');
    }

    return row;
  }

  /**
   * Start editing a given match: populate the form with its data
   * and mark it as the current editing target.
   *
   * @param matchId - The id of the match to edit.
   */
  private static startEditing(matchId: number): void {
    const match = getAllMatches().find(m => m.id === matchId); // TODO ???
    if (!match) {
      console.error('Match to edit not found:', matchId);
      return;
    }

    AddMatchView._editingMatchId = matchId;

    const selects = AddMatchView.getAllTeamSelects();
    selects[0].value = match.teamA.defence.toString();
    selects[1].value = match.teamA.attack.toString();
    selects[2].value = match.teamB.defence.toString();
    selects[3].value = match.teamB.attack.toString();

    const [scoreA, scoreB] = match.score;
    const scoreInputs = AddMatchView.getScoreInputs();
    scoreInputs[0].value = String(scoreA);
    scoreInputs[1].value = String(scoreB);

    // Update visual state
    AddMatchView.renderAllMatches();

    const messageEl = AddMatchView.getMessageEl();
    messageEl.textContent = 'Editing existing match...';
  }

  /**
   * Locate the "add match" form in the DOM.
   *
   * @returns The HTML form element.
   * @throws If the form element cannot be found.
   */
  private static getForm(): HTMLFormElement {
    const form = document.getElementById('add-match-form') as HTMLFormElement | null;
    if (!form) {
      throw new Error('Wrong add-match form id');
    }
    return form;
  }

  /**
   * Resolve all team-related player selects from the DOM.
   *
   * @returns The list of `<select>` elements in the order:
   *          [teamA-defence, teamA-attack, teamB-defence, teamB-attack]
   * @throws If any of the expected select elements is not found.
   */
  private static getAllTeamSelects(): HTMLSelectElement[] {
    return TEAM_SELECT_IDS.map((id) => {
      const select = document.getElementById(id) as HTMLSelectElement | null;
      if (!select) {
        throw new Error(`Wrong team select id: ${id}`);
      }
      return select;
    });
  }

  /**
   * Resolve all score inputs from the DOM.
   *
   * @returns The list of `<input>` elements in the order:
   *          [scoreA, scoreB]
   * @throws If any of the expected input elements is not found.
   */
  private static getScoreInputs(): HTMLInputElement[] {
    return SCORE_INPUT_IDS.map((id) => {
      const input = document.getElementById(id) as HTMLInputElement | null;
      if (!input) {
        throw new Error(`Wrong score input id: ${id}`);
      }
      return input;
    });
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
   * Locate the table used to display newly added matches.
   *
   * @returns The HTML table element.
   * @throws If the table element cannot be found.
   */
  private static getAddedMatchesTable(): HTMLTableElement {
    const table = document.getElementById('added-matches') as HTMLTableElement | null;
    if (!table) {
      throw new Error('Wrong added matches table id');
    }
    return table;
  }
}
