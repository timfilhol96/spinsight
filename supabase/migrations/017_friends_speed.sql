-- Run once in Supabase → SQL Editor (after 016). Safe to re-run.

-- The Friends tab used to pull every friend's last 30 days of plays, their
-- whole collections and your whole wantlist into the server and work it out
-- there, with one count query per friend. These functions do that work in
-- the database, so the tab costs about the same with 5 friends or 500.
--
-- Like the tables, they're only for the server (secret key): execute is
-- revoked from the public roles below.

-- ---- indexes ----

-- A friend's copy of a record, your copy of it, and who owns your wants.
create index if not exists collection_items_user_release_idx
  on public.collection_items (user_id, release_id);
-- "New in their crates": each friend's newest additions.
create index if not exists collection_items_user_added_idx
  on public.collection_items (user_id, date_added desc);
-- Other pressings of the same album.
create index if not exists releases_master_idx
  on public.releases (master_id) where master_id is not null;
-- "Dusted off": had this record been spun before this week?
create index if not exists plays_user_release_idx
  on public.plays (user_id, release_id, played_at);

-- ---- now spinning and last spin ----

-- Each user's newest few plays since p_since (the newest is "now playing"
-- while it's on, the newest finished one is "last spin"), with the record,
-- that user's copy of it (hand-picked cover, disc photo) and the viewer's
-- copy of the same release or another pressing of the album.
create or replace function public.friends_feed_plays(
  p_viewer uuid,
  p_user_ids uuid[],
  p_since timestamptz,
  p_per_user int default 4
)
returns table (
  id uuid,
  user_id uuid,
  release_id bigint,
  played_at timestamptz,
  ended_at timestamptz,
  context jsonb,
  release jsonb,
  copy jsonb,
  your_copy jsonb
)
language sql
stable
set search_path = ''
as $$
  select
    p.id, p.user_id, p.release_id, p.played_at, p.ended_at, p.context,
    jsonb_build_object(
      'id', r.id,
      'master_id', r.master_id,
      'title', r.title,
      'artist_display', r.artist_display,
      'formats', r.formats,
      'cover_image', r.cover_image,
      'thumb', r.thumb,
      'artwork_url', r.artwork_url,
      'artwork_thumb', r.artwork_thumb,
      'duration_sec', r.duration_sec
    ),
    c.copy,
    coalesce(ye.your_copy, ym.your_copy)
  from unnest(p_user_ids) as u (id)
  cross join lateral (
    select pl.*
    from public.plays pl
    where pl.user_id = u.id and pl.played_at >= p_since
    order by pl.played_at desc
    limit p_per_user
  ) p
  join public.releases r on r.id = p.release_id
  left join lateral (
    select jsonb_build_object(
      'cover_url', ci.cover_url,
      'cover_thumb', ci.cover_thumb,
      'disc_photo', ci.disc_photo,
      'disc_colors', ci.disc_colors
    ) as copy
    from public.collection_items ci
    where ci.user_id = p.user_id and ci.release_id = p.release_id
    order by ci.instance_id
    limit 1
  ) c on true
  left join lateral (
    select jsonb_build_object('releaseId', ci.release_id, 'instanceId', ci.instance_id) as your_copy
    from public.collection_items ci
    where ci.user_id = p_viewer and ci.release_id = r.id
    order by ci.instance_id
    limit 1
  ) ye on true
  left join lateral (
    select jsonb_build_object('releaseId', ci.release_id, 'instanceId', ci.instance_id) as your_copy
    from public.releases mr
    join public.collection_items ci
      on ci.release_id = mr.id and ci.user_id = p_viewer
    where ye.your_copy is null and r.master_id is not null and mr.master_id = r.master_id
    order by ci.instance_id
    limit 1
  ) ym on true
  order by p.played_at desc
$$;

-- ---- this week's leaderboard ----

