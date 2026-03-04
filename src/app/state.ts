/**
 * Lightweight AppState singleton with event emitter.
 *
 * Holds cross-route reactive state (auth, data loading status, lobby).
 * Services remain the actual source of truth for data.
 */

import { isPlayerAdmin } from '@/config/admin.config';
import type { ILobbyState } from '@/models/lobby.interface';
import type { IRunningMatchDTO } from '@/models/match.interface';

type Listener = (...args: unknown[]) => void;

class AppState {
  private listeners = new Map<string, Set<Listener>>();

  // ── Auth ─────────────────────────────────────────────────
  currentPlayerId: number | null = null;
  currentPlayerName: string | null = null;
  isAdmin = false;
  isAuthenticated = false;

  // ── Data status ──────────────────────────────────────────
  playersLoaded = false;
  matchesLoaded = false;

  // ── Lobby (single source of truth — written by LobbyService) ──
  lobbyActive = false;
  lobbyExists = false;
  lobbyTtl = 0;
  lobbyMatch: IRunningMatchDTO | null = null;
  lobbyConfirmationsCount = 0;

  /**
   * Update lobby state from the unified API response.
   * Only LobbyService should call this.
   */
  updateLobbyState(state: ILobbyState): void {
    this.lobbyExists = state.exists;
    this.lobbyActive = state.exists;
    this.lobbyTtl = state.ttl;
    this.lobbyMatch = state.match;
    this.lobbyConfirmationsCount = state.count;
  }

  /**
   * Reset lobby state (e.g. after match save or cleanup).
   */
  resetLobbyState(): void {
    this.lobbyExists = false;
    this.lobbyActive = false;
    this.lobbyTtl = 0;
    this.lobbyMatch = null;
    this.lobbyConfirmationsCount = 0;
  }

  // ── Event emitter ────────────────────────────────────────

  on(event: string, cb: Listener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(cb);
  }

  off(event: string, cb: Listener): void {
    this.listeners.get(event)?.delete(cb);
  }

  emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach(cb => cb(...args));
  }

  /**
   * Hydrate auth state from localStorage (set by the notification system).
   */
  hydrateFromLocalStorage(): void {
    const playerId = localStorage.getItem('biliardino_player_id');
    const playerName = localStorage.getItem('biliardino_player_name');
    if (playerId) {
      this.currentPlayerId = Number(playerId);
      this.currentPlayerName = playerName;
      this.isAdmin = isPlayerAdmin(this.currentPlayerId);
    }
  }
}

export const appState = new AppState();
