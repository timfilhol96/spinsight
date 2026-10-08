import { env } from '#/lib/env.server'
import type { Popularity } from '#/lib/liner-notes'

// Last.fm: how many people listen to a track, album or artist, and how often.
// Read-only, with an API key; scrobbling would need each listener to connect
// their own account. Off (null) until LASTFM_API_KEY is set.

const LASTFM = 'https://ws.audioscrobbler.com/2.0/'
const TIMEOUT_MS = 6_000

/** Last.fm sends counts as strings. */
const count = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

async function lastfmGet<T>(
  method: string,
  params: Record<string, string>,
): Promise<T | null> {
  const key = env.lastfmKey
  if (!key) return null
  try {
    const res = await fetch(
      `${LASTFM}?${new URLSearchParams({
        method,
        api_key: key,
        format: 'json',
        // "Radiohead - Paranoid Android (Remastered)" finds the right page.
        autocorrect: '1',
        ...params,
      })}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    )
    if (!res.ok) return null
    const data = (await res.json()) as T & { error?: number }
    return data.error ? null : data
  } catch {
    return null
  }
}

type Counts = { listeners?: string; playcount?: string; url?: string }

function popularity(c: Counts | undefined): Popularity | null {
  const listeners = count(c?.listeners)
  return c && listeners
    ? { listeners, plays: count(c.playcount), url: c.url ?? '' }
    : null
}

export async function lastfmTrack(
  artist: string,
  track: string,
): Promise<Popularity | null> {
  const data = await lastfmGet<{ track?: Counts }>('track.getInfo', {
    artist,
    track,
  })
  return popularity(data?.track)
}

export async function lastfmAlbum(
  artist: string,
  album: string,
): Promise<Popularity | null> {
  const data = await lastfmGet<{ album?: Counts }>('album.getInfo', {
    artist,
    album,
  })
  return popularity(data?.album)
}

export async function lastfmArtist(artist: string): Promise<Popularity | null> {
  const data = await lastfmGet<{
    artist?: { url?: string; stats?: Counts }
  }>('artist.getInfo', { artist })
  return popularity(
    data?.artist && { ...data.artist.stats, url: data.artist.url },
  )
}
