import { editionTokens } from '#/lib/editions'
import { spotifyAppToken } from '#/lib/spotify.server'
import { trackSeconds } from '#/lib/track-follower'

// Clean album artwork. A Discogs release's primary image is often a photo of
// the sleeve and disc, so we look the album up on Spotify first, then Apple
// (iTunes Search, no key needed), and only fall back to Discogs if neither
// has a confident match.
//
// Special editions ("10th Anniversary", "Deluxe") often have their own
// artwork, so for those we look for a streaming match of the same edition;
// without one, the release's own Discogs image is the better choice.

export type Artwork = {
  url: string
  thumb: string
  source: 'spotify' | 'itunes'
  /** Spotify album id or Apple collection id, for looking up track lengths. */
  id: string
  /** The streaming service's album name, e.g. "Peripheral Vision (10 Year Anniversary…)". */
  name: string
}

export type ArtworkResult = {
  /** The regular album's cover. */
  album: Artwork | null
  /** A cover for this specific edition, when the release is one and a match exists. */
  edition: Artwork | null
}

/** Loose-but-safe comparison key: case, accents, punctuation and edition noise removed. */
export function matchKey(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/&|\+/g, ' and ')
      .replace(/\s*[([].*?[)\]]\s*/g, ' ') // "(2022 Remaster)", "[Deluxe]"
      .replace(
        /\s+-\s+(ep|single|remaster(ed)?|deluxe.*|\d+(th)? (year )?anniversary.*)$/g,
        '',
      )
      .replace(/\b(the|a|an)\b/g, '')
      // Streaming services often append the format with no dash: "Opium EP".
      .replace(/(\S)\s+(ep|single)$/g, '$1')
      .replace(/[^a-z0-9]/g, '')
  )
}

function sameArtist(want: string, got: string) {
  const [w, g] = [matchKey(want), matchKey(got)]
  return (
    w === g ||
    (w.length > 3 && g.length > 3 && (w.includes(g) || g.includes(w)))
  )
}

/** Search-friendly title: drop "(10th Anniversary Edition)" and friends. */
const searchTitle = (t: string) => t.replace(/\s*[([].*?[)\]]\s*/g, ' ').trim()

async function spotifySearch(
  query: string,
): Promise<Array<Artwork & { artists: string[] }>> {
  const token = await spotifyAppToken()
  if (!token) return []
  const res = await fetch(
    `https://api.spotify.com/v1/search?type=album&limit=10&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) throw new Error(`Spotify album search failed (${res.status})`)
  const data = (await res.json()) as {
    albums?: {
      items?: Array<{
        id: string
        name: string
        artists: Array<{ name: string }>
        images?: Array<{ url: string; width?: number }>
      }>
    }
  }
  return (data.albums?.items ?? []).flatMap((a) => {
    if (!a.images?.length) return []
    const bySize = [...a.images].sort((x, y) => (y.width ?? 0) - (x.width ?? 0))
    const mid = bySize.find(
      (i) => (i.width ?? 0) <= 300 && (i.width ?? 0) >= 200,
    )
    return [
      {
        artists: a.artists.map((x) => x.name),
        id: a.id,
        name: a.name,
        url: bySize[0].url,
        thumb: (mid ?? bySize[0]).url,
        source: 'spotify' as const,
      },
    ]
  })
}

async function itunesSearch(
  query: string,
): Promise<Array<Artwork & { artists: string[] }>> {
  const res = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&limit=25`,
  )
  if (!res.ok) throw new Error(`iTunes search failed (${res.status})`)
  const data = (await res.json()) as {
    results?: Array<{
      collectionId: number
      artistName: string
      collectionName: string
      artworkUrl100?: string
    }>
  }
  return (data.results ?? []).flatMap((r) =>
    r.artworkUrl100
      ? [
          {
            artists: [r.artistName],
            id: String(r.collectionId),
            name: r.collectionName,
            // Apple serves any size by rewriting the dimensions in the URL.
            url: r.artworkUrl100.replace(/\/\d+x\d+bb\./, '/1000x1000bb.'),
            thumb: r.artworkUrl100.replace(/\/\d+x\d+bb\./, '/300x300bb.'),
            source: 'itunes' as const,
          },
        ]
      : [],
  )
}

function editionPhrase(tokens: string[]): string {
  const anniversary = tokens.find((t) => t.startsWith('anniversary:'))
  return anniversary ? `${anniversary.split(':')[1]}th anniversary` : tokens[0]
}

/**
 * Finds the album cover and, for special editions, an edition-specific one.
 * `editionText` is everything else that might name the edition (format text
 * and descriptions). Throws only if every source errored, so a transient
 * outage doesn't get cached as "no artwork".
 */
