/**
 * LobbyService — Centralized lobby state management with real-time updates.
 *
 * Single source of truth for lobby data. Uses Upstash WebSocket Pub/Sub
 * for real-time updates and falls back to polling (60s) if WS is unavailable.
 *
 * All consumers (LobbyPage, HeaderComponent, MatchmakingPage, MessageService)
 * read from this service instead of making direct API calls.
 */

import { API_BASE_URL, UPSTASH_PUBSUB_TOKEN, UPSTASH_PUBSUB_URL } from '@/config/env.config';
import type { ILobbyState } from '@/models/lobby.interface';
import { appState } from '../app/state';

type LobbyStateListener = (state: ILobbyState) => void;

// ── Constants ────────────────────────────────────────────────────

const FALLBACK_POLL_MS = 60_000;
const DEBOUNCE_MS = 500;
const WS_RECONNECT_BASE = 1000;
const WS_RECONNECT_MAX = 30_000;

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

  // WebSocket
  private ws: WebSocket | null = null;
  private shouldReconnect = true;
  private reconnectDelay = WS_RECONNECT_BASE;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private wsConnected = false;

  // Polling fallback
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  // Debounce
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Active consumers count (for lazy init/destroy)
  private consumerCount = 0;

  // ── Public API ─────────────────────────────────────────────

  /**
   * Initialize the service: fetch current state + connect WebSocket.
   * Safe to call multiple times (idempotent).
   */
  async init(): Promise<ILobbyState> {
    this.consumerCount++;

    if (!this.initialized) {
      this.initialized = true;
      await this.refresh();
      this.connectWs();
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
   * Full teardown: close WebSocket, stop polling, clear state.
   */
  destroy(): void {
    this.stopFallbackPoll();
    this.disconnectWs();
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

  // ── WebSocket (Upstash Pub/Sub) ───────────────────────────

  private connectWs(): void {
    if (!UPSTASH_PUBSUB_TOKEN) {
      console.warn('[LobbyService] VITE_UPSTASH_PUBSUB_TOKEN not configured — real-time disabled');
      return;
    }

    this.shouldReconnect = true;
    const wsUrl = `${UPSTASH_PUBSUB_URL}${UPSTASH_PUBSUB_URL.includes('?') ? '&' : '?'}token=${encodeURIComponent(UPSTASH_PUBSUB_TOKEN)}`;

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (e) {
      console.warn('[LobbyService] WebSocket init failed:', e);
      return;
    }

    this.ws.addEventListener('open', () => {
      this.reconnectDelay = WS_RECONNECT_BASE;
      this.wsConnected = true;
      try {
        // Subscribe to both topics for backward compatibility
        this.ws?.send(JSON.stringify({ type: 'subscribe', topic: 'lobby_events' }));
        this.ws?.send(JSON.stringify({ type: 'subscribe', topic: 'availability_events' }));
        console.log('[LobbyService] WebSocket connected, subscribed to lobby_events + availability_events');
      } catch (e) {
        console.warn('[LobbyService] Subscribe failed:', e);
      }
    });

    this.ws.addEventListener('message', (msg) => {
      try {
        const parsed = JSON.parse(msg.data as string);
        // Upstash format: { type: 'message', topic, data }
        let payload: any = null;
        if (parsed && typeof parsed === 'object' && parsed.data) {
          try {
            payload = JSON.parse(parsed.data);
          } catch {
            payload = parsed.data;
          }
        } else {
          payload = parsed;
        }

        if (payload) {
          // Debounced refresh on any lobby/availability event
          this.debouncedRefresh();
        }
      } catch (e) {
        console.warn('[LobbyService] Message parse error:', e);
      }
    });

    this.ws.addEventListener('error', (e) => {
      console.warn('[LobbyService] WebSocket error:', e);
    });

    this.ws.addEventListener('close', () => {
      console.log('[LobbyService] WebSocket closed');
      this.ws = null;
      this.wsConnected = false;
      if (this.shouldReconnect) this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    console.log(`[LobbyService] Reconnect in ${delay}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWs();
      this.reconnectDelay = Math.min(WS_RECONNECT_MAX, this.reconnectDelay * 2);
    }, delay);
  }

  private disconnectWs(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
    this.ws = null;
    this.wsConnected = false;
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
