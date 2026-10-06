import {
  artistDisplay,
  cleanArtistName,
  discogsGet,
} from '#/lib/discogs.server'
import type {
  DiscogsCollectionPage,
  DiscogsCollectionValue,
  DiscogsMaster,
  DiscogsRelease,
  DiscogsWantsPage,
  OAuthToken,
} from '#/lib/discogs.server'
import {
  albumDurationSec,
  findArtwork,
  missingTrackLengths,
} from '#/lib/artwork.server'
import { editionTokens } from '#/lib/editions'
import { env } from '#/lib/env.server'
import { findSpotifyArtist } from '#/lib/spotify.server'
import type { SpotifyArtist } from '#/lib/spotify.server'
import { DETAILS_VERSION } from '#/lib/records'
import { db } from '#/lib/supabase.server'
import type { UserRow } from '#/lib/supabase.server'
import { parseVinylLook } from '#/lib/vinyl-color'
import type { DiscogsFormat } from '#/lib/vinyl-color'

const auth = (u: UserRow): OAuthToken => ({
  token: u.oauth_token,
  secret: u.oauth_token_secret,
})

export type SyncResult = { total: number; added: number; removed: number }

/**
 * Mirrors the user's Discogs collection (all folders) into the database.
 * Cheap: one request per 100 records, plus one for the collection value.
 */
export async function syncCollection(
  user: UserRow,
  trigger: 'manual' | 'cron' | 'signup' = 'manual',
): Promise<SyncResult> {
  const supabase = db()
  const { data: run } = await supabase
    .from('sync_runs')
    .insert({ user_id: user.id, trigger })
    .select('id')
    .single()

  try {
    const { data: existing, error: exErr } = await supabase
      .from('collection_items')
      .select('instance_id')
      .eq('user_id', user.id)
    if (exErr) throw exErr
    const before = new Set((existing ?? []).map((r) => Number(r.instance_id)))

    const seen = new Set<number>()
    const username = encodeURIComponent(user.discogs_username)
    for (let page = 1, pages = 1; page <= pages; page++) {
      const data = await discogsGet<DiscogsCollectionPage>(
        `/users/${username}/collection/folders/0/releases?per_page=100&page=${page}&sort=added&sort_order=desc`,
        auth(user),
      )
      pages = data.pagination.pages

      // A release can appear twice (two copies), so de-dupe before upserting.
      const releases = new Map<number, Record<string, unknown>>()
      for (const item of data.releases) {
        const b = item.basic_information
        releases.set(b.id, {
          id: b.id,
          master_id: b.master_id || null,
          title: b.title,
          artist_display: artistDisplay(b.artists),
          artists: b.artists,
          year: b.year || null,
          genres: b.genres ?? [],
          styles: b.styles ?? [],
          labels: (b.labels ?? []).map((l) => ({
            id: l.id,
            name: cleanArtistName(l.name),
            catno: l.catno,
          })),
          formats: b.formats ?? [],
          vinyl_look: parseVinylLook(b.formats),
          cover_image: b.cover_image || null,
          thumb: b.thumb || null,
          updated_at: new Date().toISOString(),
        })
      }
      if (releases.size) {
        // Only basic columns are sent, so enrichment columns survive the upsert.
        const { error } = await supabase
          .from('releases')
          .upsert([...releases.values()], { onConflict: 'id' })
        if (error) throw error
      }

      const items = data.releases.map((item) => {
        seen.add(item.instance_id)
        return {
          instance_id: item.instance_id,
          user_id: user.id,
          release_id: item.basic_information.id,
          folder_id: item.folder_id,
          rating: item.rating || null,
          date_added: item.date_added,
        }
      })
      if (items.length) {
        const { error } = await supabase
          .from('collection_items')
          .upsert(items, { onConflict: 'instance_id' })
        if (error) throw error
      }
    }

    // Records sold or removed on Discogs disappear here too.
    const removedIds = [...before].filter((id) => !seen.has(id))
    if (removedIds.length) {
      const { error } = await supabase
        .from('collection_items')
        .delete()
        .eq('user_id', user.id)
        .in('instance_id', removedIds)
      if (error) throw error
    }
    const added = [...seen].filter((id) => !before.has(id)).length

    // Collection value is only visible to the owner's own token; skip quietly
    // if Discogs refuses (e.g. an empty collection).
    let collectionValue = user.collection_value
    try {
      const v = await discogsGet<DiscogsCollectionValue>(
        `/users/${username}/collection/value`,
        auth(user),
      )
      collectionValue = { ...v, fetched_at: new Date().toISOString() }
    } catch (e) {
      console.warn('[sync] collection value unavailable', (e as Error).message)
    }

    // The wantlist powers "friends who have your wants". Not worth failing the
    // sync over (and the table only exists after migration 006).
    try {
      await syncWantlist(user)
    } catch (e) {
      console.warn('[sync] wantlist unavailable', (e as Error).message)
    }

    await supabase
      .from('users')
      .update({
        last_synced_at: new Date().toISOString(),
        collection_value: collectionValue,
      })
      .eq('id', user.id)

    const result = { total: seen.size, added, removed: removedIds.length }
    if (run) {
      await supabase
        .from('sync_runs')
        .update({
          status: 'ok',
          items_total: result.total,
          items_added: result.added,
          items_removed: result.removed,
          finished_at: new Date().toISOString(),
        })
        .eq('id', run.id)
    }
    return result
  } catch (e) {
    if (run) {
      await supabase
        .from('sync_runs')
        .update({
          status: 'error',
          error: String((e as Error).message ?? e),
          finished_at: new Date().toISOString(),
        })
        .eq('id', run.id)
    }
    throw e
  }
}

