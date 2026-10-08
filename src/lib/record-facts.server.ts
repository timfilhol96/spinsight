import {
  releaseGroupForMaster,
  releaseGroupForRelease,
} from '#/lib/musicbrainz.server'
import type { AwardFact, CertFact } from '#/lib/praise.server'
import { db } from '#/lib/supabase.server'
import { wikidataAlbum } from '#/lib/wikidata.server'

// What MusicBrainz and Wikidata know about a record: its IDs there (and its
// artist's), its exact Wikipedia articles, awards, certifications and the
// MusicBrainz rating. Resolving takes up to
// four slow requests (MusicBrainz allows one a second), and none of it changes
// often, so the answer is kept in the database for every server instance to
// share, keyed by Discogs master: every pressing of an album shares it.

const TTL_MS = 14 * 24 * 60 * 60_000

export type RecordFacts = {
  /** MusicBrainz release group. */
  mbid: string | null
  qid: string | null
  /** The article in the album's own language, when that isn't English. */
  original: { lang: string; title: string } | null
  wikiTitles: { en: string | null; fr: string | null }
  /** Awards and nominations from Wikidata. */
  awards: AwardFact[]
  /** Sales certifications from Wikidata (mostly French: SNEP). */
  certifications: CertFact[]
  /** MusicBrainz community rating out of 5, before any threshold. */
  musicbrainzRating: { average: number; count: number } | null
  /** The album artist's MusicBrainz ID (setlist.fm is keyed by it). */
  artistMbid: string | null
}

type CacheRow = {
  discogs_key: string
  mbid: string | null
  wikidata_qid: string | null
  original_lang: string | null
  original_title: string | null
  enwiki_title: string | null
  frwiki_title: string | null
  // Not only praise any more: the artist's MBID rides along, saving a migration.
  external_praise: Partial<
    Pick<
      RecordFacts,
      'awards' | 'certifications' | 'musicbrainzRating' | 'artistMbid'
    >
  >
  fetched_at: string
}

/** The cache key: the master when there is one, otherwise this pressing. */
const cacheKey = (masterId: number | undefined, releaseId: number) =>
  masterId ? `master:${masterId}` : `release:${releaseId}`

/** A fresh cached answer, or null (also when the database can't be reached). */
async function readCache(key: string): Promise<RecordFacts | null> {
  try {
    const { data } = await db()
      .from('record_facts_cache')
      .select('*')
      .eq('discogs_key', key)
      .maybeSingle<CacheRow>()
    if (!data || Date.now() - Date.parse(data.fetched_at) > TTL_MS) return null
    return {
      mbid: data.mbid,
      qid: data.wikidata_qid,
      original:
        data.original_lang && data.original_title
          ? { lang: data.original_lang, title: data.original_title }
          : null,
      wikiTitles: { en: data.enwiki_title, fr: data.frwiki_title },
      awards: data.external_praise.awards ?? [],
      certifications: data.external_praise.certifications ?? [],
      musicbrainzRating: data.external_praise.musicbrainzRating ?? null,
      artistMbid: data.external_praise.artistMbid ?? null,
    }
  } catch {
    return null
  }
}

async function writeCache(key: string, facts: RecordFacts): Promise<void> {
  try {
    await db()
      .from('record_facts_cache')
      .upsert({
        discogs_key: key,
        mbid: facts.mbid,
        wikidata_qid: facts.qid,
        original_lang: facts.original?.lang ?? null,
        original_title: facts.original?.title ?? null,
        enwiki_title: facts.wikiTitles.en,
        frwiki_title: facts.wikiTitles.fr,
        external_praise: {
          awards: facts.awards,
          certifications: facts.certifications,
          musicbrainzRating: facts.musicbrainzRating,
          artistMbid: facts.artistMbid,
        },
        fetched_at: new Date().toISOString(),
      } satisfies CacheRow)
  } catch {
    // A missed write only costs a slower lookup next time.
  }
}

/** "https://en.wikipedia.org/wiki/Frog_in_Boiling_Water" → "Frog in Boiling Water". */
function enwikiTitle(url: string | null): string | null {
  const m = /^https?:\/\/en\.wikipedia\.org\/wiki\/(.+)$/.exec(url ?? '')
  if (!m) return null
  try {
    return decodeURIComponent(m[1]).replace(/_/g, ' ')
  } catch {
    return null
  }
}

/**
 * Discogs master (or, without one, the release) → MusicBrainz release group →
 * Wikidata item. Throws when a source couldn't answer, so that a blank from
 * an outage isn't cached for two weeks.
 */
async function resolve(
  masterId: number | undefined,
  releaseId: number,
): Promise<RecordFacts> {
  const rg = masterId
    ? await releaseGroupForMaster(masterId)
    : await releaseGroupForRelease(releaseId)
  const fromWikipedia = enwikiTitle(rg?.wikipediaUrl ?? null)
  const wd = rg?.wikidataQid
    ? await wikidataAlbum({ qid: rg.wikidataQid })
    : fromWikipedia
      ? await wikidataAlbum({ enwikiTitle: fromWikipedia })
      : null
  return {
    mbid: rg?.mbid ?? null,
    qid: wd?.qid ?? null,
    original: wd?.original ?? null,
    wikiTitles: {
      en: wd?.wikiTitles.en ?? fromWikipedia,
      fr: wd?.wikiTitles.fr ?? null,
    },
    awards: wd?.awards ?? [],
    certifications: wd?.certifications ?? [],
    musicbrainzRating: rg?.rating ?? null,
    artistMbid: rg?.artistMbid ?? null,
  }
}

/**
 * The record's IDs, articles, awards and rating from MusicBrainz and
 * Wikidata: from the database when looked up in the last two weeks.
 * Null when a source couldn't answer; never throws.
 */
export async function recordFactsFor(
  masterId: number | undefined,
  releaseId: number,
): Promise<RecordFacts | null> {
  const key = cacheKey(masterId, releaseId)
  const cached = await readCache(key)
  if (cached) return cached
  try {
    const facts = await resolve(masterId, releaseId)
    await writeCache(key, facts)
    return facts
  } catch {
    return null
  }
}
