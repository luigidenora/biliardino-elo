import { LOBBY_ENV, supabase } from '@/utils/supabase.util';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface RemoteCursor {
  playerId: number;
  x: number;
  y: number;
}

type CursorListener = (cursors: RemoteCursor[]) => void;

// Stato di tutti i cursori remoti noti (aggiornato sui broadcast in arrivo)
const remoteCursorsMap = new Map<number, RemoteCursor>();

class CursorServiceImpl {
  private channel: RealtimeChannel | null = null;
  private listeners = new Set<CursorListener>();
  private myId: number | null = null;

  // Throttle: invia al massimo ogni N ms
  private lastSent = 0;
  private pendingMove: { x: number; y: number } | null = null;
  private throttleMs = 33; // ~30 fps
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;

  join(playerId: number): void {
    if (this.channel) return;
    this.myId = playerId;

    this.channel = supabase.channel(`cursors-${LOBBY_ENV}`);

    this.channel
      .on('broadcast', { event: 'cursor' }, ({ payload }) => {
        const { playerId: pid, x, y } = payload as RemoteCursor;
        if (pid === this.myId) return;

        if (x < 0) {
          remoteCursorsMap.delete(pid);
        } else {
          remoteCursorsMap.set(pid, { playerId: pid, x, y });
        }

        const cursors = Array.from(remoteCursorsMap.values());
        for (const cb of this.listeners) cb(cursors);
      })
      .subscribe();
  }

  move(x: number, y: number): void {
    const now = Date.now();
    const remaining = this.throttleMs - (now - this.lastSent);

    if (remaining <= 0) {
      this.flush(x, y);
    } else {
      this.pendingMove = { x, y };
      if (!this.throttleTimer) {
        this.throttleTimer = setTimeout(() => {
          this.throttleTimer = null;
          if (this.pendingMove) {
            this.flush(this.pendingMove.x, this.pendingMove.y);
            this.pendingMove = null;
          }
        }, remaining);
      }
    }
  }

  private flush(x: number, y: number): void {
    this.lastSent = Date.now();
    this.channel?.send({
      type: 'broadcast',
      event: 'cursor',
      payload: { playerId: this.myId, x, y }
    });
  }

  on(cb: CursorListener): void { this.listeners.add(cb); }
  off(cb: CursorListener): void { this.listeners.delete(cb); }

  leave(): void {
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
    if (this.myId !== null) {
      this.channel?.send({
        type: 'broadcast',
        event: 'cursor',
        payload: { playerId: this.myId, x: -1, y: -1 }
      });
    }
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
    remoteCursorsMap.clear();
    this.listeners.clear();
    this.myId = null;
  }
}

export const CursorService = new CursorServiceImpl();
