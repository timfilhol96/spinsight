// Friends: types shared with the server, and comparisons between two
// collections. Like stats.ts, the comparisons are pure and run in the browser
// on two already-loaded profiles.
import { DEFAULT_RUNTIME_SEC } from '#/lib/records'
import type { CollectionRecord, Play, Reaction } from '#/lib/records'
import type { VinylLook } from '#/lib/vinyl-color'
import { artists, decadeOf, genres, styles } from '#/lib/stats'
import type { Ranked } from '#/lib/stats'

/** The emoji a friend can put on your spin. */
export const REACTIONS = ['🔥', '🎷', '💃', '😌', '👀', '🤘'] as const
export type ReactionEmoji = (typeof REACTIONS)[number]

/** Discogs usernames: letters, digits, dot, dash, underscore. */
export const USERNAME_RE = /^[A-Za-z0-9._-]{1,100}$/

/**
 * Accepts "name", "@name" or a Discogs profile URL
 * (discogs.com/user/name, /seller/name/profile). Null if it isn't one.
 */
export function parseUsername(input: string): string | null {
  let s = input.trim()
  const url = /discogs\.com\/(?:[a-z]{2}\/)?(?:user|seller)\/([^/?#\s]+)/i.exec(
    s,
  )
  if (url) s = decodeURIComponent(url[1])
  s = s.replace(/^@/, '')
  return USERNAME_RE.test(s) ? s : null
}

/** Link that signs a friend up and has them follow you back. Browser only. */
export const inviteUrl = (username: string) =>
  `${window.location.origin}/?invite=${encodeURIComponent(username)}`

export type FriendUser = {
  username: string
  displayName: string | null
  avatarUrl: string | null
}

export type FriendSpin = {
  playId: string
  releaseId: number
  masterId: number | null
  title: string
  artist: string
  look: VinylLook
  coverImage: string | null
  thumb: string | null
  durationSec: number | null
  startedAt: string
  /** Set while it's still on the turntable. */
  endsAt: string | null
  /** Username of the friend this spin joined. */
  along: string | null
  reactions: Reaction[]
  /** Your emoji on it, if any. */
  myReaction: string | null
  /** Your copy of the same release (or another pressing of the album). */
  yourCopy: { releaseId: number; instanceId: number } | null
}

export type Friend = FriendUser & {
  /** pending: not on Spinsight yet. private: their collection is private. */
  status: 'active' | 'pending' | 'private'
  followsYou: boolean
  /** False when they keep what they're spinning to themselves. */
  sharesListening: boolean
  nowPlaying: FriendSpin | null
  /** Their latest spin that has finished (last 30 days). */
  lastSpin: FriendSpin | null
  recordCount: number | null
  /** Records added in the last 30 days, newest first. */
  recentAdditions: Array<{
    releaseId: number
    title: string
    artist: string
    thumb: string | null
    dateAdded: string
  }>
}

export type LeaderRow = FriendUser & {
  isYou: boolean
  spins: number
  minutes: number
  /** Records owned 6+ months that got their first logged spin this week. */
  rescued: number
}

export type WantMatch = {
  want: WantItem
  owners: Array<FriendUser & { exact: boolean }>
}

export type WantItem = {
  releaseId: number
  masterId: number | null
  title: string
  artist: string
  year: number | null
  thumb: string | null
}

export type FriendsActivity = {
  sharesListening: boolean
  friends: Friend[]
  /** People following you whom you don't follow back. */
  followers: FriendUser[]
  /** You and the friends who share listening, last 7 days. */
  leaderboard: LeaderRow[]
  /** Your wants that a friend owns. */
  wantMatches: WantMatch[]
  /** Friends' spins in the last 14 days, newest first (for the picker). */
  recentSpins: Array<{
    releaseId: number
    masterId: number | null
    username: string
    displayName: string | null
    playedAt: string
  }>
}

// ---------- comparing two collections ----------

/** Same album regardless of pressing: the Discogs master, else the release. */
export const albumKey = (r: { masterId: number | null; releaseId: number }) =>
  r.masterId ? `m${r.masterId}` : `r${r.releaseId}`

function counts(items: Ranked[]) {
  return new Map(items.map((i) => [i.name, i.count]))
}

/** Cosine similarity of two count vectors, 0..1. */
function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (const [k, v] of a) {
    na += v * v
    dot += v * (b.get(k) ?? 0)
  }
  for (const v of b.values()) nb += v * v
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

/** Things both collections have, ranked by the smaller side's count. */
function shared(a: Ranked[], b: Ranked[], limit: number) {
  const other = counts(b)
  return a
    .filter((x) => other.has(x.name))
    .map((x) => ({
      name: x.name,
      mine: x.count,
      theirs: other.get(x.name) ?? 0,
    }))
    .sort(
      (x, y) =>
        Math.min(y.mine, y.theirs) - Math.min(x.mine, x.theirs) ||
        y.mine + y.theirs - (x.mine + x.theirs),
    )
    .slice(0, limit)
}

const decadeCounts = (rs: CollectionRecord[]) => {
  const m = new Map<string, number>()
  for (const r of rs)
    if (r.originalYear) {
      const d = `${decadeOf(r.originalYear)}s`
      m.set(d, (m.get(d) ?? 0) + 1)
    }
  return m
}

export type TasteMatch = {
  /** 0..100. */
  score: number
  label: string
  parts: Array<{ name: string; value: number }>
  sharedArtists: Array<{ name: string; mine: number; theirs: number }>
  sharedStyles: Array<{ name: string; mine: number; theirs: number }>
  reasons: string[]
}

const MATCH_LABELS: Array<[number, string]> = [
  [85, 'Crate twins'],
  [65, 'Kindred ears'],
  [45, 'Plenty in common'],
  [25, 'Some common ground'],
  [10, 'A few crossovers'],
  [0, 'Opposite ends of the shop'],
]

/**
 * How alike two collections are. Styles and artists carry most of the
 * weight: nearly everyone owns "Rock", so genres alone say little.
 */
export function tasteMatch(
  mine: CollectionRecord[],
  theirs: CollectionRecord[],
): TasteMatch {
  const myArtists = artists(mine, Infinity)
  const theirArtists = artists(theirs, Infinity)
  const myStyles = styles(mine, Infinity)
  const theirStyles = styles(theirs, Infinity)

  const myAlbums = new Set(mine.map(albumKey))
  const theirAlbums = new Set(theirs.map(albumKey))
  const both = [...myAlbums].filter((k) => theirAlbums.has(k)).length
  const smaller = Math.min(myAlbums.size, theirAlbums.size)
  // Owning the same exact albums is rare; a tenth in common already says a lot.
  const albumShare = smaller ? Math.min(1, (both / smaller) * 5) : 0

  const parts = [
    {
      name: 'Styles',
      weight: 0.35,
      value: cosine(counts(myStyles), counts(theirStyles)),
    },
    {
      name: 'Artists',
      weight: 0.25,
      value: cosine(counts(myArtists), counts(theirArtists)),
    },
    {
      name: 'Decades',
      weight: 0.15,
      value: cosine(decadeCounts(mine), decadeCounts(theirs)),
    },
    {
      name: 'Genres',
      weight: 0.1,
      value: cosine(counts(genres(mine)), counts(genres(theirs))),
    },
    { name: 'Same albums', weight: 0.15, value: albumShare },
  ]
  // Cosine similarities of real collections rarely go below ~0.2, so stretch
  // the range to make the number mean something.
  const raw = parts.reduce((s, p) => s + p.weight * p.value, 0)
  const score =
    mine.length && theirs.length
      ? Math.round(Math.max(0, Math.min(1, (raw - 0.1) / 0.8)) * 100)
      : 0

  const sharedArtists = shared(myArtists, theirArtists, 8)
  const sharedStyles = shared(myStyles, theirStyles, 8)
  const reasons: string[] = []
  if (sharedArtists.length)
    reasons.push(
      `You both collect ${sharedArtists
        .slice(0, 2)
        .map((a) => a.name)
        .join(' and ')}`,
    )
  if (sharedStyles.length)
    reasons.push(
      `${sharedStyles
        .slice(0, 2)
        .map((s) => s.name)
        .join(' and ')} on both shelves`,
    )
  if (both) reasons.push(`${both} ${both === 1 ? 'album' : 'albums'} in common`)
  const myTopDecade = [...decadeCounts(mine)].sort((a, b) => b[1] - a[1])[0]
  const theirTopDecade = [...decadeCounts(theirs)].sort(
    (a, b) => b[1] - a[1],
  )[0]
  if (myTopDecade && myTopDecade[0] === theirTopDecade?.[0])
    reasons.push(`Both heavy on the ${myTopDecade[0]}`)

  return {
    score,
    label: MATCH_LABELS.find(([min]) => score >= min)?.[1] ?? '',
    parts: parts.map(({ name, value }) => ({
      name,
      value: Math.round(value * 100),
    })),
    sharedArtists,
    sharedStyles,
    reasons,
  }
}

export type Overlap = {
  both: Array<{ mine: CollectionRecord; theirs: CollectionRecord }>
  onlyMine: CollectionRecord[]
  onlyTheirs: CollectionRecord[]
}

/** Crate overlap by album, so different pressings still count as shared. */
export function overlap(
  mine: CollectionRecord[],
  theirs: CollectionRecord[],
): Overlap {
  const theirByKey = new Map<string, CollectionRecord>()
  for (const r of theirs)
    if (!theirByKey.has(albumKey(r))) theirByKey.set(albumKey(r), r)
  const myKeys = new Set(mine.map(albumKey))
  const seen = new Set<string>()
  const both: Overlap['both'] = []
  for (const r of mine) {
    const k = albumKey(r)
    const t = theirByKey.get(k)
    if (t && !seen.has(k)) {
      seen.add(k)
      both.push({ mine: r, theirs: t })
    }
  }
  const byArtist = (a: CollectionRecord, b: CollectionRecord) =>
    a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title)
  return {
    both: both.sort((a, b) => byArtist(a.mine, b.mine)),
    onlyMine: mine.filter((r) => !theirByKey.has(albumKey(r))).sort(byArtist),
    onlyTheirs: theirs.filter((r) => !myKeys.has(albumKey(r))).sort(byArtist),
  }
}

