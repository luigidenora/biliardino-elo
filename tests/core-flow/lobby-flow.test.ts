/**
 * Core Lobby Flow — Integration Tests con Redis reale
 *
 * Testa il ciclo completo: confirm-availability → lobby-state → send-message → admin-cleanup
 * Usa il vero Upstash Redis per testare il comportamento end-to-end.
 */
import * as jose from 'jose';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prefixed, redis, redisRaw } from '../../api/_redisClient';
import adminCleanupHandler from '../../api/admin-cleanup';
import confirmHandler from '../../api/confirm-availability';
import lobbyStateHandler from '../../api/lobby-state';
import sendMessageHandler from '../../api/send-message';
import { mockRequest, mockResponse } from '../helpers/mock-vercel';

// ─── Costanti ────────────────────────────────────────────────────────────────
// Player ID alto per evitare collisioni con dati reali
const PLAYER_1 = 99001;
const PLAYER_2 = 99002;
const PLAYER_3 = 99003;
const PLAYER_4 = 99004;

// ─── Helper ──────────────────────────────────────────────────────────────────

async function createAdminToken(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.AUTH_JWT_SECRET!);
  return new jose.SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(secret);
}

async function cleanup() {
  const pipeline = redisRaw.pipeline();
  pipeline.del(prefixed('availability'));
  pipeline.del(prefixed('availability_ts'));
  await pipeline.exec();

  const messageIds = await redis.lrange('messages', 0, -1) as string[];
  for (const id of messageIds) {
    await redis.del(`message:${id}`);
  }
  await redis.del('messages');
}

