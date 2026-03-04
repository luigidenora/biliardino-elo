import type { IConfirmation } from './confirmation.interface';
import type { IRunningMatchDTO } from './match.interface';
import type { IMessage } from './message.interface';

/**
 * Confirmation with fish name (as returned by the unified /api/lobby endpoint)
 */
export interface IConfirmationWithFish extends IConfirmation {
  fishName: string;
}

/**
 * Unified lobby state — single source of truth returned by GET /api/lobby.
 *
 * Merges the old /api/check-lobby and /api/lobby-state endpoints.
 */
export interface ILobbyState {
  /** Whether a lobby is currently active */
  exists: boolean;
  /** Seconds remaining before the lobby expires */
  ttl: number;
  /** Team composition (set when the broadcast includes a match) */
  match: IRunningMatchDTO | null;
  /** Number of confirmed players */
  count: number;
  /** Confirmed players with fish names */
  confirmations: IConfirmationWithFish[];
  /** Chat messages */
  messages: IMessage[];
  /** Number of chat messages */
  messageCount: number;
}

/**
 * Lobby event types pushed through the WebSocket
 */
export type LobbyEventType
  = | 'confirmation-add'
    | 'confirmation-remove'
    | 'message'
    | 'lobby-created'
    | 'lobby-expired';

/**
 * Events published via Upstash Pub/Sub on topic `lobby_events`
 */
export interface ILobbyEvent {
  type: LobbyEventType;
  playerId?: number;
  timestamp: number;
}
