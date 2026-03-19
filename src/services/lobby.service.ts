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

const POLL_ACTIVE_MS = 10_000; // lobby exists
const POLL_IDLE_MS = 30_000; // no active lobby
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
  private activeFetchController: AbortController | null = null;
  private lifecycleVersion = 0;
  /** Guards against concurrent fetches — reuses the in-flight promise. */
  private fetchInFlight: Promise<ILobbyState> | null = null;

  // ── Public API ─────────────────────────────────────────────

  /**
   * Initialize the service: fetch current state + start polling.
   * Safe to call multiple times (idempotent).
   */
  async init(): Promise<ILobbyState> {
    if (!this.initialized) {
      this.initialized = true;
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      await this.refresh();
      this.scheduleNextPoll();
    }

    return this.state;
  }

  /**
   * Register a page-level consumer. When the last consumer releases,
   * the service fully tears down and stops polling.
   */
  async acquire(): Promise<ILobbyState> {
    this.consumerCount++;
    return this.init();
  }

  /**
   * Fetch fresh state from the unified /api/lobby endpoint.
   * Concurrent calls are deduplicated — the in-flight promise is reused.
   */
  async refresh(): Promise<ILobbyState> {
    if (this.fetchInFlight) return this.fetchInFlight;
    this.fetchInFlight = this.doFetch();
    try {
      return await this.fetchInFlight;
    } finally {
      this.fetchInFlight = null;
    }
  }

  /**
   * Force-refresh and reset the poll timer — use after user-triggered actions
   * (confirm, broadcast) so the next poll happens a full interval later.
   */
  async refreshNow(): Promise<ILobbyState> {
    const result = await this.refresh();
    // Reset the poll schedule so we don't double-fetch shortly after
    if (this.initialized && document.visibilityState !== 'hidden') {
      this.scheduleNextPoll();
    }
    return result;
  }

  private async doFetch(): Promise<ILobbyState> {
    const lifecycleVersion = this.lifecycleVersion;
    const controller = new AbortController();
    this.activeFetchController = controller;

    try {
      const res = await fetch(`${API_BASE_URL}/lobby`, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ILobbyState = await res.json();

      if (controller.signal.aborted || lifecycleVersion !== this.lifecycleVersion) {
        return this.state;
      }

      this.consecutiveErrors = 0;
      this.updateState(data);
      return this.state;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return this.state;
      }

      console.error('[LobbyService] Fetch error:', err);
      this.consecutiveErrors++;
      return this.state;
    } finally {
      if (this.activeFetchController === controller) {
        this.activeFetchController = null;
      }
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

    if (this.consumerCount === 0) {
      this.destroy();
    }
  }

  /**
   * Full teardown: stop polling, clear state.
   */
  destroy(): void {
    const hadLobbyState = this.state.exists || appState.lobbyExists;

    this.lifecycleVersion++;
    this.activeFetchController?.abort();
    this.activeFetchController = null;
    this.fetchInFlight = null;
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.stopPoll();
    this.consumerCount = 0;
    this.initialized = false;
    this.listeners.clear();
    this.state = { ...EMPTY_STATE };
    this.consecutiveErrors = 0;

    appState.resetLobbyState();
    if (hadLobbyState) {
      appState.emit('lobby-change');
    }
  }

  // ── State management ──────────────────────────────────────

  private updateState(data: ILobbyState): void {
    const prev = this.state;
    this.state = data;

    // Always sync appState (TTL, counts) — it's the global source of truth
    appState.updateLobbyState(data);

    // Emit lobby-change only when existence changes
    if (prev.exists !== data.exists) {
      appState.emit('lobby-change');
    }

    // Notify listeners only when meaningful state changed
    if (this.hasChanged(prev, data)) {
      this.notifyListeners();
    }
  }

  /** Compare fields that actually matter for UI — ignores TTL jitter. */
  private hasChanged(prev: ILobbyState, next: ILobbyState): boolean {
    if (prev.exists !== next.exists) return true;
    if (prev.count !== next.count) return true;
    if (prev.messageCount !== next.messageCount) return true;

    // Match composition changed
    const prevMatchKey = prev.match
      ? `${prev.match.teamA.defence}-${prev.match.teamA.attack}-${prev.match.teamB.defence}-${prev.match.teamB.attack}`
      : null;
    const nextMatchKey = next.match
      ? `${next.match.teamA.defence}-${next.match.teamA.attack}-${next.match.teamB.defence}-${next.match.teamB.attack}`
      : null;
    if (prevMatchKey !== nextMatchKey) return true;

    return false;
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
