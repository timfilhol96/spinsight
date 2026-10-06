-- Run once in Supabase → SQL Editor (after 007). Safe to re-run.

-- The listening room shows an album's Wikipedia article in the album's own
-- language first (from Wikidata's "language of work"), then English.
alter table public.record_facts_cache add column if not exists original_lang text;  -- "fr"
alter table public.record_facts_cache add column if not exists original_title text;

-- Rows cached before this migration don't know the album's language, so the
-- cache starts over. It's only a cache: each record is looked up again the
-- next time it's opened (re-running this just empties it again).
delete from public.record_facts_cache;
