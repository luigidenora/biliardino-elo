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
 * Lobby event types pushed through @upstash/realtime SSE.
 *
 * These match the Zod schema defined in `api/_realtime.ts`.
 * Dot notation is used by @upstash/realtime event names.
 */
export type LobbyEventType
  = | 'lobby.confirmation_add'
    | 'lobby.confirmation_remove'
    | 'lobby.message'
    | 'lobby.created'
    | 'lobby.expired';
