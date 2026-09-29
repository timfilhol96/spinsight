import { db } from '#/lib/supabase.server'
import type { UserRow } from '#/lib/supabase.server'
import { reactionsFor, spinEndsAt } from '#/lib/plays.server'
import { DEFAULT_RUNTIME_SEC } from '#/lib/records'
import type {
  Friend,
  FriendSpin,
  FriendUser,
  FriendsActivity,
  LeaderRow,
  WantMatch,
} from '#/lib/friends'
import { parseVinylLook, withDiscPhoto } from '#/lib/vinyl-color'
import type { DiscPhoto, DiscogsFormat } from '#/lib/vinyl-color'

const DAY = 86_400_000
/** How far back the feed looks for last spins and new additions. */
const FEED_DAYS = 30
const LEADERBOARD_DAYS = 7
const PICKER_DAYS = 14
/** A record owned this long before its first logged spin was "rescued". */
const DUST_DAYS = 180

type UserLite = {
  id: string
  discogs_username: string
  display_name: string | null
  avatar_url: string | null
  is_public: boolean
  share_listening: boolean
}

type PlayRow = {
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
    formats: DiscogsFormat[]
    cover_image: string | null
    thumb: string | null
    artwork_url: string | null
    artwork_thumb: string | null
    duration_sec: number | null
  }
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&')

/** Supabase filters go in the URL, so long id lists are sent in chunks. */
function chunks<T>(items: T[], size = 150): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size))
  return out
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