export async function findArtwork(
  artist: string,
  title: string,
  editionText = '',
): Promise<ArtworkResult> {
  const wanted = editionTokens(`${title} ${editionText}`)
  const base = matchKey(title)
  type Hit = Artwork & { artists: string[] }
  const isAlbum = (c: Hit) =>
    c.artists.some((a) => sameArtist(artist, a)) && matchKey(c.name) === base
  const isEdition = (c: Hit) =>
    isAlbum(c) && editionTokens(c.name).some((t) => wanted.includes(t))
  const strip = ({ artists: _artists, ...art }: Hit): Artwork => art

  let album: Hit | undefined
  let edition: Hit | undefined
  let failures = 0
  const sources = [spotifySearch, itunesSearch]
  for (const search of sources) {
    try {
      const queries = [`${searchTitle(title)} ${artist}`]
      // Editions are often missing from a plain search; ask for them by name too.
      if (wanted.length)
        queries.push(`${searchTitle(title)} ${editionPhrase(wanted)} ${artist}`)
      for (const q of queries) {
        const found = await search(q)
        // Prefer the plain album ("Jar") over an edition ("Jar (Deluxe)") for the regular cover.
        album ??=
          found.find((c) => isAlbum(c) && !editionTokens(c.name).length) ??
          found.find(isAlbum)
        if (wanted.length) edition ??= found.find(isEdition)
      }
    } catch (e) {
      failures++
      console.warn('[artwork]', (e as Error).message, artist, title)
    }
    if (album && (!wanted.length || edition)) break
  }
  if (failures === sources.length)
    throw new Error('Artwork sources unavailable')
  return {
    album: album ? strip(album) : null,
    edition: edition ? strip(edition) : null,
  }
}

export type StreamedTrack = { name: string; sec: number }

/** A streaming album's tracks, in album order, with lengths in seconds. */
export async function albumTracks(
  art: Pick<Artwork, 'id' | 'source'>,
): Promise<StreamedTrack[]> {
  if (art.source === 'spotify') {
    const token = await spotifyAppToken()
    if (!token) return []
    const res = await fetch(
      `https://api.spotify.com/v1/albums/${encodeURIComponent(art.id)}/tracks?limit=50`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) return []
    const data = (await res.json()) as {
      items?: Array<{ name?: string; duration_ms?: number }>
    }
    return (data.items ?? []).map((t) => ({
      name: t.name ?? '',
      sec: Math.round((t.duration_ms ?? 0) / 1000),
    }))
  }
  const res = await fetch(
    `https://itunes.apple.com/lookup?id=${encodeURIComponent(art.id)}&entity=song`,
  )
  if (!res.ok) return []
  const data = (await res.json()) as {
    results?: Array<{
      wrapperType: string
      trackName?: string
      discNumber?: number
      trackNumber?: number
      trackTimeMillis?: number
    }>
  }
  return (data.results ?? [])
    .filter((r) => r.wrapperType === 'track')
    .sort(
      (a, b) =>
        (a.discNumber ?? 1) - (b.discNumber ?? 1) ||
        (a.trackNumber ?? 0) - (b.trackNumber ?? 0),
    )
    .map((t) => ({
      name: t.trackName ?? '',
      sec: Math.round((t.trackTimeMillis ?? 0) / 1000),
    }))
}

/** Track lengths of a streaming album in seconds, in album order. */
export async function albumTrackLengths(
  art: Pick<Artwork, 'id' | 'source'>,
): Promise<number[]> {
  return (await albumTracks(art)).map((t) => t.sec)
}

/**
 * Words in a "(…)" or " - …" tag that make it a different recording, with a
 * different length: an instrumental isn't the album take. "(2011 Remaster)"
 * or "(Mono)" are the same recording and don't count.
 */
const RECORDING_TAGS: Array<[RegExp, string]> = [
  [/\binstrumental\b/i, 'instrumental'],
  [/\bacoustic\b/i, 'acoustic'],
  [/\bdemo\b/i, 'demo'],
  [/\blive\b/i, 'live'],
  [/\bremix\b/i, 'remix'],
  [/\balternat(e|ive)\b/i, 'alternate'],
  [/\b(radio |single )?edit\b/i, 'edit'],
  // Only when nothing more specific is named (see songKey).
  [/\bversion\b/i, 'version'],
]

/**
 * A song title's comparison key. Discogs credits guests in the title
 * ("Myself In The Way Feat. Brendan Yates") and Spotify tags reissues on the
 * end ("Song - 2011 Remaster"); neither changes the song. A tag naming
 * another recording ("(Instrumental)", "- Live at …") is kept, so a deluxe
 * edition's instrumental doesn't get the album take's length.
 */
