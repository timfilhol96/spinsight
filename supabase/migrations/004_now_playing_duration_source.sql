-- Run once in Supabase → SQL Editor (after 003). Safe to re-run.

-- Set when you press "Done" on the now-playing card, or when a new record
-- starts. A play with no end counts as spinning until its runtime has passed.
alter table public.plays add column if not exists ended_at timestamptz;
create index if not exists plays_user_open_idx on public.plays (user_id, played_at desc) where ended_at is null;

-- Where duration_sec came from: 'discogs' (tracklist) or, when Discogs has
-- no track times, 'spotify' / 'itunes' (the digital album's track lengths).
alter table public.releases add column if not exists duration_source text;
