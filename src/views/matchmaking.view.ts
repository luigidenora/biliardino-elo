import { IRunningMatchDTO } from '@/models/match.interface';
import { IPlayer } from '@/models/player.interface';
import { getPlayerElo } from '@/services/elo.service';
import { addMatch } from '@/services/match.service';
import { clearRunningMatch, fetchRunningMatch, saveMatch, saveRunningMatch } from '@/services/repository.service';
import { availabilityList } from '@/utils/availability.util';
import { getDisplayElo } from '@/utils/get-display-elo.util';
import { findBestMatch, IMatchProposal } from '../services/matchmaking.service';
import { getAllPlayers, getPlayerById, getPlayerByName } from '../services/player.service';

/**
 * Player state: 0 = unchecked, 1 = checked (queue), 2 = priority
 */
type PlayerState = 0 | 1 | 2;

/**
 * Renders and handles UI interactions for the matchmaking page.
 */
export class MatchmakingView {
  private static readonly playerStates: Map<string, PlayerState> = new Map();
  private static currentMatch: IMatchProposal | null = null;

  /**
   * Initialize the matchmaking UI.
   */
  public static async init(): Promise<void> {
    MatchmakingView.renderPlayersList();
    MatchmakingView.setupEventListeners();
    MatchmakingView.renderDisclaimer();
    await MatchmakingView.restoreSavedMatch();
    MatchmakingView.updateUI();
  }

  /**
   * Rehydrate a previously generated match from Firestore if it exists.
   */
  private static async restoreSavedMatch(): Promise<void> {
    try {
      const storedMatch = await fetchRunningMatch();
      if (!storedMatch) return;

      const proposal = MatchmakingView.mapStoredMatchToProposal(storedMatch);
      if (!proposal) {
        await clearRunningMatch();
        return;
      }

      MatchmakingView.currentMatch = proposal;
      MatchmakingView.renderMatches([proposal]);
    } catch (error) {
      console.error('Failed to restore generated match', error);
    }
  }

  /**
   * Map a stored match DTO back to a match proposal with full player objects.
   */
  private static mapStoredMatchToProposal(storedMatch: IRunningMatchDTO): IMatchProposal | null {
    const defA = getPlayerById(storedMatch.teamA.defence);
    const attA = getPlayerById(storedMatch.teamA.attack);
    const defB = getPlayerById(storedMatch.teamB.defence);
    const attB = getPlayerById(storedMatch.teamB.attack);

    if (!defA || !attA || !defB || !attB) return null;

    return {
      teamA: { defence: defA, attack: attA },
      teamB: { defence: defB, attack: attB }
    };
  }

  /**
   * Render the list of players with checkboxes (3-state: unchecked, checked, priority).
   */
  private static renderPlayersList(): void {
    const playersList = document.getElementById('players-list')!;
    const allPlayers = getAllPlayers();
    const sortedPlayers = allPlayers.toSorted((a, b) => a.name.localeCompare(b.name));

    // Arrange players in column-major order only when the list is shown with multiple columns.
    const gridTemplate = getComputedStyle(playersList).getPropertyValue('grid-template-columns');
    const columnCount = gridTemplate.split(/\s+/).filter(Boolean).length;
    const playersToRender: IPlayer[] = [];

    if (columnCount > 1) {
      const columnHeight = Math.ceil(sortedPlayers.length / columnCount);
      for (let row = 0; row < columnHeight; row++) {
        for (let col = 0; col < columnCount; col++) {
          const idx = col * columnHeight + row;
          if (idx < sortedPlayers.length) {
            playersToRender.push(sortedPlayers[idx]);
          }
        }
      }
    } else {
      playersToRender.push(...sortedPlayers);
    }

    // Determine today's availability key
    const dayKeyMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
    const todayKey = dayKeyMap[new Date().getDay()];
    const todaysAvailable = (availabilityList as any)[todayKey] as string[] | undefined;

    const fragment = document.createDocumentFragment();

    playersToRender.forEach((player) => {
      // Default state
      let initialState: PlayerState = 0;
      const isAvailableToday = Array.isArray(todaysAvailable) && todaysAvailable.includes(player.name);
      if (isAvailableToday) {
        initialState = 1; // queue
      }
      MatchmakingView.playerStates.set(player.name, initialState);

      const label = document.createElement('label');
      label.className = 'player-checkbox';
      label.dataset.playerName = player.name;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = player.name;
      checkbox.dataset.playerName = player.name;
      if (initialState === 1) {
        checkbox.checked = true;
      }

      const playerInfo = document.createElement('span');
      playerInfo.className = 'player-info';

      const playerName = document.createElement('span');
      playerName.className = 'player-name';
      playerName.textContent = player.name;

      const playerElo = document.createElement('span');
      playerElo.className = 'player-elo';
      playerElo.textContent = `${getDisplayElo(player)}`;

      playerInfo.appendChild(playerName);
      playerInfo.appendChild(playerElo);

      label.appendChild(checkbox);
      label.appendChild(playerInfo);

      // Add click handler for 3-state cycling
      checkbox.addEventListener('click', (e) => {
        const currentState = MatchmakingView.playerStates.get(player.name) || 0;

        if (currentState === 0) {
          // unchecked -> checked (il checkbox diventa checked automaticamente)
          MatchmakingView.playerStates.set(player.name, 1);
          label.classList.remove('priority');
        } else if (currentState === 1) {
          // checked -> priority (manteniamo checked ma aggiungiamo stile priority)
          e.preventDefault(); // Preveniamo l'uncheck
          checkbox.checked = true;
          MatchmakingView.playerStates.set(player.name, 2);
          label.classList.add('priority');
        } else {
          // priority -> unchecked (permettiamo l'uncheck naturale)
          MatchmakingView.playerStates.set(player.name, 0);
          label.classList.remove('priority');
        }

        MatchmakingView.updateUI();
      });

      fragment.appendChild(label);
    });

    playersList.appendChild(fragment);
  }

