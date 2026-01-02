import { IPlayer } from '@/models/player.interface';
import { addMatch } from '@/services/match.service';
import { saveMatch } from '@/services/repository.service';
import { availabilityList } from '@/utils/availability.util';
import { getDisplayElo } from '@/utils/get-display-elo.util';
import { findBestMatch, IMatchProposal } from '../services/matchmaking.service';
import { getAllPlayers, getPlayerByName } from '../services/player.service';

/**
 * Player state: 0 = unchecked, 1 = checked (queue), 2 = priority
 */
type PlayerState = 0 | 1 | 2;

/**
 * Renders and handles UI interactions for the matchmaking page.
 */
export class MatchmakingView {
  private static playerStates: Map<string, PlayerState> = new Map();
  private static currentMatch: IMatchProposal | null = null;
  private static rolesSwapped: { teamA: boolean; teamB: boolean } = { teamA: false, teamB: false };

  /**
   * Initialize the matchmaking UI.
   */
  public static init(): void {
    MatchmakingView.renderPlayersList();
    MatchmakingView.setupEventListeners();
    MatchmakingView.renderDisclaimer();
    MatchmakingView.updateUI();
  }

  /**
   * Render the list of players with checkboxes (3-state: unchecked, checked, priority).
   */
  private static renderPlayersList(): void {
    const playersList = document.getElementById('players-list')!;
    const allPlayers = getAllPlayers();
    const sortedPlayers = allPlayers.sort((a, b) => a.name.localeCompare(b.name));

    // Determine today's availability key
    const dayKeyMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
    const todayKey = dayKeyMap[new Date().getDay()];
    const todaysAvailable = (availabilityList as any)[todayKey] as string[] | undefined;

    const fragment = document.createDocumentFragment();

    sortedPlayers.forEach((player) => {
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
    disclaimer.insertAdjacentElement('afterend', rulesPanel);
  }

  /**
   * Setup event listeners for user interactions.
   */
  private static setupEventListeners(): void {
    const selectAllButton = document.getElementById('select-all-btn');
    const deselectAllButton = document.getElementById('deselect-all-btn');
    const generateButton = document.getElementById('generate-match-btn');
    const matchesContainer = document.getElementById('matches-container');

    if (!selectAllButton || !deselectAllButton || !generateButton || !matchesContainer) {
      console.error('Missing required DOM elements:', {
        selectAllButton: !!selectAllButton,
        deselectAllButton: !!deselectAllButton,
        generateButton: !!generateButton,
        matchesContainer: !!matchesContainer
      });
      return;
    }

    selectAllButton.addEventListener('click', () => MatchmakingView.selectAllPlayers());
    deselectAllButton.addEventListener('click', () => MatchmakingView.deselectAllPlayers());
    generateButton.addEventListener('click', () => MatchmakingView.generateMatches());

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

    if (selectedCountElement) {
      selectedCountElement.textContent = `${totalSelected} selezionati`;
    }

    // Enable generate button only if at least 4 players and no match exists
    const shouldEnable = totalSelected >= 4;
    generateButton.disabled = !shouldEnable;
  }

  private static generateMatches(): void {
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

    if (match) {
      // Auto-assegna i ruoli mettendo in difesa chi gioca più spesso in difesa
      const autoAssigned = MatchmakingView.assignPreferredRoles(match);
      MatchmakingView.currentMatch = autoAssigned;
      MatchmakingView.renderMatches([autoAssigned]);
      MatchmakingView.updateUI();
    } else {
      alert('Impossibile generare partite con i giocatori selezionati.');
    }
  }

  /**
   * Auto-assegna i ruoli usando la somma delle percentuali dei ruoli assegnati.
   * Calcola se invertire ma NON scambia i giocatori, solo setta il flag rolesSwapped.
   */
  private static assignPreferredRoles(match: IMatchProposal): IMatchProposal {
    const calcRolePct = (p: IPlayer, role: 'defence' | 'attack'): number => {
      const matches = (p as any).matches || 0;
      const count = role === 'defence'
        ? ((p as any).matchesAsDefender || 0)
        : ((p as any).matchesAsAttacker || 0);
      return matches > 0 ? (count / matches) * 100 : 0;
    };

    // Team A: confronta somma attuale vs somma con ruoli invertiti, scegli la maggiore
    const teamA_sum_current = calcRolePct(match.teamA.defence, 'defence') + calcRolePct(match.teamA.attack, 'attack');
    const teamA_sum_swapped = calcRolePct(match.teamA.attack, 'defence') + calcRolePct(match.teamA.defence, 'attack');
    if (teamA_sum_swapped > teamA_sum_current || (teamA_sum_swapped === teamA_sum_current && Math.random() < 0.5)) {
      MatchmakingView.rolesSwapped.teamA = true;
    } else {
      MatchmakingView.rolesSwapped.teamA = false;
    }

    // Team B: confronta somma attuale vs somma con ruoli invertiti, scegli la maggiore
    const teamB_sum_current = calcRolePct(match.teamB.defence, 'defence') + calcRolePct(match.teamB.attack, 'attack');
    const teamB_sum_swapped = calcRolePct(match.teamB.attack, 'defence') + calcRolePct(match.teamB.defence, 'attack');
    if (teamB_sum_swapped > teamB_sum_current || (teamB_sum_swapped === teamB_sum_current && Math.random() < 0.5)) {
      MatchmakingView.rolesSwapped.teamB = true;
    } else {
      MatchmakingView.rolesSwapped.teamB = false;
    }

    return match;
  }

  /**
   * Render the generated matches.
   */
  private static renderMatches(matches: IMatchProposal[]): void {
    const matchesContainer = document.getElementById('matches-container')!;
    // Mantieni disclaimer e regolamento sempre visibili
    const disclaimer = matchesContainer.querySelector('.match-disclaimer-fixed');
    const rulesPanel = matchesContainer.querySelector('.match-rules-panel');
    matchesContainer.innerHTML = '';
    if (disclaimer) matchesContainer.appendChild(disclaimer);
    if (rulesPanel) matchesContainer.appendChild(rulesPanel);

    if (matches.length === 0) {
      matchesContainer.innerHTML += '<p class="no-matches">Nessuna partita generata.</p>';
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

    const avgEloTeamA = (match.teamA.defence.elo + match.teamA.attack.elo) / 2;
    const avgEloTeamB = (match.teamB.defence.elo + match.teamB.attack.elo) / 2;
    const avgEloMatch = (avgEloTeamA + avgEloTeamB) / 2;

    // Teams container con VS e form al centro
    const teamsContainer = document.createElement('div');
    teamsContainer.className = 'teams-container';

    const winProbA = 1 / (1 + Math.pow(10, (avgEloTeamB - avgEloTeamA) / 400));
    const winProbB = 1 - winProbA;

    // Determina i giocatori in base allo switch
    const teamADefence = MatchmakingView.rolesSwapped.teamA ? match.teamA.attack : match.teamA.defence;
    const teamAAttack = MatchmakingView.rolesSwapped.teamA ? match.teamA.defence : match.teamA.attack;
    const teamBDefence = MatchmakingView.rolesSwapped.teamB ? match.teamB.attack : match.teamB.defence;
    const teamBAttack = MatchmakingView.rolesSwapped.teamB ? match.teamB.defence : match.teamB.attack;

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
        const value = parseInt(target.value);
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

    const calcPerc = (count: number | undefined, total: number | undefined): number => {
      const t = total || 0;
      const c = count || 0;
      return t > 0 ? Math.round((c / t) * 100) : 0;
    };

    const defPercP1 = role1 === 'defence' ? calcPerc((player1 as any).matchesAsDefender, (player1 as any).matches) : calcPerc((player1 as any).matchesAsAttacker, (player1 as any).matches);
    const attPercP2 = role2 === 'attack' ? calcPerc((player2 as any).matchesAsAttacker, (player2 as any).matches) : calcPerc((player2 as any).matchesAsDefender, (player2 as any).matches);

    const fallbackAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJncmFkIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgeDE9IjAlIiB5MT0iMCUiIHgyPSIwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNlMGUwZTA7c3RvcC1vcGFjaXR5OjEiIC8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdHlsZT0ic3RvcC1jb2xvcjojZjVmNWY1O3N0b3Atb3BhY2l0eToxIiAvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgZmlsbD0idXJsKCNncmFkKSIvPjxjaXJjbGUgY3g9IjI0IiBjeT0iMTUiIHI9IjciIGZpbGw9IiM3OTdhYjEiLz48cGF0aCBkPSJNIDEwIDMwIEMgMTAgMjQgMTYgMjAgMjQgMjAgQyAzMiAyMCAzOCAyNCAzOCAzMCBDIDM4IDM4IDMyIDQyIDI0IDQyIEMgMTYgNDIgMTAgMzggMTAgMzAiIGZpbGw9IiM3OTdhYjEiLz48L3N2Zz4=';

    const roleIcon1 = role1 === 'defence' ? '🛡️' : '⚔️';
    const roleBadgeClass1 = role1 === 'defence' ? 'badge-def' : 'badge-att';
    const roleLabel1 = role1 === 'defence' ? `DIF ${defPercP1}%` : `ATT ${defPercP1}%`;

    const roleIcon2 = role2 === 'attack' ? '⚔️' : '🛡️';
    const roleBadgeClass2 = role2 === 'attack' ? 'badge-att' : 'badge-def';
    const roleLabel2 = role2 === 'attack' ? `ATT ${attPercP2}%` : `DIF ${attPercP2}%`;

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
                src="/biliardino-elo/avatars/${player1.id}.png" 
                alt="${player1.name}"
                class="match-avatar-img"
                onerror="this.src='${fallbackAvatar}'"
              />
            </div>
            <div class="match-player-name"><span class="player-name">${roleIcon1} ${player1.name}</span></div>
            <div class="match-player-meta">
              <span class="role-badge ${roleBadgeClass1}" title="Percentuale partite nel ruolo assegnato">${roleLabel1}</span>
              <span class="player-elo">${getDisplayElo(player1)}</span>
            </div>
          </div>
        </div>
        <div class="player-item">
          <div class="match-player-grid">
            <div class="match-player-avatar">
              <img 
                src="/biliardino-elo/avatars/${player2.id}.png" 
                alt="${player2.name}"
                class="match-avatar-img"
                onerror="this.src='${fallbackAvatar}'"
              />
            </div>
            <div class="match-player-name"><span class="player-name">${roleIcon2} ${player2.name}</span></div>
            <div class="match-player-meta">
              <span class="role-badge ${roleBadgeClass2}" title="Percentuale partite nel ruolo assegnato">${roleLabel2}</span>
              <span class="player-elo">${getDisplayElo(player2)}</span>
            </div>
          </div>
        </div>
      </div>
      <button type="button" class="switch-roles-btn" data-team="${teamName}">🔄 Inverti Ruoli</button>
    `;

    // Aggiungi event listener per il bottone switch
    const switchBtn = teamCard.querySelector('.switch-roles-btn') as HTMLButtonElement;
    switchBtn.addEventListener('click', () => {
      MatchmakingView.switchTeamRoles(teamName);
    });

    return teamCard;
  }

  /**
   * Switch roles for a team.
   */
  private static switchTeamRoles(teamName: string): void {
    if (teamName === 'A') {
      MatchmakingView.rolesSwapped.teamA = !MatchmakingView.rolesSwapped.teamA;
    } else if (teamName === 'B') {
      MatchmakingView.rolesSwapped.teamB = !MatchmakingView.rolesSwapped.teamB;
    }

    // Re-render la partita
    if (MatchmakingView.currentMatch) {
      MatchmakingView.renderMatches([MatchmakingView.currentMatch]);
    }
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
   * Save the match with the entered scores.
   */
  private static async saveMatch(form: HTMLFormElement): Promise<void> {
    if (!MatchmakingView.currentMatch) {
      alert('Nessuna partita da salvare.');
      return;
    }

    const formData = new FormData(form);
    const scoreTeamA = parseInt(formData.get('scoreTeamA') as string, 10);
    const scoreTeamB = parseInt(formData.get('scoreTeamB') as string, 10);

    if (isNaN(scoreTeamA) || isNaN(scoreTeamB)) {
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

    // Usa i ruoli corretti (eventualmente switchati)
    const teamADefence = MatchmakingView.rolesSwapped.teamA ? match.teamA.attack : match.teamA.defence;
    const teamAAttack = MatchmakingView.rolesSwapped.teamA ? match.teamA.defence : match.teamA.attack;
    const teamBDefence = MatchmakingView.rolesSwapped.teamB ? match.teamB.attack : match.teamB.defence;
    const teamBAttack = MatchmakingView.rolesSwapped.teamB ? match.teamB.defence : match.teamB.attack;

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

      // Reset state
      MatchmakingView.currentMatch = null;
      MatchmakingView.rolesSwapped = { teamA: false, teamB: false };
      MatchmakingView.renderMatches([]);
      MatchmakingView.updateUI();
    } catch (error) {
      console.error('Errore durante il salvataggio della partita:', error);
      alert('Errore durante il salvataggio della partita. Riprova.');
    }
  }
}
