import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { CURRENCIES, parseMoney } from '#/lib/currency'
import type { DiscogsRelease } from '#/lib/discogs.server'
import { DETAILS_VERSION } from '#/lib/records'
import type {
  CollectionRecord,
  CoverOption,
  Profile,
  Viewer,
} from '#/lib/records'
import { parseVinylLook, withDiscPhoto } from '#/lib/vinyl-color'
import type { DiscPhoto, DiscogsFormat, VinylLook } from '#/lib/vinyl-color'

// Server functions: the only way the browser reaches the database. Server-only
// modules are imported inside handlers so they never end up in the client bundle.

export const getViewer = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Viewer | null> => {
    const { currentUser } = await import('#/lib/session.server')
    const user = await currentUser()
    if (!user) return null
    return {
      id: user.id,
      username: user.discogs_username,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      preferredCurrency: user.preferred_currency,
    }
  },
)

type ReleaseRow = {
  id: number
  master_id: number | null
  title: string
  artist_display: string
  artists: Array<{ id: number }>
  year: number | null
  genres: string[]
  styles: string[]
  labels: Array<{ name: string; catno: string }>
  formats: DiscogsFormat[]
  vinyl_look: VinylLook | null
  cover_image: string | null
  thumb: string | null
  artwork_url: string | null
  artwork_thumb: string | null
  artwork_source: 'spotify' | 'itunes' | null
  album_artwork_url: string | null
  album_artwork_thumb: string | null
  is_special_edition: boolean | null
  original_year: number | null
  price_currency: string | null
  country: string | null
  community_have: number | null
  community_want: number | null
  community_rating: number | null
  lowest_price: number | null
  num_for_sale: number | null
  tracklist: CollectionRecord['tracklist']
  duration_sec: number | null
  duration_source: 'discogs' | 'spotify' | 'itunes' | null
  enriched_at: string | null
  details_version: number
}