/** Wants of one side that the other side owns (any pressing of the album). */
export function wantsOwnedBy(wants: WantItem[], owner: CollectionRecord[]) {
  const byRelease = new Set(owner.map((r) => r.releaseId))
  const byMaster = new Map<number, CollectionRecord>()
  for (const r of owner) if (r.masterId) byMaster.set(r.masterId, r)
  return wants.flatMap((w) => {
    const exact = byRelease.has(w.releaseId)
    const record = exact
      ? owner.find((r) => r.releaseId === w.releaseId)
      : w.masterId
        ? byMaster.get(w.masterId)
        : undefined
    return record ? [{ want: w, record, exact }] : []
  })
}

// ---------- a year, side by side ----------

const yearOfDate = (iso: string | null) =>
  iso ? new Date(iso).getFullYear() : null

/** Years in which either person added or spun something, newest first. */
export function jointYears(
  a: { records: CollectionRecord[]; plays: Play[] },
  b: { records: CollectionRecord[]; plays: Play[] },
): number[] {
  const ys = new Set<number>()
  for (const side of [a, b]) {
    for (const r of side.records) {
      const y = yearOfDate(r.dateAdded)
      if (y) ys.add(y)
    }
    for (const p of side.plays) ys.add(new Date(p.playedAt).getFullYear())
  }
  return [...ys].sort((x, y) => y - x)
}

