// Works out which track is probably under the needle, from when the record
// started, the track lengths and the sides. Vinyl can't report its position,
// so this is an estimate the listener can correct: tap a track to say "I'm
// here", and confirm the flip when a side runs out.

export type TimedTrack = {
  position: string
  title: string
  /** Seconds into its side where the track starts. */
  start: number
  sec: number
  /** Index in the whole tracklist. */
  index: number
}

export type Side = { name: string; tracks: TimedTrack[]; length: number }

/** Where the track lengths came from, least trustworthy last. */
export type TimingSource = 'discogs' | 'spotify' | 'itunes' | 'estimated'

export type Sides = {
  sides: Side[]
  /** Where most times came from; 'estimated' only when none were known. */
  timing: TimingSource
  /** Tracks whose length is a guess (a share of the remaining runtime). */
  guessed: number
}

/** Seconds from a Discogs duration like "4:15" or "1:02:03"; 0 if missing. */
export function trackSeconds(d: string | null | undefined): number {
  if (!d) return 0
  const parts = d.split(':').map(Number)
  if (parts.some(Number.isNaN)) return 0
  return parts.reduce((acc, n) => acc * 60 + n, 0)
}

/** "A1", "B", "C3a" → "A"; "1", "" → null (no side marked). */
function sideLetter(position: string): string | null {
  return /^([A-Z])/i.exec(position.trim())?.[1].toUpperCase() ?? null
}

/** Assumed runtime when nothing better is known (a typical LP). */
const DEFAULT_RUNTIME_SEC = 45 * 60

/**
 * Groups the tracklist into sides and times every track, track by track:
 * the Discogs time when it has one, else the streaming length found for that
 * position (matched by song title on the server), else an even share of
 * whatever runtime is left.
 */
export function buildSides(
  tracklist: Array<{
    position: string
    title: string
    duration: string
    /** Set when the sync filled `duration` from streaming. */
    source?: 'spotify' | 'itunes'
  }>,
  opts: {
    totalSec?: number | null
    streaming?: {
      lengths: Array<{ position: string; sec: number }>
      source: 'spotify' | 'itunes'
    } | null
  } = {},
): Sides {
  if (!tracklist.length) return { sides: [], timing: 'estimated', guessed: 0 }
  const discogs = tracklist.map((t) =>
    t.source ? 0 : trackSeconds(t.duration),
  )
  // Lengths the sync already saved, then the liner notes' (for records
  // synced before it did).
  const streamed = new Map(
    (opts.streaming?.lengths ?? []).map((l) => [l.position, l.sec]),
  )
  for (const t of tracklist)
    if (t.source && trackSeconds(t.duration))
      streamed.set(t.position, trackSeconds(t.duration))
  const streamingSource =
    tracklist.find((t) => t.source)?.source ?? opts.streaming?.source
  const known = tracklist.map(
    (t, i) => discogs[i] || streamed.get(t.position) || 0,
  )
  const guessed = known.filter((s) => !s).length
  const knownSum = known.reduce((a, b) => a + b, 0)
  const runtime = opts.totalSec || DEFAULT_RUNTIME_SEC
  // Unknown tracks share what's left of the runtime, or, when the known ones
  // already fill it, get the average known length.
  const share = !guessed
    ? 0
    : Math.round(
        runtime > knownSum
          ? (runtime - knownSum) / guessed
          : knownSum / (tracklist.length - guessed),
      )
  const lengths = known.map((s) => s || share)
  const usedStreaming = tracklist.some(
    (t, i) => !discogs[i] && streamed.has(t.position),
  )
  const timing: TimingSource =
    guessed === tracklist.length
      ? 'estimated'
      : usedStreaming && streamingSource
        ? streamingSource
        : 'discogs'

  const sides: Side[] = []
  tracklist.forEach((t, index) => {
    // Unlettered positions ("1", "2") all go on one side.
    const name = sideLetter(t.position) ?? sides.at(-1)?.name ?? 'A'
    let side = sides.at(-1)
    if (!side || side.name !== name) {
      side = { name, tracks: [], length: 0 }
      sides.push(side)
    }
    side.tracks.push({
      position: t.position,
      title: t.title,
      start: side.length,
      sec: lengths[index],
      index,
    })
    side.length += lengths[index]
  })
  return { sides, timing, guessed }
}

/**
 * The listener's last known position: `offset` seconds into side `side` at
 * wall-clock time `at` (ms). Everything after is extrapolated.
 */
export type Cursor = { side: number; offset: number; at: number }

/** Time allowed to lift the needle, flip and drop it again. */
export const FLIP_SEC = 30

/**
 * Best guess for someone who hasn't said where they are: they started at A1
 * and flipped promptly at the end of every side.
 */
export function initialCursor(
  sides: Side[],
  startedAt: number,
  now: number,
): Cursor {
  let elapsed = Math.max(0, (now - startedAt) / 1000)
  for (let i = 0; i < sides.length; i++) {
    const last = i === sides.length - 1
    if (elapsed < sides[i].length || last)
      return {
        side: i,
        offset: Math.min(elapsed, sides[i].length),
        at: now,
      }
    elapsed -= sides[i].length + FLIP_SEC
    // Mid-flip: call it the start of the next side.
    if (elapsed < 0) return { side: i + 1, offset: 0, at: now }
  }
  return { side: 0, offset: 0, at: now }
}

export type Position =
  | {
      state: 'playing'
      side: Side
      track: TimedTrack
      /** Seconds into the current track. */
      intoTrack: number
      /** Seconds into the side. */
      intoSide: number
    }
  /** The side ran out and there's another one to play. */
  | { state: 'flip'; side: Side; next: Side }
  /** The last side ran out. */
  | { state: 'finished'; side: Side }

export function positionAt(
  sides: Side[],
  cursor: Cursor,
  now: number,
): Position | null {
  const side = sides.at(cursor.side)
  if (!side) return null
  const intoSide = cursor.offset + Math.max(0, (now - cursor.at) / 1000)
  if (intoSide >= side.length) {
    const next = sides.at(cursor.side + 1)
    return next ? { state: 'flip', side, next } : { state: 'finished', side }
  }
  let track = side.tracks[0]
  for (const t of side.tracks) if (t.start <= intoSide) track = t
  return {
    state: 'playing',
    side,
    track,
    intoTrack: intoSide - track.start,
    intoSide,
  }
}
