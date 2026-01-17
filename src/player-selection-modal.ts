import type { IPlayer } from './models/player.interface';
import { getAllPlayers } from './services/player.service';

export function showPlayerSelectionModal(onSelect: (playerId: number, playerName: string) => void): void {
  const existingModal = document.getElementById('player-selection-modal');
  if (existingModal) {
    existingModal.remove();
  }

  const modal = createModalElement();
  document.body.appendChild(modal);

  setupModalEventListeners(modal, onSelect);

  // Focus input after animation
  setTimeout(() => {
    const input = modal.querySelector<HTMLInputElement>('#player-search-input');
    input?.focus();
  }, 100);
}

function createModalElement(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.id = 'player-selection-modal';
  overlay.className = 'player-modal-overlay';

  const allPlayers = getAllPlayers().sort((a, b) => a.name.localeCompare(b.name));

  overlay.innerHTML = `
    <div class="player-modal">
      <div class="player-modal-header">
        <h2>🎮 Seleziona il tuo giocatore</h2>
        <p>Scegli il tuo nome per ricevere le notifiche delle partite</p>
      </div>
      
      <div class="player-search-container">
        <input 
          type="text" 
          id="player-search-input" 
          class="player-search-input" 
          placeholder="Cerca il tuo nome..." 
          autocomplete="off"
        />
        <div class="search-icon">🔍</div>
      </div>

      <div class="player-list-container">
        <div id="player-list" class="player-list">
          ${allPlayers.map(player => createPlayerItemHTML(player)).join('')}
        </div>
      </div>

      <div class="player-modal-footer">
        <button id="cancel-player-selection" class="btn-cancel">✕ Annulla</button>
        <button id="confirm-player-selection" class="btn-confirm" disabled>✓ Conferma</button>
      </div>
    </div>
  `;

  return overlay;
}

function createPlayerItemHTML(player: IPlayer): string {
  const defPercent = Math.round(player.defence * 100);
  const roleIcon = defPercent >= 50 ? '🛡️' : '⚔️';
  const roleLabel = defPercent >= 50 ? `DIF ${defPercent}%` : `ATT ${100 - defPercent}%`;

  return `
    <div class="player-item" data-player-id="${player.id}" data-player-name="${player.name.toLowerCase()}">
      <div class="player-item-content">
        <div class="player-avatar">
          <img 
            src="/biliardino-elo/avatars/${player.id}.webp" 
            alt="${player.name}"
            onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSIjZTBlMGUwIi8+PGNpcmNsZSBjeD0iMjQiIGN5PSIxNSIgcj0iNyIgZmlsbD0iIzc5N2FiMSIvPjxwYXRoIGQ9Ik0gMTAgMzAgQyAxMCAyNCAxNiAyMCAyNCAyMCBDIDMyIDIwIDM4IDI0IDM4IDMwIEMgMzggMzggMzIgNDIgMjQgNDIgQyAxNiA0MiAxMCAzOCAxMCAzMCIgZmlsbD0iIzc5N2FiMSIvPjwvc3ZnPg=='"
          />
        </div>
        <div class="player-info">
          <div class="player-name">${roleIcon} ${player.name}</div>
          <div class="player-stats">
            <span class="player-role">${roleLabel}</span>
            <span class="player-elo">ELO ${player.elo}</span>
            <span class="player-matches">${player.matches} partite</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function setupModalEventListeners(modal: HTMLElement, onSelect: (playerId: number, playerName: string) => void): void {
  const searchInput = modal.querySelector<HTMLInputElement>('#player-search-input');
  const playerList = modal.querySelector<HTMLElement>('#player-list');
  const cancelBtn = modal.querySelector<HTMLButtonElement>('#cancel-player-selection');
  const confirmBtn = modal.querySelector<HTMLButtonElement>('#confirm-player-selection');

  let selectedPlayerId: number | null = null;
  let selectedPlayerName: string | null = null;

  // Search/filter
  searchInput?.addEventListener('input', (e) => {
    const query = (e.target as HTMLInputElement).value.toLowerCase().trim();
    const items = playerList?.querySelectorAll<HTMLElement>('.player-item');

    items?.forEach((item: HTMLElement): void => {
      const playerName = item.dataset.playerName || '';
      if (playerName.includes(query)) {
        item.style.display = '';
      } else {
        item.style.display = 'none';
      }
    });
  });

  // Player selection
  playerList?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const playerItem = target.closest<HTMLElement>('.player-item');

    if (playerItem) {
      const playerId = Number(playerItem.dataset.playerId);
      const playerNameFull = getAllPlayers().find(p => p.id === playerId)?.name || '';

      // Remove previous selection
      playerList.querySelectorAll('.player-item').forEach((item) => {
        item.classList.remove('selected');
      });

      // Add selection to clicked item
      playerItem.classList.add('selected');

      // Update selected player
      selectedPlayerId = playerId;
      selectedPlayerName = playerNameFull;

      // Enable confirm button
      if (confirmBtn) {
        confirmBtn.disabled = false;
      }
    }
  });

  // Confirm selection
  confirmBtn?.addEventListener('click', () => {
    if (selectedPlayerId !== null && selectedPlayerName !== null) {
      onSelect(selectedPlayerId, selectedPlayerName);
      closeModal(modal);
    }
  });

  // Cancel
  cancelBtn?.addEventListener('click', () => {
    closeModal(modal);
  });

  // Close on overlay click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal(modal);
    }
  });

  // ESC key
  const handleEsc = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      closeModal(modal);
      document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);
}

function closeModal(modal: HTMLElement): void {
  modal.classList.add('closing');
  setTimeout(() => modal.remove(), 300);
}
