/**
 * Shared @upstash/realtime configuration.
 *
 * Defines Zod-validated event schemas for lobby events and exposes a
 * singleton `realtime` instance used by every API endpoint that emits
 * events, as well as the SSE handler in `api/realtime.ts`.
 *
 * The Redis Stream key and Pub/Sub channel are scoped to the current
 * Vercel environment via `redisPrefix` (e.g. "production_lobby").
 */

import { Realtime, type InferRealtimeEvents } from '@upstash/realtime';
import z from 'zod/v4';
import { redisPrefix, redisRaw } from './_redisClient.js';

// ── Event schemas (Zod v4) ──────────────────────────────────────

export const lobbySchema = {
  lobby: {
    /** A player confirmed availability */
    confirmation_add: z.object({
      playerId: z.number(),
      timestamp: z.number()
    }),
    /** A player cancelled availability */
    confirmation_remove: z.object({
      playerId: z.number(),
      timestamp: z.number()
    }),
    /** A new chat message was sent */
    message: z.object({
      playerId: z.number(),
      timestamp: z.number()
    }),
    /** An admin created a new lobby (broadcast sent) */
    created: z.object({
      timestamp: z.number()
    }),
    /** The lobby TTL expired */
    expired: z.object({
      timestamp: z.number()
    })
  }
};

// ── Realtime singleton ──────────────────────────────────────────

export const realtime = new Realtime({
  schema: lobbySchema,
  redis: redisRaw,
  maxDurationSecs: 300, // Fluid Compute limit on Vercel Hobby
  verbose: process.env.NODE_ENV !== 'production'
});

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Environment-scoped lobby channel.
 * All emit / subscribe calls go through this channel so different
 * Vercel environments (production, preview, dev) are isolated.
 */
export const LOBBY_CHANNEL = `${redisPrefix}lobby`;

/**
 * Get a channel scoped to the current environment.
 */
export const lobbyChannel = (): ReturnType<typeof realtime.channel> => realtime.channel(LOBBY_CHANNEL);

// ── Type exports ────────────────────────────────────────────────

export type RealtimeEvents = InferRealtimeEvents<typeof realtime>;