export function songKey(title: string): string {
  const name = title.replace(/\s+(feat\.?|ft\.?|featuring)\s.*$/i, '')
  const tags = [
    ...[...name.matchAll(/[([]([^)\]]*)[)\]]/g)].map((m) => m[1]),
    /\s+-\s+(.+)$/.exec(name)?.[1] ?? '',
  ]
  const found = RECORDING_TAGS.filter(([re]) =>
    tags.some((t) => re.test(t)),
  ).map(([, tag]) => tag)
  // "Alternate Version" is just alternate; "Juno Version" stays a version.
  const recording =
    found.length > 1 ? found.filter((t) => t !== 'version') : found
  const base = matchKey(
    name.replace(
      /\s+-\s+[^-]*\b(remaster(ed)?|version|mix|edit|mono|stereo|live|demo|bonus|instrumental|acoustic|alternat(e|ive)|remix)\b[^-]*$/i,
      '',
    ),
  )
  return recording.length ? `${base}~${recording.join('~')}` : base
}

/**
 * One song's length, found by title and artist on Spotify: for tracks the
 * album lookup couldn't place (a split EP, a vinyl-only bonus track). Null
 * when there's no clear match.
 */
export async function spotifyTrackSeconds(
  artist: string,
  title: string,
): Promise<number | null> {
  const token = await spotifyAppToken()
  if (!token) return null
  const res = await fetch(
    `https://api.spotify.com/v1/search?type=track&limit=10&q=${encodeURIComponent(
      `track:${searchTitle(title.replace(/\s+(feat\.?|ft\.?|featuring)\s.*$/i, ''))} artist:${artist}`,
    )}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) return null
  const data = (await res.json()) as {
    tracks?: {
      items?: Array<{
        name: string
        duration_ms: number
        artists: Array<{ name: string }>
      }>
    }
  }
  const want = songKey(title)
  const hit = (data.tracks?.items ?? []).find(
    (t) =>
      songKey(t.name) === want &&
      t.artists.some((a) => sameArtist(artist, a.name)),
  )
  return hit ? Math.round(hit.duration_ms / 1000) : null
}

/** Songs looked up one by one at most: a long box set shouldn't fire dozens of searches. */
const MAX_SONG_SEARCHES = 24

/**
 * Lengths for the vinyl tracks Discogs has no time for, matched by song
 * title: from the streaming `album` first, then a Spotify search per song for
 * the rest. Titles, not positions, because vinyl and streaming tracklists
 * differ (a side-C bonus track, a single left off, a different order). Null
 * when nothing was found.
 */
export async function missingTrackLengths(
  artist: string,
  album: Artwork | null,
  vinylTracks: Array<{
    position: string
    title: string
    duration: string
    /** The track's own artist, on splits and compilations. */
    artist?: string
  }>,
): Promise<{
  source: 'spotify' | 'itunes'
  lengths: Array<{ position: string; sec: number }>
  /** The streaming album they came from; null when found song by song. */
  album: string | null
} | null> {
  const missing = vinylTracks.filter((t) => trackSeconds(t.duration) === 0)
  if (!missing.length) return null
  const streamed = album ? await albumTracks(album) : []
  const lengths: Array<{ position: string; sec: number }> = []
  const used = new Set<number>()
  for (const t of missing) {
    const key = songKey(t.title)
    const i = streamed.findIndex(
      (s, j) => !used.has(j) && s.sec > 0 && songKey(s.name) === key,
    )
    if (i < 0) continue
    used.add(i)
    lengths.push({ position: t.position, sec: streamed[i].sec })
  }
  // Same album, titles written another way (another script, another
  // language): fall back to album order when no title matched at all.
  if (!lengths.length && streamed.length >= vinylTracks.length)
    vinylTracks.forEach((t, i) => {
      if (trackSeconds(t.duration) === 0 && streamed[i].sec > 0)
        lengths.push({ position: t.position, sec: streamed[i].sec })
    })
  const fromAlbum = lengths.length

  const placed = new Set(lengths.map((l) => l.position))
  const rest = missing
    .filter((t) => !placed.has(t.position))
    .slice(0, MAX_SONG_SEARCHES)
  const searched = await Promise.all(
    rest.map((t) =>
      spotifyTrackSeconds(t.artist || artist, t.title).catch(() => null),
    ),
  )
  rest.forEach((t, i) => {
    const sec = searched[i]
    if (sec) lengths.push({ position: t.position, sec })
  })

  if (!lengths.length) return null
  return {
    source: fromAlbum && album ? album.source : 'spotify',
    lengths,
    album: fromAlbum && album ? album.name : null,
  }
}

/**
 * Total length of a streaming album in seconds, used when Discogs has no
 * track times. If the vinyl's track count is known, only that many tracks are
 * summed, so digital bonus tracks don't inflate it. Null if unavailable.
 */
export async function albumDurationSec(
  art: Pick<Artwork, 'id' | 'source'>,
  vinylTrackCount?: number,
): Promise<number | null> {
  const lengths = await albumTrackLengths(art)
  if (!lengths.length) return null
  const counted =
    vinylTrackCount && lengths.length >= vinylTrackCount
      ? lengths.slice(0, vinylTrackCount)
      : lengths
  const total = counted.reduce((a, b) => a + b, 0)
  return total > 0 ? total : null
}
