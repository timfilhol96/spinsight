import { randomBytes } from 'node:crypto'
import { env } from '#/lib/env.server'
import type { DiscogsFormat } from '#/lib/vinyl-color'

// Discogs API client. Auth is OAuth 1.0a with PLAINTEXT signatures (allowed by
// Discogs over HTTPS), so no request signing is needed — just the secrets.
// Docs: https://www.discogs.com/developers#page:authentication

const API = 'https://api.discogs.com'
const USER_AGENT = 'Spinsight/0.1'

export type OAuthToken = { token: string; secret: string }

function oauthHeader(params: Record<string, string>, tokenSecret = ''): string {
  const all: Record<string, string> = {
    oauth_consumer_key: env.discogsConsumerKey,
    oauth_nonce: randomBytes(12).toString('hex'),
    oauth_signature_method: 'PLAINTEXT',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: '1.0',
    ...params,
    oauth_signature: `${encodeURIComponent(env.discogsConsumerSecret)}&${encodeURIComponent(tokenSecret)}`,
  }
  return (
    'OAuth ' +
    Object.entries(all)
      .map(
        ([k, v]) =>
          `${k}="${k === 'oauth_signature' ? v : encodeURIComponent(v)}"`,
      )
      .join(', ')
  )
}

async function oauthPost(
  url: string,
  header: string,
): Promise<URLSearchParams> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: header,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
  })
  const body = await res.text()
  if (!res.ok)
    throw new Error(
      `Discogs OAuth failed (${res.status}): ${body.slice(0, 200)}`,
    )
  return new URLSearchParams(body)
}

export async function getRequestToken(
  callbackUrl: string,
): Promise<OAuthToken> {
  const p = await oauthPost(
    `${API}/oauth/request_token`,
    oauthHeader({ oauth_callback: callbackUrl }),
  )
  const token = p.get('oauth_token')
  const secret = p.get('oauth_token_secret')
  if (!token || !secret)
    throw new Error('Discogs did not return a request token')
  return { token, secret }
}

export function authorizeUrl(requestToken: string): string {
  return `https://www.discogs.com/oauth/authorize?oauth_token=${encodeURIComponent(requestToken)}`
}

export async function getAccessToken(
  request: OAuthToken,
  verifier: string,
): Promise<OAuthToken> {
  const p = await oauthPost(
    `${API}/oauth/access_token`,
    oauthHeader(
      { oauth_token: request.token, oauth_verifier: verifier },
      request.secret,
    ),
  )
  const token = p.get('oauth_token')
  const secret = p.get('oauth_token_secret')
  if (!token || !secret)
    throw new Error('Discogs did not return an access token')
  return { token, secret }
}

// ---------- API calls ----------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * GET against the Discogs API as the given user. Discogs allows 60 requests a
 * minute per user; we slow down as the remaining budget runs low and back off
 * on 429s instead of failing.
 */
export async function discogsGet<T>(
  path: string,
  auth: OAuthToken,
  attempt = 0,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: oauthHeader({ oauth_token: auth.token }, auth.secret),
      'User-Agent': USER_AGENT,
      Accept: 'application/vnd.discogs.v2.discogs+json',
    },
  })
  if (res.status === 429 && attempt < 4) {
    await sleep(5_000 * (attempt + 1))
    return discogsGet<T>(path, auth, attempt + 1)
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `Discogs ${path} failed (${res.status}): ${body.slice(0, 200)}`,
    )
  }
  const remaining = Number(
    res.headers.get('x-discogs-ratelimit-remaining') ?? '60',
  )
  if (remaining < 5) await sleep(3_000)
  else if (remaining < 15) await sleep(1_000)
  return (await res.json()) as T
}

// ---------- response shapes (only the fields we use) ----------

export type DiscogsIdentity = { id: number; username: string }

export type DiscogsProfile = {
  id: number
  username: string
  name?: string
  avatar_url?: string
}

export type DiscogsArtistRef = {
  id: number
  name: string
  anv?: string
  join?: string
}

export type DiscogsCollectionPage = {
  pagination: { page: number; pages: number; items: number }
  releases: Array<{
    id: number
    instance_id: number
    folder_id: number
    rating: number
    date_added: string
    basic_information: {
      id: number
      master_id: number
      title: string
      year: number
      thumb: string
      cover_image: string
      formats: DiscogsFormat[]
      labels: Array<{ id: number; name: string; catno: string }>
      artists: DiscogsArtistRef[]
      genres: string[]
      styles: string[]
    }
  }>
}

export type DiscogsWantsPage = {
  pagination: { page: number; pages: number; items: number }
  wants: Array<{
    id: number
    date_added: string
    basic_information: {
      id: number
      master_id: number
      title: string
      year: number
      thumb: string
      artists: DiscogsArtistRef[]
    }
  }>
}

export type DiscogsCollectionValue = {
  minimum: string
  median: string
  maximum: string
}

export type DiscogsRelease = {
  id: number
  country?: string
  released?: string
  lowest_price?: number | null
  num_for_sale?: number
  community?: {
    have: number
    want: number
    rating?: { count: number; average: number }
  }
  images?: Array<{
    type: string
    uri: string
    uri150: string
    width?: number
    height?: number
  }>
  tracklist?: Array<{
    position: string
    title: string
    duration: string
    type_: string
  }>
}

export type DiscogsMaster = { id: number; year?: number }

/** Discogs disambiguates duplicate artist names as "Name (2)". */
export function cleanArtistName(name: string): string {
  return name.replace(/\s\(\d+\)$/, '')
}

export function artistDisplay(artists: DiscogsArtistRef[]): string {
  return artists
    .map((a, i) => {
      const name = cleanArtistName(a.anv || a.name)
      const join =
        i < artists.length - 1
          ? a.join?.trim()
            ? ` ${a.join.trim()} `
            : ', '
          : ''
      return name + join
    })
    .join('')
    .replace(/\s+,/g, ',')
}
