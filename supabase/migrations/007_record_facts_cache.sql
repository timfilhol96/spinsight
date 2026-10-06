-- Run once in Supabase → SQL Editor (after 006). Safe to re-run.

-- What MusicBrainz and Wikidata know about a record, cached for 14 days so
-- every server instance shares one lookup (MusicBrainz allows a request a
-- second). Keyed by Discogs master ("master:21491") so every pressing of an
-- album shares a row, or by release ("release:4950798") without a master.
-- Not per user: these are public facts about the record.
create table if not exists public.record_facts_cache (
  discogs_key text primary key check (discogs_key ~ '^(master|release):[0-9]+$'),
  mbid text,                       -- MusicBrainz release group
  wikidata_qid text,               -- "Q202996"
  enwiki_title text,
  frwiki_title text,
  external_praise jsonb not null default '{}'::jsonb, -- { awards, musicbrainzRating }
  fetched_at timestamptz not null default now()
);

alter table public.record_facts_cache enable row level security;
