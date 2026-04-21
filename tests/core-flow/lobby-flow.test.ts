/**
 * Core Lobby Flow — Integration Tests con Supabase reale
 *
 * Testa il ciclo completo: create lobby → confirm-availability → lobby state → admin-cleanup
 * Usa il vero Supabase (service role) per testare il comportamento end-to-end.
 * Ambiente fisso: 'preview' (env di test isolato da produzione).
 */
import { createClient } from '@supabase/supabase-js';
import * as jose from 'jose';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import adminCleanupHandler from '../../api/admin-cleanup';
import confirmHandler from '../../api/confirm-availability';
import lobbyHandler from '../../api/lobby';
import { mockRequest, mockResponse } from '../helpers/mock-vercel';

// ─── Costanti ────────────────────────────────────────────────────────────────

const PLAYER_1 = 99001;
const PLAYER_2 = 99002;
const PLAYER_3 = 99003;
const PLAYER_4 = 99004;
const TEST_ENV = 'preview';

// ─── Supabase admin client ────────────────────────────────────────────────────
// Usa service role key se disponibile, altrimenti anon key (RLS è permissiva in test)

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '';

// Configura variabili d'ambiente per i moduli API se non già presenti
if (!process.env.SUPABASE_URL && process.env.VITE_SUPABASE_URL) {
  process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.VITE_SUPABASE_ANON_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_ANON_KEY;
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createAdminToken(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.AUTH_JWT_SECRET!);
  return new jose.SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(secret);
}

