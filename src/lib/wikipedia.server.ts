import { matchKey } from '#/lib/artwork.server'
import type { WikiPage } from '#/lib/liner-notes'

// Wikipedia for the listening room: plain-text articles (lead plus the
// sections worth reading), raw wikitext for the praise and infobox parsers,
// and a title search that only accepts a clear match.

const WIKI_UA = 'Spinsight/0.1 (https://spinsight-app.vercel.app)'

/** A Wikipedia language code: "en", "fr", "de"… */
export type WikiLang = string

export async function wikiApi<T>(
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

export async function wikiSearch(query: string, limit = 5): Promise<string[]> {
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

export async function wikiPage(
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
export async function wikiText(
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
export const bareTitle = (t: string) => t.replace(/\s*\(.*\)\s*$/, '')

/**
 * Finds the Wikipedia page for something only when it's clearly the right
 * one: the title must match and the page must mention the artist. Search
 * ranking alone is too loose (a small band's album returns its label).
 */
export async function findWikiPage(
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
