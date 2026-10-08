// MusicBrainz as an ID hub: a Discogs master resolves to a MusicBrainz
// release group, whose links give the exact Wikidata item (and so the exact
// Wikipedia article) instead of a title search. Also brings the MusicBrainz
// community rating.
//
// MusicBrainz asks for a descriptive User-Agent and at most one request per
// second (https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting); going
// over gets every request refused with 503 for a while.

const MB = 'https://musicbrainz.org/ws/2'
const MB_UA = 'Spinsight/0.1 (https://spinsight-app.vercel.app)'
const MB_GAP_MS = 1_100
const MB_TIMEOUT_MS = 8_000

/** When the next request may go out. Per server instance, which is enough at our volume. */
let nextSlot = 0

/**
 * GET from the MusicBrainz API, queued one per second. Null when MusicBrainz
 * has no such thing (404); throws when it couldn't answer, so a caller can
 * tell "not there" (worth caching) from "try again later" (not).
 */
async function mbGet<T>(path: string): Promise<T | null> {
  const now = Date.now()
  const at = Math.max(now, nextSlot)
  nextSlot = at + MB_GAP_MS
  if (at > now) await new Promise((r) => setTimeout(r, at - now))
  const res = await fetch(`${MB}${path}`, {
    headers: { 'User-Agent': MB_UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(MB_TIMEOUT_MS),
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`MusicBrainz ${path} failed (${res.status})`)
  return (await res.json()) as T
}

type Relation = {
  type: string
  url?: { resource: string }
  release_group?: { id: string }
  release?: { id: string }
}

export type MbReleaseGroup = {
  mbid: string
  title: string
  /** From the release group's Wikidata link: "Q202996". */
  wikidataQid: string | null
  /** A direct Wikipedia link, which some release groups have instead of Wikidata. */
  wikipediaUrl: string | null
  /** Community rating out of 5. */
  rating: { average: number; count: number } | null
  /** The first credited artist: setlist.fm looks artists up by it. */
  artistMbid: string | null
}

/** The MusicBrainz entity a Discogs page is linked from, by relation kind. */
async function linkedFrom(
  discogsUrl: string,
  kind: 'release_group' | 'release',
): Promise<string | null> {
  const link = await mbGet<{ relations?: Relation[] }>(
    `/url?${new URLSearchParams({
      resource: discogsUrl,
      inc: kind === 'release_group' ? 'release-group-rels' : 'release-rels',
      fmt: 'json',
    })}`,
  )
  return link?.relations?.find((r) => r[kind])?.[kind]?.id ?? null
}

/**
 * The release group linked to a Discogs master, or null when MusicBrainz has
 * no link to it. Throws when MusicBrainz is down or busy.
 */
export async function releaseGroupForMaster(
  masterId: number,
): Promise<MbReleaseGroup | null> {
  const mbid = await linkedFrom(
    `https://www.discogs.com/master/${masterId}`,
    'release_group',
  )
  return mbid ? releaseGroup(mbid) : null
}

/**
 * For a Discogs release with no master (common for small pressings): the
 * MusicBrainz release linked to it, then its release group. One request more
 * than a master lookup. Null when unlinked; throws when MusicBrainz is down.
 */
export async function releaseGroupForRelease(
  releaseId: number,
): Promise<MbReleaseGroup | null> {
  const release = await linkedFrom(
    `https://www.discogs.com/release/${releaseId}`,
    'release',
  )
  if (!release) return null
  const data = await mbGet<{ 'release-group'?: { id: string } }>(
    `/release/${release}?inc=release-groups&fmt=json`,
  )
  const mbid = data?.['release-group']?.id
  return mbid ? releaseGroup(mbid) : null
}

async function releaseGroup(mbid: string): Promise<MbReleaseGroup | null> {
  const rg = await mbGet<{
    id: string
    title: string
    relations?: Relation[]
    rating?: { value: number | null; 'votes-count': number }
    'artist-credit'?: Array<{ artist?: { id: string } }>
  }>(
    `/release-group/${mbid}?inc=url-rels+ratings+genres+artist-credits&fmt=json`,
  )
  if (!rg) return null
  const url = (type: string) =>
    rg.relations?.find((r) => r.type === type)?.url?.resource ?? null
  const qid = /\/(Q\d+)$/.exec(url('wikidata') ?? '')?.[1] ?? null
  const rating = rg.rating
  return {
    mbid: rg.id,
    title: rg.title,
    wikidataQid: qid,
    wikipediaUrl: url('wikipedia'),
    rating:
      rating && typeof rating.value === 'number'
        ? { average: rating.value, count: rating['votes-count'] }
        : null,
    artistMbid: rg['artist-credit']?.[0]?.artist?.id ?? null,
  }
}
