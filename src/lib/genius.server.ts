import { matchKey } from '#/lib/artwork.server'
import { env } from '#/lib/env.server'
import type { TrackFacts } from '#/lib/liner-notes'

// Genius for the track that's playing: the story behind the song (its
// description), where it was recorded, who wrote and produced it, and what
// it samples or was covered by. Lyrics are never fetched or shown.
// A client access token is enough: nothing here acts as a user.

const GENIUS = 'https://api.genius.com'
const TIMEOUT_MS = 8_000
/** The story is cut to whole paragraphs under this length. */
const MAX_STORY = 700
/** Songs named per connection ("Covered by"); the rest are counted. */
const MAX_SONGS = 3

type Artist = { name: string; is_verified?: boolean }
type SongRef = {
  title: string
  primary_artist: Artist
  pyongs_count?: number | null
  lyrics_state?: string
  /** Page views are only given once a song has a few thousand. */
  stats?: { pageviews?: number }
}
type Hit = { type: string; result: SongRef & { id: number } }
type Song = SongRef & {
  url: string
  description?: { plain?: string }
  recording_location?: string | null
  writer_artists?: Artist[]
  producer_artists?: Artist[]
  song_relationships?: Array<{ relationship_type: string; songs: SongRef[] }>
}

async function geniusGet<T>(path: string): Promise<T | null> {
  const token = env.geniusToken
  if (!token) return null
  try {
    const res = await fetch(`${GENIUS}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    return ((await res.json()) as { response: T }).response
  } catch {
    return null
  }
}

export type GeniusSong = NonNullable<TrackFacts['genius']> & {
  story: string | null
}

/**
 * How each relationship reads, in the order they're shown. What the song
 * itself borrows is always named (there are only ever a few); what borrowed
 * from it, only when well known.
 */
const CONNECTIONS: Array<[type: string, label: string, borrowed: boolean]> = [
  ['cover_of', 'A cover of', true],
  ['samples', 'Samples', true],
  ['interpolates', 'Interpolates', true],
  ['sampled_in', 'Sampled by', false],
  ['covered_by', 'Covered by', false],
  ['interpolated_by', 'Interpolated by', false],
]

/** Fan uploads, medleys and joke titles, not songs anyone would know. */
const NOT_A_SONG =
  /mash ?-?up|megamix|medley|cypher|freestyle|vlog|parody|otamatone|8-bit|karaoke|tribute|rewind|vocaloid|\d+ songs|^["“]|\p{Extended_Pictographic}/iu

/**
 * How well known a related song is. Genius lists them in no useful order,
 * and most are fan uploads: only songs with page views or by a verified
 * artist are named, the rest counted.
 */
const notability = (s: SongRef) =>
  (s.stats?.pageviews ?? 0) +
  (s.primary_artist.is_verified ? 5_000 : 0) +
  (s.pyongs_count ?? 0) * 500

/**
 * "Studio Gang, Paris, Île-de-France, France; Electric Lady Studios, …" →
 * "Studio Gang, Paris & Electric Lady Studios, Greenwich Village and 3 more".
 */
function places(raw: string | null | undefined): string | null {
  const all = [
    ...new Set(
      (raw ?? '')
        .split(/\s*(?:;|\s\/\s|\n)\s*/)
        .map((p) => p.split(',').slice(0, 2).join(',').trim())
        .filter(Boolean),
    ),
  ]
  if (!all.length) return null
  const more = all.length - 2
  return `${all.slice(0, 2).join(' & ')}${more > 0 ? ` and ${more} more` : ''}`
}

/** Whole paragraphs from the start, up to MAX_STORY characters. */
function story(plain: string | undefined): string | null {
  const paragraphs = (plain ?? '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
  // An empty description comes back as "?".
  if (!paragraphs.length || paragraphs.join('') === '?') return null
  const out: string[] = []
  let length = 0
  for (const p of paragraphs) {
    if (out.length && length + p.length > MAX_STORY) break
    out.push(p)
    length += p.length
  }
  return out.join('\n\n')
}

/**
 * The song on Genius, only when the artist and title both match: a search
 * also returns translations and fan-made pages of the same song.
 */
export async function geniusSong(
  artist: string,
  title: string,
): Promise<GeniusSong | null> {
  const search = await geniusGet<{ hits: Hit[] }>(
    `/search?${new URLSearchParams({ q: `${artist} ${title}` })}`,
  )
  const artistKey = matchKey(artist)
  const titleKey = matchKey(title)
  const hit = search?.hits.find(
    (h) =>
      h.type === 'song' &&
      matchKey(h.result.primary_artist.name) === artistKey &&
      matchKey(h.result.title) === titleKey,
  )
  if (!hit) return null
  const data = await geniusGet<{ song: Song }>(
    `/songs/${hit.result.id}?text_format=plain`,
  )
  const song = data?.song
  if (!song) return null

  const byOthers = (songs: SongRef[]) =>
    songs.filter(
      (s) =>
        matchKey(s.primary_artist.name) !== artistKey &&
        s.lyrics_state !== 'unreleased' &&
        !NOT_A_SONG.test(s.title),
    )
  const connections = CONNECTIONS.flatMap(([type, label, borrowed]) => {
    const songs = byOthers(
      song.song_relationships?.find((r) => r.relationship_type === type)
        ?.songs ?? [],
    )
    if (!songs.length) return []
    // A cover keeps the title, so the artist alone says it.
    const named = songs
      .filter((s) => borrowed || notability(s) > 0)
      .sort((a, b) => notability(b) - notability(a))
      .slice(0, MAX_SONGS)
      .map((s) =>
        matchKey(s.title) === titleKey
          ? s.primary_artist.name
          : `${s.title} by ${s.primary_artist.name}`,
      )
    return [{ label, songs: named, more: songs.length - named.length }]
  })
  return {
    url: song.url,
    story: story(song.description?.plain),
    recordedAt: places(song.recording_location),
    writers: (song.writer_artists ?? []).map((a) => a.name),
    producers: (song.producer_artists ?? []).map((a) => a.name),
    connections,
  }
}