export const getProfile = createServerFn({ method: 'GET' })
  .validator((d: { username: string }) =>
    z.object({ username: z.string().min(1).max(100) }).parse(d),
  )
  .handler(async ({ data }): Promise<Profile | null> => {
    const { db } = await import('#/lib/supabase.server')
    const { currentUser } = await import('#/lib/session.server')
    const supabase = db()
    const viewer = await currentUser()

    const { data: owner } = await supabase
      .from('users')
      // '*' rather than a column list so share_listening (migration 006) is
      // optional. Tokens stay on the server: only the fields below are returned.
      .select('*')
      // Case-insensitive exact match; escape LIKE wildcards (usernames can contain "_").
      .ilike('discogs_username', data.username.replace(/[\\%_]/g, '\\$&'))
      .maybeSingle()
    if (!owner) return null
    const isOwner = viewer?.id === owner.id
    if (!owner.is_public && !isOwner) return null

    const { data: items, error } = await supabase
      .from('collection_items')
      .select(
        'instance_id, date_added, rating, cover_url, cover_thumb, disc_photo, disc_colors, release:releases!inner(*)',
      )
      .eq('user_id', owner.id)
      .order('date_added', { ascending: false })
    if (error) throw new Error(error.message)

    const artistIds = new Set<number>()
    for (const it of items ?? []) {
      for (const a of (it.release as unknown as ReleaseRow).artists ?? [])
        if (a.id) artistIds.add(a.id)
    }
    const genresByArtist = new Map<number, string[]>()
    if (artistIds.size) {
      const { data: artists } = await supabase
        .from('artists')
        .select('discogs_id, spotify_genres')
        .in('discogs_id', [...artistIds])
      for (const a of artists ?? [])
        genresByArtist.set(Number(a.discogs_id), a.spotify_genres ?? [])
    }

    const { data: playRows } = await supabase
      .from('plays')
      .select('id, release_id, played_at, source')
      .eq('user_id', owner.id)
      .order('played_at', { ascending: false })
      .limit(2000)
    // Only plays of records still in the collection count. Plays of a pressing
    // that was swapped out on Discogs stay in the table (they come back if the
    // pressing does) but are left out of every stat.
    const owned = new Set(
      (items ?? []).map((it) =>
        Number((it.release as unknown as ReleaseRow).id),
      ),
    )
    const plays = (playRows ?? [])
      .map((p) => ({
        id: p.id as string,
        releaseId: Number(p.release_id),
        playedAt: p.played_at as string,
        source: p.source as 'manual' | 'picker',
      }))
      .filter((p) => owned.has(p.releaseId))
    const playStats = new Map<number, { count: number; last: string }>()
    for (const p of plays) {
      const cur = playStats.get(p.releaseId)
      // Rows are newest-first, so the first one seen is the latest play.
      playStats.set(p.releaseId, {
        count: (cur?.count ?? 0) + 1,
        last: cur?.last ?? p.playedAt,
      })
    }

    const records: CollectionRecord[] = (items ?? []).map((it) => {
      const r = it.release as unknown as ReleaseRow
      const formats = r.formats ?? []
      const ids = (r.artists ?? []).map((a) => a.id).filter(Boolean)
      return {
        instanceId: Number(it.instance_id),
        releaseId: Number(r.id),
        masterId: r.master_id ? Number(r.master_id) : null,
        title: r.title,
        artist: r.artist_display,
        artistIds: ids,
        year: r.year,
        originalYear: r.original_year ?? r.year,
        genres: r.genres ?? [],
        styles: r.styles ?? [],
        labels: r.labels ?? [],
        formatNames: [...new Set(formats.map((f) => f.name))],
        formatDescriptions: [
          ...new Set(formats.flatMap((f) => f.descriptions ?? [])),
        ],
        // Re-parse so parser improvements apply without a re-sync.
        look: withDiscPhoto(
          formats.length
            ? parseVinylLook(formats)
            : (r.vinyl_look ?? parseVinylLook([])),
          it.disc_photo as DiscPhoto | null,
          it.disc_colors as string[] | null,
        ),
        // Hand-picked cover, then clean/edition artwork, then Discogs.
        coverImage: it.cover_url ?? r.artwork_url ?? r.cover_image,
        thumb: it.cover_thumb ?? r.artwork_thumb ?? r.thumb,
        artworkSource: it.cover_url
          ? 'custom'
          : (r.artwork_source ?? 'discogs'),
        isSpecialEdition: !!r.is_special_edition,
        dateAdded: it.date_added,
        rating: it.rating,
        country: r.country,
        communityHave: r.community_have,
        communityWant: r.community_want,
        communityRating:
          r.community_rating != null ? Number(r.community_rating) : null,
        // Pre-v2 rows have no currency recorded; Discogs defaults to USD.
        lowestPrice:
          r.lowest_price != null
            ? {
                amount: Number(r.lowest_price),
                currency: r.price_currency ?? 'USD',
              }
            : null,
        numForSale: r.num_for_sale,
        tracklist: r.tracklist,
        durationSec: r.duration_sec,
        durationSource: r.duration_source ?? null,
        enriched: !!r.enriched_at,
        needsDetails:
          !r.enriched_at || (r.details_version ?? 0) < DETAILS_VERSION,
        playCount: playStats.get(Number(r.id))?.count ?? 0,
        lastPlayedAt: playStats.get(Number(r.id))?.last ?? null,
        spotifyGenres: [
          ...new Set(ids.flatMap((id) => genresByArtist.get(id) ?? [])),
        ],
      }
    })

    const { usdRates } = await import('#/lib/rates.server')
    const value = owner.collection_value as Record<
      'minimum' | 'median' | 'maximum',
      string
    > | null
    const entry = (raw: string) => ({ raw, money: parseMoney(raw) })
    return {
      username: owner.discogs_username,
      displayName: owner.display_name,
      avatarUrl: owner.avatar_url,
      isOwner,
      isPublic: owner.is_public,
      lastSyncedAt: owner.last_synced_at,
      collectionValue:
        isOwner && value
          ? {
              minimum: entry(value.minimum),
              median: entry(value.median),
              maximum: entry(value.maximum),
            }
          : null,
      currency: viewer?.preferred_currency ?? owner.preferred_currency ?? null,
      rates: await usdRates(),
      // Listening can be kept private while the collection is public.
      nowPlaying:
        isOwner || owner.share_listening !== false
          ? await (await import('#/lib/plays.server')).nowPlayingFor(owner.id)
          : null,
      plays,
      records,
    }
  })

