-- Run once in Supabase → SQL Editor (after 011). Safe to re-run.

-- What the owner paid for a copy, typed in on Spinsight (Discogs has no field
-- for it). Only ever shown to the owner. Kept in the currency it was paid in.
alter table public.collection_items add column if not exists price_paid numeric(10, 2)
  check (price_paid >= 0);
alter table public.collection_items add column if not exists price_paid_currency text;
