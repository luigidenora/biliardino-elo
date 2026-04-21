import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateFishName } from './_fishNames.js';
import { lobbyEnv } from './_lobbyEnv.js';
import { handleCorsPreFlight, setCorsHeaders } from './_cors.js';
import { withSecurityMiddleware } from './_middleware.js';
import { supabaseAdmin } from './_supabaseAdmin.js';
import { sanitizeLogOutput, validatePlayerId } from './_validation.js';

async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  setCorsHeaders(res);
  if (handleCorsPreFlight(req, res)) return res;

  // ── DELETE: rimuovi conferma ───────────────────────────────────
  if (req.method === 'DELETE') {
    try {
      const { playerId: rawPlayerId } = req.body as { playerId?: string | number };
      if (!rawPlayerId) return res.status(400).json({ error: 'Missing playerId' });
      const playerIdNum = validatePlayerId(rawPlayerId);

      const lobby = await getActiveLobby();
      if (lobby) {
        const { error } = await supabaseAdmin
          .from('lobby_confirmations')
          .delete()
          .eq('lobby_id', lobby.lobby_id)
          .eq('player_id', playerIdNum);
        if (error) throw error;
      }

      console.log(`❌ Cancellazione conferma da ${sanitizeLogOutput(String(playerIdNum))}`);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Errore cancellazione conferma:', err);
      return res.status(500).json({ error: 'Errore cancellazione conferma' });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── POST: aggiungi conferma ────────────────────────────────────
  try {
    const { playerId: rawPlayerId } = req.body as { playerId?: string | number };
    if (!rawPlayerId) return res.status(400).json({ error: 'Missing playerId' });

    const playerIdNum = validatePlayerId(rawPlayerId);
    const fishName = generateFishName(playerIdNum);

    const lobby = await getActiveLobby();
    if (!lobby) {
      return res.status(404).json({ error: 'Nessuna lobby attiva' });
    }

    const { error } = await supabaseAdmin
      .from('lobby_confirmations')
      .upsert(
        { player_id: playerIdNum, lobby_id: lobby.lobby_id, fish_name: fishName, confirmed_at: new Date().toISOString() },
        { onConflict: 'player_id,lobby_id' }
      );
    if (error) throw error;

    const { count, error: countErr } = await supabaseAdmin
      .from('lobby_confirmations')
      .select('*', { count: 'exact', head: true })
      .eq('lobby_id', lobby.lobby_id);
    if (countErr) throw countErr;

    console.log(`✅ Conferma da ${sanitizeLogOutput(String(playerIdNum))} (totale: ${count})`);
    return res.status(200).json({ ok: true, count: count ?? 0 });
  } catch (err) {
    console.error('Errore conferma availability:', err);
    return res.status(500).json({ error: 'Errore salvataggio conferma' });
  }
}

async function getActiveLobby(): Promise<{ lobby_id: string } | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('lobbies')
    .select('lobby_id')
    .eq('environment', lobbyEnv)
    .eq('status', 'waiting')
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export default withSecurityMiddleware(handler, {
  maxPayloadSize: 10 * 1024,
  timeout: 10000
});
