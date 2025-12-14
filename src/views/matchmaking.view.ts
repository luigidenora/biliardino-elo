import { IPlayer } from '@/models/player.interface';
import { MatchService } from '@/services/match.service';
import { getDisplayElo } from '@/utils/get-display-elo.util';
import { updateElo } from '@/utils/update-elo.util';
import { IMatchProposal, MatchmakingService } from '../services/matchmaking.service';
import { PlayerService } from '../services/player.service';
import { RepositoryService } from '../services/repository.service';

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
    MatchmakingView.updateUI();
  }

  /**
   * Render the list of players with checkboxes (3-state: unchecked, checked, priority).
   */
  private static renderPlayersList(): void {
    const playersList = document.getElementById('players-list')!;
    const allPlayers = PlayerService.getAllPlayers();
    const sortedPlayers = allPlayers.sort((a, b) => a.name.localeCompare(b.name));

    const fragment = document.createDocumentFragment();

    sortedPlayers.forEach((player) => {
      MatchmakingView.playerStates.set(player.name, 0);

      const label = document.createElement('label');
      label.className = 'player-checkbox';
      label.dataset.playerName = player.name;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = player.name;
      checkbox.dataset.playerName = player.name;

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
    const allPlayers = PlayerService.getAllPlayers();
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
    const allPlayers = PlayerService.getAllPlayers();
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
    const shouldEnable = totalSelected >= 4 && MatchmakingView.currentMatch === null;
    generateButton.disabled = !shouldEnable;
  }

  /**
   * Generate balanced matches from selected players using MatchmakingService.
   */
  private static generateMatches(): void {
    // Get all selected players (both queue and priority)
    const selectedPlayerIds: string[] = [];
    const priorityPlayerIds: string[] = [];

    MatchmakingView.playerStates.forEach((state, playerName) => {
      const player = PlayerService.getPlayerByName(playerName);
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

    const match = MatchmakingService.findBestMatch(selectedPlayerIds, priorityPlayerIds);

    if (match) {
      // Auto-assegna i ruoli mettendo in difesa chi gioca più spesso in difesa
      const autoAssigned = MatchmakingView.assignPreferredRoles(match);
      MatchmakingView.currentMatch = autoAssigned;
      MatchmakingView.renderMatches([match]);
      MatchmakingView.updateUI();
    } else {
      alert('Impossibile generare partite con i giocatori selezionati.');
    }
  }

  /**
   * Ensure defenders are the players with higher defence percentage on each team.
   */
  private static assignPreferredRoles(match: IMatchProposal): IMatchProposal {
    const calcDefencePct = (p: IPlayer): number => {
      const matches = (p as any).matches || 0;
      const def = (p as any).matchesAsDefender || 0;
      // Percentuale difesa: def/matches; se nessuna partita, 0.
      return matches > 0 ? def / matches : 0;
    };

    // Calcola percentuali difesa per tutti i giocatori
    const teamA_p1_defPct = calcDefencePct(match.teamA.defence);
    const teamA_p2_defPct = calcDefencePct(match.teamA.attack);
    const teamB_p1_defPct = calcDefencePct(match.teamB.defence);
    const teamB_p2_defPct = calcDefencePct(match.teamB.attack);

    const adjusted: IMatchProposal = {
      ...match,
      teamA: { ...match.teamA },
      teamB: { ...match.teamB }
    };

    // Team A: metti in difesa il giocatore con percentuale difesa più alta
    if (teamA_p2_defPct > teamA_p1_defPct) {
      const tmp = adjusted.teamA.defence;
      adjusted.teamA.defence = adjusted.teamA.attack;
      adjusted.teamA.attack = tmp;
      MatchmakingView.rolesSwapped.teamA = true;
    } else {
      MatchmakingView.rolesSwapped.teamA = false;
    }

    // Team B: stessa logica
    if (teamB_p2_defPct > teamB_p1_defPct) {
      const tmp = adjusted.teamB.defence;
      adjusted.teamB.defence = adjusted.teamB.attack;
      adjusted.teamB.attack = tmp;
      MatchmakingView.rolesSwapped.teamB = true;
    } else {
      MatchmakingView.rolesSwapped.teamB = false;
    }

    return adjusted;
  }

  /**
   * Render the generated matches.
   */
  private static renderMatches(matches: IMatchProposal[]): void {
    const matchesContainer = document.getElementById('matches-container')!;
    matchesContainer.innerHTML = '';

    if (matches.length === 0) {
      matchesContainer.innerHTML = '<p class="no-matches">Nessuna partita generata.</p>';
      return;
    }

    const fragment = document.createDocumentFragment();

    // Aggiungi titolo
    const title = document.createElement('h2');
    title.textContent = 'Partita da Giocare';
    fragment.appendChild(title);

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
    const teamACard = MatchmakingView.createTeamCard('A', teamADefence, teamAAttack, avgEloTeamA, winProbA);
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
        if (value > 10) {
          target.value = '10';
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
    const teamBCard = MatchmakingView.createTeamCard('B', teamBDefence, teamBAttack, avgEloTeamB, winProbB);
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
   * Create a team card element.
   */
  private static createTeamCard(teamName: string, player1: IPlayer, player2: IPlayer, avgElo: number, winProb: number): HTMLElement {
    const teamCard = document.createElement('div');
    teamCard.className = 'team-card';
    teamCard.dataset.team = teamName;

    const calcPerc = (count: number | undefined, total: number | undefined): number => {
      const t = total || 0;
      const c = count || 0;
      return t > 0 ? Math.round((c / t) * 100) : 0;
    };

    const defPercP1 = calcPerc((player1 as any).matchesAsDefender, (player1 as any).matches);
    const attPercP2 = calcPerc((player2 as any).matchesAsAttacker, (player2 as any).matches);

    teamCard.innerHTML = `
      <div class="team-title">
        <span class="team-name">Team ${teamName}</span>
        <span class="team-elo-value">${avgElo.toFixed(0)}</span>
      </div>
      <div class="team-players">
        <div class="player-item">
          <span class="player-name">🛡️ ${player1.name} <span class="role-badge badge-def" title="Percentuale partite in difesa">DIF ${defPercP1}%</span></span>
          <span class="player-elo">${getDisplayElo(player1)}</span>
        </div>
        <div class="player-item">
          <span class="player-name">⚔️ ${player2.name} <span class="role-badge badge-att" title="Percentuale partite in attacco">ATT ${attPercP2}%</span></span>
          <span class="player-elo">${getDisplayElo(player2)}</span>
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
      <input type="number" name="scoreTeamA" min="0" max="10" required placeholder="0" class="score-input" />
      <span class="score-separator">-</span>
      <input type="number" name="scoreTeamB" min="0" max="10" required placeholder="0" class="score-input" />
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
    teamAInput.max = '10';
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
    teamBInput.max = '10';
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

    if (scoreTeamA < 0 || scoreTeamB < 0 || scoreTeamA > 10 || scoreTeamB > 10) {
      alert('I punteggi devono essere compresi tra 0 e 10.');
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
      const match = MatchService.addMatch(teamA, teamB, [scoreTeamA, scoreTeamB]);
      await RepositoryService.saveMatch(match);
      updateElo(match);

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
