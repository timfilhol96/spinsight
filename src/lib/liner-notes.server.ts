import { albumTrackLengths, findArtwork, matchKey } from '#/lib/artwork.server'
import { cleanArtistName, discogsGet } from '#/lib/discogs.server'
import type {
  DiscogsArtistRef,
  DiscogsRelease,
  OAuthToken,
} from '#/lib/discogs.server'
import type { LinerNotes, WikiPage } from '#/lib/liner-notes'
import { praiseFrom } from '#/lib/praise.server'
import { trackSeconds } from '#/lib/track-follower'

// Reading material for the listening room: credits, notes and the artist bio
// from Discogs, background from Wikipedia, and streaming track lengths so the
// track follower has timings when Discogs has none. Read-only everywhere:
// nothing here touches the database.

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

const WIKI = 'https://en.wikipedia.org/w/api.php'
const WIKI_UA = 'Spinsight/0.1 (https://spinsight-app.vercel.app)'

async function wikiApi<T>(params: Record<string, string>): Promise<T | null> {
  const url = `${WIKI}?${new URLSearchParams({
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
  /^(background|history|recording|production|writing|composition|music|lyrics|themes|concept|artwork|packaging|release|legacy|origins?|formation|early|career|style|influences|musical style)/i

async function wikiPage(title: string): Promise<WikiPage | null> {
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
  }>({
    action: 'query',
    prop: 'extracts|description|info',
    inprop: 'url',
    explaintext: '1',
    redirects: '1',
    titles: title,
  })
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
    url:
      page.fullurl ??
      `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    description: page.description ?? null,
    summary,
    sections,
  }
}

/** Raw wikitext, for what the plain extract drops: score boxes and tables. */
async function wikiText(title: string): Promise<string | null> {
  const data = await wikiApi<{ parse?: { wikitext?: string } }>({
    action: 'parse',
    page: title,
    prop: 'wikitext',
    redirects: '1',
  })
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

/** Sentences of an article that name the song in quotes: "…the single "Dopamine"…". */
function mentionsOf(song: string, pages: Array<WikiPage | null>): string[] {
  const key = matchKey(song)
  if (key.length < 2) return []
  const out: string[] = []
  for (const page of pages) {
    if (!page) continue
    const text = [page.summary, ...page.sections.map((s) => s.text)].join('\n')
    for (const sentence of text.split(/(?<=[.!?])\s+(?=[A-Z"“])/)) {
      const quoted = [...sentence.matchAll(/["“]([^"”]+)["”]/g)].map((m) =>
        matchKey(m[1]),
      )
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

  const [albumPage, artistPage, streaming] = await Promise.all([
    findWikiPage(
      release.title,
      artistName,
      `"${release.title}" ${artistName} album`,
      (p) =>
        /\b(album|ep|record|mixtape)\b/i.test(`${p.description} ${p.summary}`),
    ),
    artist ? findArtistPage(artistName, artist.urls ?? []) : null,
    // Only needed when Discogs is missing track times.
    tracks.every((t) => trackSeconds(t.duration) > 0)
      ? null
      : streamingLengths(artistName, release.title, tracks.length),
  ])

  const albumWikitext = albumPage ? await wikiText(albumPage.title) : null

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
    praise: albumWikitext ? praiseFrom(albumWikitext) : [],
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

async function streamingLengths(
  artist: string,
  title: string,
  vinylTracks: number,
): Promise<LinerNotes['streaming']> {
  if (!artist || !vinylTracks) return null
  try {
    const found = await findArtwork(artist, title)
    if (!found.album) return null
    const lengths = await albumTrackLengths(found.album)
    return lengths.length >= vinylTracks
      ? { source: found.album.source, lengths, album: found.album.name }
      : null
  } catch {
    return null
  }
}
