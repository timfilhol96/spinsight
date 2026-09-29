-- Run once in Supabase → SQL Editor (after 005). Safe to re-run.

-- Following, like Spotify: one-way, no requests to accept. You can follow a
-- Discogs username that isn't on Spinsight yet; the row stays pending
-- (followee_id null) until they sign in, then it's linked to their account.
create table if not exists public.follows (
  follower_id uuid not null references public.users (id) on delete cascade,
  followee_username text not null,
  followee_id uuid references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists follows_pair_idx
  on public.follows (follower_id, lower(followee_username));
create index if not exists follows_followee_idx on public.follows (followee_id);
create index if not exists follows_pending_idx
  on public.follows (lower(followee_username)) where followee_id is null;

-- Keep the collection public but what you're spinning to yourself.
alter table public.users add column if not exists share_listening boolean not null default true;

-- One emoji per person per spin, shown on the spinner's now-playing dock.
create table if not exists public.play_reactions (
  play_id uuid not null references public.plays (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (play_id, user_id)
);

-- Mirror of each user's Discogs wantlist, refreshed with every sync. Kept
-- apart from `releases` so wanted records don't count as owned anywhere.
create table if not exists public.want_items (
  user_id uuid not null references public.users (id) on delete cascade,
  release_id bigint not null,
  master_id bigint,
  title text not null,
  artist_display text not null,
  year int,
  thumb text,
  date_added timestamptz,
  primary key (user_id, release_id)
);
create index if not exists want_items_master_idx on public.want_items (master_id);

alter table public.follows enable row level security;
alter table public.play_reactions enable row level security;
alter table public.want_items enable row level security;