function sideOfYear(records: CollectionRecord[], plays: Play[], year: number) {
  const added = records.filter((r) => yearOfDate(r.dateAdded) === year)
  const spun = plays.filter((p) => new Date(p.playedAt).getFullYear() === year)
  const byRelease = new Map(records.map((r) => [r.releaseId, r]))
  const spinCounts = new Map<number, number>()
  let minutes = 0
  for (const p of spun) {
    spinCounts.set(p.releaseId, (spinCounts.get(p.releaseId) ?? 0) + 1)
    const sec = byRelease.get(p.releaseId)?.durationSec
    minutes += (sec ?? DEFAULT_RUNTIME_SEC) / 60
  }
  const topSpin = [...spinCounts].sort((x, y) => y[1] - x[1])[0]
  const spunRecords = spun
    .map((p) => byRelease.get(p.releaseId))
    .filter((r): r is CollectionRecord => !!r)
  return {
    added,
    spins: spun.length,
    minutes: Math.round(minutes),
    mostSpun: topSpin
      ? { record: byRelease.get(topSpin[0]) ?? null, count: topSpin[1] }
      : null,
    topArtist: artists([...added, ...spunRecords], 1)[0] ?? null,
    topStyle: styles(added, 1)[0] ?? null,
    /** Everything they touched this year: bought or played. */
    touched: [...added, ...spunRecords],
  }
}

export function jointYear(
  me: { records: CollectionRecord[]; plays: Play[] },
  them: { records: CollectionRecord[]; plays: Play[] },
  year: number,
) {
  const mine = sideOfYear(me.records, me.plays, year)
  const theirs = sideOfYear(them.records, them.plays, year)
  // Albums you both bought this year.
  const theirAddedKeys = new Set(theirs.added.map(albumKey))
  const boughtBoth = mine.added.filter((r) => theirAddedKeys.has(albumKey(r)))
  // Artists you both bought or played this year.
  const sharedArtistsOfYear = shared(
    artists(mine.touched, Infinity),
    artists(theirs.touched, Infinity),
    5,
  )
  return { year, mine, theirs, boughtBoth, sharedArtists: sharedArtistsOfYear }
}

/** "just now", "12 min ago", "3 h ago", "2 d ago". */
export function timeAgo(iso: string, now = Date.now()): string {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

export const firstName = (u: Pick<FriendUser, 'username' | 'displayName'>) =>
  u.displayName?.split(' ')[0] || u.username
