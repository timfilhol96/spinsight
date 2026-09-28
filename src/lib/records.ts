// Types shared between server functions and the UI.
import type { Money, Rates } from '#/lib/currency'
import type { VinylLook } from '#/lib/vinyl-color'

/**
 * Bump when enrichment starts filling new fields; rows with an older version
 * are re-fetched on the next run. v2: original year, USD prices, artwork.
 * v3: edition-aware artwork.
 */
export const DETAILS_VERSION = 3

export type Play = {
  id: string
  releaseId: number
  playedAt: string
  source: 'manual' | 'picker'
}

export type Viewer = {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  preferredCurrency: string | null
}

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
  artworkSource: 'spotify' | 'itunes' | 'discogs' | 'custom'
  /** Anniversary / deluxe / expanded edition. */
  isSpecialEdition: boolean
  dateAdded: string | null
  rating: number | null
  country: string | null
  communityHave: number | null
  communityWant: number | null
  communityRating: number | null
  /** Lowest current Discogs listing. */
  lowestPrice: Money | null
  numForSale: number | null
  tracklist: Array<{ position: string; title: string; duration: string }> | null
  durationSec: number | null
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
  /** Units per 1 USD, for converting amounts. */
  rates: Rates | null
  /** Most recent plays first (capped). */
  plays: Play[]
  records: CollectionRecord[]
}

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
}
