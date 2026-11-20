// Types shared between server functions and the UI.
import type { Money, Rates } from '#/lib/currency'
import type { VinylLook } from '#/lib/vinyl-color'
import { trackSeconds } from '#/lib/track-follower'

/**
 * Bump when enrichment starts filling new fields; rows with an older version
 * are re-fetched on the next run. v2: original year, USD prices, artwork.
 * v3: edition-aware artwork. v4: streaming runtime when Discogs has none.
 * v5: each track Discogs has no time for gets its streaming length.
 * v6: song titles match across "Part 1" / "Pt. 1"; only records still
 * missing a track time are re-fetched for it (see TRACK_TIMES_VERSION).
 * v7: bonus tracks are marked, for the original album's runtime; only
 * records that may have some are re-fetched for it (see BONUS_VERSION).
 * v8: an album track spelt differently on the master is no longer taken
 * for a bonus track; only records with bonus tracks are re-fetched.
 * v9: a Cover Art Archive cover that isn't square (a CD's) is passed over;
 * only records with one of its covers are re-fetched.
 */
export const DETAILS_VERSION = 9

/** The version that started marking bonus tracks. */
const BONUS_VERSION = 7

/**
 * The last version that changed every record. Versions after it only
 * improved track-time matching, so they re-fetch a record only when one of
 * its tracks still has no length.
 */
export const TRACK_TIMES_VERSION = 5

/**
 * Whether a release's details are from an older enrichment and need
 * fetching again. Shared by the sync (which re-fetches) and the collection
 * (which counts what's still pending), so the two always agree.
 */
export function detailsOutdated(
  version: number,
  tracklist: Array<{ duration?: string; title?: string; bonus?: true }> | null,
  isSpecialEdition: boolean | null = false,
  albumArtworkUrl: string | null = null,
): boolean {
  if (version < TRACK_TIMES_VERSION) return true
  if (version < 6 && (tracklist ?? []).some((t) => !trackSeconds(t.duration)))
    return true
  // Editions, and records with a track named as another take or a bonus
  // (an unlabelled deluxe with live sides). The rest get theirs marked on
  // the monthly refresh.
  if (
    version < BONUS_VERSION &&
    (!!isSpecialEdition ||
      (tracklist ?? []).some((t) => EXTRA_TAG.test(t.title ?? '')))
  )
    return true
  // v8 changed which tracks count as bonus: check those that have some.
  if (version < 8 && (tracklist ?? []).some((t) => t.bonus)) return true
  // v9 checks a Cover Art Archive cover's shape: look again at those.
  return (
    version < 9 && !!albumArtworkUrl?.startsWith('https://coverartarchive.org/')
  )
}

/** "(Live)", "[Demo]", "- Instrumental", "(Bonus Track)": maybe not the album take. */
const EXTRA_TAG =
  /[([][^)\]]*\b(live|demo|instrumental|acoustic|remix|alternate|bonus|outtake|rehearsal|early version|rough mix)\b[^)\]]*[)\]]|\s-\s.*\b(live|demo|instrumental|acoustic|remix|alternate|bonus)\b/i

/**
 * The original album's runtime, leaving out the tracks marked as bonus.
 * Null when nothing is marked, or when a track of the album has no time.
 */
export function originalRuntimeSec(
  tracklist: Array<{ duration?: string; bonus?: true }> | null,
): number | null {
  const tracks = tracklist ?? []
  if (!tracks.some((t) => t.bonus)) return null
  const album = tracks.filter((t) => !t.bonus)
  const secs = album.map((t) => trackSeconds(t.duration))
  return album.length && secs.every((n) => n > 0)
    ? secs.reduce((a, b) => a + b, 0)
    : null
}