  /**
   * Render the disclaimer that is always visible.
   */
  private static renderDisclaimer(): void {
    const matchesContainer = document.getElementById('matches-container')!;
    // Disclaimer classico
    const disclaimer = document.createElement('div');
    disclaimer.className = 'match-disclaimer-fixed';
    disclaimer.innerHTML = `
      <div class="disclaimer-icon">⚠️</div>
      <div class="disclaimer-content">
        <strong>Promemoria importante</strong>
        <p>Il biliardino non è scontato: solo in pausa e con rispetto, per evitare sanzioni.</p>
      </div>
    `;
    matchesContainer.insertBefore(disclaimer, matchesContainer.firstChild);

    // Pannello regolamento
    const rulesPanel = document.createElement('div');
    rulesPanel.className = 'match-rules-panel';
    rulesPanel.innerHTML = `
      <div class="rules-icon">📘</div>
      <div class="rules-content">
        <strong>Regolamento</strong>
        <ul>
          <li>Si vince a <b>8</b> (non ci sono supplementari)</li>
          <li>Si cambia campo dopo <b>7 goal totali</b></li>
          <li>Il goal è valido solo se ci sono stati almeno due tocchi <b>volontari</b> da stecche diverse</li>
          <li>Non valgono schizzo e rullata</li>
          <li>Se la palla non può essere colpita e non è tra difensore e portiere, si riparte da calcio d'inizio</li>
          <li>I ruoli devono essere rispettati e non posso essere cambiati.</li>
        </ul>
      </div>
    `;
    disclaimer.after(rulesPanel);
  }

  /**
   * Setup event listeners for user interactions.
   */
  private static setupEventListeners(): void {
    const selectAllButton = document.getElementById('select-all-btn');
    const deselectAllButton = document.getElementById('deselect-all-btn');
    const generateButton = document.getElementById('generate-match-btn');
    const deleteMatchButton = document.getElementById('delete-match-btn');
    const matchesContainer = document.getElementById('matches-container');

    if (!selectAllButton || !deselectAllButton || !generateButton || !matchesContainer || !deleteMatchButton) {
      console.error('Missing required DOM elements:', {
        selectAllButton: !!selectAllButton,
        deselectAllButton: !!deselectAllButton,
        generateButton: !!generateButton,
        deleteMatchButton: !!deleteMatchButton,
        matchesContainer: !!matchesContainer
      });
      return;
    }

    selectAllButton.addEventListener('click', () => MatchmakingView.selectAllPlayers());
    deselectAllButton.addEventListener('click', () => MatchmakingView.deselectAllPlayers());
    generateButton.addEventListener('click', () => MatchmakingView.generateMatches());
    deleteMatchButton.addEventListener('click', () => MatchmakingView.deleteGeneratedMatch());

    // Delegate event handling for dynamically created save match forms
    matchesContainer.addEventListener('submit', (e) => {
      if ((e.target as HTMLElement).classList.contains('match-form')) {
        e.preventDefault();
        MatchmakingView.saveMatch(e.target as HTMLFormElement);
      }
    });
  }

