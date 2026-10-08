import {
  findArtwork,
  matchKey,
  missingTrackLengths,
} from '#/lib/artwork.server'
import { cleanArtistName, discogsGet } from '#/lib/discogs.server'
import type {
  DiscogsArtistRef,
  DiscogsRelease,
  OAuthToken,
} from '#/lib/discogs.server'
import type { LinerNotes, WikiPage } from '#/lib/liner-notes'
import { lastfmAlbum, lastfmArtist } from '#/lib/lastfm.server'
import {
  albumFactsFrom,
  artistFactsFrom,
  communityRating,
  praiseFrom,
} from '#/lib/praise.server'
import { recordFactsFor } from '#/lib/record-facts.server'
import type { RecordFacts } from '#/lib/record-facts.server'
import { liveHistory, liveTrack } from '#/lib/setlistfm.server'
import { trackSeconds } from '#/lib/track-follower'
import {
  bareTitle,
  findWikiPage,
  wikiPage,
  wikiSearch,
  wikiText,
} from '#/lib/wikipedia.server'
import type { WikiLang } from '#/lib/wikipedia.server'

// Reading material for the listening room: credits, notes and the artist bio
// from Discogs, background from Wikipedia, listeners from Last.fm, live shows
// from setlist.fm, and streaming track lengths so the track follower has
// timings when Discogs has none. The album's article is found through
// MusicBrainz → Wikidata when they know the record (exact), and by title
// search otherwise. The only database use is the shared cache of those
// lookups (record-facts.server.ts); every source fails soft. What's known
// about each song is looked up when it plays (track-facts.server.ts).

type Credit = {
  name: string
  anv?: string
  role: string
  tracks?: string
}

type FullRelease = Omit<DiscogsRelease, 'tracklist'> & {
  title: string
  master_id?: number
  notes?: string
  artists: DiscogsArtistRef[]
  extraartists?: Credit[]
  companies?: Array<{ name: string; entity_type_name: string }>
  identifiers?: Array<{ type: string; value: string; description?: string }>
  tracklist?: Array<{
    position: string
    title: string
    duration: string
    type_: string
    /** Split records and compilations credit an artist per track. */
    artists?: DiscogsArtistRef[]
    extraartists?: Credit[]
  }>
}

type DiscogsArtist = {
  name: string
  realname?: string
  profile?: string
  urls?: string[]
  members?: Array<{ name: string; active: boolean }>
  uri?: string
}

