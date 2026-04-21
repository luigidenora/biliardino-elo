/**
 * LobbyService — Gestione stato lobby con Supabase Realtime.
 *
 * Si abbona alle tabelle `lobbies`, `lobby_confirmations` e `lobby_messages`
 * via Supabase Realtime postgres_changes, e usa il canale broadcast per
 * consegna istantanea dei messaggi chat.
 */

import { API_BASE_URL } from '@/config/env.config';
import type { ILobbyState } from '@/models/lobby.interface';
import type { IMessage } from '@/models/message.interface';
import { LOBBY_ENV, supabase } from '@/utils/supabase.util';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { appState } from '../app/state';

type LobbyStateListener = (state: ILobbyState) => void;
type MessageListener = (msg: IMessage) => void;

const EMPTY_STATE: ILobbyState = {
  exists: false,
  ttl: 0,
  match: null,
  count: 0,
  confirmations: [],
  messages: [],
  messageCount: 0
};

class LobbyServiceImpl {
  private state: ILobbyState = { ...EMPTY_STATE };
  private listeners: Set<LobbyStateListener> = new Set();
  private chatListeners: Set<MessageListener> = new Set();
  private initialized = false;
  private consumerCount = 0;
  private channel: RealtimeChannel | null = null;
  private fetchInFlight: Promise<ILobbyState> | null = null;
  private fetchSucceeded = false;

  // ── Public API ─────────────────────────────────────────────

  async init(): Promise<ILobbyState> {
    if (!this.initialized) {
      this.initialized = true;
      await this.refresh();
      this.subscribeRealtime();
    }
    return this.state;
  }

  async acquire(): Promise<ILobbyState> {
    this.consumerCount++;
    return this.init();
  }

  async refresh(): Promise<ILobbyState> {
    if (this.fetchInFlight) return this.fetchInFlight;
    this.fetchInFlight = this.doFetch();
    try {
      return await this.fetchInFlight;
    } finally {
      this.fetchInFlight = null;
    }
  }

  async refreshNow(): Promise<ILobbyState> {
    return this.refresh();
  }

  getState(): ILobbyState {
    return this.state;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  hasFetchedFromServer(): boolean {
    return this.fetchSucceeded;
  }

  onStateChange(cb: LobbyStateListener): void {
    this.listeners.add(cb);
  }

  offStateChange(cb: LobbyStateListener): void {
    this.listeners.delete(cb);
  }

  onChatMessage(cb: MessageListener): void {
    this.chatListeners.add(cb);
  }

  offChatMessage(cb: MessageListener): void {
    this.chatListeners.delete(cb);
  }

  /** Invia un messaggio chat via broadcast Supabase (consegna istantanea). */
  async broadcastMessage(msg: IMessage): Promise<void> {
    await this.channel?.send({ type: 'broadcast', event: 'chat', payload: msg });
  }

  release(): void {
    this.consumerCount = Math.max(0, this.consumerCount - 1);
    if (this.consumerCount === 0) {
      this.destroy();
    }
  }

  destroy(): void {
    const hadLobbyState = this.state.exists || appState.lobbyExists;

    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.fetchInFlight = null;
    this.fetchSucceeded = false;
    this.consumerCount = 0;
    this.initialized = false;
    this.listeners.clear();
    this.chatListeners.clear();
    this.state = { ...EMPTY_STATE };

    appState.resetLobbyState();
    if (hadLobbyState) {
      appState.emit('lobby-change');
    }
  }

  // ── Internals ──────────────────────────────────────────────

  private async doFetch(): Promise<ILobbyState> {
    try {
      const res = await fetch(`${API_BASE_URL}/lobby`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ILobbyState = await res.json();
      this.fetchSucceeded = true;
      this.updateState(data);
      return this.state;
    } catch (err) {
      console.error('[LobbyService] Fetch error:', err);
      return this.state;
    }
  }

  private subscribeRealtime(): void {
    this.channel = supabase
      .channel(`lobby-${LOBBY_ENV}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lobbies', filter: `environment=eq.${LOBBY_ENV}` },
        () => { this.refresh(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lobby_confirmations' },
        () => { this.refresh(); }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lobby_messages' },
        () => { this.refresh(); }
      )
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        const msg = payload as IMessage;
        if (msg) {
          for (const cb of this.chatListeners) {
            try {
              cb(msg);
            } catch (_) { /* */ }
          }
        }
      })
      .subscribe((status) => {
        console.log(`[LobbyService] Realtime on ${LOBBY_ENV} status:`, status);
      });
  }

  private updateState(data: ILobbyState): void {
    const prev = this.state;
    this.state = data;

    appState.updateLobbyState(data);

    if (prev.exists !== data.exists) {
      appState.emit('lobby-change');
    }

    if (this.hasChanged(prev, data)) {
      this.notifyListeners();
    }
  }

  private hasChanged(prev: ILobbyState, next: ILobbyState): boolean {
    if (prev.exists !== next.exists) return true;
    if (prev.count !== next.count) return true;
    if (prev.messageCount !== next.messageCount) return true;
    const prevMatchKey = prev.match
      ? `${prev.match.teamA.defence}-${prev.match.teamA.attack}-${prev.match.teamB.defence}-${prev.match.teamB.attack}`
      : null;
    const nextMatchKey = next.match
      ? `${next.match.teamA.defence}-${next.match.teamA.attack}-${next.match.teamB.defence}-${next.match.teamB.attack}`
      : null;
    return prevMatchKey !== nextMatchKey;
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
}

export const LobbyService = new LobbyServiceImpl();
