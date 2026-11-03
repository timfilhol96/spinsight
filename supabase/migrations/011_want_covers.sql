-- Run once in Supabase → SQL Editor (after 010). Safe to re-run.

-- The Wants page shows each want's full cover and, since a want is often one
-- particular coloured pressing, its vinyl colour. Filled on the next sync.
alter table public.want_items add column if not exists cover_image text;
alter table public.want_items add column if not exists vinyl_look jsonb;
