import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCorsPreFlight, setCorsHeaders } from './_cors.js';
import { lobbyEnv } from './_lobbyEnv.js';
import { withSecurityMiddleware } from './_middleware.js';
import { supabaseAdmin } from './_supabaseAdmin.js';
import { validatePlayerId, validateString } from './_validation.js';

interface SendMessageBody {
  playerId: number;
  playerName: string;
  fishType: string;
  text: string;
  sentAt: number;
}

/**
 * API per inviare un messaggio chat durante la conferma.
 * Salva il messaggio in Supabase lobby_messages (cascade delete alla chiusura lobby).
 *
 * POST /api/send-message
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  setCorsHeaders(res);
  if (handleCorsPreFlight(req, res)) return res;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { playerId, playerName, fishType, text, sentAt } = req.body as SendMessageBody;

    if (!validatePlayerId(playerId)) {
      return res.status(400).json({ error: 'Invalid playerId' });
    }
    if (!validateString(playerName, 'playerName', 100)) {
      return res.status(400).json({ error: 'Invalid playerName' });
    }
    if (!validateString(fishType, 'fishType', 20)) {
      return res.status(400).json({ error: 'Invalid fishType' });
    }
    if (!validateString(text, 'text', 500)) {
      return res.status(400).json({ error: 'Message must be 1-500 chars' });
    }

    const wordCount = text.trim().split(/\s+/).length;
    if (wordCount > 6) {
      return res.status(400).json({ error: 'Message must be max 6 words' });
    }

    // Trova la lobby attiva per l'ambiente corrente
    const now = new Date().toISOString();
    const { data: lobby, error: lobbyErr } = await supabaseAdmin
      .from('lobbies')
      .select('lobby_id')
      .eq('environment', lobbyEnv)
      .eq('status', 'waiting')
      .gt('expires_at', now)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lobbyErr) throw lobbyErr;
    if (!lobby) {
      return res.status(404).json({ error: 'No active lobby' });
    }

    const { data: msg, error: insertErr } = await supabaseAdmin
      .from('lobby_messages')
      .insert({
        lobby_id: lobby.lobby_id,
        player_id: playerId,
        player_name: playerName,
        fish_type: fishType,
        text,
        sent_at: sentAt ?? Date.now()
      })
      .select('id, player_id, player_name, fish_type, text, sent_at, created_at')
      .single();

    if (insertErr) throw insertErr;

    return res.status(201).json({
      id: msg.id,
      playerId: msg.player_id,
      playerName: msg.player_name,
      fishType: msg.fish_type,
      text: msg.text,
      sentAt: msg.sent_at,
      timestamp: msg.created_at
    });
  } catch (error) {
    console.error('❌ Errore send-message:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withSecurityMiddleware(handler);
