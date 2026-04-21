# Migrazione Supabase Realtime — Piano di riferimento

> Stato: **IN PAUSA** (2026-04-21). Il codice è scritto ma le tabelle Supabase non esistono ancora.
> Il sistema è attualmente su Redis + `@upstash/realtime` SSE (stato funzionante).

## Motivazione

Il progetto usa già Supabase per `playersShark`, `matchesShark`, `runningMatch`, `cache-control`.
Il layer Upstash Redis + `@upstash/realtime` SSE gestisce solo lobby state, availability, messaggi e realtime.

**Perché migrare:**
- Un solo SDK frontend (`supabase-js`) per dati + realtime: WebSocket nativo, nessun SSE custom
- `RealtimeClient` (~700 righe) e `api/realtime.ts` / `api/_realtime.ts` vengono eliminati
- I Redis key-type bugs spariscono per costruzione
- TTL della lobby diventa colonna `expires_at` — debuggabile, backuppabile
- Supabase Broadcast più stabile degli SSE su Vercel Hobby (no Fluid Compute timeout)

---

## Architettura target

### Tabelle da creare

```sql
create table lobbies (
  id                   integer primary key default 1,
  created_at           timestamptz not null default now(),
  expires_at           timestamptz not null,
  notifications_sent   integer not null default 0,
  match                jsonb,
  active               boolean not null default true
);

create table confirmations (
  player_id    integer primary key,
  confirmed_at timestamptz not null default now()
);

create table messages (
  id          uuid primary key default gen_random_uuid(),
  player_id   integer not null,
  player_name text not null,
  fish_name   text,
  fish_type   text,
  text        text not null,
  sent_at     bigint,
  timestamp   text,
  created_at  timestamptz not null default now()
);
```

Il file SQL completo è in `supabase/migrations/20260421_lobby_tables.sql`.

### Canale Realtime

```
channel: 'lobby'
events: lobby.created | lobby.expired | lobby.confirmation_add | lobby.confirmation_remove | lobby.message
```

Frontend (anon key):
```typescript
supabase.channel('lobby')
  .on('broadcast', { event: '*' }, handler)
  .subscribe();
```

Server (service role, via `api/_supabaseClient.ts`):
```typescript
await supabaseAdmin.channel('lobby').send({ type: 'broadcast', event, payload });
```

---

## File già scritti (in branch `refactor/notify-and-multi-db`, ripristinati in pausa)

| File | Stato |
|------|-------|
| `api/_supabaseClient.ts` | ✅ Pronto (nuovo file, non toccato dal rollback) |
| `api/lobby.ts` | Riscritto per Supabase — da ri-applicare |
| `api/send-broadcast.ts` | Riscritto per Supabase — da ri-applicare |
| `api/confirm-availability.ts` | Riscritto per Supabase — da ri-applicare |
| `api/send-message.ts` | Riscritto per Supabase — da ri-applicare |
| `api/admin-cleanup.ts` | Riscritto per Supabase — da ri-applicare |
| `src/app/pages/matchmaking.page.ts` | Migrato a `supabase.channel('lobby')` — da ri-applicare |
| `api/realtime.ts` | Da eliminare |
| `api/_realtime.ts` | Da eliminare |
| `src/services/realtime-client.ts` | Da eliminare |
| `src/models/lobby.interface.ts` | Aggiunto `ILobbyState`, `IConfirmationWithFish` — da ri-applicare |

---

## Checklist per completare la migrazione

### 1. Fix env var in `api/_supabaseClient.ts`

Il file usa `process.env.SUPABASE_SERVICE_ROLE_KEY` ma `.env.local` ha `VITE_SUPABASE_SERVICE_ROLE_KEY`.
Fix: aggiungere fallback:
```typescript
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;
```

### 2. Crea tabelle Supabase (via MCP)

```typescript
// mcp__supabase__apply_migration con il contenuto di:
// supabase/migrations/20260421_lobby_tables.sql
```

### 3. Abilita Realtime publication (via MCP)

```sql
alter publication supabase_realtime add table lobbies;
alter publication supabase_realtime add table confirmations;
alter publication supabase_realtime add table messages;
```

### 4. Aggiungi env var a Vercel (via Vercel MCP)

Aggiungere `SUPABASE_SERVICE_ROLE_KEY` alle env vars del progetto Vercel.
**NON** usare prefisso `VITE_` su Vercel (il valore verrebbe embeddato nel bundle).

### 5. Ri-applica le modifiche al codice

Tutti i file riscritti sono nella git history di questa branch.
Recuperarli con `git show <commit>:<file>` o ri-applicando i diff.

### 6. Cleanup finale

```bash
npm uninstall @upstash/realtime
# Valutare se rimuovere anche @upstash/redis dopo test completo
```
Eliminare: `api/realtime.ts`, `api/_realtime.ts`, `src/services/realtime-client.ts`

---

## RLS policies

```sql
-- Lettura pubblica
create policy "read lobbies"       on lobbies       for select using (true);
create policy "read confirmations" on confirmations for select using (true);
create policy "read messages"      on messages      for select using (true);

-- Write solo autenticati
create policy "write confirmations" on confirmations for all    using (auth.role() = 'authenticated');
create policy "write messages"      on messages      for insert using (auth.role() = 'authenticated');
-- lobbies: solo service role (bypassa RLS) — nessuna policy insert/delete per authenticated
```

---

## Verifica end-to-end post-migrazione

1. `npx vercel dev` — nessun crash
2. `GET /api/lobby` — risponde con dati da Supabase (non Redis)
3. Frontend lobby — conferme e messaggi in real-time via WebSocket
4. Admin broadcast — crea riga in `lobbies`, emette `lobby.created` Broadcast
5. TTL scaduto — `active = false`
