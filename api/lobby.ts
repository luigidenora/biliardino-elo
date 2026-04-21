import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateFishName } from './_fishNames.js';
import { lobbyEnv } from './_lobbyEnv.js';
import { handleCorsPreFlight, setCorsHeaders } from './_cors.js';
import { withSecurityMiddleware } from './_middleware.js';
import { supabaseAdmin } from './_supabaseAdmin.js';

/**
 * Unified Lobby API — restituisce lo stato completo della lobby in una chiamata.
 *
 * GET /api/lobby
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  setCorsHeaders(res);
  if (handleCorsPreFlight(req, res)) return res;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const now = new Date().toISOString();

    // Cerca la lobby attiva per l'ambiente corrente
    const { data: lobby, error: lobbyErr } = await supabaseAdmin
      .from('lobbies')
      .select('lobby_id, expires_at, duration_seconds, match, created_at')
      .eq('environment', lobbyEnv)
      .eq('status', 'waiting')
      .gt('expires_at', now)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lobbyErr) throw lobbyErr;

    if (!lobby) {
      return res.status(200).json({
        exists: false,
        ttl: 0,
        match: null,
        count: 0,
        confirmations: [],
        messages: [],
        messageCount: 0
      });
    }

    const ttl = Math.max(0, Math.floor((new Date(lobby.expires_at).getTime() - Date.now()) / 1000));

    // Leggi conferme
    const { data: rows, error: confErr } = await supabaseAdmin
      .from('lobby_confirmations')
      .select('player_id, confirmed_at, fish_name')
      .eq('lobby_id', lobby.lobby_id)
      .order('confirmed_at', { ascending: true });

    if (confErr) throw confErr;

    const confirmations = (rows ?? []).map(r => ({
      playerId: r.player_id,
      confirmedAt: r.confirmed_at,
      fishName: r.fish_name ?? generateFishName(r.player_id)
    }));

    // Leggi messaggi
    const { data: msgRows, error: msgErr } = await supabaseAdmin
      .from('lobby_messages')
      .select('id, player_id, player_name, fish_type, text, sent_at, created_at')
      .eq('lobby_id', lobby.lobby_id)
      .order('created_at', { ascending: true })
      .limit(50);

    if (msgErr) throw msgErr;

    const messages = (msgRows ?? []).map(m => ({
      id: m.id,
      playerId: m.player_id,
      playerName: m.player_name,
      fishType: m.fish_type,
      text: m.text,
      sentAt: m.sent_at,
      timestamp: m.created_at
    }));

    return res.status(200).json({
      exists: true,
      ttl,
      match: lobby.match ?? null,
      count: confirmations.length,
      confirmations,
      messages,
      messageCount: messages.length
    });
  } catch (error) {
    console.error('❌ Errore lobby:', (error as Error).message);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
}

export default withSecurityMiddleware(handler);
