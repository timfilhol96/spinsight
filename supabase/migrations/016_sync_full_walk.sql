-- Run once in Supabase → SQL Editor (after 015). Safe to re-run.

-- Syncs stop early once they reach records already mirrored, so a run only
-- sees every record (and so can catch rating or folder changes on old ones)
-- when it walks the whole collection. This marks those runs; a full walk is
-- forced when the last one is over a week old. Older runs count as partial,
-- so everyone's next sync walks everything.
alter table public.sync_runs add column if not exists full_walk boolean not null default false;