/** Everything on the Friends tab, from the viewer's point of view. */
export async function friendsActivity(
  viewer: UserRow,
): Promise<FriendsActivity> {
  const supabase = db()
  const now = Date.now()

  const [{ data: following, error: fErr }, { data: followerRows }] =
    await Promise.all([
      supabase
        .from('follows')
        .select('followee_username, followee_id, created_at')
        .eq('follower_id', viewer.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('follows')
        .select('follower_id')
        .eq('followee_id', viewer.id),
    ])
  if (fErr) throw new Error(fErr.message)

  const followingIds = new Set(
    (following ?? [])
      .map((f) => f.followee_id as string | null)
      .filter(Boolean),
  ) as Set<string>
  const followerIds = new Set(
    (followerRows ?? []).map((f) => f.follower_id as string),
  )
  const userIds = [...new Set([...followingIds, ...followerIds])]
  const users = new Map<string, UserLite>()
  if (userIds.length) {
    const { data } = await supabase
      .from('users')
      .select(
        'id, discogs_username, display_name, avatar_url, is_public, share_listening',
      )
      .in('id', userIds)
    for (const u of (data ?? []) as UserLite[]) users.set(u.id, u)
  }

  const visible = [...followingIds].filter((id) => users.get(id)?.is_public)
  const listeners = visible.filter((id) => users.get(id)?.share_listening)
  const withMe = [viewer.id, ...listeners]
  const sharesListening = viewer.share_listening !== false

  // ---- plays: now spinning, last spins, leaderboard, picker ----
  const since = new Date(now - FEED_DAYS * DAY).toISOString()
  const { data: playData } = await supabase
    .from('plays')
    .select(
      'id, user_id, release_id, played_at, ended_at, context, release:releases!inner(id, master_id, title, artist_display, formats, cover_image, thumb, artwork_url, artwork_thumb, duration_sec)',
    )
    .in('user_id', withMe)
    .gte('played_at', since)
    .order('played_at', { ascending: false })
    .limit(3000)
  const plays = (playData ?? []) as unknown as PlayRow[]

  // Each user's copies of the records in those plays: hand-picked covers,
  // disc photos, and how long they've owned them.
  const releaseIds = [...new Set(plays.map((p) => Number(p.release_id)))]
  type ItemRow = {
    user_id: string
    release_id: number
    date_added: string | null
    cover_url: string | null
    cover_thumb: string | null
    disc_photo: DiscPhoto | null
    disc_colors: string[] | null
  }
  const copies = new Map<string, ItemRow>()
  for (const ids of chunks(releaseIds)) {
    const { data } = await supabase
      .from('collection_items')
      .select(
        'user_id, release_id, date_added, cover_url, cover_thumb, disc_photo, disc_colors',
      )
      .in('user_id', withMe)
      .in('release_id', ids)
    for (const it of (data ?? []) as ItemRow[])
      copies.set(`${it.user_id}:${it.release_id}`, it)
  }

  // The viewer's own shelf, by release and by album, for "Spin it too".
  const { data: myItems } = await supabase
    .from('collection_items')
    .select('instance_id, release_id, release:releases!inner(master_id)')
    .eq('user_id', viewer.id)
  const myByRelease = new Map<number, number>()
  const myByMaster = new Map<
    number,
    { releaseId: number; instanceId: number }
  >()
  for (const it of myItems ?? []) {
    const releaseId = Number(it.release_id)
    const instanceId = Number(it.instance_id)
    myByRelease.set(releaseId, instanceId)
    const master = (it.release as unknown as { master_id: number | null })
      .master_id
    if (master) myByMaster.set(Number(master), { releaseId, instanceId })
  }

  const isOpen = (p: PlayRow) =>
    !p.ended_at && now <= spinEndsAt(p.played_at, p.release.duration_sec)

  // Newest play per user = now playing (if still open); newest finished one
  // = last spin.
  const nowByUser = new Map<string, PlayRow>()
  const lastByUser = new Map<string, PlayRow>()
  for (const p of plays) {
    if (p.user_id === viewer.id) continue
    const first = !nowByUser.has(p.user_id) && !lastByUser.has(p.user_id)
    if (first && isOpen(p)) nowByUser.set(p.user_id, p)
    else if (!lastByUser.has(p.user_id) && !isOpen(p))
      lastByUser.set(p.user_id, p)
  }
  const shownPlays = [...nowByUser.values(), ...lastByUser.values()]
  const reactions = await reactionsFor(shownPlays.map((p) => p.id))

  const toSpin = (p: PlayRow, open: boolean): FriendSpin => {
    const rel = p.release
    const copy = copies.get(`${p.user_id}:${p.release_id}`)
    const mine = reactions.get(p.id) ?? []
    const master = rel.master_id ? Number(rel.master_id) : null
    const exact = myByRelease.get(Number(rel.id))
    return {
      playId: p.id,
      releaseId: Number(rel.id),
      masterId: master,
      title: rel.title,
      artist: rel.artist_display,
      look: withDiscPhoto(
        parseVinylLook(rel.formats ?? []),
        copy?.disc_photo ?? null,
        copy?.disc_colors ?? null,
      ),
      coverImage: copy?.cover_url ?? rel.artwork_url ?? rel.cover_image,
      thumb: copy?.cover_thumb ?? rel.artwork_thumb ?? rel.thumb,
      durationSec: rel.duration_sec,
      startedAt: p.played_at,
      endsAt: open
        ? new Date(spinEndsAt(p.played_at, rel.duration_sec)).toISOString()
        : null,
      along: p.context?.along ?? null,
      reactions: mine.map((r) => ({
        username: r.username,
        displayName: r.displayName,
        emoji: r.emoji,
      })),
      myReaction: mine.find((r) => r.userId === viewer.id)?.emoji ?? null,
      yourCopy:
        exact != null
          ? { releaseId: Number(rel.id), instanceId: exact }
          : master
            ? (myByMaster.get(master) ?? null)
            : null,
    }
  }

  // ---- recent additions and collection sizes ----
  const additions = new Map<string, Friend['recentAdditions']>()
  const sizes = new Map<string, number>()
  if (visible.length) {
    const { data } = await supabase
      .from('collection_items')
      .select(
        'user_id, date_added, release:releases!inner(id, title, artist_display, thumb, artwork_thumb)',
      )
      .in('user_id', visible)
      .gte('date_added', since)
      .order('date_added', { ascending: false })
      .limit(300)
    for (const it of data ?? []) {
      const rel = it.release as unknown as {
        id: number
        title: string
        artist_display: string
        thumb: string | null
        artwork_thumb: string | null
      }
      const list = additions.get(it.user_id as string) ?? []
      list.push({
        releaseId: Number(rel.id),
        title: rel.title,
        artist: rel.artist_display,
        thumb: rel.artwork_thumb ?? rel.thumb,
        dateAdded: it.date_added as string,
      })
      additions.set(it.user_id as string, list)
    }
    await Promise.all(
      visible.map(async (id) => {
        const { count } = await supabase
          .from('collection_items')
          .select('instance_id', { count: 'exact', head: true })
          .eq('user_id', id)
        sizes.set(id, count ?? 0)
      }),
    )
  }

  // ---- the list, in the order you followed them ----
  const friends: Friend[] = (following ?? []).map((f) => {
    const id = f.followee_id as string | null
    const u = id ? users.get(id) : undefined
    if (!id || !u) {
      return {
        username: f.followee_username as string,
        displayName: null,
        avatarUrl: null,
        status: 'pending',
        followsYou: false,
        sharesListening: false,
        nowPlaying: null,
        lastSpin: null,
        recordCount: null,
        recentAdditions: [],
      }
    }
    const listening = u.is_public && u.share_listening
    const nowPlay = listening ? nowByUser.get(id) : undefined
    const lastPlay = listening ? lastByUser.get(id) : undefined
    return {
      ...toFriendUser(u),
      status: u.is_public ? 'active' : 'private',
      followsYou: followerIds.has(id),
      sharesListening: u.share_listening,
      nowPlaying: nowPlay ? toSpin(nowPlay, true) : null,
      lastSpin: lastPlay ? toSpin(lastPlay, false) : null,
      recordCount: sizes.get(id) ?? null,
      recentAdditions: (additions.get(id) ?? []).slice(0, 8),
    }
  })

  const followers = [...followerIds]
    .filter((id) => !followingIds.has(id))
    .map((id) => users.get(id))
    .filter((u): u is UserLite => !!u)
    .map(toFriendUser)

  return {
    sharesListening,
    friends,
    followers,
    leaderboard: await leaderboard(viewer, users, listeners, plays, copies),
    wantMatches: await wantMatches(viewer, visible, users),
    recentSpins: plays
      .filter(
        (p) =>
          p.user_id !== viewer.id &&
          new Date(p.played_at).getTime() >= now - PICKER_DAYS * DAY,
      )
      .map((p) => {
        const u = users.get(p.user_id)!
        return {
          releaseId: Number(p.release_id),
          masterId: p.release.master_id ? Number(p.release.master_id) : null,
          username: u.discogs_username,
          displayName: u.display_name,
          playedAt: p.played_at,
        }
      }),
  }
}

/**
 * Last 7 days for you and the friends who share listening: spins, minutes
 * actually on the turntable, and dust collectors given their first spin.
 */
async function leaderboard(
  viewer: UserRow,
  users: Map<string, UserLite>,
  listeners: string[],
  plays: PlayRow[],
  copies: Map<string, { date_added: string | null }>,
): Promise<LeaderRow[]> {
  const now = Date.now()
  const weekStart = now - LEADERBOARD_DAYS * DAY
  const week = plays.filter((p) => new Date(p.played_at).getTime() >= weekStart)
  const ids = [viewer.id, ...listeners]

  // Rescued: owned for a while, and no logged spin before this week.
  const candidates = week.filter((p) => {
    const added = copies.get(`${p.user_id}:${p.release_id}`)?.date_added
    return added && new Date(added).getTime() < now - DUST_DAYS * DAY
  })
  const playedBefore = new Set<string>()
  const candidateReleases = [...new Set(candidates.map((p) => p.release_id))]
  for (const rel of chunks(candidateReleases)) {
    const { data } = await db()
      .from('plays')
      .select('user_id, release_id')
      .in('user_id', ids)
      .in('release_id', rel)
      .lt('played_at', new Date(weekStart).toISOString())
    for (const p of data ?? [])
      playedBefore.add(`${p.user_id as string}:${Number(p.release_id)}`)
  }

  const rows = ids.map((id): LeaderRow => {
    const mine = week.filter((p) => p.user_id === id)
    const minutes = mine.reduce((sum, p) => {
      const runtime = (p.release.duration_sec ?? DEFAULT_RUNTIME_SEC) * 1000
      const start = new Date(p.played_at).getTime()
      const end = p.ended_at ? new Date(p.ended_at).getTime() : now
      return sum + Math.max(0, Math.min(runtime, end - start)) / 60_000
    }, 0)
    const rescued = new Set(
      candidates
        .filter(
          (p) => p.user_id === id && !playedBefore.has(`${id}:${p.release_id}`),
        )
        .map((p) => p.release_id),
    ).size
    const u = id === viewer.id ? null : users.get(id)
    return {
      username: u?.discogs_username ?? viewer.discogs_username,
      displayName: u ? u.display_name : viewer.display_name,
      avatarUrl: u ? u.avatar_url : viewer.avatar_url,
      isYou: id === viewer.id,
      spins: mine.length,
      minutes: Math.round(minutes),
      rescued,
    }
  })
  return rows.sort(
    (a, b) =>
      b.spins - a.spins || b.minutes - a.minutes || b.rescued - a.rescued,
  )
}

/** Your wantlist against friends' shelves: exact pressing or same album. */
async function wantMatches(
  viewer: UserRow,
  visible: string[],
  users: Map<string, UserLite>,
): Promise<WantMatch[]> {
  if (!visible.length) return []
  const supabase = db()
  const { data: wants, error } = await supabase
    .from('want_items')
    .select('release_id, master_id, title, artist_display, year, thumb')
    .eq('user_id', viewer.id)
  if (error || !wants?.length) return []

  type Hit = { user_id: string; release_id: number; master_id: number | null }
  const hits: Hit[] = []
  const wantIds = wants.map((w) => Number(w.release_id))
  const masterIds = [
    ...new Set(
      wants
        .map((w) => Number(w.master_id))
        .filter((m) => Number.isFinite(m) && m > 0),
    ),
  ]
  for (const ids of chunks(wantIds)) {
    const { data } = await supabase
      .from('collection_items')
      .select('user_id, release_id, release:releases!inner(master_id)')
      .in('user_id', visible)
      .in('release_id', ids)
    for (const it of data ?? [])
      hits.push({
        user_id: it.user_id as string,
        release_id: Number(it.release_id),
        master_id: (it.release as unknown as { master_id: number | null })
          .master_id,
      })
  }
  for (const ids of chunks(masterIds)) {
    const { data } = await supabase
      .from('collection_items')
      .select('user_id, release_id, release:releases!inner(master_id)')
      .in('user_id', visible)
      .in('release.master_id', ids)
    for (const it of data ?? [])
      hits.push({
        user_id: it.user_id as string,
        release_id: Number(it.release_id),
        master_id: (it.release as unknown as { master_id: number | null })
          .master_id,
      })
  }

  const out: WantMatch[] = []
  for (const w of wants) {
    const releaseId = Number(w.release_id)
    const masterId = w.master_id ? Number(w.master_id) : null
    const owners = new Map<string, boolean>()
    for (const h of hits) {
      const exact = h.release_id === releaseId
      const same = masterId != null && Number(h.master_id) === masterId
      if (exact || same) owners.set(h.user_id, owners.get(h.user_id) || exact)
    }
    if (!owners.size) continue
    out.push({
      want: {
        releaseId,
        masterId,
        title: w.title as string,
        artist: w.artist_display as string,
        year: (w.year as number | null) ?? null,
        thumb: (w.thumb as string | null) ?? null,
      },
      owners: [...owners].map(([id, exact]) => ({
        ...toFriendUser(users.get(id)!),
        exact,
      })),
    })
  }
  // Exact pressings first: those are the ones worth asking to borrow.
  return out.sort(
    (a, b) =>
      Number(b.owners.some((o) => o.exact)) -
        Number(a.owners.some((o) => o.exact)) ||
      a.want.artist.localeCompare(b.want.artist),
  )
}