/** "LP", '7"', '12"': the size Discogs lists among the format descriptions. */
export const discSize = (r: { formatDescriptions: string[] }) =>
  r.formatDescriptions.find((d) => /^(LP|\d+")$/.test(d)) ?? null

/** Runtime assumed when a record's length is unknown (a typical LP). */
export const DEFAULT_RUNTIME_SEC = 45 * 60

/**
 * The runtime a play saved in its context: set when it was the original
 * album alone, without the edition's bonus tracks (see `logPlay`).
 */
export function spinRuntime(context: unknown): { runtimeSec?: number } {
  const sec = (context as { runtimeSec?: unknown } | null)?.runtimeSec
  return typeof sec === 'number' && sec > 0 ? { runtimeSec: sec } : {}
}

/** How long a play runs: its own runtime if it saved one, else the record's. */
export const playRuntimeSec = (
  context: unknown,
  durationSec: number | null,
): number | null => spinRuntime(context).runtimeSec ?? durationSec

export type Play = {
  id: string
  releaseId: number
  playedAt: string
  /** "Done" pressed, or the next record started. Null while it may still spin. */
  endedAt: string | null
  source: 'manual' | 'picker'
  /**
   * Set when the spin was the original album alone, without the edition's
   * bonus tracks: its runtime. Otherwise the record's runtime applies.
   */
  runtimeSec?: number
}

export type Viewer = {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  preferredCurrency: string | null
  secondaryCurrency: string | null
}

export type Track = {
  position: string
  title: string
  /** "4:15". Filled from streaming when Discogs has none (see `source`). */
  duration: string
  /** Set when `duration` came from streaming rather than Discogs. */
  source?: 'spotify' | 'itunes'
  /**
   * Not on the original album: a special edition's bonus track, demo, live
   * take or instrumental.
   */
  bonus?: true
}

/**
 * One record in a collection. The tracklist isn't included: it's most of the
 * weight and only needed once a record is opened (see `tracklistQuery`).
 */
export type CollectionRecord = {
  instanceId: number
  releaseId: number
  masterId: number | null
  title: string
  artist: string
  artistIds: number[]
  /** Year of this pressing. */
  year: number | null
  /** Year the music first came out (Discogs master); falls back to `year`. */
  originalYear: number | null
  genres: string[]
  styles: string[]
  labels: Array<{ name: string; catno: string }>
  formatNames: string[]
  formatDescriptions: string[]
  look: VinylLook
  /** Clean album artwork when found, else the Discogs image. */
  coverImage: string | null
  thumb: string | null
  artworkSource: 'caa' | 'spotify' | 'itunes' | 'discogs' | 'custom'
  /** Anniversary / deluxe / expanded edition. */
  isSpecialEdition: boolean
  /**
   * When the copy joined the collection: the purchase date the owner typed
   * in, else the date it was added to Discogs. Drives every date-based stat.
   */
  dateAdded: string | null
  /** The date it was added to Discogs, whatever `dateAdded` says. */
  discogsAddedAt: string | null
  /** "2024-06-11" as the owner typed it. Only sent to the owner. */
  purchasedOn: string | null
  /** The owner's own notes on this copy. Only sent to the owner. */
  notes: string | null
  rating: number | null
  country: string | null
  communityHave: number | null
  communityWant: number | null
  communityRating: number | null
  /** Lowest current Discogs listing. */
  lowestPrice: Money | null
  /** What the owner paid, as they typed it in. Only sent to the owner. */
  pricePaid: Money | null
  numForSale: number | null
  /** The whole record, bonus tracks included. */
  durationSec: number | null
  /** 'discogs' (tracklist) or the streaming service the runtime came from. */
  durationSource: 'discogs' | 'spotify' | 'itunes' | null
  /**
   * Tracks beyond the original album (a special edition's bonus tracks,
   * demos, live takes, instrumentals). 0 for most records.
   */
  bonusTracks: number
  /**
   * The original album alone, when there are bonus tracks. Null when there
   * are none, or a track time is missing.
   */
  originalDurationSec: number | null
  /** Has community stats etc. (possibly from an older enrichment version). */
  enriched: boolean
  /** Missing details, or fetched before the current DETAILS_VERSION. */
  needsDetails: boolean
  spotifyGenres: string[]
  playCount: number
  lastPlayedAt: string | null
}

export type Profile = {
  username: string
  displayName: string | null
  avatarUrl: string | null
  isOwner: boolean
  isPublic: boolean
  lastSyncedAt: string | null
  /** Only returned to the owner. `money` is null if the amount couldn't be parsed. */
  collectionValue: Record<
    'minimum' | 'median' | 'maximum',
    { raw: string; money: Money | null }
  > | null
  /** Currency to show amounts in (the viewer's choice, else the owner's). Null = as reported. */
  currency: string | null
  /** Shown small beside amounts (the viewer's choice; the owner's for visitors). */
  secondaryCurrency: string | null
  /** Units per 1 USD, for converting amounts. */
  rates: Rates | null
  /** What the collection's owner is spinning right now (public). */
  nowPlaying: NowPlaying | null
  /**
   * A visitor, and the owner keeps listening private: `plays` is empty and
   * play counts are zero, so say "private" rather than show them.
   */
  listeningHidden: boolean
  /** Most recent plays first (capped). */
  plays: Play[]
  records: CollectionRecord[]
}

/**
 * The album's own runtime: a special edition's bonus tracks left out when
 * they're known, else the whole record. What collection stats go by.
 */
export const albumRuntimeSec = (
  r: Pick<CollectionRecord, 'durationSec' | 'originalDurationSec'>,
): number | null => r.originalDurationSec ?? r.durationSec

export function formatDuration(sec: number | null | undefined): string | null {
  if (!sec) return null
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return h ? `${h}h ${m}m` : `${m} min`
}

export type CoverOption = {
  /** null = automatic choice. */
  url: string | null
  thumb: string | null
  label: string
  /**
   * Set for photos (Discogs images, images added from a link): these can
   * also be used as a disc photo.
   */
  photo?: { width: number; height: number }
  /** Added from a link and stored by Spinsight: the owner can delete it. */
  stored?: true
}

export type NowPlaying = {
  playId: string
  releaseId: number
  /** The owner's copy, when it's still in their collection. */
  instanceId: number | null
  title: string
  artist: string
  look: VinylLook
  coverImage: string | null
  thumb: string | null
  /**
   * This spin's runtime if known (the original album's, with `albumOnly`);
   * the player assumes ~45 min otherwise.
   */
  durationSec: number | null
  /** The original album alone, without the edition's bonus tracks. */
  albumOnly: boolean
  startedAt: string
  /** After this it's no longer "now playing" (runtime + grace). */
  endsAt: string
  /** Started with "Spin it too" from this friend's spin. */
  along: { username: string; displayName: string | null } | null
  /** Friends' emoji on this spin, oldest first. */
  reactions: Reaction[]
}

export type Reaction = {
  username: string
  displayName: string | null
  emoji: string
}
