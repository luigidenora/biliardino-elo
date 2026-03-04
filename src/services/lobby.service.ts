/**
 * LobbyService — Centralized lobby state management with real-time updates.
 *
 * Single source of truth for lobby data. Uses @upstash/realtime SSE client
 * for real-time updates and falls back to polling (60s) if SSE is unavailable.
 *
 * All consumers (LobbyPage, HeaderComponent, MatchmakingPage, MessageService)
 * read from this service instead of making direct API calls.
 */

import { API_BASE_URL } from '@/config/env.config';
import type { ILobbyState } from '@/models/lobby.interface';
import { appState } from '../app/state';
import { RealtimeClient, type RealtimeEventHandler } from './realtime-client';

type LobbyStateListener = (state: ILobbyState) => void;

// ── Constants ────────────────────────────────────────────────────

const FALLBACK_POLL_MS = 60_000;
const DEBOUNCE_MS = 500;

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

  // SSE client
  private sseClient: RealtimeClient | null = null;
  private sseEventHandler: RealtimeEventHandler | null = null;

  // Polling fallback
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  // Debounce
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Active consumers count (for lazy init/destroy)
  private consumerCount = 0;

  // ── Public API ─────────────────────────────────────────────

  /**
   * Initialize the service: fetch current state + connect SSE.
   * Safe to call multiple times (idempotent).
   */
  async init(): Promise<ILobbyState> {
    this.consumerCount++;

    if (!this.initialized) {
      this.initialized = true;
      await this.refresh();
      this.connectSse();
      this.startFallbackPoll();
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
      this.updateState(data);
      return this.state;
    } catch (err) {
      console.error('[LobbyService] Fetch error:', err);
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
   * When all consumers disconnect, cleanup resources.
   */
  release(): void {
    this.consumerCount = Math.max(0, this.consumerCount - 1);
    // Keep alive — header always needs lobby status.
    // Only full destroy() stops everything.
  }

  /**
   * Full teardown: close SSE, stop polling, clear state.
   */
  destroy(): void {
    this.stopFallbackPoll();
    this.disconnectSse();
    this.consumerCount = 0;
    this.initialized = false;
    this.listeners.clear();
    this.state = { ...EMPTY_STATE };
  }

  // ── State management ──────────────────────────────────────

  private updateState(data: ILobbyState): void {
    const wasActive = this.state.exists;
    this.state = data;

    // Sync to appState (single source of truth for header indicator etc.)
    appState.updateLobbyState(data);

    // Emit lobby-change if existence changed
    if (wasActive !== data.exists) {
      appState.emit('lobby-change');
    }

    // Notify all listeners
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

  // ── SSE (@upstash/realtime via RealtimeClient) ────────────

  private connectSse(): void {
    this.sseClient = new RealtimeClient({
      onStatusChange: (status) => {
        console.log('[LobbyService] SSE status:', status);
      }
    });

    this.sseEventHandler = (event: any) => {
      // Use typed event data for targeted updates when available
      if (event?.type && event?.data) {
        this.handleTypedEvent(event);
      } else {
        // Fallback to full refresh for untyped events
        this.debouncedRefresh();
      }
    };

    this.sseClient.onEvent(this.sseEventHandler);
    this.sseClient.connect();
    console.log('[LobbyService] SSE client connected');
  }

  /**
   * Handle typed SSE events with payload data for targeted updates.
   * Avoids full state refresh when possible.
   */
  private handleTypedEvent(event: { type: string; data: any }): void {
    switch (event.type) {
      case 'player-join':
      case 'player-leave':
        // Targeted update: increment/decrement count, update confirmations
        this.updateCountFromEvent(event.data);
        break;
      case 'match-update':
        // Targeted update: refresh match state only
        this.updateMatchFromEvent(event.data);
        break;
      case 'message':
        // Targeted update: add message, increment count
        this.updateMessageFromEvent(event.data);
        break;
      default:
        // Unknown event type: full refresh
        this.debouncedRefresh();
    }
  }

  /**
   * Update count and confirmations from player join/leave events.
   */
  private updateCountFromEvent(data: { playerId: string; timestamp: number }): void {
    if (!data?.playerId) {
      this.debouncedRefresh();
      return;
    }
    // Trigger debounced refresh to catch count changes atomically
    this.debouncedRefresh();
  }

  /**
   * Update match state from match-update events.
   */
  private updateMatchFromEvent(data: { timestamp: number }): void {
    if (!data?.timestamp) {
      this.debouncedRefresh();
      return;
    }
    // Trigger debounced refresh for match state consistency
    this.debouncedRefresh();
  }

  /**
   * Update messages from message events without full refresh.
   */
  private updateMessageFromEvent(data: { playerId: string; text: string; timestamp: number }): void {
    if (!data?.playerId || !data?.text) {
      this.debouncedRefresh();
      return;
    }
    // Add message to state and increment count
    if (data.text && this.state.messages) {
      this.state.messages.push({
        playerId: data.playerId,
        text: data.text,
        timestamp: data.timestamp || Date.now()
      } as any);
      this.state.messageCount = (this.state.messageCount || 0) + 1;
      this.notifyListeners();
    } else {
      this.debouncedRefresh();
    }
  }

  private disconnectSse(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.sseClient) {
      if (this.sseEventHandler) {
        this.sseClient.offEvent(this.sseEventHandler);
        this.sseEventHandler = null;
      }
      this.sseClient.disconnect();
      this.sseClient = null;
    }
  }

  // ── Debounced refresh ─────────────────────────────────────

  private debouncedRefresh(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.refresh();
    }, DEBOUNCE_MS);
  }

  // ── Fallback polling ──────────────────────────────────────

  private startFallbackPoll(): void {
    this.stopFallbackPoll();
    this.pollTimer = setInterval(() => {
      this.refresh();
    }, FALLBACK_POLL_MS);
  }

  private stopFallbackPoll(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}

/** Singleton instance */
export const LobbyService = new LobbyServiceImpl();
