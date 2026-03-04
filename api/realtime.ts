/**
 * GET /api/realtime — Server-Sent Events endpoint for real-time lobby updates.
 *
 * Uses @upstash/realtime `handle()` to create an SSE stream backed by
 * Redis Streams + Pub/Sub.  The handler expects Web Standard Request/Response,
 * so we adapt from VercelRequest/VercelResponse.
 *
 * Fluid Compute keeps the connection alive for up to 300 s (Vercel Hobby).
 * When the server-side timeout nears, a `{type:"reconnect"}` SSE event is
 * sent and the client should reconnect with `last_ack_*` query params.
 *
 * No authentication token is exposed to the browser — credentials stay
 * server-side in the Realtime instance.
 */

import { handle } from '@upstash/realtime';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders } from './_cors.js';
import { LOBBY_CHANNEL, realtime } from './_realtime.js';

// Build the SSE handler once (cold-start optimised)
const sseHandler = handle({ realtime });

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  setCorsHeaders(res);

  // Only GET is valid for SSE
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // ── Build a Web Standard Request ──────────────────────────────
  const protocol = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url!, `${protocol}://${host}`);

  // Force our environment-scoped channel regardless of what the client sends
  url.searchParams.delete('channel');
  url.searchParams.append('channel', LOBBY_CHANNEL);

  const controller = new AbortController();

  // Abort the SSE stream when the client disconnects
  req.on('close', () => controller.abort());

  const webRequest = new Request(url.toString(), {
    method: 'GET',
    headers: new Headers(req.headers as Record<string, string>),
    signal: controller.signal
  });

  // ── Call the @upstash/realtime handler ────────────────────────
  const webResponse = await sseHandler(webRequest);
  if (!webResponse) {
    res.status(500).json({ error: 'SSE handler returned no response' });
    return;
  }

  // ── Stream the Response body to VercelResponse ────────────────
  const headers: Record<string, string> = {};
  webResponse.headers.forEach((value, key) => {
    headers[key] = value;
  });

  res.writeHead(webResponse.status, headers);

  if (webResponse.body) {
    const reader = webResponse.body.getReader();
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } catch {
      // Client disconnected or abort — expected for SSE
    } finally {
      reader.releaseLock();
    }
  }

  res.end();
}
