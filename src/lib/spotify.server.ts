import { env } from '#/lib/env.server'

// Spotify is optional enrichment: artist genres (a second opinion next to
// Discogs styles) and an artist photo. Uses the client-credentials flow, so
// no user ever connects Spotify. Every field is treated as optional because
// Spotify has been trimming what it returns to development-mode apps.

let tokenCache: { token: string; expiresAt: number } | null = null

export async function spotifyAppToken(): Promise<string | null> {
  const creds = env.spotify
  if (!creds) return null
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000)
    return tokenCache.token
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${creds.id}:${creds.secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  })
  if (!res.ok) {
    console.error('[spotify] token failed', res.status)
    return null
  }
  const json = (await res.json()) as {
    access_token: string
    expires_in: number
  }
  tokenCache = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  }
  return json.access_token
}

export type SpotifyArtist = {
  spotify_id: string
  genres: string[]
  image_url: string | null
  popularity: number | null
}

type SearchResponse = {
  artists?: {
    items?: Array<{
      id: string
      name: string
      genres?: string[]
      popularity?: number
      images?: Array<{ url: string; width?: number }>
    }>
  }
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]/g, '')

/** Returns null when there's no confident match. Throws if Spotify is unavailable. */
export async function findSpotifyArtist(
  name: string,
): Promise<SpotifyArtist | null> {
  const token = await spotifyAppToken()
  if (!token) throw new Error('Spotify unavailable')
  const q = encodeURIComponent(`artist:"${name.replace(/"/g, '')}"`)
  const res = await fetch(
    `https://api.spotify.com/v1/search?type=artist&limit=5&q=${q}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  )
  // Throw (rather than return null) so callers don't cache a failure as "no match".
  if (!res.ok) throw new Error(`Spotify search failed (${res.status})`)
  const data = (await res.json()) as SearchResponse
  const items = data.artists?.items ?? []
  // Only accept an exact (normalised) name match: a wrong artist's genres are
  // worse than none.
  const match = items.find((a) => normalize(a.name) === normalize(name))
  if (!match) return null
  const image = [...(match.images ?? [])]
    .sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
    .find((i) => (i.width ?? 0) >= 160)
  return {
    spotify_id: match.id,
    genres: match.genres ?? [],
    image_url: image?.url ?? match.images?.[0]?.url ?? null,
    popularity: typeof match.popularity === 'number' ? match.popularity : null,
  }
}
