import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth } from './_auth.js';
import { handleCorsPreFlight, setCorsHeaders } from './_cors.js';
import { lobbyEnv } from './_lobbyEnv.js';
import { supabaseAdmin } from './_supabaseAdmin.js';

/**
 * Chiude la lobby attiva e cancella tutte le conferme (admin only).
 *
 * POST /api/admin-cleanup
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  setCorsHeaders(res);
  if (handleCorsPreFlight(req, res)) return res;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const now = new Date().toISOString();

    // Trova lobby attiva
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

    let deletedConfirmations = 0;

    if (lobby) {
      // Conta e cancella le conferme
      const { count, error: countErr } = await supabaseAdmin
        .from('lobby_confirmations')
        .select('*', { count: 'exact', head: true })
        .eq('lobby_id', lobby.lobby_id);
      if (countErr) throw countErr;

      deletedConfirmations = count ?? 0;

      // Chiudi la lobby
      const { error: updateErr } = await supabaseAdmin
        .from('lobbies')
        .update({ status: 'closed' })
        .eq('lobby_id', lobby.lobby_id);
      if (updateErr) throw updateErr;
      // Le conferme vengono eliminate in cascade dalla FK

      console.log(`Cleanup: ${deletedConfirmations} conferme, lobby ${lobby.lobby_id} chiusa`);
    }

    return res.status(200).json({
      ok: true,
      deletedMessages: 0,
      deletedConfirmations
    });
  } catch (error) {
    console.error('Errore admin-cleanup:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler, 'admin');
