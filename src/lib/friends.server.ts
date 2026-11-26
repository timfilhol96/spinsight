import { db } from '#/lib/supabase.server'
import type { UserRow } from '#/lib/supabase.server'
import { reactionsFor, spinEndsAt } from '#/lib/plays.server'
import { DEFAULT_RUNTIME_SEC, playRuntimeSec } from '#/lib/records'
import type { Reaction } from '#/lib/records'
import { ADDITIONS_PER_FRIEND } from '#/lib/friends'
import type {
  Friend,
  FriendAdditions,
  FriendFollows,
  FriendRecentSpin,
  FriendSpin,
  FriendUser,
  FriendsCrates,
  FriendsLive,
  LeaderRow,
  WantMatch,
} from '#/lib/friends'
import { parseVinylLook, withDiscPhoto } from '#/lib/vinyl-color'
import type { DiscPhoto, DiscogsFormat } from '#/lib/vinyl-color'

// The Friends tab is a few separate queries so the list of friends and what
// they're spinning (polled) doesn't wait on the slower, steadier parts
// (leaderboard, want matches, new additions). The heavy lifting is done by
// the database functions in migration 017.

const DAY = 86_400_000
/** How far back the feed looks for last spins and new additions. */
const FEED_DAYS = 30
const LEADERBOARD_DAYS = 7
const PICKER_DAYS = 14
/** A record owned this long before its first logged spin was "rescued". */
const DUST_DAYS = 180
/** Plays per friend the feed needs: the newest, and the newest finished one. */
const FEED_PLAYS_PER_FRIEND = 4
/** Sections slower than this are logged, to spot what needs work next. */
const SLOW_MS = 800

type UserLite = {
  id: string
  discogs_username: string
  display_name: string | null
  avatar_url: string | null
  is_public: boolean
  share_listening: boolean
}

/** A row from friends_feed_plays. */
type FeedPlay = {
  id: string
  user_id: string
  release_id: number
  played_at: string
  ended_at: string | null
  context: { along?: string } | null
  release: {
    id: number
    master_id: number | null
    title: string
    artist_display: string
    formats: DiscogsFormat[] | null
    cover_image: string | null
    thumb: string | null
    artwork_url: string | null
    artwork_thumb: string | null
    duration_sec: number | null
  }
  /** The friend's copy: hand-picked cover and disc photo. */
  copy: {
    cover_url: string | null
    cover_thumb: string | null
    disc_photo: DiscPhoto | null
    disc_colors: string[] | null
  } | null
  /** The viewer's copy of this release, or of another pressing. */
  your_copy: { releaseId: number; instanceId: number } | null
}

/** The spin's runtime: the original album alone when it saved one. */
const runtimeOf = (p: Pick<FeedPlay, 'context' | 'release'>) =>
  playRuntimeSec(p.context, p.release.duration_sec)

const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&')

/** Supabase filters go in the URL, so long id lists are sent in chunks. */
function chunks<T>(items: T[], size = 150): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size))
  return out
}

/** Awaits `work`, logging it when it's slow. */
async function timed<T>(label: string, work: PromiseLike<T>): Promise<T> {
  const start = performance.now()
  try {
    return await work
  } finally {
    const ms = performance.now() - start
    if (ms > SLOW_MS)
      console.warn(`[friends] ${label} took ${Math.round(ms)}ms`)
  }
}

/** Database function results, or throws with the function's name. */
async function rpc<T>(fn: string, args: Record<string, unknown>) {
  const { data, error } = await timed(fn, db().rpc(fn, args))
  if (error) throw new Error(`${fn}: ${error.message}`)
  return (data ?? []) as T[]
}

const toFriendUser = (u: UserLite): FriendUser => ({
  username: u.discogs_username,
  displayName: u.display_name,
  avatarUrl: u.avatar_url,
})

/** The Spinsight user with this Discogs username (any case), if any. */
export async function findUser(username: string) {
  const { data } = await db()
    .from('users')
    .select('*')
    .ilike('discogs_username', escapeLike(username))
    .maybeSingle()
  return (data as UserRow | null) ?? null
}

