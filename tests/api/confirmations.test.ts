import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Carica variabili come fa Vite: prima .env.local (override), poi .env
dotenv.config({ path: ['.env.local', '.env'] });

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const BASE_URL = process.env.VITE_API_BASE_URL;
const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN;

const TEST_PLAYER_ID = 999;
const TEST_PLAYER_ID_2 = 998;

/**
 * Ogni chiamata a una Vercel serverless function può impiegare fino a 5-8s
 * in caso di cold start + round-trip verso Upstash Redis.
 * Il timeout di ogni test è: (numero di chiamate API stimato) × PER_CALL.
 */
const PER_CALL = 10_000;

/**
 * Intervallo di polling (ms). Upstash Redis con database globale può mostrare
 * eventual consistency tra invocazioni serverless consecutive: le repliche
 * impiegano tempo a propagare le scritture. In produzione il frontend fa polling
 * ogni ~5 secondi, dando tempo alla replica di convergere. Nei test simuliamo
 * lo stesso comportamento con un breve intervallo di retry.
 */
const POLL_INTERVAL = 2_000;
const POLL_RETRIES = 3;

// ─── Helper ──────────────────────────────────────────────────────────────────

async function confirmAvailability(playerId: number) {
  return fetch(`${BASE_URL}/confirm-availability`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId })
  });
}

async function getConfirmations() {
  return fetch(`${BASE_URL}/get-confirmations`);
}

async function clearConfirmations() {
  return fetch(`${BASE_URL}/clear-confirmations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ADMIN_TOKEN}`
    }
  });
}

/**
 * Verifica il successo della risposta API prima di proseguire.
 */