  /**
   * Select all players.
   */
  private static selectAllPlayers(): void {
    const allPlayers = getAllPlayers();
    const playersList = document.getElementById('players-list')!;

    allPlayers.forEach((player) => {
      MatchmakingView.playerStates.set(player.name, 1);
      const label = playersList.querySelector(
        `label[data-player-name="${player.name}"]`
      ) as HTMLLabelElement;
      const checkbox = label?.querySelector('input[type="checkbox"]') as HTMLInputElement;
      if (checkbox) {
        checkbox.checked = true;
        checkbox.indeterminate = false;
        label.classList.remove('priority');
      }
    });

    MatchmakingView.updateUI();
  }

  /**
   * Deselect all players.
   */
  private static deselectAllPlayers(): void {
    const allPlayers = getAllPlayers();
    const playersList = document.getElementById('players-list')!;

    allPlayers.forEach((player) => {
      MatchmakingView.playerStates.set(player.name, 0);
      const label = playersList.querySelector(
        `label[data-player-name="${player.name}"]`
      ) as HTMLLabelElement;
      const checkbox = label?.querySelector('input[type="checkbox"]') as HTMLInputElement;
      if (checkbox) {
        checkbox.checked = false;
        checkbox.indeterminate = false;
        label.classList.remove('priority');
      }
    });

    MatchmakingView.updateUI();
  }

  /**
   * Update the UI based on current state.
   */
  private static updateUI(): void {
    const queueCount = Array.from(MatchmakingView.playerStates.values()).filter(
      state => state === 1
    ).length;
    const priorityCount = Array.from(MatchmakingView.playerStates.values()).filter(
      state => state === 2
    ).length;
    const totalSelected = queueCount + priorityCount;

    const selectedCountElement = document.getElementById('selected-count');
    const generateButton = document.getElementById('generate-match-btn') as HTMLButtonElement;
    const deleteMatchButton = document.getElementById('delete-match-btn') as HTMLButtonElement | null;

    if (selectedCountElement) {
      selectedCountElement.textContent = `${totalSelected} selezionati`;
    }

    // Enable generate button only if at least 4 players are selected
    const shouldEnable = totalSelected >= 4;
    generateButton.disabled = !shouldEnable;

    if (deleteMatchButton) {
      deleteMatchButton.disabled = !MatchmakingView.currentMatch;
    }
  }

  private static async generateMatches(): Promise<void> {
    // Get all selected players (both queue and priority)
    const selectedPlayerIds: number[] = [];
    const priorityPlayerIds: number[] = [];

    MatchmakingView.playerStates.forEach((state, playerName) => {
      const player = getPlayerByName(playerName);
      if (!player) return;

      if (state === 1) {
        selectedPlayerIds.push(player.id);
      } else if (state === 2) {
        priorityPlayerIds.push(player.id);
        selectedPlayerIds.push(player.id);
      }
    });

    if (selectedPlayerIds.length < 4) {
      alert('Seleziona almeno 4 giocatori per generare una partita.');
      return;
    }

    const match = findBestMatch(selectedPlayerIds, priorityPlayerIds);

    if (!match) {
      alert('Impossibile generare partite con i giocatori selezionati.');
      return;
    }
    // Assegna ruoli standard
    MatchmakingView.currentMatch = match;
    MatchmakingView.renderMatches([match]);
    MatchmakingView.updateUI();
    await MatchmakingView.persistCurrentMatch();
  }
  /**
   * Persist the currently generated match so it can be resumed after refresh.
   */

  private static async persistCurrentMatch(): Promise<void> {
    if (!MatchmakingView.currentMatch) return;

    const match = MatchmakingView.currentMatch;
    const storedMatch: IRunningMatchDTO = {
      teamA: {
        defence: match.teamA.defence.id,
        attack: match.teamA.attack.id
      },
      teamB: {
        defence: match.teamB.defence.id,
        attack: match.teamB.attack.id
      }
    };

    try {
      await saveRunningMatch(storedMatch);
    } catch (error) {
      console.error('Failed to persist generated match', error);
    }
  }