/** Links follows made before this person joined to their new account. */
export async function claimPendingFollows(user: {
  id: string
  discogs_username: string
}) {
  const { error } = await db()
    .from('follows')
    .update({ followee_id: user.id, followee_username: user.discogs_username })
    .is('followee_id', null)
    .ilike('followee_username', escapeLike(user.discogs_username))
  if (error) console.warn('[friends] claim pending follows', error.message)
}

// ---------- who you follow and who follows you ----------

type FollowGraph = {
  /** In the order you followed them, pending ones included. */
  following: Array<{ username: string; id: string | null }>
  followerIds: Set<string>
  users: Map<string, UserLite>
  /** Friends whose collection is public. */
  visible: string[]
  /** ...who also share what they're spinning. */
  listeners: string[]
}

async function followGraph(viewer: UserRow): Promise<FollowGraph> {
  const supabase = db()
  const [{ data: followingRows, error }, { data: followerRows }] = await timed(
    'follows',
    Promise.all([
      supabase
        .from('follows')
        .select('followee_username, followee_id, created_at')
        .eq('follower_id', viewer.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('follows')
        .select('follower_id')
        .eq('followee_id', viewer.id),
    ]),
  )
  if (error) throw new Error(error.message)

  const following = (followingRows ?? []).map((f) => ({
    username: f.followee_username as string,
    id: (f.followee_id as string | null) ?? null,
  }))
  const followerIds = new Set(
    (followerRows ?? []).map((f) => f.follower_id as string),
  )
  const userIds = [
    ...new Set([
      ...following.flatMap((f) => (f.id ? [f.id] : [])),
      ...followerIds,
    ]),
  ]
  const users = new Map<string, UserLite>()
  await timed(
    'users',
    Promise.all(
      chunks(userIds).map(async (ids) => {
        const { data } = await supabase
          .from('users')
          .select(
            'id, discogs_username, display_name, avatar_url, is_public, share_listening',
          )
          .in('id', ids)
        for (const u of (data ?? []) as UserLite[]) users.set(u.id, u)
      }),
    ),
  )

  const visible = following
    .flatMap((f) => (f.id ? [f.id] : []))
    .filter((id) => users.get(id)?.is_public)
  const listeners = visible.filter((id) => users.get(id)?.share_listening)
  return { following, followerIds, users, visible, listeners }
}

/** Just the usernames, for Follow buttons around the app. */
export async function friendFollows(viewer: UserRow): Promise<FriendFollows> {
  const g = await followGraph(viewer)
  return {
    following: g.following.map((f) => f.username.toLowerCase()),
    followers: [...g.followerIds].flatMap((id) => {
      const u = g.users.get(id)
      return u ? [u.discogs_username.toLowerCase()] : []
    }),
  }
}

// ---------- the live part: friends and what they're spinning ----------

/** The friend list with now playing and last spin. Polled by the tab. */
export async function friendsLive(viewer: UserRow): Promise<FriendsLive> {
  const now = Date.now()
  const g = await followGraph(viewer)
  const followingIds = new Set(g.following.map((f) => f.id))

  const plays = g.listeners.length
    ? await rpc<FeedPlay>('friends_feed_plays', {
        p_viewer: viewer.id,
        p_user_ids: g.listeners,
        p_since: new Date(now - FEED_DAYS * DAY).toISOString(),
        p_per_user: FEED_PLAYS_PER_FRIEND,
      })
    : []

  const isOpen = (p: FeedPlay) =>
    !p.ended_at && now <= spinEndsAt(p.played_at, runtimeOf(p))

  // Newest play per user = now playing (if still open); newest finished one
  // = last spin. Rows come newest first.
  const nowByUser = new Map<string, FeedPlay>()
  const lastByUser = new Map<string, FeedPlay>()
  for (const p of plays) {
    const first = !nowByUser.has(p.user_id) && !lastByUser.has(p.user_id)
    if (first && isOpen(p)) nowByUser.set(p.user_id, p)
    else if (!lastByUser.has(p.user_id) && !isOpen(p))
      lastByUser.set(p.user_id, p)
  }
  const shownIds = [...nowByUser.values(), ...lastByUser.values()].map(
    (p) => p.id,
  )
  const reactions = new Map<string, Array<Reaction & { userId: string }>>()
  await timed(
    'reactions',
    Promise.all(
      chunks(shownIds).map(async (ids) => {
        for (const [k, v] of await reactionsFor(ids)) reactions.set(k, v)
      }),
    ),
  )

  const toSpin = (p: FeedPlay, open: boolean): FriendSpin => {
    const rel = p.release
    const mine = reactions.get(p.id) ?? []
    return {
      playId: p.id,
      releaseId: Number(rel.id),
      masterId: rel.master_id ? Number(rel.master_id) : null,
      title: rel.title,
      artist: rel.artist_display,
      look: withDiscPhoto(
        parseVinylLook(rel.formats ?? []),
        p.copy?.disc_photo ?? null,
        p.copy?.disc_colors ?? null,
      ),
      coverImage: p.copy?.cover_url ?? rel.artwork_url ?? rel.cover_image,
      thumb: p.copy?.cover_thumb ?? rel.artwork_thumb ?? rel.thumb,
      durationSec: runtimeOf(p),
      startedAt: p.played_at,
      endsAt: open
        ? new Date(spinEndsAt(p.played_at, runtimeOf(p))).toISOString()
        : null,
      along: p.context?.along ?? null,
      reactions: mine.map((r) => ({
        username: r.username,
        displayName: r.displayName,
        emoji: r.emoji,
      })),
      myReaction: mine.find((r) => r.userId === viewer.id)?.emoji ?? null,
      yourCopy: p.your_copy
        ? {
            releaseId: Number(p.your_copy.releaseId),
            instanceId: Number(p.your_copy.instanceId),
          }
        : null,
    }
  }

  // In the order you followed them.
  const friends: Friend[] = g.following.map((f) => {
    const u = f.id ? g.users.get(f.id) : undefined
    if (!f.id || !u) {
      return {
        username: f.username,
        displayName: null,
        avatarUrl: null,
        status: 'pending',
        followsYou: false,
        sharesListening: false,
        nowPlaying: null,
        lastSpin: null,
      }
    }
    const listening = u.is_public && u.share_listening
    const nowPlay = listening ? nowByUser.get(f.id) : undefined
    const lastPlay = listening ? lastByUser.get(f.id) : undefined
    return {
      ...toFriendUser(u),
      status: u.is_public ? 'active' : 'private',
      followsYou: g.followerIds.has(f.id),
      sharesListening: u.share_listening,
      nowPlaying: nowPlay ? toSpin(nowPlay, true) : null,
      lastSpin: lastPlay ? toSpin(lastPlay, false) : null,
    }
  })

  const followers = [...g.followerIds]
    .filter((id) => !followingIds.has(id))
    .map((id) => g.users.get(id))
    .filter((u): u is UserLite => !!u)
    .map(toFriendUser)

  return {
    sharesListening: viewer.share_listening !== false,
    friends,
    followers,
  }
}

// ---------- this week ----------

/**
 * Last 7 days for you and the friends who share listening: spins, minutes
 * actually on the turntable, and dust collectors given their first spin.
 */
export async function friendsLeaderboard(
  viewer: UserRow,
): Promise<LeaderRow[]> {
  const now = Date.now()
  const g = await followGraph(viewer)
  const ids = [viewer.id, ...g.listeners]
  const totals = await rpc<{
    user_id: string
    spins: number
    minutes: number
    rescued: number
  }>('friends_leaderboard', {
    p_user_ids: ids,
    p_week_start: new Date(now - LEADERBOARD_DAYS * DAY).toISOString(),
    p_dust_before: new Date(now - DUST_DAYS * DAY).toISOString(),
    p_default_runtime_sec: DEFAULT_RUNTIME_SEC,
  })
  const byUser = new Map(totals.map((t) => [t.user_id, t]))

  const rows = ids.map((id): LeaderRow => {
    const t = byUser.get(id)
    const u = id === viewer.id ? null : g.users.get(id)
    return {
      username: u?.discogs_username ?? viewer.discogs_username,
      displayName: u ? u.display_name : viewer.display_name,
      avatarUrl: u ? u.avatar_url : viewer.avatar_url,
      isYou: id === viewer.id,
      spins: t?.spins ?? 0,
      minutes: t?.minutes ?? 0,
      rescued: t?.rescued ?? 0,
    }
  })
  return rows.sort(
    (a, b) =>
      b.spins - a.spins || b.minutes - a.minutes || b.rescued - a.rescued,
  )
}

// ---------- their crates: sizes, new additions, your wants ----------

/** Collection sizes, new additions and want matches. Change on sync only. */
export async function friendsCrates(viewer: UserRow): Promise<FriendsCrates> {
  const g = await followGraph(viewer)
  if (!g.visible.length)
    return { recordCounts: {}, additions: [], wantMatches: [] }
  const since = new Date(Date.now() - FEED_DAYS * DAY).toISOString()

  const [counts, added, matches] = await Promise.all([
    rpc<{ user_id: string; records: number }>('record_counts', {
      p_user_ids: g.visible,
    }),
    rpc<{
      user_id: string
      release_id: number
      title: string
      artist_display: string
      thumb: string | null
      date_added: string
    }>('friends_recent_additions', {
      p_user_ids: g.visible,
      p_since: since,
      p_per_user: ADDITIONS_PER_FRIEND,
    }),
    rpc<{
      release_id: number
      master_id: number | null
      title: string
      artist_display: string
      year: number | null
      thumb: string | null
      owner_id: string
      exact: boolean
    }>('friends_want_matches', {
      p_viewer: viewer.id,
      p_user_ids: g.visible,
    }),
  ])

  const recordCounts: Record<string, number> = {}
  for (const id of g.visible) {
    const u = g.users.get(id)
    if (u) recordCounts[u.discogs_username.toLowerCase()] = 0
  }
  for (const c of counts) {
    const u = g.users.get(c.user_id)
    if (u) recordCounts[u.discogs_username.toLowerCase()] = c.records
  }

  // Newest first, so friends come out in order of their latest addition.
  const additionsByUser = new Map<string, FriendAdditions>()
  for (const a of added) {
    const u = g.users.get(a.user_id)
    if (!u) continue
    const entry = additionsByUser.get(a.user_id) ?? {
      ...toFriendUser(u),
      records: [],
    }
    entry.records.push({
      releaseId: Number(a.release_id),
      title: a.title,
      artist: a.artist_display,
      thumb: a.thumb,
      dateAdded: a.date_added,
    })
    additionsByUser.set(a.user_id, entry)
  }

  const wants = new Map<number, WantMatch>()
  for (const m of matches) {
    const u = g.users.get(m.owner_id)
    if (!u) continue
    const releaseId = Number(m.release_id)
    const entry = wants.get(releaseId) ?? {
      want: {
        releaseId,
        masterId: m.master_id ? Number(m.master_id) : null,
        title: m.title,
        artist: m.artist_display,
        year: m.year ?? null,
        thumb: m.thumb ?? null,
      },
      owners: [],
    }
    entry.owners.push({ ...toFriendUser(u), exact: m.exact })
    wants.set(releaseId, entry)
  }
  // Exact pressings first: those are the ones worth asking to borrow.
  const wantMatches = [...wants.values()].sort(
    (a, b) =>
      Number(b.owners.some((o) => o.exact)) -
        Number(a.owners.some((o) => o.exact)) ||
      a.want.artist.localeCompare(b.want.artist),
  )

  return {
    recordCounts,
    additions: [...additionsByUser.values()],
    wantMatches,
  }
}

// ---------- for the picker ----------

/** Friends' spins in the last 14 days, newest first. */
export async function friendRecentSpins(
  viewer: UserRow,
): Promise<FriendRecentSpin[]> {
  const g = await followGraph(viewer)
  const since = new Date(Date.now() - PICKER_DAYS * DAY).toISOString()
  const rows = (
    await timed(
      'recent spins',
      Promise.all(
        chunks(g.listeners).map(async (ids) => {
          const { data } = await db()
            .from('plays')
            .select(
              'user_id, release_id, played_at, release:releases!inner(master_id)',
            )
            .in('user_id', ids)
            .gte('played_at', since)
            .order('played_at', { ascending: false })
            .limit(2000)
          return data ?? []
        }),
      ),
    )
  ).flat()

  return rows
    .map((p) => {
      const u = g.users.get(p.user_id as string)!
      const master = (p.release as unknown as { master_id: number | null })
        .master_id
      return {
        releaseId: Number(p.release_id),
        masterId: master ? Number(master) : null,
        username: u.discogs_username,
        displayName: u.display_name,
        playedAt: p.played_at as string,
      }
    })
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt))
}