/** Crea una lobby test con TTL di 1 ora. Ritorna il lobby_id. */
async function createTestLobby(overrides: {
  durationSeconds?: number;
  expired?: boolean;
} = {}): Promise<string> {
  const duration = overrides.durationSeconds ?? 3600;
  const expiresAt = overrides.expired
    ? new Date(Date.now() - 1000).toISOString()
    : new Date(Date.now() + duration * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('lobbies')
    .insert({
      status: 'waiting',
      environment: TEST_ENV,
      expires_at: expiresAt,
      duration_seconds: duration
    })
    .select('lobby_id')
    .single();

  if (error) throw error;
  return data.lobby_id;
}

/** Rimuove tutte le lobby e conferme test. */
async function cleanup() {
  // Le conferme vengono eliminate in cascade tramite FK
  await supabaseAdmin
    .from('lobbies')
    .delete()
    .eq('environment', TEST_ENV);
}

// ─── Setup / Teardown ────────────────────────────────────────────────────────

beforeEach(async () => {
  await cleanup();
}, 15_000);

afterAll(async () => {
  await cleanup();
}, 15_000);

// ═════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═════════════════════════════════════════════════════════════════════════════

describe('Core Lobby Flow — Integration con Supabase reale', () => {

  // ─── Prerequisites ──────────────────────────────────────────────────────

  describe('Prerequisites', () => {
    it('Supabase è raggiungibile', async () => {
      const { error } = await supabaseAdmin.from('lobbies').select('lobby_id').limit(1);
      expect(error).toBeNull();
    }, 10_000);

    it('AUTH_JWT_SECRET è configurato', () => {
      expect(process.env.AUTH_JWT_SECRET).toBeDefined();
      expect(process.env.AUTH_JWT_SECRET!.length).toBeGreaterThan(0);
    });

    it('SUPABASE_SERVICE_ROLE_KEY è configurata', () => {
      expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // confirm-availability
  // ═══════════════════════════════════════════════════════════════════════════

  describe('confirm-availability', () => {
    it('crea una conferma con playerId valido', async () => {
      await createTestLobby();
      const res = mockResponse();
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_1 } }), res);

      expect(res._status).toBe(200);
      expect(res._json.ok).toBe(true);
      expect(res._json.count).toBeGreaterThanOrEqual(1);
    }, 15_000);

    it('scrive in Supabase con i campi corretti', async () => {
      const lobbyId = await createTestLobby();
      await confirmHandler(
        mockRequest({ method: 'POST', body: { playerId: PLAYER_1 } }),
        mockResponse()
      );

      const { data, error } = await supabaseAdmin
        .from('lobby_confirmations')
        .select('*')
        .eq('lobby_id', lobbyId)
        .eq('player_id', PLAYER_1)
        .maybeSingle();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.player_id).toBe(PLAYER_1);
      expect(data!.confirmed_at).toBeDefined();
      expect(typeof data!.fish_name).toBe('string');
      expect(data!.fish_name!.length).toBeGreaterThan(0);
    }, 15_000);

    it('re-conferma è idempotente (non duplica)', async () => {
      await createTestLobby();
      const r1 = mockResponse();
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_1 } }), r1);
      expect(r1._json.count).toBe(1);

      const r2 = mockResponse();
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_2 } }), r2);
      expect(r2._json.count).toBe(2);

      // Re-conferma PLAYER_1 → count resta 2
      const r3 = mockResponse();
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_1 } }), r3);
      expect(r3._json.count).toBe(2);
    }, 15_000);

    it('conferme concorrenti non causano perdita dati', async () => {
      await createTestLobby();
      const players = [PLAYER_1, PLAYER_2, PLAYER_3, PLAYER_4, 99005];

      const results = await Promise.all(
        players.map(async (playerId) => {
          const res = mockResponse();
          await confirmHandler(mockRequest({ method: 'POST', body: { playerId } }), res);
          return res;
        })
      );

      for (const res of results) {
        expect(res._status).toBe(200);
        expect(res._json.ok).toBe(true);
      }

      const { count } = await supabaseAdmin
        .from('lobby_confirmations')
        .select('*', { count: 'exact', head: true });
      expect(count).toBe(5);
    }, 15_000);

    it('rifiuta se non c\'è lobby attiva (404)', async () => {
      // nessuna lobby creata
      const res = mockResponse();
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_1 } }), res);
      expect(res._status).toBe(404);
    }, 15_000);

    it('rifiuta richiesta senza playerId (400)', async () => {
      await createTestLobby();
      const res = mockResponse();
      await confirmHandler(mockRequest({ method: 'POST', body: {} }), res);
      expect(res._status).toBe(400);
    }, 15_000);

    it('rifiuta playerId negativo (500 — validatePlayerId throws)', async () => {
      await createTestLobby();
      const res = mockResponse();
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: -1 } }), res);
      expect(res._status).toBe(500);
    }, 15_000);

    it('rifiuta metodo GET (405)', async () => {
      const res = mockResponse();
      await confirmHandler(mockRequest({ method: 'GET' }), res);
      expect(res._status).toBe(405);
    }, 15_000);

    it('rifiuta payload con Prototype Pollution (security middleware)', async () => {
      const body = JSON.parse('{"playerId":1,"nested":{"__proto__":{"isAdmin":true}}}');
      const res = mockResponse();
      await confirmHandler(mockRequest({ method: 'POST', body }), res);
      expect(res._status).toBe(400);
    }, 15_000);

    it('rifiuta payload troppo grande (>10KB)', async () => {
      const res = mockResponse();
      await confirmHandler(
        mockRequest({ method: 'POST', body: { playerId: 1, data: 'x'.repeat(20 * 1024) } }),
        res
      );
      expect(res._status).toBe(413);
    }, 15_000);

    it('DELETE rimuove la conferma', async () => {
      await createTestLobby();
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_1 } }), mockResponse());

      const del = mockResponse();
      await confirmHandler(mockRequest({ method: 'DELETE', body: { playerId: PLAYER_1 } }), del);
      expect(del._status).toBe(200);

      const res = mockResponse();
      await lobbyHandler(mockRequest({ method: 'GET' }), res);
      expect(res._json.count).toBe(0);
    }, 15_000);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // lobby (unified endpoint)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('lobby', () => {
    it('restituisce stato vuoto senza lobby attiva', async () => {
      const res = mockResponse();
      await lobbyHandler(mockRequest({ method: 'GET' }), res);

      expect(res._status).toBe(200);
      expect(res._json.exists).toBe(false);
      expect(res._json.count).toBe(0);
      expect(res._json.confirmations).toEqual([]);
    }, 15_000);

    it('restituisce exists:true con lobby attiva', async () => {
      await createTestLobby();
      const res = mockResponse();
      await lobbyHandler(mockRequest({ method: 'GET' }), res);

      expect(res._status).toBe(200);
      expect(res._json.exists).toBe(true);
      expect(res._json.ttl).toBeGreaterThan(0);
    }, 15_000);

    it('restituisce le conferme dopo che i player confermano', async () => {
      await createTestLobby();
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_1 } }), mockResponse());
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_2 } }), mockResponse());

      const res = mockResponse();
      await lobbyHandler(mockRequest({ method: 'GET' }), res);

      expect(res._json.count).toBe(2);
      const ids = res._json.confirmations.map((c: any) => c.playerId);
      expect(ids).toContain(PLAYER_1);
      expect(ids).toContain(PLAYER_2);
    }, 15_000);

    it('ogni conferma ha playerId, confirmedAt e fishName', async () => {
      await createTestLobby();
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_1 } }), mockResponse());

      const res = mockResponse();
      await lobbyHandler(mockRequest({ method: 'GET' }), res);

      const conf = res._json.confirmations[0];
      expect(conf.playerId).toBe(PLAYER_1);
      expect(conf.confirmedAt).toBeDefined();
      expect(new Date(conf.confirmedAt).getTime()).not.toBeNaN();
      expect(typeof conf.fishName).toBe('string');
      expect(conf.fishName.length).toBeGreaterThan(0);
    }, 15_000);

    it('fishName è deterministico (stessa lettura, stesso nome)', async () => {
      await createTestLobby();
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_1 } }), mockResponse());

      const res1 = mockResponse();
      await lobbyHandler(mockRequest({ method: 'GET' }), res1);
      const res2 = mockResponse();
      await lobbyHandler(mockRequest({ method: 'GET' }), res2);

      expect(res1._json.confirmations[0].fishName).toBe(res2._json.confirmations[0].fishName);
    }, 15_000);

    it('lobby scaduta non viene restituita (exists:false)', async () => {
      await createTestLobby({ expired: true });

      const res = mockResponse();
      await lobbyHandler(mockRequest({ method: 'GET' }), res);

      expect(res._json.exists).toBe(false);
    }, 15_000);

    it('rifiuta metodo POST (405)', async () => {
      const res = mockResponse();
      await lobbyHandler(mockRequest({ method: 'POST' }), res);
      expect(res._status).toBe(405);
    }, 15_000);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // admin-cleanup
  // ═══════════════════════════════════════════════════════════════════════════

  describe('admin-cleanup', () => {
    it('chiude lobby e cancella conferme con token admin valido', async () => {
      await createTestLobby();
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_1 } }), mockResponse());
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_2 } }), mockResponse());

      const token = await createAdminToken();
      const res = mockResponse();
      await adminCleanupHandler(
        mockRequest({ method: 'POST', headers: { authorization: `Bearer ${token}` } }),
        res
      );

      expect(res._status).toBe(200);
      expect(res._json.ok).toBe(true);
      expect(res._json.deletedConfirmations).toBe(2);

      // Lobby risulta chiusa
      const stateRes = mockResponse();
      await lobbyHandler(mockRequest({ method: 'GET' }), stateRes);
      expect(stateRes._json.exists).toBe(false);
    }, 15_000);

    it('restituisce 0 se non ci sono dati da cancellare', async () => {
      const token = await createAdminToken();
      const res = mockResponse();
      await adminCleanupHandler(
        mockRequest({ method: 'POST', headers: { authorization: `Bearer ${token}` } }),
        res
      );

      expect(res._status).toBe(200);
      expect(res._json.deletedConfirmations).toBe(0);
    }, 15_000);

    it('rifiuta senza token (401)', async () => {
      const res = mockResponse();
      await adminCleanupHandler(mockRequest({ method: 'POST' }), res);
      expect(res._status).toBe(401);
    }, 15_000);

    it('rifiuta con token invalido (401)', async () => {
      const res = mockResponse();
      await adminCleanupHandler(
        mockRequest({ method: 'POST', headers: { authorization: 'Bearer token-falso-123' } }),
        res
      );
      expect(res._status).toBe(401);
    }, 15_000);

    it('rifiuta con ruolo non-admin (403)', async () => {
      const secret = new TextEncoder().encode(process.env.AUTH_JWT_SECRET!);
      const cronToken = await new jose.SignJWT({ role: 'cron' })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('1h')
        .sign(secret);

      const res = mockResponse();
      await adminCleanupHandler(
        mockRequest({ method: 'POST', headers: { authorization: `Bearer ${cronToken}` } }),
        res
      );
      expect(res._status).toBe(403);
    }, 15_000);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Environment isolation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Environment isolation', () => {
    it('lobby su env "production" non appare in GET /lobby (che legge "preview")', async () => {
      // Inserisce direttamente una lobby production tramite supabaseAdmin
      await supabaseAdmin.from('lobbies').insert({
        status: 'waiting',
        environment: 'production',
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        duration_seconds: 3600
      });

      // GET /lobby legge l'env corrente (preview in test)
      const res = mockResponse();
      await lobbyHandler(mockRequest({ method: 'GET' }), res);
      expect(res._json.exists).toBe(false);

      // Cleanup production lobby
      await supabaseAdmin.from('lobbies').delete().eq('environment', 'production');
    }, 15_000);

    it('conferme su lobby preview non compaiono nella lobby production', async () => {
      const lobbyId = await createTestLobby(); // preview
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_1 } }), mockResponse());

      // Verifica diretta: la conferma è associata alla lobby preview
      const { data } = await supabaseAdmin
        .from('lobby_confirmations')
        .select('lobby_id')
        .eq('player_id', PLAYER_1)
        .maybeSingle();

      expect(data!.lobby_id).toBe(lobbyId);
    }, 15_000);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // E2E: flusso completo
  // ═══════════════════════════════════════════════════════════════════════════

  describe('E2E: Lobby → Confirm → Stato → Cleanup', () => {
    it('ciclo completo: 4 player confermano → stato corretto → cleanup', async () => {
      // 1. Crea lobby
      await createTestLobby();

      // 2. Quattro player confermano
      for (const playerId of [PLAYER_1, PLAYER_2, PLAYER_3, PLAYER_4]) {
        const res = mockResponse();
        await confirmHandler(mockRequest({ method: 'POST', body: { playerId } }), res);
        expect(res._status).toBe(200);
      }

      // 3. Verifica stato
      const state1 = mockResponse();
      await lobbyHandler(mockRequest({ method: 'GET' }), state1);

      expect(state1._json.exists).toBe(true);
      expect(state1._json.count).toBe(4);
      const confirmedIds = state1._json.confirmations.map((c: any) => c.playerId);
      expect(confirmedIds).toContain(PLAYER_1);
      expect(confirmedIds).toContain(PLAYER_2);
      expect(confirmedIds).toContain(PLAYER_3);
      expect(confirmedIds).toContain(PLAYER_4);
      for (const conf of state1._json.confirmations) {
        expect(typeof conf.fishName).toBe('string');
      }

      // 4. Admin cleanup
      const token = await createAdminToken();
      const cleanupRes = mockResponse();
      await adminCleanupHandler(
        mockRequest({ method: 'POST', headers: { authorization: `Bearer ${token}` } }),
        cleanupRes
      );

      expect(cleanupRes._status).toBe(200);
      expect(cleanupRes._json.deletedConfirmations).toBe(4);

      // 5. Stato pulito
      const state2 = mockResponse();
      await lobbyHandler(mockRequest({ method: 'GET' }), state2);
      expect(state2._json.exists).toBe(false);
      expect(state2._json.count).toBe(0);
    }, 30_000);

    it('ciclo si ripete: cleanup → nuova sessione con player diversi', async () => {
      await createTestLobby();
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_1 } }), mockResponse());

      const token = await createAdminToken();
      await adminCleanupHandler(
        mockRequest({ method: 'POST', headers: { authorization: `Bearer ${token}` } }),
        mockResponse()
      );

      // Seconda sessione
      await createTestLobby();
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_3 } }), mockResponse());
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_4 } }), mockResponse());

      const state = mockResponse();
      await lobbyHandler(mockRequest({ method: 'GET' }), state);
      expect(state._json.count).toBe(2);
      const ids = state._json.confirmations.map((c: any) => c.playerId);
      expect(ids).toContain(PLAYER_3);
      expect(ids).toContain(PLAYER_4);
      expect(ids).not.toContain(PLAYER_1);
    }, 30_000);

    it('conteggio conferme cresce progressivamente', async () => {
      await createTestLobby();
      for (let i = 0; i < 4; i++) {
        const res = mockResponse();
        await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_1 + i } }), res);
        expect(res._json.count).toBe(i + 1);
      }
    }, 30_000);
  });
});
