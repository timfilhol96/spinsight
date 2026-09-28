-- Run once in Supabase → SQL Editor (after schema.sql). Safe to re-run.

-- Clean album artwork from Spotify / Apple instead of Discogs photos.
alter table public.releases add column if not exists artwork_url text;
alter table public.releases add column if not exists artwork_thumb text;
alter table public.releases add column if not exists artwork_source text;
alter table public.releases add column if not exists artwork_checked_at timestamptz;

-- Year the music first came out (Discogs master release), vs this pressing's year.
alter table public.releases add column if not exists original_year int;

-- Bumped in code when enrichment gains new fields, so old rows get refreshed.
alter table public.releases add column if not exists details_version int not null default 0;
-- Currency of lowest_price (we now always request USD and convert for display).
alter table public.releases add column if not exists price_currency text;

-- Display currency for values and prices (ISO code, e.g. 'SGD'). Null = as Discogs reports.
alter table public.users add column if not exists preferred_currency text;
