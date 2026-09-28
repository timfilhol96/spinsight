-- Run once in Supabase → SQL Editor (after 002). Safe to re-run.

-- The regular album's streaming cover, kept even when a special edition uses
-- different artwork, so it can be offered as a manual choice.
alter table public.releases add column if not exists album_artwork_url text;
alter table public.releases add column if not exists album_artwork_thumb text;
-- Anniversary / deluxe / expanded editions (see src/lib/editions.ts).
alter table public.releases add column if not exists is_special_edition boolean not null default false;

-- A cover picked by hand for this copy ("Change cover" in the record panel).
alter table public.collection_items add column if not exists cover_url text;
alter table public.collection_items add column if not exists cover_thumb text;
