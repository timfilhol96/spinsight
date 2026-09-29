// Types for the listening room's reading material, shared by the server
// (liner-notes.server.ts) and the UI.

export type WikiPage = {
  title: string
  url: string
  /** Wikipedia's one-liner, e.g. "2016 studio album by DIIV". */
  description: string | null
  /** The lead section. */
  summary: string
  /** Background, recording, composition… (tables and references skipped). */
  sections: Array<{ heading: string; text: string }>
}

export type CreditGroup = { role: string; names: string[] }

/** A critic's high mark: a list placing, a quote or a score. */
export type Praise = {
  kind: 'accolade' | 'quote' | 'rating'
  /** "No. 7, NME's Albums of the Year 2016", the quote itself, or "4/5". */
  text: string
  /** Who said it: the publication. */
  by: string
  /** For quotes: the score that publication gave. */
  score?: string
}

export type TrackNotes = {
  position: string
  title: string
  /** Who played, wrote or produced this track. */
  credits: CreditGroup[]
  /** Sentences from the album or song article that name this track. */
  mentions: string[]
  /** The song's own article, for singles and well-known tracks. */
  article: { title: string; url: string; summary: string } | null
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
  } | null
  wiki: { album: WikiPage | null; artist: WikiPage | null }
  /** Critics' highest marks for the album (from its Wikipedia article). */
  praise: Praise[]
  tracks: TrackNotes[]
  /** Streaming track lengths, when Discogs has no track times. */
  streaming: {
    source: 'spotify' | 'itunes'
    lengths: number[]
    album: string
  } | null
}
