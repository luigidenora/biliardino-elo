/**
 * Vanilla TS SSE client for @upstash/realtime.
 *
 * Replaces the raw WebSocket Pub/Sub client used previously. Connects to
 * the server's `/api/realtime` SSE endpoint — no token is exposed to the
 * browser.  Handles automatic reconnection with `last_ack_*` cursor
 * tracking so no events are lost across reconnects.
 *
 * @upstash/realtime protocol (text/event-stream):
 *   System events: {type:"connected"}, {type:"reconnect"}, {type:"ping"}, …
 *   User events:   {id, data, event, channel}
 */

import { API_BASE_URL } from '@/config/env.config';

// ── Types ───────────────────────────────────────────────────────

interface RealtimeUserEvent {
  id: string;
  data: unknown;
  event: string;
  channel: string;
}

interface RealtimeSystemEvent {
  type: 'connected' | 'reconnect' | 'ping' | 'error' | 'disconnected';
  channel?: string;
  channels?: string[];
  cursor?: string;
  timestamp?: number;
  error?: string;
}

type RealtimeMessage = RealtimeUserEvent | RealtimeSystemEvent;

export type RealtimeEventHandler = (event: RealtimeUserEvent) => void;

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface RealtimeClientOptions {
  /** Base URL for the API (e.g. "/api" or "https://...") */
  apiBaseUrl?: string;
  /** Path to the SSE endpoint (default: "/realtime") */
  path?: string;
  /** Maximum reconnection attempts before giving up. 0 = infinite. */
  maxReconnectAttempts?: number;
  /** Called whenever the connection status changes */
  onStatusChange?: (status: ConnectionStatus) => void;
}

// ── Constants ───────────────────────────────────────────────────

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

// ── Client ──────────────────────────────────────────────────────

export class RealtimeClient {
  private es: EventSource | null = null;
  private handlers = new Set<RealtimeEventHandler>();
  private status: ConnectionStatus = 'disconnected';
  private shouldReconnect = true;
  private reconnectDelay = RECONNECT_BASE_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;

  /** Per-channel last acknowledged stream ID for seamless resumption */
  private lastAcks = new Map<string, string>();

  private readonly apiBaseUrl: string;
  private readonly path: string;
  private readonly maxReconnectAttempts: number;
  private readonly onStatusChange?: (status: ConnectionStatus) => void;

  constructor(opts: RealtimeClientOptions = {}) {
    this.apiBaseUrl = opts.apiBaseUrl ?? API_BASE_URL;
    this.path = opts.path ?? '/realtime';
    this.maxReconnectAttempts = opts.maxReconnectAttempts ?? 0;
    this.onStatusChange = opts.onStatusChange;
  }

  // ── Public API ─────────────────────────────────────────────

  /** Start the SSE connection */
  connect(): void {
    if (this.es) return; // already connected or connecting

    this.shouldReconnect = true;
    this.setStatus('connecting');
    this.openEventSource();
  }

  /** Close the connection and stop reconnecting */
  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.closeEventSource();
    this.setStatus('disconnected');
  }

  /** Register a handler for user events */
  onEvent(handler: RealtimeEventHandler): void {
    this.handlers.add(handler);
  }

  /** Unregister a handler */
  offEvent(handler: RealtimeEventHandler): void {
    this.handlers.delete(handler);
  }

  /** Current connection status */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  // ── Internal ───────────────────────────────────────────────

  private buildUrl(): string {
    const base = `${this.apiBaseUrl}${this.path}`;
    const url = new URL(base, window.location.origin);

    // Append last_ack cursors for each known channel
    for (const [channel, ack] of this.lastAcks) {
      url.searchParams.set(`last_ack_${channel}`, ack);
    }

    return url.toString();
  }

  private openEventSource(): void {
    const url = this.buildUrl();
    console.log('[RealtimeClient] Connecting to', url);

    this.es = new EventSource(url);

    this.es.onopen = () => {
      this.reconnectDelay = RECONNECT_BASE_MS;
      this.reconnectAttempts = 0;
      // Status will become "connected" once we receive a "connected" system event
    };

    this.es.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data as string) as RealtimeMessage;
        this.handleMessage(parsed);
      } catch (e) {
        console.warn('[RealtimeClient] Parse error:', e);
      }
    };

    this.es.onerror = () => {
      // EventSource will try to reconnect by itself, but its built-in retry
      // doesn't carry our last_ack params.  Close and do it manually.
      this.closeEventSource();
      this.setStatus('error');

      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    };
  }

  private handleMessage(msg: RealtimeMessage): void {
    // System events have a `type` field at the top level
    if ('type' in msg) {
      const sys = msg as RealtimeSystemEvent;

      switch (sys.type) {
        case 'connected':
          this.setStatus('connected');
          console.log('[RealtimeClient] Connected to channel:', sys.channel);
          break;

        case 'reconnect':
          // Server requests us to reconnect (approaching maxDurationSecs)
          console.log('[RealtimeClient] Server requested reconnect');
          this.closeEventSource();
          // Use a minimum delay to avoid spinning in a tight loop in dev
          this.reconnectDelay = Math.max(RECONNECT_BASE_MS, this.reconnectDelay);
          this.scheduleReconnect();
          break;

        case 'ping':
          // Keepalive — no-op
          break;

        case 'error':
          console.warn('[RealtimeClient] Server error:', sys.error);
          break;

        case 'disconnected':
          console.log('[RealtimeClient] Server disconnected channels:', sys.channels);
          break;
      }

      return;
    }

    // User event — track cursor and dispatch
    const userEvent = msg as RealtimeUserEvent;
    if (userEvent.id && userEvent.channel) {
      this.lastAcks.set(userEvent.channel, userEvent.id);
    }

    for (const handler of this.handlers) {
      try {
        handler(userEvent);
      } catch (e) {
        console.error('[RealtimeClient] Handler error:', e);
      }
    }
  }

  private closeEventSource(): void {
    if (this.es) {
      this.es.onopen = null;
      this.es.onmessage = null;
      this.es.onerror = null;
      this.es.close();
      this.es = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    if (this.maxReconnectAttempts > 0 && this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[RealtimeClient] Max reconnect attempts reached, giving up');
      this.setStatus('error');
      return;
    }

    const delay = this.reconnectDelay;
    console.log(`[RealtimeClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts++;
      this.reconnectDelay = Math.min(RECONNECT_MAX_MS, this.reconnectDelay * 2 || RECONNECT_BASE_MS);
      this.setStatus('connecting');
      this.openEventSource();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.onStatusChange?.(status);
  }
}