function validMessageBody(overrides: Record<string, any> = {}) {
  return {
    playerId: PLAYER_1,
    playerName: 'TestPlayer',
    fishType: 'Squalo',
    text: 'Ciao a tutti',
    sentAt: Date.now(),
    timestamp: new Date().toISOString(),
    ...overrides
  };
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

describe('Core Lobby Flow — Integration con Redis reale', () => {
  // ─── Prerequisites ──────────────────────────────────────────────────────

  describe('Prerequisites', () => {
    it('Redis è raggiungibile', async () => {
      const pong = await redisRaw.ping();
      expect(pong).toBe('PONG');
    }, 10_000);

    it('AUTH_JWT_SECRET è configurato', () => {
      expect(process.env.AUTH_JWT_SECRET).toBeDefined();
      expect(process.env.AUTH_JWT_SECRET!.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // confirm-availability
  // ═══════════════════════════════════════════════════════════════════════════

  describe('confirm-availability', () => {
    it('crea una conferma con playerId valido', async () => {
      const res = mockResponse();
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_1 } }), res);

      expect(res._status).toBe(200);
      expect(res._json.ok).toBe(true);
      expect(res._json.count).toBeGreaterThanOrEqual(1);
    }, 15_000);

    it('scrive nel hash Redis con i campi corretti', async () => {
      await confirmHandler(
        mockRequest({ method: 'POST', body: { playerId: PLAYER_1 } }),
        mockResponse()
      );

      // Verifica diretta su Redis
      // @upstash/redis auto-deserializza i valori JSON da hgetall
      const raw = await redisRaw.hgetall(prefixed('availability')) as Record<string, any> | null;
      expect(raw).not.toBeNull();

      const entry = raw![String(PLAYER_1)];
      // Il valore potrebbe essere già un oggetto (auto-deserializzato) o una stringa JSON
      const parsed = typeof entry === 'string' ? JSON.parse(entry) : entry;
      expect(parsed.playerId).toBe(PLAYER_1);
      expect(parsed.confirmedAt).toBeDefined();
      expect(new Date(parsed.confirmedAt).getTime()).not.toBeNaN();
    }, 15_000);

    it('re-conferma è idempotente (non duplica)', async () => {
      // Conferma 2 player diversi
      const r1 = mockResponse();
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_1 } }), r1);
      expect(r1._json.count).toBe(1);

      const r2 = mockResponse();
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_2 } }), r2);
      expect(r2._json.count).toBe(2);

      // Re-conferma PLAYER_1 → count resta 2 (hash HSET sovrascrive, non duplica)
      const r3 = mockResponse();
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_1 } }), r3);
      expect(r3._json.count).toBe(2);
    }, 15_000);

    it('conferme concorrenti non causano perdita dati', async () => {
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

      // Verifica che tutti e 5 siano presenti
      const hash = await redisRaw.hgetall(prefixed('availability')) as Record<string, string>;
      expect(Object.keys(hash).length).toBe(5);
    }, 15_000);

    it('rifiuta richiesta senza playerId (400)', async () => {
      const res = mockResponse();
      await confirmHandler(mockRequest({ method: 'POST', body: {} }), res);

      expect(res._status).toBe(400);
      expect(res._json.error).toContain('Missing playerId');
    }, 15_000);

    it('rifiuta playerId negativo (500 — validatePlayerId throws)', async () => {
      const res = mockResponse();
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: -1 } }), res);
      expect(res._status).toBe(500);
    }, 15_000);

    it('rifiuta playerId > 999999 (500)', async () => {
      const res = mockResponse();
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: 1_000_000 } }), res);
      expect(res._status).toBe(500);
    }, 15_000);

    it('rifiuta playerId non numerico (500)', async () => {
      const res = mockResponse();
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: 'abc' } }), res);
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

    it('rifiuta payload troppo grande (security middleware, >10KB)', async () => {
      const res = mockResponse();
      await confirmHandler(
        mockRequest({ method: 'POST', body: { playerId: 1, data: 'x'.repeat(20 * 1024) } }),
        res
      );
      expect(res._status).toBe(413);
    }, 15_000);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // lobby-state
  // ═══════════════════════════════════════════════════════════════════════════

  describe('lobby-state', () => {
    it('restituisce stato vuoto senza conferme', async () => {
      const res = mockResponse();
      await lobbyStateHandler(mockRequest({ method: 'GET' }), res);

      expect(res._status).toBe(200);
      expect(res._json.count).toBe(0);
      expect(res._json.confirmations).toEqual([]);
      expect(res._json.messages).toEqual([]);
      expect(res._json.messageCount).toBe(0);
    }, 15_000);

    it('restituisce le conferme dopo che i player confermano', async () => {
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_1 } }), mockResponse());
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_2 } }), mockResponse());

      const res = mockResponse();
      await lobbyStateHandler(mockRequest({ method: 'GET' }), res);

      expect(res._status).toBe(200);
      expect(res._json.count).toBe(2);
      expect(res._json.confirmations).toHaveLength(2);

      const ids = res._json.confirmations.map((c: any) => c.playerId);
      expect(ids).toContain(PLAYER_1);
      expect(ids).toContain(PLAYER_2);
    }, 15_000);

    it('ogni conferma ha playerId, confirmedAt e fishName', async () => {
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_1 } }), mockResponse());

      const res = mockResponse();
      await lobbyStateHandler(mockRequest({ method: 'GET' }), res);

      const conf = res._json.confirmations[0];
      expect(conf.playerId).toBe(PLAYER_1);
      expect(conf.confirmedAt).toBeDefined();
      expect(new Date(conf.confirmedAt).getTime()).not.toBeNaN();
      expect(typeof conf.fishName).toBe('string');
      expect(conf.fishName.length).toBeGreaterThan(0);
    }, 15_000);

    it('fishName è deterministico (stessa lettura, stesso nome)', async () => {
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_1 } }), mockResponse());

      const res1 = mockResponse();
      await lobbyStateHandler(mockRequest({ method: 'GET' }), res1);

      const res2 = mockResponse();
      await lobbyStateHandler(mockRequest({ method: 'GET' }), res2);

      expect(res1._json.confirmations[0].fishName).toBe(res2._json.confirmations[0].fishName);
    }, 15_000);

    it('rifiuta metodo POST (405)', async () => {
      const res = mockResponse();
      await lobbyStateHandler(mockRequest({ method: 'POST' }), res);
      expect(res._status).toBe(405);
    }, 15_000);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // send-message
  // ═══════════════════════════════════════════════════════════════════════════

  describe('send-message', () => {
    it('salva un messaggio valido (201)', async () => {
      const res = mockResponse();
      await sendMessageHandler(mockRequest({ method: 'POST', body: validMessageBody() }), res);

      expect(res._status).toBe(201);
      expect(res._json.id).toBeDefined();
      expect(res._json.playerId).toBe(PLAYER_1);
      expect(res._json.text).toBe('Ciao a tutti');
    }, 15_000);

    it('il messaggio appare in lobby-state', async () => {
      await sendMessageHandler(
        mockRequest({ method: 'POST', body: validMessageBody({ text: 'Arrivo subito' }) }),
        mockResponse()
      );

      const res = mockResponse();
      await lobbyStateHandler(mockRequest({ method: 'GET' }), res);

      expect(res._json.messageCount).toBe(1);
      expect(res._json.messages).toHaveLength(1);
      expect(res._json.messages[0].text).toBe('Arrivo subito');
    }, 15_000);

    it('accetta messaggio con esattamente 6 parole', async () => {
      const res = mockResponse();
      await sendMessageHandler(
        mockRequest({ method: 'POST', body: validMessageBody({ text: 'uno due tre quattro cinque sei' }) }),
        res
      );
      expect(res._status).toBe(201);
    }, 15_000);

    it('rifiuta messaggio con più di 6 parole (400)', async () => {
      const res = mockResponse();
      await sendMessageHandler(
        mockRequest({ method: 'POST', body: validMessageBody({ text: 'questa frase ha più di sei parole sicuramente' }) }),
        res
      );

      expect(res._status).toBe(400);
      expect(res._json.error).toContain('6 words');
    }, 15_000);

    it('rifiuta senza playerName (500 — validateString throws)', async () => {
      const body = validMessageBody();
      delete (body as any).playerName;

      const res = mockResponse();
      await sendMessageHandler(mockRequest({ method: 'POST', body }), res);
      expect(res._status).toBe(500);
    }, 15_000);

    it('rifiuta metodo GET (405)', async () => {
      const res = mockResponse();
      await sendMessageHandler(mockRequest({ method: 'GET' }), res);
      expect(res._status).toBe(405);
    }, 15_000);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // admin-cleanup
  // ═══════════════════════════════════════════════════════════════════════════

  describe('admin-cleanup', () => {
    it('cancella conferme e messaggi con token admin valido', async () => {
      // Setup
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_1 } }), mockResponse());
      await sendMessageHandler(mockRequest({ method: 'POST', body: validMessageBody() }), mockResponse());

      // Cleanup
      const token = await createAdminToken();
      const res = mockResponse();
      await adminCleanupHandler(
        mockRequest({ method: 'POST', headers: { authorization: `Bearer ${token}` } }),
        res
      );

      expect(res._status).toBe(200);
      expect(res._json.ok).toBe(true);
      expect(res._json.deletedMessages).toBeGreaterThanOrEqual(1);
      expect(res._json.deletedConfirmations).toBeGreaterThanOrEqual(1);

      // Verifica che sia effettivamente vuoto
      const stateRes = mockResponse();
      await lobbyStateHandler(mockRequest({ method: 'GET' }), stateRes);
      expect(stateRes._json.count).toBe(0);
      expect(stateRes._json.messages).toEqual([]);
    }, 15_000);

    it('restituisce 0 se non ci sono dati da cancellare', async () => {
      const token = await createAdminToken();
      const res = mockResponse();
      await adminCleanupHandler(
        mockRequest({ method: 'POST', headers: { authorization: `Bearer ${token}` } }),
        res
      );

      expect(res._status).toBe(200);
      expect(res._json.deletedMessages).toBe(0);
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

    it('gestisce CORS preflight senza auth', async () => {
      const res = mockResponse();
      await adminCleanupHandler(mockRequest({ method: 'OPTIONS' }), res);

      expect(res._status).toBe(200);
      expect(res._ended).toBe(true);
    }, 15_000);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // E2E: flusso completo
  // ═══════════════════════════════════════════════════════════════════════════

  describe('E2E: Broadcast → Confirm → Lobby → Chat → Matchmaking → Cleanup', () => {
    it('ciclo lobby completo: broadcast → 4 player confermano → chat → stato corretto → cleanup', async () => {
      // 1. Simula broadcast (crea lobby key come farebbe send-broadcast)
      await redis.set('lobby', JSON.stringify({
        createdAt: new Date().toISOString(),
        notificationsSent: 10,
        active: true
      }), { ex: 5400 });

      // 2. Quattro player confermano disponibilità
      for (const playerId of [PLAYER_1, PLAYER_2, PLAYER_3, PLAYER_4]) {
        const res = mockResponse();
        await confirmHandler(mockRequest({ method: 'POST', body: { playerId } }), res);
        expect(res._status).toBe(200);
      }

      // 3. Verifica stato lobby — 4 conferme con fishName
      const state1 = mockResponse();
      await lobbyStateHandler(mockRequest({ method: 'GET' }), state1);

      expect(state1._json.count).toBe(4);
      expect(state1._json.confirmations).toHaveLength(4);

      const confirmedIds = state1._json.confirmations.map((c: any) => c.playerId);
      expect(confirmedIds).toContain(PLAYER_1);
      expect(confirmedIds).toContain(PLAYER_2);
      expect(confirmedIds).toContain(PLAYER_3);
      expect(confirmedIds).toContain(PLAYER_4);

      for (const conf of state1._json.confirmations) {
        expect(typeof conf.fishName).toBe('string');
      }

      // 4. Player inviano messaggi nella chat lobby
      const chatMessages = [
        { playerId: PLAYER_1, text: 'Arrivo presto!' },
        { playerId: PLAYER_2, text: 'Presente!' },
        { playerId: PLAYER_3, text: 'Oggi vinco io' }
      ];
      for (const { playerId, text } of chatMessages) {
        await sendMessageHandler(
          mockRequest({
            method: 'POST',
            body: {
              playerId, playerName: `Player${playerId}`, fishType: 'Tonno',
              text, sentAt: Date.now(), timestamp: new Date().toISOString()
            }
          }),
          mockResponse()
        );
      }

      // 5. Verifica stato completo (conferme + messaggi)
      const state2 = mockResponse();
      await lobbyStateHandler(mockRequest({ method: 'GET' }), state2);

      expect(state2._json.count).toBe(4);
      expect(state2._json.messageCount).toBe(3);
      expect(state2._json.messages).toHaveLength(3);

      // 6. Admin esegue cleanup (post-matchmaking)
      const token = await createAdminToken();
      const cleanupRes = mockResponse();
      await adminCleanupHandler(
        mockRequest({ method: 'POST', headers: { authorization: `Bearer ${token}` } }),
        cleanupRes
      );

      expect(cleanupRes._status).toBe(200);
      expect(cleanupRes._json.deletedConfirmations).toBe(4);
      expect(cleanupRes._json.deletedMessages).toBe(3);

      // 7. Stato lobby è completamente pulito
      const state3 = mockResponse();
      await lobbyStateHandler(mockRequest({ method: 'GET' }), state3);

      expect(state3._json.count).toBe(0);
      expect(state3._json.messages).toEqual([]);

      // Cleanup lobby key
      await redis.del('lobby');
    }, 30_000);

    it('il ciclo lobby si ripete: cleanup → nuova sessione con player diversi', async () => {
      // ── Prima sessione ──
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_1 } }), mockResponse());

      let state = mockResponse();
      await lobbyStateHandler(mockRequest({ method: 'GET' }), state);
      expect(state._json.count).toBe(1);

      // Cleanup
      const token = await createAdminToken();
      await adminCleanupHandler(
        mockRequest({ method: 'POST', headers: { authorization: `Bearer ${token}` } }),
        mockResponse()
      );

      state = mockResponse();
      await lobbyStateHandler(mockRequest({ method: 'GET' }), state);
      expect(state._json.count).toBe(0);

      // ── Seconda sessione ──
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_3 } }), mockResponse());
      await confirmHandler(mockRequest({ method: 'POST', body: { playerId: PLAYER_4 } }), mockResponse());

      state = mockResponse();
      await lobbyStateHandler(mockRequest({ method: 'GET' }), state);
      expect(state._json.count).toBe(2);

      const ids = state._json.confirmations.map((c: any) => c.playerId);
      expect(ids).toContain(PLAYER_3);
      expect(ids).toContain(PLAYER_4);
      expect(ids).not.toContain(PLAYER_1);
    }, 30_000);

    it('conteggio conferme cresce progressivamente', async () => {
      for (let i = 0; i < 4; i++) {
        const playerId = PLAYER_1 + i;
        const res = mockResponse();
        await confirmHandler(mockRequest({ method: 'POST', body: { playerId } }), res);
        expect(res._json.count).toBe(i + 1);
      }
    }, 30_000);

    it('messaggi multipli appaiono tutti in lobby-state', async () => {
      const messages = [
        { playerId: PLAYER_1, text: 'Primo msg' },
        { playerId: PLAYER_2, text: 'Secondo msg' },
        { playerId: PLAYER_3, text: 'Terzo msg' }
      ];

      for (const msg of messages) {
        await sendMessageHandler(
          mockRequest({ method: 'POST', body: validMessageBody(msg) }),
          mockResponse()
        );
      }

      const res = mockResponse();
      await lobbyStateHandler(mockRequest({ method: 'GET' }), res);

      expect(res._json.messageCount).toBe(3);
      const texts = res._json.messages.map((m: any) => m.text);
      expect(texts).toContain('Primo msg');
      expect(texts).toContain('Secondo msg');
      expect(texts).toContain('Terzo msg');
    }, 15_000);
  });
});