  /**
   * Render the generated matches.
   */
  private static renderMatches(matches: IMatchProposal[]): void {
    const matchesContainer = document.getElementById('matches-container')!;
    // Mantieni disclaimer e regolamento sempre visibili
    const disclaimer = matchesContainer.querySelector('.match-disclaimer-fixed');
    const rulesPanel = matchesContainer.querySelector('.match-rules-panel');
    const actionsBar = matchesContainer.querySelector('.match-actions');
    const initialEmptyState = matchesContainer.querySelector('.empty-state');
    matchesContainer.innerHTML = '';
    if (disclaimer) matchesContainer.appendChild(disclaimer);
    if (rulesPanel) matchesContainer.appendChild(rulesPanel);
    if (actionsBar) matchesContainer.appendChild(actionsBar);

    if (matches.length === 0) {
      const emptyState = (initialEmptyState?.cloneNode(true) as HTMLElement)
        ?? Object.assign(document.createElement('p'), {
          className: 'empty-state',
          textContent: 'Seleziona almeno 4 giocatori e clicca su "Genera Partita"'
        });
      matchesContainer.appendChild(emptyState);
      return;
    }

    const fragment = document.createDocumentFragment();
    matches.forEach((match) => {
      const matchCard = MatchmakingView.createMatchCard(match);
      fragment.appendChild(matchCard);
    });
    matchesContainer.appendChild(fragment);
  }

  /**
   * Create a match card element for a single match proposal.
   */
  private static createMatchCard(match: IMatchProposal): HTMLElement {
    const matchContent = document.createElement('div');
    matchContent.className = 'match-content';

    const avgEloTeamA = (getPlayerElo(match.teamA.defence, true) + getPlayerElo(match.teamA.attack, false)) / 2;
    const avgEloTeamB = (getPlayerElo(match.teamB.defence, true) + getPlayerElo(match.teamB.attack, false)) / 2;

    // Teams container con VS e form al centro
    const teamsContainer = document.createElement('div');
    teamsContainer.className = 'teams-container';

    const winProbA = 1 / (1 + Math.pow(10, (avgEloTeamB - avgEloTeamA) / 400));
    const winProbB = 1 - winProbA;

    // Determina i giocatori (ruoli standard)
    const teamADefence = match.teamA.defence;
    const teamAAttack = match.teamA.attack;
    const teamBDefence = match.teamB.defence;
    const teamBAttack = match.teamB.attack;

    // Team A
    const teamACard = MatchmakingView.createTeamCard('A', teamADefence, 'defence', teamAAttack, 'attack', avgEloTeamA, winProbA);
    teamsContainer.appendChild(teamACard);

    // Centro con VS e form punteggio
    const centerSection = document.createElement('div');
    centerSection.className = 'center-section';

    const vsText = document.createElement('div');
    vsText.className = 'vs-text';
    vsText.textContent = 'VS';
    centerSection.appendChild(vsText);

    const scoreInputs = MatchmakingView.createScoreInputs();

    // Aggiungi validazione blur agli input
    const inputs = scoreInputs.querySelectorAll('.score-input');
    inputs.forEach((input) => {
      input.addEventListener('blur', (e) => {
        const target = e.target as HTMLInputElement;
        const value = Number.parseInt(target.value);
        if (value > 8) {
          target.value = '8';
        }
      });
    });

    centerSection.appendChild(scoreInputs);

    // Probabilità di vittoria sotto gli input
    const probabilitiesContainer = document.createElement('div');
    probabilitiesContainer.className = 'probabilities-container';
    const probAPercent = (winProbA * 100);
    const probBPercent = (winProbB * 100);
    const classA = probAPercent > 50 ? 'probability-high' : 'probability-low';
    const classB = probBPercent > 50 ? 'probability-high' : 'probability-low';
    probabilitiesContainer.innerHTML = `
      <div class="probability-item ${classA}">${probAPercent.toFixed(1)}%</div>
      <div class="probability-item ${classB}">${probBPercent.toFixed(1)}%</div>
    `;
    centerSection.appendChild(probabilitiesContainer);

    teamsContainer.appendChild(centerSection);

    // Team B
    const teamBCard = MatchmakingView.createTeamCard('B', teamBDefence, 'defence', teamBAttack, 'attack', avgEloTeamB, winProbB);
    teamsContainer.appendChild(teamBCard);

    matchContent.appendChild(teamsContainer);

    // Pulsante salva
    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.className = 'save-match-button';
    saveButton.textContent = 'Salva Partita';

    // Wrappa tutto in un form
    const form = document.createElement('form');
    form.className = 'match-form';
    form.appendChild(matchContent);
    form.appendChild(saveButton);

    return form;
  }

