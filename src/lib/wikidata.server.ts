import type { AwardFact, CertFact } from '#/lib/praise.server'

// Wikidata, reached through MusicBrainz: the album item's sitelinks name its
// exact Wikipedia articles, its language says which of them to read first,
// and its "award received" / "nominated for" statements list awards (and
// French sales certifications) that the article often leaves out.

const WIKIDATA = 'https://www.wikidata.org/w/api.php'
const WIKIDATA_UA = 'Spinsight/0.1 (https://spinsight-app.vercel.app)'
const WIKIDATA_TIMEOUT_MS = 8_000

/** award received, nominated for, the "point in time" qualifier, language of work. */
const AWARD_RECEIVED = 'P166'
const NOMINATED_FOR = 'P1411'
const POINT_IN_TIME = 'P585'
const LANGUAGE = 'P407'

/**
 * Wikipedia language codes of the languages albums are most often in, by
 * Wikidata item. Rarer languages count as unknown, and the English article
 * is read instead.
 */
const WIKI_LANGS: Record<string, string> = {
  Q1860: 'en',
  Q150: 'fr',
  Q188: 'de',
  Q1321: 'es',
  Q652: 'it',
  Q5146: 'pt',
  Q7411: 'nl',
  Q9027: 'sv',
  Q9035: 'da',
  Q9043: 'no',
  Q25167: 'no',
  Q1412: 'fi',
  Q294: 'is',
  Q809: 'pl',
  Q7737: 'ru',
  Q9056: 'cs',
  Q9067: 'hu',
  Q9129: 'el',
  Q256: 'tr',
  Q7026: 'ca',
  Q9142: 'ga',
  Q9309: 'cy',
  Q5287: 'ja',
  Q9176: 'ko',
  Q7850: 'zh',
  Q13955: 'ar',
  Q9288: 'he',
  Q1568: 'hi',
}

/** Throws when Wikidata can't answer, so the caller doesn't cache a blank. */
async function wikidataApi<T>(params: Record<string, string>): Promise<T> {
  const res = await fetch(
    `${WIKIDATA}?${new URLSearchParams({ format: 'json', ...params })}`,
    {
      headers: { 'User-Agent': WIKIDATA_UA },
      signal: AbortSignal.timeout(WIKIDATA_TIMEOUT_MS),
    },
  )
  if (!res.ok) throw new Error(`Wikidata failed (${res.status})`)
  return (await res.json()) as T
}

type Claim = {
  rank?: string
  mainsnak?: { datavalue?: { value?: { id?: string } } }
  qualifiers?: Record<
    string,
    Array<{ datavalue?: { value?: { time?: string } } }> | undefined
  >
}

type Entity = {
  id?: string
  missing?: string
  sitelinks?: Record<string, { title: string } | undefined>
  claims?: Record<string, Claim[] | undefined>
  labels?: Record<string, { value: string } | undefined>
}

export type WikidataAlbum = {
  qid: string
  /** The album's own language's article, when that isn't English: { lang: "fr", title: "Ginger (album de Gaëtan Roussel)" }. */
  original: { lang: string; title: string } | null
  /** English and French article titles. */
  wikiTitles: { en: string | null; fr: string | null }
  awards: AwardFact[]
  certifications: CertFact[]
}

/**
 * The album item by QID, or found from its English article's title (for
 * release groups that link Wikipedia but not Wikidata). Null when missing.
 */