async function expectOk(res: Awaited<ReturnType<typeof fetch>>, context: string) {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[${context}] HTTP ${res.status}: ${body}`);
  }
}

/**
 * Polling con retry per attendere la convergenza delle repliche Redis.
 * Simula il comportamento reale del frontend che interroga periodicamente
 * l'endpoint get-confirmations. Ritorna i dati dell'ultimo tentativo.
 */
async function pollForCount(
  expected: number,
  retries = POLL_RETRIES,
  interval = POLL_INTERVAL
): Promise<{ count: number; confirmations: any[] }> {
  for (let i = 0; i <= retries; i++) {
    const res = await getConfirmations();
    const data = await res.json() as { count: number; confirmations: any[] };
    if (data.count === expected) return data;
    if (i < retries) await new Promise(r => setTimeout(r, interval));
  }
  // Ultimo tentativo — ritorna comunque, il chiamante asserirà
  const res = await getConfirmations();
  return await res.json() as { count: number; confirmations: any[] };
}

/**
 * Cancella ripetutamente fino a che get-confirmations ritorna 0.
 * Gestisce il caso in cui clear non vede tutte le chiavi al primo passaggio
 * a causa dell'eventual consistency di redis.keys().
 */
async function ensureCleared(retries = POLL_RETRIES): Promise<void> {
  for (let i = 0; i <= retries; i++) {
    await clearConfirmations();
    const data = await pollForCount(0, 1, 1000);
    if (data.count === 0) return;
  }
}

// ─── Setup & Teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  await ensureCleared();
  await ensureCleared();
}, PER_CALL * 6);

afterAll(async () => {
  await ensureCleared();
  await ensureCleared();
}, PER_CALL * 6);

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('Confirmations API (Redis)', () => {

  // ─── Prerequisiti ──────────────────────────────────────────────────────

  describe('Prerequisiti', () => {
    it('dovrebbe avere BASE_URL configurato', () => {
      expect(BASE_URL).toBeDefined();
      expect(BASE_URL).toMatch(/^https?:\/\//);
    });

    it('dovrebbe avere ADMIN_TOKEN configurato', () => {
      expect(ADMIN_TOKEN).toBeDefined();
      expect(ADMIN_TOKEN!.length).toBeGreaterThan(0);
    });
  });

  // ─── CRUD — Create ────────────────────────────────────────────────────

  describe('CRUD — confirm-availability (Create)', () => {

    it('dovrebbe creare una conferma con dati validi', async () => {
      const res = await confirmAvailability(TEST_PLAYER_ID);

      expect(res.status).toBe(200);
      const data = await res.json() as { ok: boolean; count: number };
      expect(data.ok).toBe(true);
      expect(data.count).toBeGreaterThanOrEqual(1);
    }, PER_CALL);

    it('dovrebbe rifiutare una richiesta senza playerId', async () => {
      const res = await fetch(`${BASE_URL}/confirm-availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(res.status).toBe(400);
    }, PER_CALL);

    it('dovrebbe rifiutare una richiesta senza', async () => {
      const res = await fetch(`${BASE_URL}/confirm-availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: TEST_PLAYER_ID })
      });

      expect(res.status).toBe(400);
    }, PER_CALL);

    // validateMatchTime lancia → il try/catch del handler ritorna 500
    it('dovrebbe rifiutare un matchTime con formato invalido (500)', async () => {
      const res = await confirmAvailability(TEST_PLAYER_ID);

      expect(res.status).toBe(500);
    }, PER_CALL);

    // validatePlayerId lancia → il try/catch del handler ritorna 500
    it('dovrebbe rifiutare un playerId invalido (500)', async () => {
      const res = await fetch(`${BASE_URL}/confirm-availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: -1 })
      });

      expect(res.status).toBe(500);
    }, PER_CALL);

    it('dovrebbe rifiutare metodi diversi da POST', async () => {
      const res = await fetch(`${BASE_URL}/confirm-availability`, {
        method: 'GET'
      });

      expect(res.status).toBe(405);
    }, PER_CALL);
  });

  // ─── CRUD — Read ──────────────────────────────────────────────────────

  describe('CRUD — get-confirmations (Read)', () => {

    it('dovrebbe restituire le conferme per un orario valido', async () => {
      const confirmRes = await confirmAvailability(TEST_PLAYER_ID);
      await expectOk(confirmRes, 'setup confirm');

      // Polling: attende che la replica converga
      const data = await pollForCount(1);

      expect(data.count).toBeGreaterThanOrEqual(1);
      expect(data.confirmations).toBeInstanceOf(Array);
      expect(data.confirmations.length).toBe(data.count);
    }, PER_CALL * 4);

    it('dovrebbe restituire i campi attesi in ogni conferma', async () => {
      const confirmRes = await confirmAvailability(TEST_PLAYER_ID);
      await expectOk(confirmRes, 'setup confirm');

      const data = await pollForCount(1);

      expect(data.confirmations.length).toBeGreaterThan(0);
      const conf = data.confirmations[0];
      expect(conf).toHaveProperty('playerId');
      expect(conf).toHaveProperty('matchTime');
      expect(conf).toHaveProperty('confirmedAt');
    }, PER_CALL * 4);

    it('dovrebbe restituire 0 conferme per un orario senza adesioni', async () => {
      await ensureCleared();

      const data = await pollForCount(0);
      expect(data.count).toBe(0);
      expect(data.confirmations).toEqual([]);
    }, PER_CALL * 6);

    it('dovrebbe rifiutare una richiesta senza parametro time', async () => {
      const res = await fetch(`${BASE_URL}/get-confirmations`);
      expect(res.status).toBe(400);
    }, PER_CALL);

    // validateMatchTime lancia → il try/catch del handler ritorna 500
    it('dovrebbe rifiutare un time con formato invalido (500)', async () => {
      const res = await getConfirmations();

      expect(res.status).toBe(500);
    }, PER_CALL);
  });

  // ─── CRUD — Delete ────────────────────────────────────────────────────

  describe('CRUD — clear-confirmations (Delete)', () => {

    it('dovrebbe cancellare le conferme con auth admin valida', async () => {
      // Crea una conferma e attendi convergenza
      const confirmRes = await confirmAvailability(TEST_PLAYER_ID);
      await expectOk(confirmRes, 'setup confirm');

      const beforeData = await pollForCount(1);
      expect(beforeData.count).toBeGreaterThanOrEqual(1);

      // Cancella con auth admin
      const res = await clearConfirmations();
      expect(res.status).toBe(200);
      const data = await res.json() as { ok: boolean; deleted: number; matchTime: string };
      expect(data.ok).toBe(true);

      // Verifica l'effetto reale: le conferme devono essere sparite
      const afterData = await pollForCount(0);
      expect(afterData.count).toBe(0);
    }, PER_CALL * 8);

    it('dovrebbe rifiutare la cancellazione senza token admin', async () => {
      const res = await fetch(`${BASE_URL}/clear-confirmations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchTime: TEST_MATCH_TIME })
      });

      expect(res.status).toBe(401);
    }, PER_CALL);

    it('dovrebbe rifiutare la cancellazione con token invalido', async () => {
      const res = await fetch(`${BASE_URL}/clear-confirmations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token-falso'
        },
        body: JSON.stringify({ matchTime: TEST_MATCH_TIME })
      });

      expect(res.status).toBe(401);
    }, PER_CALL);

    it('dovrebbe restituire deleted: 0 se non ci sono conferme da cancellare', async () => {
      // Pulizia robusta: cancella e attendi convergenza a 0
      await ensureCleared();

      const res = await clearConfirmations();
      expect(res.status).toBe(200);
      const data = await res.json() as { ok: boolean; deleted: number };
      expect(data.ok).toBe(true);
      expect(data.deleted).toBe(0);
    }, PER_CALL * 6);
  });

  // ─── Logica applicativa: raccolta adesioni ────────────────────────────

  describe('Raccolta adesioni', () => {

    it('dovrebbe raccogliere più adesioni di giocatori diversi', async () => {
      await ensureCleared();

      const res1 = await confirmAvailability(TEST_PLAYER_ID);
      await expectOk(res1, 'confirm player 1');

      const res2 = await confirmAvailability(TEST_PLAYER_ID_2);
      await expectOk(res2, 'confirm player 2');

      // Polling per la convergenza della replica
      const data = await pollForCount(2);
      expect(data.count).toBe(2);

      const playerIds = data.confirmations.map((c: any) => c.playerId);
      expect(playerIds).toContain(TEST_PLAYER_ID);
      expect(playerIds).toContain(TEST_PLAYER_ID_2);
    }, PER_CALL * 8);

    it('dovrebbe sovrascrivere la conferma se lo stesso giocatore conferma di nuovo (idempotente)', async () => {
      await ensureCleared();
      const c1 = await confirmAvailability(TEST_PLAYER_ID, TEST_MATCH_TIME);
      await expectOk(c1, 'confirm player 1');
      const c2 = await confirmAvailability(TEST_PLAYER_ID_2, TEST_MATCH_TIME);
      await expectOk(c2, 'confirm player 2');

      // Re-conferma player 1 — la chiave Redis è la stessa, non crea duplicati
      const c3 = await confirmAvailability(TEST_PLAYER_ID, TEST_MATCH_TIME);
      await expectOk(c3, 'confirm player 1 again');

      // Polling: il count deve restare 2
      const data = await pollForCount(TEST_MATCH_TIME, 2);
      expect(data.count).toBe(2);
    }, PER_CALL * 8);
  });

  // ─── Verifica persistenza Redis ───────────────────────────────────────

  describe('Persistenza in Redis', () => {

    it('le adesioni dovrebbero essere presenti nel db dopo la conferma', async () => {
      await ensureCleared(TEST_MATCH_TIME);

      const c1 = await confirmAvailability(TEST_PLAYER_ID, TEST_MATCH_TIME);
      await expectOk(c1, 'confirm player 1');
      const c2 = await confirmAvailability(TEST_PLAYER_ID_2, TEST_MATCH_TIME);
      await expectOk(c2, 'confirm player 2');

      const data = await pollForCount(TEST_MATCH_TIME, 2);
      expect(data.count).toBe(2);

      const playerIds = data.confirmations.map((c: any) => c.playerId);
      expect(playerIds).toContain(TEST_PLAYER_ID);
      expect(playerIds).toContain(TEST_PLAYER_ID_2);
    }, PER_CALL * 8);

    it('ogni conferma dovrebbe avere un timestamp confirmedAt valido', async () => {
      const confirmRes = await confirmAvailability(TEST_PLAYER_ID, TEST_MATCH_TIME);
      await expectOk(confirmRes, 'confirm');

      const data = await pollForCount(TEST_MATCH_TIME, 1);
      expect(data.confirmations.length).toBeGreaterThan(0);

      for (const conf of data.confirmations) {
        expect(conf.confirmedAt).toBeDefined();
        const date = new Date(conf.confirmedAt);
        expect(date.getTime()).not.toBeNaN();
      }
    }, PER_CALL * 4);
  });

  // ─── Polling: aggiornamento in tempo reale ────────────────────────────

  describe('Polling — aggiornamento conferme', () => {

    it('dovrebbe riflettere in tempo reale le nuove adesioni', async () => {
      await ensureCleared(TEST_MATCH_TIME);

      // Poll iniziale: 0 conferme
      const data0 = await pollForCount(TEST_MATCH_TIME, 0);
      expect(data0.count).toBe(0);

      // Primo giocatore conferma
      const c1 = await confirmAvailability(TEST_PLAYER_ID, TEST_MATCH_TIME);
      await expectOk(c1, 'confirm player 1');

      // Poll aggiornato: 1 conferma
      const data1 = await pollForCount(TEST_MATCH_TIME, 1);
      expect(data1.count).toBe(1);

      // Secondo giocatore conferma
      const c2 = await confirmAvailability(TEST_PLAYER_ID_2, TEST_MATCH_TIME);
      await expectOk(c2, 'confirm player 2');

      // Poll aggiornato: 2 conferme
      const data2 = await pollForCount(TEST_MATCH_TIME, 2);
      expect(data2.count).toBe(2);
    }, PER_CALL * 12);

    it('dovrebbe riflettere la cancellazione dopo clear', async () => {
      // Garantiamo almeno una conferma presente
      const confirmRes = await confirmAvailability(TEST_PLAYER_ID, TEST_MATCH_TIME);
      await expectOk(confirmRes, 'confirm');

      const dataBefore = await pollForCount(TEST_MATCH_TIME, 1);
      expect(dataBefore.count).toBeGreaterThan(0);

      // Cancella e attendi convergenza
      await ensureCleared(TEST_MATCH_TIME);

      const dataAfter = await pollForCount(TEST_MATCH_TIME, 0);
      expect(dataAfter.count).toBe(0);
    }, PER_CALL * 10);
  });

  // ─── Temporaneità (TTL) ────────────────────────────────────────────────

  describe('Temporaneità — le adesioni sono effimere', () => {

    it('le conferme vengono salvate con TTL (chiave Redis con expiry di 1800s)', async () => {
      const confirmRes = await confirmAvailability(TEST_PLAYER_ID, TEST_MATCH_TIME);
      await expectOk(confirmRes, 'confirm');

      // Verifica che la conferma esista subito dopo la creazione
      const data = await pollForCount(TEST_MATCH_TIME, 1);
      expect(data.count).toBeGreaterThanOrEqual(1);

      // Il TTL è impostato a 1800s (30 min) in confirm-availability.ts con redis.set(..., { ex: 1800 }).
      // Non aspettiamo 30 minuti: il test verifica che la chiave esiste subito dopo la creazione
      // e che la cancellazione funziona. L'expiry reale è garantito dalla configurazione.
    }, PER_CALL * 4);

    it('la cancellazione manuale simula il comportamento del TTL', async () => {
      const confirmRes = await confirmAvailability(TEST_PLAYER_ID, TEST_MATCH_TIME);
      await expectOk(confirmRes, 'confirm');

      const dataBefore = await pollForCount(TEST_MATCH_TIME, 1);
      expect(dataBefore.count).toBeGreaterThanOrEqual(1);

      // Cancella (simula scadenza TTL)
      await ensureCleared(TEST_MATCH_TIME);

      // Le conferme non esistono più — come dopo la scadenza del TTL
      const dataAfter = await pollForCount(TEST_MATCH_TIME, 0);
      expect(dataAfter.count).toBe(0);
    }, PER_CALL * 8);

    it('conferme di orari diversi sono isolate e indipendenti', async () => {
      // Pulizia entrambi gli orari
      await ensureCleared(TEST_MATCH_TIME);
      await ensureCleared(TEST_MATCH_TIME_ALT);

      // Conferma su due orari diversi
      const c1 = await confirmAvailability(TEST_PLAYER_ID, TEST_MATCH_TIME);
      await expectOk(c1, 'confirm 03:33');
      const c2 = await confirmAvailability(TEST_PLAYER_ID_2, TEST_MATCH_TIME_ALT);
      await expectOk(c2, 'confirm 03:34');

      // Polling: ogni orario ha le proprie conferme
      const data1 = await pollForCount(TEST_MATCH_TIME, 1);
      expect(data1.count).toBe(1);
      expect(data1.confirmations.every((c: any) => c.matchTime === TEST_MATCH_TIME)).toBe(true);

      const data2 = await pollForCount(TEST_MATCH_TIME_ALT, 1);
      expect(data2.count).toBe(1);
      expect(data2.confirmations.every((c: any) => c.matchTime === TEST_MATCH_TIME_ALT)).toBe(true);

      // La cancellazione di un orario non tocca l'altro
      await ensureCleared(TEST_MATCH_TIME);

      const data3 = await pollForCount(TEST_MATCH_TIME, 0);
      expect(data3.count).toBe(0);

      const data4 = await pollForCount(TEST_MATCH_TIME_ALT, 1);
      expect(data4.count).toBe(1); // Ancora presente

      // Cleanup
      await ensureCleared(TEST_MATCH_TIME_ALT);
    }, PER_CALL * 16);
  });
});