  /**
   * Create a team card element with specific roles for each player.
   */
  private static createTeamCard(teamName: string, player1: IPlayer, role1: 'defence' | 'attack', player2: IPlayer, role2: 'defence' | 'attack', avgElo: number, winProb: number): HTMLElement {
    const teamCard = document.createElement('div');
    teamCard.className = 'team-card';
    teamCard.dataset.team = teamName;

    // Usa la property defence per calcolare la percentuale del ruolo
    const defPercP1 = Math.round(player1.defence * 100);
    const attPercP1 = 100 - defPercP1;
    const defPercP2 = Math.round(player2.defence * 100);
    const attPercP2 = 100 - defPercP2;

    const fallbackAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJncmFkIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgeDE9IjAlIiB5MT0iMCUiIHgyPSIwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNlMGUwZTA7c3RvcC1vcGFjaXR5OjEiIC8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdHlsZT0ic3RvcC1jb2xvcjojZjVmNWY1O3N0b3Atb3BhY2l0eToxIiAvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgZmlsbD0idXJsKCNncmFkKSIvPjxjaXJjbGUgY3g9IjI0IiBjeT0iMTUiIHI9IjciIGZpbGw9IiM3OTdhYjEiLz48cGF0aCBkPSJNIDEwIDMwIEMgMTAgMjQgMTYgMjAgMjQgMjAgQyAzMiAyMCAzOCAyNCAzOCAzMCBDIDM4IDM4IDMyIDQyIDI0IDQyIEMgMTYgNDIgMTAgMzggMTAgMzAiIGZpbGw9IiM3OTdhYjEiLz48L3N2Zz4=';

    const roleIcon1 = role1 === 'defence' ? '🛡️' : '⚔️';
    const roleBadgeClass1 = role1 === 'defence' ? 'badge-def' : 'badge-att';
    const roleLabel1 = role1 === 'defence' ? `DIF ${defPercP1}%` : `ATT ${attPercP1}%`;

    const roleIcon2 = role2 === 'attack' ? '⚔️' : '🛡️';
    const roleBadgeClass2 = role2 === 'attack' ? 'badge-att' : 'badge-def';
    const roleLabel2 = role2 === 'attack' ? `ATT ${attPercP2}%` : `DIF ${defPercP2}%`;

    teamCard.innerHTML = `
      <div class="team-title">
        <span class="team-name">Team ${teamName}</span>
        <span class="team-elo-value">${avgElo.toFixed(0)}</span>
      </div>
      <div class="team-players">
        <div class="player-item">
          <div class="match-player-grid">
            <div class="match-player-avatar">
              <img 
                src="/biliardino-elo/avatars/${player1.id}.webp" 
                alt="${player1.name}"
                class="match-avatar-img"
                onerror="this.src='${fallbackAvatar}'"
              />
            </div>
            <div class="match-player-name"><span class="player-name">${roleIcon1} ${player1.name}</span></div>
            <div class="match-player-meta">
              <span class="role-badge ${roleBadgeClass1}" title="Percentuale partite nel ruolo assegnato">${roleLabel1}</span>
              <span class="player-elo">${Math.round(getPlayerElo(player1, role1 === 'defence'))} <span style="font-size:0.85em;opacity:0.7;">(${getDisplayElo(player1)})</span></span>
            </div>
          </div>
        </div>
        <div class="player-item">
          <div class="match-player-grid">
            <div class="match-player-avatar">
              <img 
                src="/biliardino-elo/avatars/${player2.id}.webp" 
                alt="${player2.name}"
                class="match-avatar-img"
                onerror="this.src='${fallbackAvatar}'"
              />
            </div>
            <div class="match-player-name"><span class="player-name">${roleIcon2} ${player2.name}</span></div>
            <div class="match-player-meta">
              <span class="role-badge ${roleBadgeClass2}" title="Percentuale partite nel ruolo assegnato">${roleLabel2}</span>
              <span class="player-elo">${Math.round(getPlayerElo(player2, role2 === 'defence'))} <span style="font-size:0.85em;opacity:0.7;">(${getDisplayElo(player2)})</span></span>
            </div>
          </div>
        </div>
      </div>
    `;

    return teamCard;
  }

  /**
   * Create score inputs section.
   */
  private static createScoreInputs(): HTMLElement {
    const scoresContainer = document.createElement('div');
    scoresContainer.className = 'scores-container';

    scoresContainer.innerHTML = `
      <input type="number" name="scoreTeamA" min="0" max="8" required placeholder="0" class="score-input" />
      <span class="score-separator">-</span>
      <input type="number" name="scoreTeamB" min="0" max="8" required placeholder="0" class="score-input" />
    `;

    return scoresContainer;
  }

