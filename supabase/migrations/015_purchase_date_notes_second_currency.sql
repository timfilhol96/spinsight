-- Run once in Supabase → SQL Editor (after 014). Safe to re-run.

-- When the owner actually bought a copy. Discogs only knows when it was added
-- there, which for a collection imported in one go is the same day for every
-- record. When set, it stands in for the Discogs date everywhere dates are
-- used (growth chart, on this day, year in vinyl).
alter table public.collection_items add column if not exists purchased_on date;

-- The owner's own notes on a copy (a gift, where it was found…). Only ever
-- shown to the owner. Kept on Spinsight, not in Discogs' notes field.
alter table public.collection_items add column if not exists notes text
  check (char_length(notes) <= 2000);

-- A second currency shown in small type beside amounts, e.g. THB next to USD.
alter table public.users add column if not exists secondary_currency text;
