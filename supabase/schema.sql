-- Spinsight schema. Paste into Supabase → SQL Editor → Run.
-- Safe to re-run: every statement is idempotent.
--
-- Access model: RLS is enabled on every table with NO policies, so the public
-- (anon/publishable) key can read nothing. The app only talks to the database
-- from server functions using the secret key, and checks the session itself.

create extension if not exists pgcrypto;

-- One row per person who signed in with Discogs.
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  discogs_id bigint not null unique,
  discogs_username text not null unique,
  display_name text,
  avatar_url text,
  -- Discogs OAuth access token. These don't expire; never sent to the browser.
  oauth_token text not null,
  oauth_token_secret text not null,
  is_public boolean not null default true,
  preferred_currency text,                -- ISO code for displaying values/prices
  collection_value jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

-- Discogs release metadata, shared between users who own the same pressing.
create table if not exists public.releases (
  id bigint primary key,                  -- Discogs release id
  master_id bigint,
  title text not null,
  artist_display text not null,
  artists jsonb not null default '[]',    -- [{id, name, anv, join}]
  year int,
  genres text[] not null default '{}',
  styles text[] not null default '{}',
  labels jsonb not null default '[]',     -- [{id, name, catno}]
  formats jsonb not null default '[]',    -- raw Discogs formats
  vinyl_look jsonb,                       -- parsed colour variant, see src/lib/vinyl-color.ts
  cover_image text,
  thumb text,
  -- Filled by enrichment (one /releases/{id} call each):
  country text,
  released text,
  community_have int,
  community_want int,
  community_rating numeric(3, 2),
  lowest_price numeric(10, 2),
  num_for_sale int,
  tracklist jsonb,
  duration_sec int,
  original_year int,                      -- year of the Discogs master (first release)
  price_currency text,                    -- currency of lowest_price (USD)
  artwork_url text,                       -- clean cover from Spotify/Apple, if found
  artwork_thumb text,
  artwork_source text,
  artwork_checked_at timestamptz,
  album_artwork_url text,                 -- the regular album's cover (differs for editions)
  album_artwork_thumb text,
  is_special_edition boolean not null default false,
  details_version int not null default 0, -- see DETAILS_VERSION in sync.server.ts
  enriched_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Spotify lookups per Discogs artist, cached so each artist is searched once.
create table if not exists public.artists (
  discogs_id bigint primary key,
  name text not null,
  spotify_id text,
  spotify_genres text[] not null default '{}',
  image_url text,
  popularity int,
  looked_up_at timestamptz not null default now()
);

-- A copy of a release in someone's collection (Discogs "instance").
create table if not exists public.collection_items (
  instance_id bigint primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  release_id bigint not null references public.releases (id),
  folder_id bigint,
  rating smallint,
  date_added timestamptz,
  cover_url text,                         -- cover chosen by hand for this copy
  cover_thumb text,
  created_at timestamptz not null default now()
);
create index if not exists collection_items_user_idx on public.collection_items (user_id);
create index if not exists collection_items_release_idx on public.collection_items (release_id);

-- "I'm playing this" log. Powers most-played / dust-collector stats and keeps
-- the picker from repeating itself.
create table if not exists public.plays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  release_id bigint not null references public.releases (id),
  played_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('manual', 'picker')),
  context jsonb
);
create index if not exists plays_user_played_idx on public.plays (user_id, played_at desc);

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  trigger text not null default 'manual' check (trigger in ('manual', 'cron', 'signup')),
  status text not null default 'running' check (status in ('running', 'ok', 'error')),
  items_total int,
  items_added int,
  items_removed int,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists sync_runs_user_idx on public.sync_runs (user_id, started_at desc);

alter table public.users enable row level security;
alter table public.releases enable row level security;
alter table public.artists enable row level security;
alter table public.collection_items enable row level security;
alter table public.plays enable row level security;
alter table public.sync_runs enable row level security;