/** Discogs markup ("[a=Name]", "[url=…]text[/url]", "[b]") to plain text. */
export function cleanDiscogsMarkup(text: string): string {
  return (
    text
      .replace(/\[url=[^\]]*\]([\s\S]*?)\[\/url\]/gi, '$1')
      .replace(/\[(?:a|l|m|r)=([^\]]+)\]/gi, (_, name: string) =>
        cleanArtistName(name),
      )
      // Bare ids ("[a123456]") can't be shown without another lookup.
      .replace(/\[(?:a|l|m|r)\d+\]/gi, '')
      .replace(/\[\/?[biu]\]/gi, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

/** "Producer, Mixed By" → ["Producer", "Mixed By"], keeping "Guitar [Lead, Rhythm]" whole. */
function splitRoles(role: string): string[] {
  return role
    .split(/,(?![^[]*\])/)
    .map((r) => r.trim())
    .filter(Boolean)
}

function groupCredits(credits: Credit[]) {
  const byRole = new Map<string, string[]>()
  for (const c of credits) {
    const name = cleanArtistName(c.anv || c.name)
    for (const role of splitRoles(c.role)) {
      const label = c.tracks ? `${role} (${c.tracks})` : role
      const names = byRole.get(label) ?? []
      if (!names.includes(name)) names.push(name)
      byRole.set(label, names)
    }
  }
  return [...byRole].map(([role, names]) => ({ role, names }))
}

// ---------- Wikipedia ----------

/** Abbreviations a sentence doesn't end on: "St. Catherine's", "U.S. tour". */
const NOT_AN_END = /\b(St|Mr|Mrs|Ms|Dr|Jr|Sr|vs|No|Vol|feat|ft|[A-Z]\.[A-Z])\.$/

/**
 * The first few sentences of the first paragraph, under `max` characters
 * (but at least one): the artist's summary, where the full article is too
 * much to read over one side of a record.
 */
export function briefly(text: string, max = 480): string {
  const first = text.split(/\n+/).find((p) => p.trim()) ?? ''
  const sentences: string[] = []
  for (const part of first.trim().split(/(?<=[.!?])\s+(?=[\p{Lu}"“(])/u)) {
    const prev = sentences.length - 1
    if (prev >= 0 && NOT_AN_END.test(sentences[prev]))
      sentences[prev] += ` ${part}`
    else sentences.push(part)
  }
  let out = sentences[0] ?? ''
  for (const s of sentences.slice(1)) {
    if (out.length + s.length + 1 > max) break
    out += ` ${s}`
  }
  return out
}

/**
 * The album's article: the exact one Wikidata links when MusicBrainz knew the
 * record, in the album's own language first, then English, then French (a
 * French label's English-language records often only have a French article).
 * Otherwise a title search that only accepts a clear match.
 */
async function albumArticle(
  facts: RecordFacts | null,
  title: string,
  artist: string,
): Promise<{ page: WikiPage | null; lang: WikiLang }> {
  const candidates: Array<{ lang: WikiLang; title: string | null }> = [
    {
      lang: facts?.original?.lang ?? '',
      title: facts?.original?.title ?? null,
    },
    { lang: 'en', title: facts?.wikiTitles.en ?? null },
    { lang: 'fr', title: facts?.wikiTitles.fr ?? null },
  ]
  for (const c of candidates) {
    const page = c.title ? await wikiPage(c.title, c.lang) : null
    if (page) return { page, lang: c.lang }
  }
  const found = await findWikiPage(
    title,
    artist,
    `"${title}" ${artist} album`,
    (p) =>
      /\b(album|ep|record|mixtape)\b/i.test(`${p.description} ${p.summary}`),
  )
  return { page: found, lang: 'en' }
}

const ABOUT_ARTIST =
  /\b(band|musician|singer|rapper|producer|dj|duo|trio|group|songwriter|composer|artist|project)\b/i

async function findArtistPage(
  artist: string,
  discogsUrls: string[],
): Promise<WikiPage | null> {
  // Discogs often links the right article already.
  const linked = discogsUrls.find((u) =>
    /^https?:\/\/en\.wikipedia\.org\/wiki\//.test(u),
  )
  if (linked) {
    const page = await wikiPage(
      decodeURIComponent(linked.split('/wiki/')[1]).replace(/_/g, ' '),
    )
    if (page) return page
  }
  const want = matchKey(artist)
  const titles = (await wikiSearch(`${artist} band OR musician`)).filter(
    (t) => matchKey(bareTitle(t)) === want,
  )
  for (const t of titles.slice(0, 3)) {
    const page = await wikiPage(t)
    if (page && ABOUT_ARTIST.test(`${page.description ?? ''} ${page.summary}`))
      return page
  }
  return null
}

/** Sentences naming a song are kept to a few: the album section has the rest. */
const MAX_MENTIONS = 3

/** Sentences of the album's article that name the song in quotes: "…the single "Dopamine"…" (or «…», „…“). */
function mentionsOf(song: string, page: WikiPage | null): string[] {
  const key = matchKey(song)
  if (key.length < 2 || !page) return []
  const out: string[] = []
  const text = [page.summary, ...page.sections.map((s) => s.text)].join('\n')
  for (const sentence of text.split(/(?<=[.!?])\s+(?=[\p{Lu}"“«„])/u)) {
    const quoted = [...sentence.matchAll(/["“«„]\s?([^"”»“]+?)\s?["”»“]/g)].map(
      (m) => matchKey(m[1]),
    )
    if (quoted.includes(key) && !out.includes(sentence.trim()))
      out.push(sentence.trim())
  }
  return out.slice(0, MAX_MENTIONS)
}

// ---------- assembly ----------

const cache = new Map<number, { at: number; notes: LinerNotes }>()
const CACHE_MS = 60 * 60_000

export async function linerNotesFor(
  releaseId: number,
  auth: OAuthToken,
): Promise<LinerNotes> {
  const hit = cache.get(releaseId)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.notes

  const release = await discogsGet<FullRelease>(`/releases/${releaseId}`, auth)
  // Started early: it's the slowest source (MusicBrainz allows one request a
  // second) and runs alongside the Discogs lookups below.
  const factsP = recordFactsFor(release.master_id, releaseId)
  const tracks = (release.tracklist ?? []).filter((t) => t.type_ === 'track')
  const mainArtist = release.artists[0]
  const artistName = cleanArtistName(mainArtist?.name ?? '')

  // Small pressings often carry no credits; the master's main release may.
  let credits = release.extraartists ?? []
  let creditsFrom: LinerNotes['creditsFrom'] = 'this pressing'
  if (!credits.length && release.master_id) {
    const master = await discogsGet<{ main_release?: number }>(
      `/masters/${release.master_id}`,
      auth,
    ).catch(() => null)
    if (master?.main_release && master.main_release !== releaseId) {
      const main = await discogsGet<FullRelease>(
        `/releases/${master.main_release}`,
        auth,
      ).catch(() => null)
      if (main?.extraartists?.length) {
        credits = main.extraartists
        creditsFrom = 'the original release'
      }
    }
  }

  const artist =
    mainArtist && mainArtist.id !== 194 // "Various"
      ? await discogsGet<DiscogsArtist>(
          `/artists/${mainArtist.id}`,
          auth,
        ).catch(() => null)
      : null

  const [
    { page: albumPage, lang: albumLang },
    artistPage,
    streaming,
    facts,
    albumStats,
    artistStats,
    live,
  ] = await Promise.all([
    factsP.then((f) => albumArticle(f, release.title, artistName)),
    artist ? findArtistPage(artistName, artist.urls ?? []) : null,
    // Only needed when Discogs is missing track times.
    tracks.every((t) => trackSeconds(t.duration) > 0)
      ? null
      : streamingLengths(artistName, release.title, tracks),
    factsP,
    artist ? lastfmAlbum(artistName, release.title) : null,
    artist ? lastfmArtist(artistName) : null,
    artist
      ? factsP
          .then((f) => liveHistory(artistName, f?.artistMbid ?? null))
          .catch(() => null)
      : null,
  ])
  const artistWikitext = artistPage ? await wikiText(artistPage.title) : null

  // The praise and infobox parsers know English Wikipedia's templates, so
  // they read the English article when the one shown is in another language.
  const englishTitle = facts?.wikiTitles.en
  const albumWikitext =
    albumLang !== 'en' && englishTitle
      ? await wikiText(englishTitle, 'en')
      : albumPage
        ? await wikiText(albumPage.title, albumLang)
        : null
  // Comes with the release already fetched: no extra request.
  // One community rating is enough: the one more people voted in.
  const [communityPraise] = [
    {
      source: 'Discogs',
      ...release.community?.rating,
    },
    {
      source: 'MusicBrainz',
      ...facts?.musicbrainzRating,
    },
  ]
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .flatMap((r) => communityRating(r.source, r.average, r.count) ?? [])

  const notes: LinerNotes = {
    releaseId,
    notes: release.notes ? cleanDiscogsMarkup(release.notes) : null,
    credits: groupCredits(credits.filter((c) => !c.tracks)),
    creditsFrom,
    companies: groupCredits(
      (release.companies ?? []).map((c) => ({
        name: c.name,
        role: c.entity_type_name,
      })),
    ),
    runout: (release.identifiers ?? [])
      .filter((i) => /matrix|runout/i.test(i.type))
      .map((i) => (i.description ? `${i.value} (${i.description})` : i.value)),
    artist: artist
      ? {
          name: artistName,
          realName: artist.realname ?? null,
          profile: artist.profile
            ? briefly(cleanDiscogsMarkup(artist.profile))
            : null,
          members: (artist.members ?? []).map((m) => ({
            name: cleanArtistName(m.name),
            active: m.active,
          })),
          discogsUrl: artist.uri ?? null,
          facts: artistWikitext ? artistFactsFrom(artistWikitext) : null,
          lastfm: artistStats,
          live: live
            ? { shows: live.total, last: live.last, url: live.url }
            : null,
        }
      : null,
    wiki: {
      album: albumPage,
      // Its lead, cut short: the room is about the record.
      artist: artistPage
        ? { ...artistPage, summary: briefly(artistPage.summary), sections: [] }
        : null,
    },
    albumFacts: albumWikitext ? albumFactsFrom(albumWikitext) : null,
    praise: [
      // Wikidata's awards still count when there's no article to read.
      ...praiseFrom(albumWikitext ?? '', {
        awards: facts?.awards,
        certifications: facts?.certifications,
      }),
      ...(communityPraise ? [communityPraise] : []),
    ],
    lastfm: albumStats,
    tracks: tracks.map((t) => {
      const own = t.artists?.[0] ? cleanArtistName(t.artists[0].name) : null
      // On a split, another band's song isn't in this artist's setlists.
      const byArtist = !own || matchKey(own) === matchKey(artistName)
      return {
        position: t.position,
        title: t.title,
        artist: byArtist ? null : own,
        credits: groupCredits([
          ...(t.extraartists ?? []),
          // Release-level credits scoped to tracks ("Vocals (A2, B1)").
          ...credits.filter(
            (c) => c.tracks && tracksInclude(c.tracks, t.position),
          ),
        ]).map((c) => ({ ...c, role: c.role.replace(/\s*\([^)]*\)$/, '') })),
        mentions: mentionsOf(t.title, albumPage),
        live: byArtist ? liveTrack(live, t.title) : null,
      }
    }),
    streaming,
  }
  cache.set(releaseId, { at: Date.now(), notes })
  return notes
}

/** Does a Discogs track range like "A1 to A3, B2" cover `position`? */
export function tracksInclude(range: string, position: string): boolean {
  const pos = position.trim().toUpperCase()
  return range
    .toUpperCase()
    .split(/\s*,\s*/)
    .some((part) => {
      const [from, to] = part.split(/\s+TO\s+/).map((s) => s.trim())
      if (!to) return from === pos
      const parse = (p: string) => /^([A-Z]*)(\d*)/.exec(p) ?? ['', '', '']
      const [, fs, fn] = parse(from)
      const [, ts, tn] = parse(to)
      const [, ps, pn] = parse(pos)
      const key = (s: string, n: string) =>
        `${s.padStart(2, ' ')}${n.padStart(3, '0')}`
      return key(fs, fn) <= key(ps, pn) && key(ps, pn) <= key(ts, tn)
    })
}

/** Lengths for the tracks Discogs has no time for, matched by song title. */
async function streamingLengths(
  artist: string,
  title: string,
  vinylTracks: Array<{
    position: string
    title: string
    duration: string
    artists?: DiscogsArtistRef[]
  }>,
): Promise<LinerNotes['streaming']> {
  if (!artist) return null
  try {
    const found = await findArtwork(artist, title).catch(() => null)
    return await missingTrackLengths(
      artist,
      found?.album ?? null,
      vinylTracks.map((t) => ({
        ...t,
        // On a split, each side's band, not the first one named.
        artist: t.artists?.[0] ? cleanArtistName(t.artists[0].name) : undefined,
      })),
    )
  } catch {
    return null
  }
}