export const runSync = createServerFn({ method: 'POST' })
  .validator((d: { trigger?: 'manual' | 'signup' }) =>
    z.object({ trigger: z.enum(['manual', 'signup']).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import('#/lib/session.server')
    const { syncCollection } = await import('#/lib/sync.server')
    const user = await requireUser()
    return syncCollection(user, data.trigger ?? 'manual')
  })

export const runEnrich = createServerFn({ method: 'POST' }).handler(
  async () => {
    const { requireUser } = await import('#/lib/session.server')
    const { enrichBatch } = await import('#/lib/sync.server')
    const user = await requireUser()
    return enrichBatch(user, 25_000)
  },
)

export const setProfileVisibility = createServerFn({ method: 'POST' })
  .validator((d: { isPublic: boolean }) =>
    z.object({ isPublic: z.boolean() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import('#/lib/session.server')
    const { db } = await import('#/lib/supabase.server')
    const user = await requireUser()
    const { error } = await db()
      .from('users')
      .update({ is_public: data.isPublic })
      .eq('id', user.id)
    if (error) throw new Error(error.message)
    return { isPublic: data.isPublic }
  })

export const setPreferredCurrency = createServerFn({ method: 'POST' })
  .validator((d: { currency: string | null }) =>
    z.object({ currency: z.enum(CURRENCIES).nullable() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import('#/lib/session.server')
    const { db } = await import('#/lib/supabase.server')
    const user = await requireUser()
    const { error } = await db()
      .from('users')
      .update({ preferred_currency: data.currency })
      .eq('id', user.id)
    if (error) throw new Error(error.message)
    return { currency: data.currency }
  })

const PlayContext = z
  .object({
    mood: z.string().max(20).optional(),
    weather: z.string().max(20).optional(),
    family: z.string().max(30).optional(),
    length: z.string().max(20).optional(),
    time: z.string().max(20).optional(),
    mode: z.enum(['guided', 'random', 'friends']).optional(),
    /** Username of the friend whose spin this joins ("Spin it too"). */
    along: z.string().min(1).max(100).optional(),
  })
  .strict()

export const logPlay = createServerFn({ method: 'POST' })
  .validator(
    (d: {
      releaseId: number
      source: 'manual' | 'picker'
      context?: unknown
    }) =>
      z
        .object({
          releaseId: z.number().int().positive(),
          source: z.enum(['manual', 'picker']),
          context: PlayContext.optional(),
        })
        .parse(d),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import('#/lib/session.server')
    const { db } = await import('#/lib/supabase.server')
    const user = await requireUser()
    const supabase = db()
    // Only records you own can be logged.
    const { count } = await supabase
      .from('collection_items')
      .select('instance_id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('release_id', data.releaseId)
    if (!count) throw new Error('That record is not in your collection.')
    const { endOpenPlays } = await import('#/lib/plays.server')
    await endOpenPlays(user.id)
    const { data: row, error } = await supabase
      .from('plays')
      .insert({
        user_id: user.id,
        release_id: data.releaseId,
        source: data.source,
        context: data.context ?? null,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return { id: row.id as string }
  })

export const deletePlay = createServerFn({ method: 'POST' })
  .validator((d: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import('#/lib/session.server')
    const { db } = await import('#/lib/supabase.server')
    const user = await requireUser()
    const { error } = await db()
      .from('plays')
      .delete()
      .eq('id', data.id)
      .eq('user_id', user.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

// ---------- cover choice ----------

/** Everything a copy's cover can be set to. Owner only. */
async function coverOptionsFor(instanceId: number): Promise<CoverOption[]> {
  const { requireUser } = await import('#/lib/session.server')
  const { db } = await import('#/lib/supabase.server')
  const { discogsGet } = await import('#/lib/discogs.server')
  const user = await requireUser()
  const { data: item } = await db()
    .from('collection_items')
    .select(
      'instance_id, release:releases!inner(id, artwork_url, artwork_thumb, artwork_source, album_artwork_url, album_artwork_thumb)',
    )
    .eq('instance_id', instanceId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!item) throw new Error('That record is not in your collection.')
  const rel = item.release as unknown as {
    id: number
    artwork_url: string | null
    artwork_thumb: string | null
    artwork_source: string | null
    album_artwork_url: string | null
    album_artwork_thumb: string | null
  }
  const service = (s: string | null) =>
    s === 'itunes' ? 'Apple Music' : 'Spotify'
  const options: CoverOption[] = [
    { url: null, thumb: null, label: 'Automatic' },
  ]
  if (rel.album_artwork_url)
    options.push({
      url: rel.album_artwork_url,
      thumb: rel.album_artwork_thumb,
      label: 'Album cover',
    })
  if (rel.artwork_url && rel.artwork_url !== rel.album_artwork_url)
    options.push({
      url: rel.artwork_url,
      thumb: rel.artwork_thumb,
      label: `Edition cover (${service(rel.artwork_source)})`,
    })
  const full = await discogsGet<DiscogsRelease>(`/releases/${rel.id}`, {
    token: user.oauth_token,
    secret: user.oauth_token_secret,
  })
  ;(full.images ?? []).slice(0, 12).forEach((img, i) =>
    options.push({
      url: img.uri,
      thumb: img.uri150 || img.uri,
      label: `Discogs image ${i + 1}`,
      discogs: { width: img.width ?? 0, height: img.height ?? 0 },
    }),
  )
  return options
}

export const getCoverOptions = createServerFn({ method: 'GET' })
  .validator((d: { instanceId: number }) =>
    z.object({ instanceId: z.number().int().positive() }).parse(d),
  )
  .handler(async ({ data }) => coverOptionsFor(data.instanceId))

export const setCover = createServerFn({ method: 'POST' })
  .validator((d: { instanceId: number; url: string | null }) =>
    z
      .object({
        instanceId: z.number().int().positive(),
        url: z.string().url().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { db } = await import('#/lib/supabase.server')
    // Re-derive the options server-side so only a real cover can be saved.
    const options = await coverOptionsFor(data.instanceId)
    const choice = options.find((o) => o.url === data.url)
    if (!choice) throw new Error('That cover is not available for this record.')
    const { error } = await db()
      .from('collection_items')
      .update({ cover_url: choice.url, cover_thumb: choice.thumb })
      .eq('instance_id', data.instanceId)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

// ---------- now playing ----------

export const getNowPlaying = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { currentUser } = await import('#/lib/session.server')
    const { nowPlayingFor } = await import('#/lib/plays.server')
    const user = await currentUser()
    return user ? nowPlayingFor(user.id) : null
  },
)

/** "Done": the record is back in its sleeve. */
export const stopPlay = createServerFn({ method: 'POST' })
  .validator((d: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import('#/lib/session.server')
    const { db } = await import('#/lib/supabase.server')
    const user = await requireUser()
    const { error } = await db()
      .from('plays')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', data.id)
      .eq('user_id', user.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

// ---------- disc photo ----------

/**
 * Uses one of the release's Discogs photos as this copy's disc, cropped to the
 * circle the owner drew, and samples its colours for the app tint. `url: null`
 * goes back to the drawn disc.
 */
export const setDiscPhoto = createServerFn({ method: 'POST' })
  .validator(
    (d: {
      instanceId: number
      url: string | null
      cx?: number
      cy?: number
      r?: number
    }) =>
      z
        .object({
          instanceId: z.number().int().positive(),
          url: z.string().url().nullable(),
          cx: z.number().min(0).max(1).optional(),
          cy: z.number().min(0).max(1).optional(),
          r: z.number().min(0.05).max(1).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data }) => {
    const { db } = await import('#/lib/supabase.server')
    const { sampleDiscColors } = await import('#/lib/disc-photo.server')
    // Also checks ownership, and that the photo belongs to this release.
    const options = await coverOptionsFor(data.instanceId)
    if (data.url === null) {
      const { error } = await db()
        .from('collection_items')
        .update({ disc_photo: null, disc_colors: null })
        .eq('instance_id', data.instanceId)
      if (error) throw new Error(error.message)
      return { colors: [] as string[] }
    }
    const option = options.find((o) => o.discogs && o.url === data.url)
    if (!option || data.cx == null || data.cy == null || data.r == null)
      throw new Error('That photo is not available for this record.')
    const crop = { cx: data.cx, cy: data.cy, r: data.r }
    const sampled = await sampleDiscColors(data.url, crop)
    const { error } = await db()
      .from('collection_items')
      .update({
        disc_photo: {
          url: data.url,
          ...crop,
          w: sampled.width,
          h: sampled.height,
        },
        disc_colors: sampled.colors,
      })
      .eq('instance_id', data.instanceId)
    if (error) throw new Error(error.message)
    return { colors: sampled.colors }
  })