/** Mirrors the Discogs wantlist: one request per 100 wants. */
async function syncWantlist(user: UserRow) {
  const supabase = db()
  const username = encodeURIComponent(user.discogs_username)
  const rows = new Map<number, Record<string, unknown>>()
  for (let page = 1, pages = 1; page <= pages; page++) {
    const data = await discogsGet<DiscogsWantsPage>(
      `/users/${username}/wants?per_page=100&page=${page}`,
      auth(user),
    )
    pages = data.pagination.pages
    for (const w of data.wants) {
      const b = w.basic_information
      rows.set(b.id, {
        user_id: user.id,
        release_id: b.id,
        master_id: b.master_id || null,
        title: b.title,
        artist_display: artistDisplay(b.artists),
        year: b.year || null,
        thumb: b.thumb || null,
        date_added: w.date_added,
      })
    }
  }
  if (rows.size) {
    const { error } = await supabase
      .from('want_items')
      .upsert([...rows.values()], { onConflict: 'user_id,release_id' })
    if (error) throw error
  }
  const { data: existing, error } = await supabase
    .from('want_items')
    .select('release_id')
    .eq('user_id', user.id)
  if (error) throw error
  const gone = (existing ?? [])
    .map((r) => Number(r.release_id))
    .filter((id) => !rows.has(id))
  if (gone.length) {
    const { error: delErr } = await supabase
      .from('want_items')
      .delete()
      .eq('user_id', user.id)
      .in('release_id', gone)
    if (delErr) throw delErr
  }
}

