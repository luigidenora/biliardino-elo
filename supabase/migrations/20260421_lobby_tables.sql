-- Migration: Lobby tables for Supabase Realtime migration
-- Replaces: Upstash Redis keys lobby_state, availability, messages

-- ── lobbies ──────────────────────────────────────────────────────
-- Sostituisce Redis key lobby_state (JSON con TTL)
create table if not exists lobbies (
  id                   integer primary key default 1,
  created_at           timestamptz not null default now(),
  expires_at           timestamptz not null,
  notifications_sent   integer not null default 0,
  match                jsonb,
  active               boolean not null default true
);

-- ── confirmations ─────────────────────────────────────────────────
-- Sostituisce Redis hash availability
create table if not exists confirmations (
  player_id    integer primary key,
  confirmed_at timestamptz not null default now()
);

-- ── messages ──────────────────────────────────────────────────────
-- Sostituisce Redis list messages + hash message:<id>
create table if not exists messages (
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

-- ── RLS ───────────────────────────────────────────────────────────
alter table lobbies       enable row level security;
alter table confirmations enable row level security;
alter table messages      enable row level security;

-- Read pubblica (classifiche e lobby visibili senza autenticazione)
create policy "read lobbies"       on lobbies       for select using (true);
create policy "read confirmations" on confirmations for select using (true);
create policy "read messages"      on messages      for select using (true);

-- Write solo per autenticati (da frontend loggato)
create policy "write confirmations" on confirmations for all    using (auth.role() = 'authenticated');
create policy "write messages"      on messages      for insert using (auth.role() = 'authenticated');

-- Lobby write: solo via service role (API Vercel) — nessuna policy INSERT/DELETE per authenticated
-- Il service role bypassa RLS per design

-- ── Realtime ──────────────────────────────────────────────────────
-- Abilitare nelle impostazioni Supabase Dashboard → Database → Replication
-- oppure via SQL:
-- alter publication supabase_realtime add table lobbies;
-- alter publication supabase_realtime add table confirmations;
-- alter publication supabase_realtime add table messages;
