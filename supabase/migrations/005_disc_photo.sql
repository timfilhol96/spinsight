-- Run once in Supabase → SQL Editor (after 004). Safe to re-run.

-- A real photo used as this copy's disc: the Discogs image URL plus the
-- circle the owner drew on it ({url, cx, cy, r, w, h}; see DiscPhoto in
-- src/lib/vinyl-color.ts), and colours sampled from inside that circle,
-- which drive the app's tint for this record.
alter table public.collection_items add column if not exists disc_photo jsonb;
alter table public.collection_items add column if not exists disc_colors text[];
