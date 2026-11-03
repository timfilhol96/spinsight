-- Run once in Supabase → SQL Editor (after 012). Safe to re-run.

-- Wants get clean album artwork (Spotify / iTunes) like collection records,
-- instead of Discogs photos. The artists and formats, filled on the next
-- sync, are what the artwork search and the special-edition check need.
alter table public.want_items add column if not exists artists jsonb;
alter table public.want_items add column if not exists formats jsonb;
alter table public.want_items add column if not exists artwork_url text;
alter table public.want_items add column if not exists artwork_thumb text;
alter table public.want_items add column if not exists artwork_checked_at timestamptz;
