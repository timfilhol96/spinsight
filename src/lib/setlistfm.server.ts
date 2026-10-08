import { matchKey } from '#/lib/artwork.server'
import { env } from '#/lib/env.server'
import type { LiveTrack, Show } from '#/lib/liner-notes'

// setlist.fm: what the artist plays live. Their latest shows are fetched
// once per artist (two pages of 20) and every track of the record is checked
// against them: "played at 31 of their last 40 shows".
//
// The API allows two requests a second and 1,440 a day per key, so requests
// are spaced out and each artist's shows are kept for a few hours.

const SETLISTFM = 'https://api.setlist.fm/rest/1.0'
// Two a second on paper; closer than a second apart still gets a 429 at times.
const GAP_MS = 1_000
const TIMEOUT_MS = 8_000
const PAGES = 2
const CACHE_MS = 6 * 60 * 60_000

/** When the next request may go out. Per server instance. */
let nextSlot = 0

/** Waits for the next free slot. */
async function slot() {
  const now = Date.now()
  const at = Math.max(now, nextSlot)
  nextSlot = at + GAP_MS
  if (at > now) await new Promise((r) => setTimeout(r, at - now))
}

async function setlistGet<T>(path: string, retry = true): Promise<T | null> {
  const key = env.setlistfmKey
  if (!key) return null
  await slot()
  try {
    const res = await fetch(`${SETLISTFM}${path}`, {
      headers: { 'x-api-key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    // Too fast: once more, in the next slot.
    if (res.status === 429 && retry) return setlistGet<T>(path, false)
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

type Setlist = {
  /** "16-12-2025". */
  eventDate: string
  artist?: { url?: string }
  venue?: { name?: string; city?: { name?: string } }
  tour?: { name?: string }
  sets?: { set?: Array<{ song?: Array<{ name?: string; tape?: boolean }> }> }
}

type SetlistPage = { setlist?: Setlist[]; total?: number }

export type LiveHistory = {
  /** Every show setlist.fm has for the artist. */
  total: number
  url: string
  /** Latest shows with a known setlist, newest first. */
  recent: Array<Show & { songs: Set<string> }>
  /** The latest of them, without its songs. */
  last: Show | null
}

const cache = new Map<string, { at: number; history: LiveHistory | null }>()

function toShow(s: Setlist): Show {
  const [d, m, y] = s.eventDate.split('-')
  return {
    date: `${y}-${m}-${d}`,
    place: [s.venue?.name, s.venue?.city?.name].filter(Boolean).join(', '),
    tour: s.tour?.name ?? null,
  }
}

/** The artist's MusicBrainz ID from setlist.fm's own search, by exact name. */
async function findArtist(name: string): Promise<string | null> {
  const data = await setlistGet<{
    artist?: Array<{ mbid: string; name: string }>
  }>(
    `/search/artists?${new URLSearchParams({ artistName: name, sort: 'relevance' })}`,
  )
  const key = matchKey(name)
  return data?.artist?.find((a) => matchKey(a.name) === key)?.mbid ?? null
}

/**
 * The artist's latest shows, by MusicBrainz ID when known (exact), else
 * found by name. Null when setlist.fm has none or couldn't answer.
 */
export async function liveHistory(
  artist: string,
  mbid: string | null,
): Promise<LiveHistory | null> {
  if (!env.setlistfmKey || !artist) return null
  const cacheKey = mbid ?? `name:${matchKey(artist)}`
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.history

  const id = mbid ?? (await findArtist(artist))
  if (!id) return null
  const pages: SetlistPage[] = []
  for (let p = 1; p <= PAGES; p++) {
    const page = await setlistGet<SetlistPage>(`/artist/${id}/setlists?p=${p}`)
    if (!page?.setlist?.length) break
    pages.push(page)
    if ((page.total ?? 0) <= p * page.setlist.length) break
  }
  if (!pages.length) return null
  const setlists = pages.flatMap((p) => p.setlist ?? [])
  const history: LiveHistory = {
    total: pages[0].total ?? setlists.length,
    url:
      setlists.find((s) => s.artist?.url)?.artist?.url ??
      'https://www.setlist.fm',
    recent: setlists.flatMap((s) => {
      // Upcoming shows are listed too, with no songs yet; tapes (intro
      // music) aren't played by the band.
      const songs = new Set(
        (s.sets?.set ?? [])
          .flatMap((set) => set.song ?? [])
          .filter((song) => song.name && !song.tape)
          .map((song) => matchKey(song.name!)),
      )
      return songs.size ? [{ ...toShow(s), songs }] : []
    }),
    last: null,
  }
  const latest = history.recent.at(0)
  history.last = latest
    ? { date: latest.date, place: latest.place, tour: latest.tour }
    : null
  cache.set(cacheKey, { at: Date.now(), history })
  return history
}

/** How often a track came up in the artist's latest shows. */
export function liveTrack(
  history: LiveHistory | null,
  title: string,
): LiveTrack | null {
  if (!history?.recent.length) return null
  const key = matchKey(title)
  const shows = history.recent.filter((s) => s.songs.has(key))
  const last = shows[0]
  return {
    played: shows.length,
    of: history.recent.length,
    last: last ? { date: last.date, place: last.place, tour: last.tour } : null,
  }
}
