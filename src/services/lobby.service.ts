/**
 * LobbyService — Centralized lobby state management with polling.
 *
 * - Polls /api/lobby at adaptive intervals: 10s when lobby is active, 30s when idle.
 * - Pauses polling when the tab is hidden (Page Visibility API), resumes on focus.
 * - Exponential backoff on consecutive network errors (capped at 60s).
 *
 * All consumers (LobbyPage, HeaderComponent, MatchmakingPage, MessageService)
 * read from this service instead of making direct API calls.
 */

import { API_BASE_URL } from '@/config/env.config';
import type { ILobbyState } from '@/models/lobby.interface';
import { appState } from '../app/state';

type LobbyStateListener = (state: ILobbyState) => void;

// ── Constants ────────────────────────────────────────────────────

const POLL_ACTIVE_MS = 10_000;   // lobby exists
const POLL_IDLE_MS   = 30_000;   // no active lobby
const MAX_BACKOFF_MS = 60_000;

// ── Default empty state ─────────────────────────────────────────

const EMPTY_STATE: ILobbyState = {
  exists: false,
  ttl: 0,
  match: null,
  count: 0,
  confirmations: [],
  messages: [],
  messageCount: 0
};

// ── Service ─────────────────────────────────────────────────────

class LobbyServiceImpl {
  private state: ILobbyState = { ...EMPTY_STATE };
  private listeners: Set<LobbyStateListener> = new Set();
  private initialized = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private consumerCount = 0;
  private consecutiveErrors = 0;

  // ── Public API ─────────────────────────────────────────────

  /**
   * Initialize the service: fetch current state + start polling.
   * Safe to call multiple times (idempotent).
   */
  async init(): Promise<ILobbyState> {
    this.consumerCount++;

    if (!this.initialized) {
      this.initialized = true;
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      await this.refresh();
      this.scheduleNextPoll();
    }

    return this.state;
  }

  /**
   * Fetch fresh state from the unified /api/lobby endpoint.
   */
  async refresh(): Promise<ILobbyState> {
    try {
      const res = await fetch(`${API_BASE_URL}/lobby`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ILobbyState = await res.json();
      this.consecutiveErrors = 0;
      this.updateState(data);
      return this.state;
    } catch (err) {
      console.error('[LobbyService] Fetch error:', err);
      this.consecutiveErrors++;
      return this.state;
    }
  }

  /**
   * Get current state without fetching.
   */
  getState(): ILobbyState {
    return this.state;
  }

  /**
   * Whether the service has been initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Register a callback for state changes.
   */
  onStateChange(cb: LobbyStateListener): void {
    this.listeners.add(cb);
  }

  /**
   * Unregister a state change callback.
   */
  offStateChange(cb: LobbyStateListener): void {
    this.listeners.delete(cb);
  }

  /**
   * Signal that a consumer is done (e.g. page destroyed).
   * Polling stays alive for header.
   */
  release(): void {
    this.consumerCount = Math.max(0, this.consumerCount - 1);
  }

  /**
   * Full teardown: stop polling, clear state.
   */
  destroy(): void {
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.stopPoll();
    this.consumerCount = 0;
    this.initialized = false;
    this.listeners.clear();
    this.state = { ...EMPTY_STATE };
    this.consecutiveErrors = 0;
  }

  // ── State management ──────────────────────────────────────

  private updateState(data: ILobbyState): void {
    const wasActive = this.state.exists;
    this.state = data;

    appState.updateLobbyState(data);

    if (wasActive !== data.exists) {
      appState.emit('lobby-change');
    }

    this.notifyListeners();
  }

  private notifyListeners(): void {
    for (const cb of this.listeners) {
      try {
        cb(this.state);
      } catch (err) {
        console.error('[LobbyService] Listener error:', err);
      }
    }
  }

  // ── Adaptive polling ──────────────────────────────────────

  private getNextInterval(): number {
    if (this.consecutiveErrors > 0) {
      return Math.min(POLL_ACTIVE_MS * Math.pow(2, this.consecutiveErrors - 1), MAX_BACKOFF_MS);
    }
    return this.state.exists ? POLL_ACTIVE_MS : POLL_IDLE_MS;
  }

  private scheduleNextPoll(): void {
    this.stopPoll();
    if (!this.initialized) return;
    this.pollTimer = setTimeout(async () => {
      this.pollTimer = null;
      await this.refresh();
      if (this.initialized && document.visibilityState !== 'hidden') {
        this.scheduleNextPoll();
      }
    }, this.getNextInterval());
  }

  private stopPoll(): void {
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  // ── Page Visibility ───────────────────────────────────────

  private handleVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') {
      this.stopPoll();
    } else {
      // Refresh immediately on tab focus — user wants fresh data
      this.refresh().then(() => this.scheduleNextPoll());
    }
  };
}

/** Singleton instance */
export const LobbyService = new LobbyServiceImpl();
