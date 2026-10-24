-- Run once in Supabase → SQL Editor (after 008). Safe to re-run.

-- A record's finished liner notes (credits, Wikipedia story, Last.fm and
-- setlist.fm figures…), kept so the listening room opens from one database
-- read instead of a dozen slow lookups. Shown at once for 30 days, refreshed
-- in the background once a day old. Public facts, so shared by every user.
create table if not exists public.liner_notes_cache (
  release_id bigint primary key,   -- Discogs release
  notes jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.liner_notes_cache enable row level security;
