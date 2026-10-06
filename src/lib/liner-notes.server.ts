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
import {
  albumFactsFrom,
  communityRating,
  praiseFrom,
} from '#/lib/praise.server'
import { recordFactsFor } from '#/lib/record-facts.server'
import type { RecordFacts } from '#/lib/record-facts.server'
import { trackSeconds } from '#/lib/track-follower'

// Reading material for the listening room: credits, notes and the artist bio
// from Discogs, background from Wikipedia, and streaming track lengths so the
// track follower has timings when Discogs has none. The album's article is
// found through MusicBrainz → Wikidata when they know the record (exact), and
// by title search otherwise. The only database use is the shared cache of
// those lookups (record-facts.server.ts); every source fails soft.

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

const WIKI_UA = 'Spinsight/0.1 (https://spinsight-app.vercel.app)'

/** A Wikipedia language code: "en", "fr", "de"… */
type WikiLang = string

async function wikiApi<T>(
  params: Record<string, string>,
  lang: WikiLang = 'en',
): Promise<T | null> {
  const url = `https://${lang}.wikipedia.org/w/api.php?${new URLSearchParams({
    format: 'json',
    formatversion: '2',
    origin: '*',
    ...params,
  })}`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': WIKI_UA } })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

async function wikiSearch(query: string, limit = 5): Promise<string[]> {
  const data = await wikiApi<{ query?: { search?: Array<{ title: string }> } }>(
    {
      action: 'query',
      list: 'search',
      srsearch: query,
      srlimit: String(limit),
    },
  )
  return (data?.query?.search ?? []).map((s) => s.title)
}

/** Sections worth reading while the record plays; the rest is tables and refs. */
const READABLE =
  /^(background|history|recording|production|writing|composition|music|lyrics|themes|concept|artwork|packaging|release|legacy|origins?|formation|early|career|style|influences|musical style|contexte|genèse|historique|enregistrement|écriture|musique|paroles|thèmes|pochette|sortie|postérité|héritage|hintergrund|geschichte|entstehung|aufnahme|produktion|musik|texte|veröffentlichung|antecedentes|historia|grabación|producción|composición|música|letras|lanzamiento|legado|storia|registrazione|produzione|composizione|musica|testi|pubblicazione|história|gravação|produção|composição|lançamento|achtergrond|geschiedenis|opname|productie|muziek|teksten|uitgave)/i

async function wikiPage(
  title: string,
  lang: WikiLang = 'en',
): Promise<WikiPage | null> {
  const data = await wikiApi<{
    query?: {
      pages?: Array<{
        title: string
        missing?: boolean
        description?: string
        extract?: string
        fullurl?: string
      }>
    }
  }>(
    {
      action: 'query',
      prop: 'extracts|description|info',
      inprop: 'url',
      explaintext: '1',
      redirects: '1',
      titles: title,
    },
    lang,
  )
  const page = data?.query?.pages?.[0]
  if (!page || page.missing || !page.extract) return null
  // The plain-text extract marks headings as "== Heading ==".
  const chunks = page.extract.split(/\n\n*(==+) ?(.+?) ?==+\n/)
  const summary = chunks[0].trim()
  const sections: WikiPage['sections'] = []
  // Subsections ("2011–2012: Formation") count when their section does.
  let parentReadable = false
  for (let i = 1; i + 2 < chunks.length; i += 3) {
    const level = chunks[i].length
    const heading = chunks[i + 1].trim()
    const text = chunks[i + 2].trim()
    if (level === 2) parentReadable = READABLE.test(heading)
    const readable =
      level === 2 ? parentReadable : level === 3 && parentReadable
    if (heading && text && (readable || READABLE.test(heading)))
      sections.push({ heading, text })
  }
  return {
    title: page.title,
    lang,
    url:
      page.fullurl ??
      `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    description: page.description ?? null,
    summary,
    sections,
  }
}

/** Raw wikitext, for what the plain extract drops: score boxes and tables. */
async function wikiText(
  title: string,
  lang: WikiLang = 'en',
): Promise<string | null> {
  const data = await wikiApi<{ parse?: { wikitext?: string } }>(
    {
      action: 'parse',
      page: title,
      prop: 'wikitext',
      redirects: '1',
    },
    lang,
  )
  return data?.parse?.wikitext ?? null
}

/** Page title without the disambiguator: "Cry (Cigarettes After Sex album)" → "Cry". */
const bareTitle = (t: string) => t.replace(/\s*\(.*\)\s*$/, '')

/**
 * Finds the Wikipedia page for something only when it's clearly the right
 * one: the title must match and the page must mention the artist. Search
 * ranking alone is too loose (a small band's album returns its label).
 */
async function findWikiPage(
  name: string,
  artist: string,
  query: string,
  looksRight: (p: WikiPage) => boolean,
): Promise<WikiPage | null> {
  const want = matchKey(name)
  const titles = (await wikiSearch(query)).filter(
    (t) => matchKey(bareTitle(t)) === want,
  )
  const artistKey = matchKey(artist)
  for (const t of titles.slice(0, 3)) {
    const page = await wikiPage(t)
    if (
      page &&
      matchKey(`${page.description ?? ''} ${page.summary}`).includes(
        artistKey,
      ) &&
      looksRight(page)
    )
      return page
  }
  return null
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

/** Sentences of an article that name the song in quotes: "…the single "Dopamine"…" (or «…», „…“). */
function mentionsOf(song: string, pages: Array<WikiPage | null>): string[] {
  const key = matchKey(song)
  if (key.length < 2) return []
  const out: string[] = []
  for (const page of pages) {
    if (!page) continue
    const text = [page.summary, ...page.sections.map((s) => s.text)].join('\n')
    for (const sentence of text.split(/(?<=[.!?])\s+(?=[\p{Lu}"“«„])/u)) {
      const quoted = [
        ...sentence.matchAll(/["“«„]\s?([^"”»“]+?)\s?["”»“]/g),
      ].map((m) => matchKey(m[1]))
      if (quoted.includes(key) && !out.includes(sentence.trim()))
        out.push(sentence.trim())
    }
  }
  return out.slice(0, 4)
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

  const [{ page: albumPage, lang: albumLang }, artistPage, streaming, facts] =
    await Promise.all([
      factsP.then((f) => albumArticle(f, release.title, artistName)),
      artist ? findArtistPage(artistName, artist.urls ?? []) : null,
      // Only needed when Discogs is missing track times.
      tracks.every((t) => trackSeconds(t.duration) > 0)
        ? null
        : streamingLengths(artistName, release.title, tracks),
      factsP,
    ])

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
  const discogsRating = communityRating(
    'Discogs',
    release.community?.rating?.average,
    release.community?.rating?.count,
  )
  const mbRating = communityRating(
    'MusicBrainz',
    facts?.musicbrainzRating?.average,
    facts?.musicbrainzRating?.count,
  )

  // Song articles only exist for singles and famous tracks; look them up in
  // parallel and keep the ones that clearly match.
  const songPages = await Promise.all(
    tracks.map((t) =>
      findWikiPage(
        t.title,
        artistName,
        `"${t.title}" ${artistName} song`,
        // The description ("2015 single by DIIV") is the tell; an album's lead
        // mentions its singles too.
        (p) =>
          /\b(song|single)\b/i.test(
            p.description ?? p.summary.split(/\.\s/)[0],
          ),
      ),
    ),
  )

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
          profile: artist.profile ? cleanDiscogsMarkup(artist.profile) : null,
          members: (artist.members ?? []).map((m) => ({
            name: cleanArtistName(m.name),
            active: m.active,
          })),
          discogsUrl: artist.uri ?? null,
        }
      : null,
    wiki: { album: albumPage, artist: artistPage },
    albumFacts: albumWikitext ? albumFactsFrom(albumWikitext) : null,
    praise: [
      // Wikidata's awards still count when there's no article to read.
      ...praiseFrom(albumWikitext ?? '', {
        awards: facts?.awards,
        certifications: facts?.certifications,
      }),
      ...(discogsRating ? [discogsRating] : []),
      ...(mbRating ? [mbRating] : []),
    ],
    tracks: tracks.map((t, i) => ({
      position: t.position,
      title: t.title,
      credits: groupCredits([
        ...(t.extraartists ?? []),
        // Release-level credits scoped to tracks ("Vocals (A2, B1)").
        ...credits.filter(
          (c) => c.tracks && tracksInclude(c.tracks, t.position),
        ),
      ]).map((c) => ({ ...c, role: c.role.replace(/\s*\([^)]*\)$/, '') })),
      mentions: mentionsOf(t.title, [albumPage, songPages[i]]),
      article: songPages[i]
        ? {
            title: songPages[i].title,
            url: songPages[i].url,
            summary: songPages[i].summary,
          }
        : null,
    })),
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