  /**
   * Create a form to save the match with score input.
   */
  private static createSaveMatchForm(match: IMatchProposal): HTMLFormElement {
    const form = document.createElement('form');
    form.className = 'save-match-form-old';

    const formTitle = document.createElement('h4');
    formTitle.textContent = 'Inserisci il punteggio';
    form.appendChild(formTitle);

    const scoresContainer = document.createElement('div');
    scoresContainer.className = 'scores-container';

    // Team A score
    const teamAScoreGroup = document.createElement('div');
    teamAScoreGroup.className = 'score-group';

    const teamALabel = document.createElement('label');
    teamALabel.textContent = 'Punteggio Team A';
    teamALabel.htmlFor = 'score-team-a';

    const teamAInput = document.createElement('input');
    teamAInput.type = 'number';
    teamAInput.id = 'score-team-a';
    teamAInput.name = 'scoreTeamA';
    teamAInput.min = '0';
    teamAInput.max = '8';
    teamAInput.required = true;

    teamAScoreGroup.appendChild(teamALabel);
    teamAScoreGroup.appendChild(teamAInput);

    // Team B score
    const teamBScoreGroup = document.createElement('div');
    teamBScoreGroup.className = 'score-group';

    const teamBLabel = document.createElement('label');
    teamBLabel.textContent = 'Punteggio Team B';
    teamBLabel.htmlFor = 'score-team-b';

    const teamBInput = document.createElement('input');
    teamBInput.type = 'number';
    teamBInput.id = 'score-team-b';
    teamBInput.name = 'scoreTeamB';
    teamBInput.min = '0';
    teamBInput.max = '8';
    teamBInput.required = true;

    teamBScoreGroup.appendChild(teamBLabel);
    teamBScoreGroup.appendChild(teamBInput);

    scoresContainer.appendChild(teamAScoreGroup);
    scoresContainer.appendChild(teamBScoreGroup);

    form.appendChild(scoresContainer);

    // Submit button
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.textContent = 'Salva Partita';
    submitButton.className = 'save-match-button';

    form.appendChild(submitButton);

    return form;
  }

  /**
   * Delete the currently generated match and clear persisted state.
   */
  private static async deleteGeneratedMatch(): Promise<void> {
    MatchmakingView.currentMatch = null;
    MatchmakingView.renderMatches([]);
    MatchmakingView.updateUI();

    try {
      await clearRunningMatch();
    } catch (error) {
      console.error('Failed to delete generated match', error);
    }
  }

  /**
   * Save the match with the entered scores.
   */
  private static async saveMatch(form: HTMLFormElement): Promise<void> {
    if (!MatchmakingView.currentMatch) {
      alert('Nessuna partita da salvare.');
      return;
    }

    const formData = new FormData(form);
    const scoreTeamA = Number.parseInt(formData.get('scoreTeamA') as string, 10);
    const scoreTeamB = Number.parseInt(formData.get('scoreTeamB') as string, 10);

    if (Number.isNaN(scoreTeamA) || Number.isNaN(scoreTeamB)) {
      alert('Inserisci punteggi validi per entrambi i team.');
      return;
    }

    if (scoreTeamA < 0 || scoreTeamB < 0 || scoreTeamA > 8 || scoreTeamB > 8) {
      alert('I punteggi devono essere compresi tra 0 e 8.');
      return;
    }

    if (scoreTeamA === scoreTeamB) {
      alert('La partita non può finire in parità. Inserisci punteggi diversi.');
      return;
    }

    const match = MatchmakingView.currentMatch;

    // Usa i ruoli standard
    const teamADefence = match.teamA.defence;
    const teamAAttack = match.teamA.attack;
    const teamBDefence = match.teamB.defence;
    const teamBAttack = match.teamB.attack;

    const teamA = {
      defence: teamADefence.id,
      attack: teamAAttack.id
    };

    const teamB = {
      defence: teamBDefence.id,
      attack: teamBAttack.id
    };

    try {
      const matchDTO = addMatch(teamA, teamB, [scoreTeamA, scoreTeamB]);
      await saveMatch(matchDTO);
      try {
        await clearRunningMatch();
      } catch (clearError) {
        console.error('Errore durante la pulizia della partita generata:', clearError);
      }

      // Reset state
      MatchmakingView.currentMatch = null;
      MatchmakingView.renderMatches([]);
      MatchmakingView.updateUI();
    } catch (error) {
      console.error('Errore durante il salvataggio della partita:', error);
      alert('Errore durante il salvataggio della partita. Riprova.');
    }
  }
}
