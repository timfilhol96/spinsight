// Types for the listening room's reading material, shared by the server
// (liner-notes.server.ts) and the UI.

export type WikiPage = {
  title: string
  url: string
  /** Wikipedia language code: the album's own language can come before English. */
  lang: string
  /** Wikipedia's one-liner, e.g. "2016 studio album by DIIV". */
  description: string | null
  /** The lead section. */
  summary: string
  /** Background, recording, composition… (tables and references skipped). */
  sections: Array<{ heading: string; text: string }>
}

export type CreditGroup = { role: string; names: string[] }

/**
 * A high mark for the record: an award, a list placing, a sales
 * certification, a chart peak, a critic's quote or a score.
 */
export type Praise = {
  kind: 'award' | 'accolade' | 'certification' | 'chart' | 'quote' | 'rating'
  /**
   * "Won · Album of the Year, Grammy Awards 2014", "No. 7, NME's Albums of the
   * Year 2016", "Platinum in the UK · Gold in France", "No. 1 · UK Albums",
   * the quote itself, or "4/5". " · " separates parts shown on their own line.
   */
  text: string
  /** Who said it: the publication, award body or "1,203 Discogs ratings". */
  by: string
  /** For quotes: the score that publication gave. */
  score?: string
  /** Set on a song's own praise (its chart peaks…), so it isn't taken for the album's. */
  song?: string
}

/** At-a-glance facts from the album's Wikipedia infobox. */
export type AlbumFacts = {
  /** "July 1996 – 6 March 1997"; several lines when sessions were split. */
  recorded: string[]
  studios: string[]
  producers: string[]
  /** Running time, "53:21". */
  length: string | null
}

/** At-a-glance facts from the artist's Wikipedia infobox. */
export type ArtistFacts = {
  /** "Abingdon, Oxfordshire, England". */
  origin: string | null
  /** "1985–present". */
  yearsActive: string | null
  genres: string[]
}

/** Listeners and plays on Last.fm. */
export type Popularity = { listeners: number; plays: number; url: string }

/** A show, as setlist.fm records it. */
export type Show = {
  /** ISO date, "2025-12-16". */
  date: string
  /** "Royal Arena, Copenhagen". */
  place: string
  tour: string | null
}

/** How often a track is played live, over the artist's latest shows. */
export type LiveTrack = {
  played: number
  /** Shows looked at. */
  of: number
  last: Show | null
}

export type TrackNotes = {
  position: string
  title: string
  /** The track's own artist on splits and compilations. */
  artist: string | null
  /** Who played, wrote or produced this track. */
  credits: CreditGroup[]
  /** Sentences from the album's article that name this track. */
  mentions: string[]
  live: LiveTrack | null
}

/**
 * What's known about one song, looked up when it comes on: its story, what
 * it samples or was covered by, its own chart peaks and how many listen to it.
 */
export type TrackFacts = {
  /** The song's story: Genius's description, else its Wikipedia lead. */
  story: { text: string; source: 'Genius' | 'Wikipedia'; url: string } | null
  /** The song's Wikipedia article, when it has one. */
  wiki: { title: string; url: string } | null
  genius: {
    url: string
    recordedAt: string | null
    writers: string[]
    producers: string[]
    /**
     * "Covered by": Pentatonix, Daughter and 32 more. Only well-known songs
     * are named; `songs` can be empty with only a count.
     */
    connections: Array<{ label: string; songs: string[]; more: number }>
  } | null
  /** The song's own awards, chart peaks and certifications. */
  praise: Praise[]
  lastfm: Popularity | null
}

export type LinerNotes = {
  releaseId: number
  /** The Discogs release notes (edition size, recording notes…). */
  notes: string | null
  credits: CreditGroup[]
  /** Credits come from the master's main release when this pressing has none. */
  creditsFrom: 'this pressing' | 'the original release'
  /** Recorded at, pressed by, mastered at… */
  companies: CreditGroup[]
  /** Matrix / runout etchings: something to check on your own copy. */
  runout: string[]
  artist: {
    name: string
    realName: string | null
    profile: string | null
    members: Array<{ name: string; active: boolean }>
    discogsUrl: string | null
    /** Origin, years active, genres (from the Wikipedia infobox). */
    facts: ArtistFacts | null
    lastfm: Popularity | null
    /** setlist.fm's count of their shows, and the latest one. */
    live: { shows: number; last: Show | null; url: string } | null
  } | null
  /** The artist's article is cut to a short summary, with no sections. */
  wiki: { album: WikiPage | null; artist: WikiPage | null }
  /** Studio, producers, running time (from the album's Wikipedia infobox). */
  albumFacts: AlbumFacts | null
  /** The album's highest marks: Wikipedia's awards, lists, charts and reviews, plus the Discogs community rating. */
  praise: Praise[]
  /** The album on Last.fm. */
  lastfm: Popularity | null
  tracks: TrackNotes[]
  /**
   * Lengths for the tracks Discogs has no time for, by track position,
   * matched by song title on the streaming album or Spotify.
   */
  streaming: {
    source: 'spotify' | 'itunes'
    lengths: Array<{ position: string; sec: number }>
    /** The streaming album they came from; null when found song by song. */
    album: string | null
  } | null
}