export async function wikidataAlbum(
  by: { qid: string } | { enwikiTitle: string },
): Promise<WikidataAlbum | null> {
  const data = await wikidataApi<{ entities?: Record<string, Entity> }>({
    action: 'wbgetentities',
    props: 'sitelinks|claims',
    ...('qid' in by
      ? { ids: by.qid }
      : { sites: 'enwiki', titles: by.enwikiTitle, normalize: '1' }),
  })
  const entity = Object.values(data.entities ?? {})[0] as Entity | undefined
  if (!entity?.id || entity.missing !== undefined) return null

  const claims = (prop: string, won: boolean) =>
    (entity.claims?.[prop] ?? [])
      .filter((c) => c.rank !== 'deprecated')
      .flatMap((c) => {
        const id = c.mainsnak?.datavalue?.value?.id
        const time =
          c.qualifiers?.[POINT_IN_TIME]?.[0]?.datavalue?.value?.time ?? ''
        return id
          ? [{ id, won, year: /^[+-]?(\d{4})/.exec(time)?.[1] ?? null }]
          : []
      })
  const raw = [...claims(AWARD_RECEIVED, true), ...claims(NOMINATED_FOR, false)]
  const title = (lang: string) =>
    entity.sitelinks?.[`${lang}wiki`]?.title ?? null
  const languageId =
    entity.claims?.[LANGUAGE]?.[0]?.mainsnak?.datavalue?.value?.id
  const lang = languageId ? WIKI_LANGS[languageId] : undefined
  const originalTitle = lang && lang !== 'en' ? title(lang) : null
  const labelled = raw.length
    ? await labelAwards(raw)
    : { awards: [], certifications: [] }

  return {
    qid: entity.id,
    original: lang && originalTitle ? { lang, title: originalTitle } : null,
    wikiTitles: { en: title('en'), fr: title('fr') },
    ...labelled,
  }
}

/** Gold/platinum records are stored as awards too. */
const CERTIFICATION =
  /\b(silver|gold|platinum|diamond)\b.*\b(album|record|single|disc)\b|certification/i
/** "SNEP double platinum album": who certified it, how many times, what level. */
const CERT_LABEL =
  /^(SNEP|RIAA|BPI|BVMI|ARIA|RIAJ|FIMI|Music Canada|PROMUSICAE)\s+(?:(double|triple|quadruple|quintuple)\s+)?(gold|platinum|diamond)\s+album\b/i
const CERTIFIER_REGIONS: Record<string, string> = {
  snep: 'France',
  riaa: 'United States',
  bpi: 'United Kingdom',
  bvmi: 'Germany',
  aria: 'Australia',
  riaj: 'Japan',
  fimi: 'Italy',
  'music canada': 'Canada',
  promusicae: 'Spain',
}
const TIMES: Record<string, number> = {
  double: 2,
  triple: 3,
  quadruple: 4,
  quintuple: 5,
}

/**
 * Award items' labels: awards split into body and category, certifications
 * into country and level. Certifications that don't say which country
 * ("gold record") are dropped, since they can't be shown as "Gold in …".
 */
async function labelAwards(
  raw: Array<{ id: string; won: boolean; year: string | null }>,
): Promise<{ awards: AwardFact[]; certifications: CertFact[] }> {
  const ids = [...new Set(raw.map((r) => r.id))].slice(0, 50)
  const data = await wikidataApi<{ entities?: Record<string, Entity> }>({
    action: 'wbgetentities',
    ids: ids.join('|'),
    props: 'labels',
    languages: 'en|fr',
  })
  const awards: AwardFact[] = []
  const certifications: CertFact[] = []
  for (const r of raw) {
    const labels = data.entities?.[r.id]?.labels
    const en = labels?.en?.value
    if (!en) continue
    const cert = CERT_LABEL.exec(en)
    if (cert && r.won)
      certifications.push({
        region: CERTIFIER_REGIONS[cert[1].toLowerCase()],
        award: cert[3].toLowerCase() as CertFact['award'],
        times: cert[2] ? TIMES[cert[2].toLowerCase()] : 1,
      })
    else if (!CERTIFICATION.test(en))
      awards.push({
        ...awardName(en, labels?.fr?.value),
        won: r.won,
        year: r.year,
      })
  }
  return { awards, certifications }
}

/**
 * "Grammy Award for Album of the Year" → Grammy Awards / Album of the Year.
 * Victoires de la Musique only have clumsy English labels ("Victory of the
 * rock album"), so their French one is used.
 */
function awardName(
  en: string,
  fr: string | undefined,
): { body: string; category: string | null } {
  if (/^victor(y|ies)\b/i.test(en) && fr)
    return { body: 'Victoires de la Musique', category: fr }
  const m = /^(.+?\b(?:award|awards|prize))\s+for\s+(.+)$/i.exec(en)
  if (!m) return { body: en, category: null }
  const body = m[1].replace(/\baward$/i, 'Awards')
  return { body, category: m[2][0].toUpperCase() + m[2].slice(1) }
}
