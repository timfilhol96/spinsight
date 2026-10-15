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
  description?: { dom?: DomNode }
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

/** Genius's description as a tree, asked for with text_format=dom. */
type DomNode = string | { tag: string; children?: DomNode[] }

const textOf = (n: DomNode): string =>
  typeof n === 'string'
    ? n
    : n.tag === 'br'
      ? '\n'
      : (n.children ?? []).map(textOf).join('')

const hasTag = (n: DomNode, tags: RegExp): boolean =>
  typeof n !== 'string' &&
  (tags.test(n.tag) || (n.children ?? []).some((c) => hasTag(c, tags)))

/** Pictures and players, which the story can't show. */
const MEDIA = /^(img|iframe|video|audio|embed|object)$/
const CAPTION = /^(small|center|figcaption)$/

/** Does `text` end on a whole sentence, before any "- Source" under a quote? */
const endsSentence = (text: string) =>
  /[.!?…"”’')\]]$/.test(text.replace(/\n[-–—].*$/, ''))

/** A caption, set small or centred under a picture. */
const isCaption = (n: DomNode) =>
  typeof n !== 'string' &&
  (n.children ?? []).every((c) =>
    typeof c === 'string' ? !c.trim() : hasTag(c, CAPTION),
  )

/**
 * The description's paragraphs, each with whether it ends a sentence.
 * Pictures, players (a bare link to a video is shown as one) and their
 * captions are left out, and so is a lead-in to one ("Watch it below:").
 */
function paragraphsOf(root: DomNode): Array<{ text: string; ends: boolean }> {
  const out: Array<{ text: string; ends: boolean }> = []
  const visit = (n: DomNode) => {
    // A quote or list: one paragraph per paragraph or item in it.
    if (
      typeof n !== 'string' &&
      /^(blockquote|ul|ol|div)$/.test(n.tag) &&
      n.children?.some((c) => typeof c !== 'string' && /^(p|li)$/.test(c.tag))
    ) {
      n.children.forEach(visit)
      return
    }
    const text = textOf(n)
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
    if ((hasTag(n, MEDIA) && !text) || /^https?:\/\/\S+$/.test(text)) {
      if (out.at(-1)?.text.endsWith(':')) out.pop()
    } else if (text && !isCaption(n)) {
      out.push({ text, ends: endsSentence(text) })
    }
  }
  ;(typeof root === 'string' ? [root] : (root.children ?? [])).forEach(visit)
  return out
}

/**
 * Whole paragraphs from the start, up to MAX_STORY characters. A paragraph
 * that stops short of a full stop ("As he said:", "…and said") goes with
 * the one after it, or not at all.
 */
function story(root: DomNode | undefined): string | null {
  const paragraphs = root ? paragraphsOf(root) : []
  // An empty description comes back as "?".
  if (!paragraphs.length || paragraphs.map((p) => p.text).join('') === '?')
    return null
  const units: string[][] = []
  for (let i = 0; i < paragraphs.length; i++) {
    const unit = [paragraphs[i].text]
    while (!paragraphs[i].ends && i + 1 < paragraphs.length)
      unit.push(paragraphs[++i].text)
    // Nothing follows to finish the sentence.
    if (paragraphs[i].ends || unit.length > 1) units.push(unit)
  }
  const out: string[] = []
  let length = 0
  for (const unit of units) {
    const size = unit.reduce((n, p) => n + p.length, 0)
    if (out.length && length + size > MAX_STORY) break
    out.push(...unit)
    length += size
  }
  return out.length ? out.join('\n\n') : null
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
    `/songs/${hit.result.id}?text_format=dom`,
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
    story: story(song.description?.dom),
    recordedAt: places(song.recording_location),
    writers: (song.writer_artists ?? []).map((a) => a.name),
    producers: (song.producer_artists ?? []).map((a) => a.name),
    connections,
  }
}
