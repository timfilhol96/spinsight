// A made-up collection for the landing page screenshots. Only in `npm run dev`
// with SPINSIGHT_DEMO=1: /u/samspins then serves this instead of the database
// and the visitor is signed in as its owner. Nothing is written anywhere.
// Records come from demo-collection.json (scripts/preview/demo-collection.mjs).
import type { CollectionRecord, Play, Profile, Viewer } from '#/lib/records'
import { parseVinylLook } from '#/lib/vinyl-color'
import albums from '#/lib/demo-collection.json'

export const DEMO_USERNAME = 'samspins'

export function demoMode(): boolean {
  return import.meta.env.DEV && process.env.SPINSIGHT_DEMO === '1'
}

export const demoViewer: Viewer = {
  id: 'demo',
  username: DEMO_USERNAME,
  displayName: 'Sam',
  avatarUrl: null,
  preferredCurrency: null,
}

export function demoProfile(): Profile {
  const hoursAgo = (h: number) =>
    new Date(Date.now() - h * 3_600_000).toISOString()

  // A few spins of each recent record, spread over the last weeks.
  const plays: Play[] = []
  albums.slice(0, 24).forEach((_, i) => {
    for (let n = 0; n < 1 + ((i * 5) % 4); n++)
      plays.push({
        id: `demo-${i}-${n}`,
        releaseId: 1000 + i,
        playedAt: hoursAgo(6 + i * 17 + n * 61),
        source: n % 3 ? 'picker' : 'manual',
      })
  })
  plays.sort((a, b) => b.playedAt.localeCompare(a.playedAt))

  const records: CollectionRecord[] = albums.map((a, i) => {
    const formats = [
      {
        name: 'Vinyl',
        qty: '1',
        descriptions: ['LP', 'Album'],
        ...(a.vinylText ? { text: a.vinylText } : {}),
      },
    ]
    const mine = plays.filter((p) => p.releaseId === 1000 + i)
    return {
      instanceId: 5000 + i,
      releaseId: 1000 + i,
      masterId: 2000 + i,
      title: a.title,
      artist: a.artist,
      artistIds: [3000 + i],
      year: a.year,
      originalYear: a.originalYear,
      genres: a.genres,
      styles: a.styles,
      labels: [{ name: a.label, catno: '' }],
      formatNames: ['Vinyl'],
      formatDescriptions: formats[0].descriptions,
      look: parseVinylLook(formats),
      coverImage: a.coverImage,
      thumb: a.thumb,
      artworkSource: 'itunes',
      isSpecialEdition: false,
      dateAdded: a.dateAdded,
      rating: null,
      country: null,
      communityHave: 4000 + ((i * 937) % 30000),
      communityWant: 900 + ((i * 411) % 8000),
      communityRating: 4 + ((i * 3) % 10) / 10,
      lowestPrice: { amount: 22 + ((i * 7) % 30), currency: 'USD' },
      numForSale: 10 + ((i * 13) % 120),
      tracklist: null,
      durationSec: a.durationSec,
      durationSource: 'itunes',
      enriched: true,
      needsDetails: false,
      spotifyGenres: [],
      playCount: mine.length,
      lastPlayedAt: mine[0]?.playedAt ?? null,
    }
  })

  return {
    username: DEMO_USERNAME,
    displayName: 'Sam',
    avatarUrl: null,
    isOwner: true,
    isPublic: true,
    lastSyncedAt: hoursAgo(2),
    // Kept out of screenshots on purpose.
    collectionValue: null,
    currency: null,
    rates: null,
    nowPlaying: null,
    plays,
    records,
  }
}
