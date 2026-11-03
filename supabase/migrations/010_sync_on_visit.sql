-- Run once in Supabase → SQL Editor (after 009). Safe to re-run.

-- The collection also syncs itself when its owner comes back after a few
-- hours; those runs are logged as 'visit'.
alter table public.sync_runs drop constraint if exists sync_runs_trigger_check;
alter table public.sync_runs add constraint sync_runs_trigger_check
  check (trigger in ('manual', 'cron', 'signup', 'visit'));