/** 243 → "4:03", as Discogs writes track times. */
function formatTrackTime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const ss = String(sec % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

function parseDuration(d: string | undefined): number {
  if (!d) return 0
  const parts = d.split(':').map(Number)
  if (parts.some(Number.isNaN)) return 0
  return parts.reduce((acc, n) => acc * 60 + n, 0)
}

const REENRICH_AFTER_DAYS = 30

export type EnrichResult = { processed: number; remaining: number }

type EnrichRow = {
  id: number
  master_id: number | null
  title: string
  year: number | null
  artists: Array<{ id: number; name: string }>
  formats: DiscogsFormat[]
  enriched_at: string | null
  details_version: number
}

/**
 * Fetches full release details (community have/want, marketplace price in
 * USD, tracklist, original release year from the master) plus clean album
 * artwork and Spotify artist info, for releases that are missing them or
 * stale. Stops after `budgetMs` so it fits comfortably in one serverless call;
 * the client (or cron) calls again until `remaining` is 0.
 */
export async function enrichBatch(
  user: UserRow,
  budgetMs = 40_000,
): Promise<EnrichResult> {
  const started = Date.now()
  const supabase = db()
  const staleBefore = new Date(
    Date.now() - REENRICH_AFTER_DAYS * 86_400_000,
  ).toISOString()

  const { data: rows, error } = await supabase
    .from('collection_items')
    .select(
      'release:releases!inner(id, master_id, title, year, artists, formats, enriched_at, details_version)',
    )
    .eq('user_id', user.id)
  if (error) throw error

  const todo = new Map<number, EnrichRow>()
  for (const r of rows ?? []) {
    const rel = r.release as unknown as EnrichRow
    if (
      !rel.enriched_at ||
      rel.enriched_at < staleBefore ||
      rel.details_version < DETAILS_VERSION
    )
      todo.set(rel.id, rel)
  }

  let processed = 0
  for (const rel of todo.values()) {
    if (Date.now() - started > budgetMs) break

    const full = await discogsGet<DiscogsRelease>(
      `/releases/${rel.id}?curr_abbr=USD`,
      auth(user),
    )
    const master = rel.master_id
      ? await discogsGet<DiscogsMaster>(
          `/masters/${rel.master_id}`,
          auth(user),
        ).catch(() => null)
      : null
    const tracks = (full.tracklist ?? []).filter((t) => t.type_ === 'track')
    // Only trust Discogs' runtime when every track has a time; a partial sum
    // would undercount.
    const discogsDuration = tracks.every((t) => parseDuration(t.duration) > 0)
      ? tracks.reduce((s, t) => s + parseDuration(t.duration), 0)
      : 0
    let duration: { sec: number; source: string } | null = discogsDuration
      ? { sec: discogsDuration, source: 'discogs' }
      : null
    // Lengths for the tracks Discogs has no time for, by position.
    let streamed: Awaited<ReturnType<typeof missingTrackLengths>> = null

    // Search under the artist's real name, not a Discogs alias ("Jfff Mills").
    const searchArtist = cleanArtistName(rel.artists[0]?.name ?? '')
    // Format text and descriptions can name the edition ("10th Anniversary").
    const editionText = (rel.formats ?? [])
      .map((f) => [f.text, ...(f.descriptions ?? [])].join(' '))
      .join(' ')
    const isEdition = editionTokens(`${rel.title} ${editionText}`).length > 0
    let artwork: Record<string, unknown> = {}
    try {
      const found = searchArtist
        ? await findArtwork(searchArtist, rel.title, editionText)
        : { album: null, edition: null }
      // A special edition only takes a streaming cover of the same edition;
      // otherwise the release's own Discogs image is used (artwork_url null).
      const chosen = isEdition ? found.edition : found.album
      artwork = {
        artwork_url: chosen?.url ?? null,
        artwork_thumb: chosen?.thumb ?? null,
        artwork_source: chosen?.source ?? null,
        album_artwork_url: found.album?.url ?? null,
        album_artwork_thumb: found.album?.thumb ?? null,
        artwork_checked_at: new Date().toISOString(),
      }
      // Tracks without a Discogs time take their streaming length, matched
      // by song title (then searched song by song), so every track on the
      // card has one.
      if (!duration && searchArtist) {
        streamed = await missingTrackLengths(
          searchArtist,
          found.album,
          tracks.map((t) => ({
            ...t,
            artist: t.artists?.[0]
              ? cleanArtistName(t.artists[0].name)
              : undefined,
          })),
        )
        const byPosition = new Map(
          streamed?.lengths.map((l) => [l.position, l.sec]),
        )
        const secs = tracks.map(
          (t) => parseDuration(t.duration) || byPosition.get(t.position) || 0,
        )
        if (streamed && secs.every((n) => n > 0))
          duration = {
            sec: secs.reduce((a, b) => a + b, 0),
            source: streamed.source,
          }
      }
      // Some tracks still unknown: the digital album's length, counting only
      // as many tracks as the vinyl has.
      if (!duration && found.album) {
        const sec = await albumDurationSec(
          found.album,
          tracks.length || undefined,
        )
        if (sec) duration = { sec, source: found.album.source }
      }
    } catch {
      // Sources down: leave artwork_checked_at alone and try again next run.
    }

    const { error: upErr } = await supabase
      .from('releases')
      .update({
        country: full.country ?? null,
        released: full.released ?? null,
        community_have: full.community?.have ?? null,
        community_want: full.community?.want ?? null,
        community_rating: full.community?.rating?.average ?? null,
        lowest_price: full.lowest_price ?? null,
        price_currency: 'USD',
        num_for_sale: full.num_for_sale ?? null,
        tracklist: tracks.map((t) => {
          const sec =
            !parseDuration(t.duration) &&
            streamed?.lengths.find((l) => l.position === t.position)?.sec
          return sec
            ? {
                position: t.position,
                title: t.title,
                duration: formatTrackTime(sec),
                source: streamed!.source,
              }
            : { position: t.position, title: t.title, duration: t.duration }
        }),
        duration_sec: duration?.sec ?? null,
        duration_source: duration?.source ?? null,
        // A master's year is the first release; fall back to this pressing.
        original_year: master?.year || rel.year || null,
        is_special_edition: isEdition,
        ...artwork,
        details_version: DETAILS_VERSION,
        enriched_at: new Date().toISOString(),
      })
      .eq('id', rel.id)
    if (upErr) throw upErr

    await enrichArtists(rel.artists)
    processed++
  }

  return { processed, remaining: Math.max(0, todo.size - processed) }
}

async function enrichArtists(artists: Array<{ id: number; name: string }>) {
  if (!env.spotify) return
  const supabase = db()
  // "Various" (id 194) and friends aren't real artists.
  const real = artists.filter((a) => a.id && a.id !== 194)
  if (!real.length) return
  const { data: known } = await supabase
    .from('artists')
    .select('discogs_id')
    .in(
      'discogs_id',
      real.map((a) => a.id),
    )
  const knownIds = new Set((known ?? []).map((k) => Number(k.discogs_id)))

  for (const a of real) {
    if (knownIds.has(a.id)) continue
    const name = cleanArtistName(a.name)
    let found: SpotifyArtist | null
    try {
      found = await findSpotifyArtist(name)
    } catch (e) {
      console.warn('[spotify] skipped', name, (e as Error).message)
      continue
    }
    // Cache misses too, so we don't search for the same artist every sync.
    await supabase.from('artists').upsert(
      {
        discogs_id: a.id,
        name,
        spotify_id: found?.spotify_id ?? null,
        spotify_genres: found?.genres ?? [],
        image_url: found?.image_url ?? null,
        popularity: found?.popularity ?? null,
        looked_up_at: new Date().toISOString(),
      },
      { onConflict: 'discogs_id' },
    )
  }
}