-- Spins, minutes on the turntable (a spin counts until it ended, at most its
-- runtime) and records owned since before p_dust_before that got their
-- first logged spin this week. Users with no spins this week are left out.
create or replace function public.friends_leaderboard(
  p_user_ids uuid[],
  p_week_start timestamptz,
  p_dust_before timestamptz,
  p_default_runtime_sec int
)
returns table (user_id uuid, spins int, minutes int, rescued int)
language sql
stable
set search_path = ''
as $$
  with week as (
    select
      pl.user_id, pl.release_id, pl.played_at, pl.ended_at,
      coalesce(
        -- The original album's runtime, when the spin saved one (logPlay).
        case
          when jsonb_typeof(pl.context -> 'runtimeSec') = 'number'
            and (pl.context ->> 'runtimeSec')::numeric > 0
          then (pl.context ->> 'runtimeSec')::numeric
        end,
        r.duration_sec,
        p_default_runtime_sec
      ) as runtime_sec
    from unnest(p_user_ids) as u (id)
    join public.plays pl on pl.user_id = u.id and pl.played_at >= p_week_start
    join public.releases r on r.id = pl.release_id
  )
  select
    w.user_id,
    count(*)::int,
    round(sum(greatest(0, least(
      w.runtime_sec,
      extract(epoch from coalesce(w.ended_at, now()) - w.played_at)
    ))) / 60)::int,
    (count(distinct w.release_id) filter (
      where exists (
        select 1 from public.collection_items ci
        where ci.user_id = w.user_id and ci.release_id = w.release_id
          and ci.date_added < p_dust_before
      )
      and not exists (
        select 1 from public.plays e
        where e.user_id = w.user_id and e.release_id = w.release_id
          and e.played_at < p_week_start
      )
    ))::int
  from week w
  group by w.user_id
$$;

-- ---- collection sizes ----

create or replace function public.record_counts(p_user_ids uuid[])
returns table (user_id uuid, records int)
language sql
stable
set search_path = ''
as $$
  select ci.user_id, count(*)::int
  from public.collection_items ci
  where ci.user_id = any (p_user_ids)
  group by ci.user_id
$$;

-- ---- new in their crates ----

-- Each user's newest additions since p_since, at most p_per_user each.
create or replace function public.friends_recent_additions(
  p_user_ids uuid[],
  p_since timestamptz,
  p_per_user int default 8
)
returns table (
  user_id uuid,
  release_id bigint,
  title text,
  artist_display text,
  thumb text,
  date_added timestamptz
)
language sql
stable
set search_path = ''
as $$
  select u.id, a.release_id, r.title, r.artist_display,
    coalesce(r.artwork_thumb, r.thumb), a.date_added
  from unnest(p_user_ids) as u (id)
  cross join lateral (
    select ci.release_id, ci.date_added
    from public.collection_items ci
    where ci.user_id = u.id and ci.date_added >= p_since
    order by ci.date_added desc
    limit p_per_user
  ) a
  join public.releases r on r.id = a.release_id
  order by a.date_added desc
$$;

-- ---- your wants on friends' shelves ----

-- One row per (want, friend who owns it); exact is true when they have that
-- pressing, false when they only have another pressing of the album.
create or replace function public.friends_want_matches(
  p_viewer uuid,
  p_user_ids uuid[]
)
returns table (
  release_id bigint,
  master_id bigint,
  title text,
  artist_display text,
  year int,
  thumb text,
  owner_id uuid,
  exact boolean
)
language sql
stable
set search_path = ''
as $$
  with wants as (
    select * from public.want_items w where w.user_id = p_viewer
  ),
  hits as (
    select w.release_id as want_id, ci.user_id, true as exact
    from wants w
    join public.collection_items ci
      on ci.release_id = w.release_id and ci.user_id = any (p_user_ids)
    union all
    select w.release_id, ci.user_id, false
    from wants w
    join public.releases r on r.master_id = w.master_id
    join public.collection_items ci
      on ci.release_id = r.id and ci.user_id = any (p_user_ids)
    where w.master_id > 0 and r.id <> w.release_id
  )
  select w.release_id, w.master_id, w.title, w.artist_display, w.year, w.thumb,
    h.user_id, bool_or(h.exact)
  from hits h
  join wants w on w.release_id = h.want_id
  group by w.release_id, w.master_id, w.title, w.artist_display, w.year, w.thumb, h.user_id
$$;

-- ---- server only ----

revoke execute on function public.friends_feed_plays(uuid, uuid[], timestamptz, int) from public, anon, authenticated;
revoke execute on function public.friends_leaderboard(uuid[], timestamptz, timestamptz, int) from public, anon, authenticated;
revoke execute on function public.record_counts(uuid[]) from public, anon, authenticated;
revoke execute on function public.friends_recent_additions(uuid[], timestamptz, int) from public, anon, authenticated;
revoke execute on function public.friends_want_matches(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.friends_feed_plays(uuid, uuid[], timestamptz, int) to service_role;
grant execute on function public.friends_leaderboard(uuid[], timestamptz, timestamptz, int) to service_role;
grant execute on function public.record_counts(uuid[]) to service_role;
grant execute on function public.friends_recent_additions(uuid[], timestamptz, int) to service_role;
grant execute on function public.friends_want_matches(uuid, uuid[]) to service_role;
