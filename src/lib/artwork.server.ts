import { editionTokens } from '#/lib/editions'
import { spotifyAppToken } from '#/lib/spotify.server'

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
  return s
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
    .replace(/[^a-z0-9]/g, '')
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

/**
 * Total length of a streaming album in seconds, used when Discogs has no
 * track times. If the vinyl's track count is known, only that many tracks are
 * summed, so digital bonus tracks don't inflate it. Null if unavailable.
 */
export async function albumDurationSec(
  art: Pick<Artwork, 'id' | 'source'>,
  vinylTrackCount?: number,
): Promise<number | null> {
  let lengthsMs: number[] = []
  if (art.source === 'spotify') {
    const token = await spotifyAppToken()
    if (!token) return null
    const res = await fetch(
      `https://api.spotify.com/v1/albums/${encodeURIComponent(art.id)}/tracks?limit=50`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      items?: Array<{ duration_ms?: number }>
    }
    lengthsMs = (data.items ?? []).map((t) => t.duration_ms ?? 0)
  } else {
    const res = await fetch(
      `https://itunes.apple.com/lookup?id=${encodeURIComponent(art.id)}&entity=song`,
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      results?: Array<{
        wrapperType: string
        discNumber?: number
        trackNumber?: number
        trackTimeMillis?: number
      }>
    }
    lengthsMs = (data.results ?? [])
      .filter((r) => r.wrapperType === 'track')
      .sort(
        (a, b) =>
          (a.discNumber ?? 1) - (b.discNumber ?? 1) ||
          (a.trackNumber ?? 0) - (b.trackNumber ?? 0),
      )
      .map((t) => t.trackTimeMillis ?? 0)
  }
  if (!lengthsMs.length) return null
  const counted =
    vinylTrackCount && lengthsMs.length >= vinylTrackCount
      ? lengthsMs.slice(0, vinylTrackCount)
      : lengthsMs
  const total = Math.round(counted.reduce((a, b) => a + b, 0) / 1000)
  return total > 0 ? total : null
}
