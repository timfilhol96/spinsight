import { matchKey } from '#/lib/artwork.server'
import type { AlbumFacts, ArtistFacts, Praise } from '#/lib/liner-notes'

// Critics' praise for an album or a song, read from its Wikipedia article's wikitext:
// the review-score box ({{Music ratings}}), the accolades and awards tables,
// sales certifications, chart peaks and quotes in the reception section. Only
// the highest marks are kept; stand mode shows them, and a middling review is
// not something to put on the wall. The infobox facts (studio, producer…) are
// read here too, since they come out of the same wikitext, and so are the
// artist's (origin, years active, genres).
//
// Wikitext is hand-written and messy: every parser here returns [] or null on
// anything it doesn't recognise rather than throwing.

/** Scores at or above this share of the maximum count as high. */
const HIGH = 0.8
/** List placings at or above this rank count (unranked lists count too). */
const TOP_RANK = 10
/** Chart peaks at or above this position count. */
const TOP_PEAK = 10
/** Community averages (out of 5) at or above this count as high. */
export const HIGH_COMMUNITY = 4.0
/** Fewer votes than this and an average says more about who voted than the record. */
export const MIN_COMMUNITY_VOTES = 25
/** Longer quotes don't read from across the room. */
const MAX_QUOTE = 300
/** Quotes shown at most: each takes the whole stand-mode screen. */
const MAX_QUOTES = 2
/** Shorter quotes are fragments ("expert mood-setters or crafty reconstructionists"). */
const MIN_QUOTE_WORDS = 7
/** Bare scores shown at most; quotes and placings say more. */
const MAX_RATINGS = 2
/** Awards shown at most, before completing the last award body (see capByBody). */
const MAX_AWARDS = 4
/** List placings shown at most; a celebrated album has dozens. */
const MAX_ACCOLADES = 4
/** Countries named in the certification line; the rest are counted. */
const MAX_CERTS = 3
/** Chart lines (one per peak position) and charts named on each. */
const MAX_CHART_LINES = 2
const MAX_CHARTS = 4

/** The `{{…}}` starting at `from`, with nested templates balanced. */
function templateAt(text: string, from: number): string {
  let depth = 0
  for (let i = from; i < text.length - 1; i++) {
    if (text[i] === '{' && text[i + 1] === '{') {
      depth++
      i++
    } else if (text[i] === '}' && text[i + 1] === '}') {
      depth--
      i++
      if (depth === 0) return text.slice(from, i + 1)
    }
  }
  return text.slice(from)
}

/** Every top-level template removed, except those `keep` rewrites. */
function replaceTemplates(
  text: string,
  keep: (tpl: string) => string | null = () => null,
): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    const at = text.indexOf('{{', i)
    if (at < 0) {
      out += text.slice(i)
      break
    }
    out += text.slice(i, at)
    const tpl = templateAt(text, at)
    out += keep(tpl) ?? ''
    i = at + tpl.length
  }
  return out
}

/** Every `{{name|…}}` in the text (`name` matched case-insensitively). */
function templatesNamed(text: string, name: RegExp): string[] {
  const re = new RegExp(`\\{\\{\\s*(?:${name.source})\\s*[|}]`, 'gi')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) out.push(templateAt(text, m.index))
  return out
}

/**
 * A template's parameters, split on top-level "|" only: values are often
 * templates or links themselves.
 */
function templateParams(tpl: string): {
  positional: string[]
  named: Map<string, string>
} {
  const positional: string[] = []
  const named = new Map<string, string>()
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (let i = 2; i < tpl.length - 2; i++) {
    const two = tpl.slice(i, i + 2)
    if (two === '{{' || two === '[[') {
      depth++
      cur += two
      i++
      continue
    }
    if (two === '}}' || two === ']]') {
      depth--
      cur += two
      i++
      continue
    }
    if (tpl[i] === '|' && depth === 0) {
      parts.push(cur)
      cur = ''
      continue
    }
    cur += tpl[i]
  }
  parts.push(cur)
  // parts[0] is the template's name.
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=')
    // "=" inside a link or template is part of the value, not a name.
    const named_ = eq > 0 && !/[[{]/.test(p.slice(0, eq))
    if (named_)
      named.set(p.slice(0, eq).trim().toLowerCase(), p.slice(eq + 1).trim())
    else positional.push(p.trim())
  }
  return { positional, named }
}

const stripRefs = (w: string) =>
  w
    .replace(/<ref[^>/]*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')

/** Links to their text; italics and bold markers removed unless `keepItalics`. */
function plain(w: string, keepItalics = false): string {
  let s = w
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\[https?:\S+ ([^\]]*)\]/g, '$1')
    .replace(/'''/g, '')
    .replace(/&nbsp;/g, ' ')
  if (!keepItalics) s = s.replace(/''/g, '')
  return s.replace(/\s+/g, ' ').trim()
}

/** `{{center|7}}`, `{{'}}` and friends to their visible text. */
const inlineTemplates = (tpl: string): string | null => {
  if (tpl === "{{'}}") return '’'
  const m =
    /^\{\{\s*(center|nowrap|small|sort\|[^|]*)\s*\|([\s\S]*)\}\}$/i.exec(tpl)
  return m ? m[2] : null
}

type Score = { display: string; value: number }

const GRADES: Record<string, number> = {
  'A+': 1,
  A: 0.96,
  'A-': 0.92,
  'B+': 0.87,
  B: 0.83,
  'B-': 0.79,
  'C+': 0.75,
  C: 0.7,
  'C-': 0.65,
  D: 0.5,
  F: 0.2,
}

function parseScore(raw: string): Score | null {
  const s = raw.trim()
  const stars = /\{\{\s*rating\s*\|\s*([\d.]+)\s*\|\s*(\d+)/i.exec(s)
  if (stars)
    return {
      display: `${stars[1]}/${stars[2]}`,
      value: Number(stars[1]) / Number(stars[2]),
    }
  const frac = /^([\d.]+)\s*\/\s*(\d+)/.exec(s)
  if (frac)
    return {
      display: `${frac[1]}/${frac[2]}`,
      value: Number(frac[1]) / Number(frac[2]),
    }
  const grade = /^([A-DF])\s*([+−–-])?/.exec(plain(replaceTemplates(s)))
  if (grade) {
    const key = grade[1] + (grade[2] ? (grade[2] === '+' ? '+' : '-') : '')
    const display = grade[1] + (grade[2] ? (grade[2] === '+' ? '+' : '−') : '')
    if (key in GRADES) return { display, value: GRADES[key] }
  }
  return null
}

type Review = { by: string; score: Score }

/** Scores from {{Music ratings}} / {{Album ratings}}: reviews plus aggregators. */
function ratings(wikitext: string): Review[] {
  const at = wikitext.search(/\{\{\s*(music|album) ratings/i)
  if (at < 0) return []
  const params = templateParams(templateAt(wikitext, at)).named

  const out: Review[] = []
  const agg: Record<string, string> = {
    mc: 'Metacritic',
    adm: 'AnyDecentMusic?',
    aoty: 'Album of the Year',
  }
  for (const [key, name] of Object.entries(agg)) {
    const score = params.get(key) && parseScore(params.get(key)!)
    if (score) out.push({ by: name, score })
  }
  for (let n = 1; params.has(`rev${n}`); n++) {
    const score = parseScore(params.get(`rev${n}score`) ?? '')
    if (score) out.push({ by: plain(params.get(`rev${n}`)!), score })
  }
  return out
}

/** The body of the first section whose heading matches, up to the next one of its level. */
function section(wikitext: string, heading: RegExp): string | null {
  const re = /^(==+)\s*(.+?)\s*\1\s*$/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(wikitext))) {
    if (!heading.test(m[2])) continue
    const level = m[1].length
    const rest = wikitext.slice(m.index + m[0].length)
    const end = new RegExp(`^={2,${level}}[^=]`, 'm').exec(rest)
    return end ? rest.slice(0, end.index) : rest
  }
  return null
}

/** The bodies of every section whose heading matches. */
function sections(wikitext: string, heading: RegExp): string[] {
  const re = /^(==+)\s*(.+?)\s*\1\s*$/gm
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(wikitext))) {
    if (!heading.test(m[2])) continue
    const rest = wikitext.slice(m.index + m[0].length)
    const end = new RegExp(`^={2,${m[1].length}}[^=]`, 'm').exec(rest)
    out.push(end ? rest.slice(0, end.index) : rest)
  }
  return out
}

/** Every wikitable in a section. */
const tables = (body: string): string[] =>
  body.match(/\{\|[\s\S]*?\n\|\}/g) ?? []

/** {{won}}, {{nom}} and friends: award tables mark results with them. */
const resultTemplates = (tpl: string): string | null => {
  const m =
    /^\{\{\s*(won|nom|nominated|shortlisted|longlisted|pending)\s*(\|[\s\S]*)?\}\}$/i.exec(
      tpl,
    )
  if (!m) return inlineTemplates(tpl)
  const r = m[1].toLowerCase()
  return r === 'nom' ? 'Nominated' : r[0].toUpperCase() + r.slice(1)
}

/** A cell's visible text: templates, links and inline HTML gone. */
const cellText = (c: string) =>
  plain(
    replaceTemplates(c, resultTemplates)
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ''),
  )

/** Cell attributes ("style=… | text", 'rowspan="2" | text') split from the text. */
function cellParts(c: string): { text: string; rowspan: number } {
  const attr = /^([^[{|]*=[^|]*)\|(?!\|)/.exec(c)
  const span = attr && /rowspan\s*=\s*["']?(\d+)/i.exec(attr[1])
  return {
    text: attr ? c.slice(attr[0].length) : c,
    rowspan: span ? Math.max(1, Number(span[1])) : 1,
  }
}

/**
 * A wikitable's rows as { header: cell } objects. Handles row headers
 * ("! scope=row | NME"), cells spanning rows (award tables group a year's
 * ceremonies) and cells that run onto the next line. Rows that still don't
 * line up with the headers are dropped.
 */
function tableRows(table: string): Array<Record<string, string>> {
  let headers: string[] = []
  // Cells still spanning down from rows above, by column.
  let held: Array<{ text: string; left: number } | undefined> = []
  const out: Array<Record<string, string>> = []
  for (const row of table.split(/\n\s*\|-[^\n]*/)) {
    const cells: string[] = []
    let allHeader = true
    for (const raw of row.split('\n')) {
      const l = raw.trim()
      if (!l || /^(\{\||\|\}|\|\+)/.test(l)) continue
      if (l.startsWith('!')) cells.push(...l.slice(1).split(/!!|\|\|/))
      else if (l.startsWith('|')) {
        allHeader = false
        cells.push(...l.slice(1).split('||'))
      } else if (cells.length) cells[cells.length - 1] += `\n${l}`
    }
    if (!cells.length) continue
    const parts = cells.map(cellParts)
    if (allHeader) {
      headers = parts.map((p) => cellText(p.text).toLowerCase())
      held = []
      continue
    }
    if (!headers.length) continue
    const values: string[] = []
    let next = 0
    for (let col = 0; col < headers.length; col++) {
      const h = held[col]
      if (h && h.left > 0) {
        values.push(h.text)
        h.left--
        continue
      }
      const p = parts[next++] as ReturnType<typeof cellParts> | undefined
      if (!p) break
      const text = cellText(p.text)
      values.push(text)
      held[col] = p.rowspan > 1 ? { text, left: p.rowspan - 1 } : undefined
    }
    if (values.length === headers.length && next === parts.length)
      out.push(Object.fromEntries(headers.map((h, i) => [h, values[i]])))
  }
  return out
}

function accolades(wikitext: string): Praise[] {
  const body = section(wikitext, /^(accolades|year-end lists|rankings|lists)$/i)
  if (!body) return []
  const out: Array<Praise & { rank: number }> = []
  for (const row of tables(body).flatMap(tableRows)) {
    const by = row.publication ?? row.publisher ?? row.critic ?? row.source
    const list = row.accolade ?? row.list ?? row.title
    const rawRank = row.rank ?? row.position ?? ''
    if (!by || !list) continue
    const rank = parseInt(rawRank, 10)
    const ranked = Number.isFinite(rank)
    if (ranked && rank > TOP_RANK) continue
    out.push({
      kind: 'accolade',
      text: ranked ? `No. ${rank}, ${list}` : list,
      by,
      rank: ranked ? rank : TOP_RANK + 1,
    })
  }
  return out
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_ACCOLADES)
    .map(({ rank: _rank, ...p }) => p)
}

/**
 * Quotes from the reception section, kept only when the sentence names a
 * publication that gave the album a high score, so a pan never slips in.
 */
function quotes(wikitext: string, high: Review[]): Praise[] {
  const body = section(wikitext, /reception|reviews/i)
  if (!body || !high.length) return []
  const prose = plain(replaceTemplates(body, inlineTemplates), true)
  const out: Praise[] = []
  for (const sentence of prose.split(/(?<=[.!?]["”]?)\s+(?=[A-Z'"“])/)) {
    const match = /["“]([^"”]{20,})["”]/.exec(sentence)
    const quoted = match?.[1]
    // Words right after the closing mark mean it was really a quote inside
    // the quote ("…ends with "Waste of Breath", which…"): cut short.
    if (
      !match ||
      !quoted ||
      /^\s?\w/.test(sentence.slice(match.index + match[0].length))
    )
      continue
    const text = quoted.replace(/''/g, '').trim()
    const words = text.split(' ')
    if (text.length > MAX_QUOTE || words.length < MIN_QUOTE_WORDS) continue
    // A title in quotes ("500 Greatest Albums of All Time"), not a critic's words.
    if (words.filter((w) => /^[A-Z\d]/.test(w)).length > words.length / 2)
      continue
    const outside = matchKey(sentence.replace(quoted, ''))
    const review = high.find((r) => outside.includes(matchKey(r.by)))
    if (!review || out.some((q) => q.by === review.by)) continue
    out.push({
      kind: 'quote',
      text,
      by: review.by,
      score: review.score.display,
    })
  }
  return out.slice(0, MAX_QUOTES)
}

/** Awards where a nomination is itself an honour; elsewhere only wins count. */
const MAJOR_AWARD =
  /grammy|\bbrit awards?\b|mercury|polaris|juno|victoires de la musique/i

/** An album or a song: their articles chart and name things differently. */
export type Work = 'album' | 'song'

/** The work's name from its infobox, to tell an album's awards from its singles'. */
function infoboxName(wikitext: string): string | null {
  const at = wikitext.search(/\{\{\s*infobox (album|song|single)/i)
  if (at < 0) return null
  const name = templateParams(templateAt(wikitext, at)).named.get('name')
  return name ? plain(name) : null
}

/** An award from structured data (Wikidata), already split into body and category. */
export type AwardFact = {
  /** "Grammy Awards", "Mercury Prize". */
  body: string
  /** "Album of the Year"; null when the award has no categories. */
  category: string | null
  won: boolean
  year: string | null
}

/** Award bodies compared loosely: "Grammy Award" and "Grammy Awards" are one. */
const bodyKey = (s: string) => matchKey(s).replace(/s$/, '')

/**
 * Industry awards from Year / Award / Category / Result tables (Grammys,
 * Mercury…), plus `facts` from Wikidata that the tables don't already have.
 * Wins anywhere count; nominations only for the major awards, since
 * "nominated for a regional blog award" is no accolade.
 */
function awards(
  wikitext: string,
  facts: AwardFact[],
): { won: Praise[]; nominated: Praise[] } {
  const album = matchKey(infoboxName(wikitext) ?? '')
  const found: Array<Praise & { won: boolean; order: number }> = []
  const bodies = sections(wikitext, /award|accolade|nominat|honou?rs/i)
  for (const row of bodies.flatMap(tables).flatMap(tableRows)) {
    const rawBody =
      row.ceremony ??
      row.organization ??
      row.organisation ??
      row['awarding body'] ??
      row.association ??
      row.award ??
      row.awards
    const category =
      row.category ?? (row.award !== rawBody ? row.award : undefined)
    const result = row.result ?? row.outcome ?? ''
    if (!rawBody || !category) continue
    const won = /^(won|winner)/i.test(result)
    if (!won && !/^(nominated|shortlisted)/i.test(result)) continue
    // "56th Annual Grammy Awards" / "2014 Brit Awards" → "Grammy Awards".
    const by = rawBody
      .replace(/^\d{4}\s+/, '')
      .replace(/^\d+(st|nd|rd|th)\s+(annual\s+)?/i, '')
      .trim()
    const major = MAJOR_AWARD.test(by)
    if (!won && !major) continue
    const year = /\b(19|20)\d{2}\b/.exec(row.year ?? row.date ?? rawBody)?.[0]
    const work = (
      row['nominated work'] ??
      row['nominee / work'] ??
      row['nominee/work'] ??
      row.work ??
      ''
    )
      .replace(/^["“]|["”]$/g, '')
      .trim()
    const forAlbum = !work || matchKey(work) === album
    const text = `${won ? 'Won' : 'Nominated'} · ${category}${
      forAlbum ? '' : ` for “${work}”`
    }, ${by}${year ? ` ${year}` : ''}`
    if (found.some((f) => f.text === text)) continue
    found.push({
      kind: 'award',
      text,
      by,
      won,
      // Major awards first, then the album's own over its singles'.
      order: (major ? 0 : 2) + (forAlbum ? 0 : 1),
    })
  }
  for (const f of facts) {
    if (!f.won && !MAJOR_AWARD.test(f.body)) continue
    // The article's table said it first (its wording and year win); Wikidata
    // years can be the eligibility year rather than the ceremony's.
    const what = matchKey(f.category ?? f.body)
    const known = found.some(
      (a) =>
        a.won === f.won &&
        bodyKey(a.by) === bodyKey(f.body) &&
        matchKey(a.text).includes(what) &&
        (f.category || !f.year || a.text.includes(f.year)),
    )
    if (known) continue
    found.push({
      kind: 'award',
      text: `${f.won ? 'Won' : 'Nominated'} · ${
        f.category ? `${f.category}, ` : ''
      }${f.body}${f.year ? ` ${f.year}` : ''}`,
      by: f.body,
      won: f.won,
      order: MAJOR_AWARD.test(f.body) ? 0 : 2,
    })
  }
  const pick = (won: boolean) =>
    found
      .filter((f) => f.won === won)
      .sort((a, b) => a.order - b.order)
      .map(({ won: _won, order: _order, ...p }): Praise => p)
  const won = capByBody(pick(true), MAX_AWARDS)
  return {
    won,
    nominated: capByBody(pick(false), MAX_AWARDS - won.length),
  }
}

/**
 * The first `max` awards, plus any others from the same award bodies: a
 * night of five Grammys reads as one story, so it isn't cut at four.
 */
function capByBody(list: Praise[], max: number): Praise[] {
  if (max <= 0) return []
  const bodies = new Set(list.slice(0, max).map((p) => p.by))
  return list.filter((p, i) => i < max || bodies.has(p.by))
}

const CERT_LEVELS: Record<string, number> = {
  gold: 1,
  platinum: 2,
  diamond: 10,
}
/** Named first: a platinum record in the US outweighs one in a small market. */
const BIG_MARKETS = new Set([
  'United States',
  'United Kingdom',
  'Japan',
  'Germany',
  'France',
])
const REGION_NAMES: Record<string, string> = {
  'United States': 'the US',
  'United Kingdom': 'the UK',
  Netherlands: 'the Netherlands',
  'Czech Republic': 'the Czech Republic',
  Philippines: 'the Philippines',
}

/** A sales certification from structured data (Wikidata): "France", "diamond", 2. */
export type CertFact = {
  /** Country name as Wikipedia's certification tables write it: "United States". */
  region: string
  award: 'gold' | 'platinum' | 'diamond'
  times: number
}

/** Strongest certification per country: some articles list Gold, then Platinum later. */
function keepBest(
  best: Map<string, { label: string; weight: number }>,
  region: string,
  award: string,
  times: number,
) {
  const level = CERT_LEVELS[award]
  if (!region || !level) return
  const label = `${times > 1 ? `${times}× ` : ''}${award[0].toUpperCase()}${award.slice(1)}`
  const weight = level * times
  if ((best.get(region)?.weight ?? 0) < weight)
    best.set(region, { label, weight })
}

/**
 * Gold and above from {{Certification Table Entry}}, combined into one line:
 * "2× Platinum in the UK · Platinum in the US · Gold in France". `facts`
 * (from Wikidata) only add countries the article doesn't list: where both
 * have one, the article's is usually the more recent.
 */
function certifications(wikitext: string, facts: CertFact[]): Praise[] {
  const best = new Map<string, { label: string; weight: number }>()
  for (const tpl of templatesNamed(wikitext, /certification table entry/)) {
    const { named } = templateParams(tpl)
    const n = parseInt(named.get('number') ?? '', 10)
    keepBest(
      best,
      plain(named.get('region') ?? ''),
      plain(named.get('award') ?? '').toLowerCase(),
      Number.isFinite(n) && n > 1 ? n : 1,
    )
  }
  const fromArticle = new Set(best.keys())
  for (const f of facts)
    if (!fromArticle.has(f.region)) keepBest(best, f.region, f.award, f.times)
  if (!best.size) return []
  const small = (r: string) => Number(!BIG_MARKETS.has(r))
  const certs = [...best]
    .sort(([ra, a], [rb, b]) => small(ra) - small(rb) || b.weight - a.weight)
    .map(([region, c]) => `${c.label} in ${REGION_NAMES[region] ?? region}`)
  return [
    {
      kind: 'certification',
      text: certs.slice(0, MAX_CERTS).join(' · '),
      by:
        certs.length > MAX_CERTS
          ? `Certified Gold or higher in ${certs.length} countries`
          : 'Sales certifications',
    },
  ]
}

/** {{Album chart}} codes that don't read well as they are. */
const CHART_NAMES: Record<string, string> = {
  UK2: 'UK Albums',
  UKIndependent: 'UK Independent Albums',
  UKDigital: 'UK Album Downloads',
  UKCompilation: 'UK Compilations',
  Billboard200: 'Billboard 200',
  BillboardIndependent: 'US Independent Albums',
  BillboardRock: 'US Top Rock Albums',
  BillboardAlternative: 'US Alternative Albums',
  BillboardRandBHipHop: 'US R&B/Hip-Hop Albums',
  BillboardDanceElectronic: 'US Dance/Electronic Albums',
  BillboardCanada: 'Canada',
  France4: 'France',
  Germany4: 'Germany',
  Oricon: 'Japan',
  Flanders: 'Belgium (Flanders)',
  Wallonia: 'Belgium (Wallonia)',
  Czech: 'Czech Republic',
  Korea: 'South Korea',
  NewZealand: 'New Zealand',
}
/** {{Single chart}} codes that don't read well as they are. */
const SINGLE_CHART_NAMES: Record<string, string> = {
  UK: 'UK Singles',
  UK2: 'UK Singles',
  UKsinglesbyname: 'UK Singles',
  UKchartstats: 'UK Singles',
  UKindie: 'UK Indie',
  UKrock: 'UK Rock & Metal',
  UKrandb: 'UK R&B',
  UKdance: 'UK Dance',
  Billboardhot100: 'Billboard Hot 100',
  Billboardglobal200: 'Billboard Global 200',
  Billboardalternativesongs: 'US Alternative Airplay',
  Billboardmodernrock: 'US Alternative Airplay',
  Billboardrocksongs: 'US Rock Airplay',
  Billboardmainstreamrock: 'US Mainstream Rock',
  Billboardhotrocksongs: 'US Hot Rock & Alternative Songs',
  Billboardrandbhiphop: 'US Hot R&B/Hip-Hop Songs',
  Billboardhotcountrysongs: 'US Hot Country Songs',
  Billboarddanceelectronic: 'US Hot Dance/Electronic Songs',
  Billboardjapanhot100: 'Japan Hot 100',
  Canada: 'Canada',
  Dutch40: 'Netherlands',
  Dutch100: 'Netherlands',
  Flanders: 'Belgium (Flanders)',
  Wallonia: 'Belgium (Wallonia)',
  Hungarysingle: 'Hungary',
  Czech: 'Czech Republic',
  NewZealand: 'New Zealand',
  'West Germany': 'West Germany',
}

/**
 * Song charts that say little about the song: airplay on one format, clubs,
 * downloads, streams, "bubbling under" lists. The national charts and the
 * big genre ones (Alternative, Rock, R&B) say more.
 */
const MINOR_SINGLE_CHART =
  /airplay|radio|club|adult|rhythmic|digital|download|stream|dance(?!electronic)|tip|bubbling|heatseeker|CIS|pop ?songs|latin|eurodigital|moldova|kazakhstan/i
/** Keeps the genre airplay charts that do read as achievements. */
const GENRE_AIRPLAY =
  /alternative|modernrock|^Billboardrocksongs$|mainstreamrock/i

/**
 * A chart code as readable text when it's not in the table: "Ireland2" →
 * "Ireland", "BillboardHotCountrySongs" → "US Hot Country Songs".
 */
function chartName(code: string, names: Record<string, string>): string {
  if (names[code]) return names[code]
  const bare = code.replace(/\d+$/, '').trim()
  if (names[bare]) return names[bare]
  if (/^billboard./i.test(bare))
    return `US ${bare
      .slice(9)
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, (c) => c.toUpperCase())}`
  return bare.replace(/([a-z])([A-Z])/g, '$1 $2')
}

/** The headline charts, named first among equal peaks. */
const MAIN_CHART =
  /^(UK Albums|(US )?Billboard 200|UK Singles|Billboard Hot 100)\b/

/**
 * Top-ten peaks from the weekly charts, one line per position:
 * "No. 1 · UK Albums, Billboard 200, France and 12 more". A chart counted
 * twice (Dutch Top 40 and Single Top 100 are both "Netherlands") keeps its
 * best peak only.
 */
function charts(wikitext: string, work: Work): Praise[] {
  const body =
    section(wikitext, /^weekly charts?$/i) ??
    // Without a Weekly subsection, stop before any year-end tables.
    section(
      wikitext,
      /^(weekly )?charts?( performance| and certifications)?$/i,
    )?.split(/^=+\s*(?:year|decade|all-time)/im)[0]
  if (!body) return []
  const song = work === 'song'
  const peaks: Array<{ name: string; peak: number }> = []
  for (const tpl of templatesNamed(
    body,
    song ? /single ?chart/ : /album chart/,
  )) {
    const [code, peak] = templateParams(tpl).positional
    if (!code) continue
    if (song && MINOR_SINGLE_CHART.test(code) && !GENRE_AIRPLAY.test(code))
      continue
    peaks.push({
      name: chartName(code.trim(), song ? SINGLE_CHART_NAMES : CHART_NAMES),
      peak: parseInt(peak ?? '', 10),
    })
  }
  // Hand-written rows: "! scope=row | Japanese Albums (Oricon) || 3".
  for (const row of tables(body).flatMap(tableRows)) {
    const keys = Object.keys(row)
    const name = keys.find((k) => k.startsWith('chart'))
    const peak = keys.find((k) => /peak|position/.test(k))
    if (!name || !peak || !row[name]) continue
    if (
      song &&
      MINOR_SINGLE_CHART.test(row[name]) &&
      !/alternative|rock/i.test(row[name])
    )
      continue
    peaks.push({
      // "UK Singles (OCC)" → "UK Singles"; Belgium's regions are the chart.
      name: row[name]
        .replace(/\s*\((?!flanders|wallonia)[^)]*\)/gi, '')
        .replace(/^US /, (m) => (/billboard/i.test(row[name]) ? '' : m))
        .trim(),
      peak: parseInt(row[peak], 10),
    })
  }
  const counted = new Set<string>()
  const byPeak = new Map<number, string[]>()
  peaks
    .filter((p) => Number.isFinite(p.peak) && p.peak >= 1 && p.peak <= TOP_PEAK)
    .sort(
      (a, b) =>
        a.peak - b.peak ||
        Number(!MAIN_CHART.test(a.name)) - Number(!MAIN_CHART.test(b.name)),
    )
    .forEach((p) => {
      // Sorted best peak first, so a chart seen again is a worse peak.
      const key = matchKey(p.name.replace(/\(.*?\)/g, ''))
      if (counted.has(key)) return
      counted.add(key)
      const names = byPeak.get(p.peak) ?? []
      names.push(p.name)
      byPeak.set(p.peak, names)
    })
  return [...byPeak].slice(0, MAX_CHART_LINES).map(([peak, names]): Praise => {
    const more = names.length - MAX_CHARTS
    return {
      kind: 'chart',
      text: `No. ${peak} · ${names.slice(0, MAX_CHARTS).join(', ')}${
        more > 0 ? ` and ${more} more` : ''
      }`,
      by: song ? 'Weekly singles charts' : 'Weekly album charts',
    }
  })
}

/** Runs a parser, turning any surprise in the wikitext into `fallback`. */
function safe<T>(parse: () => T, fallback: T): T {
  try {
    return parse()
  } catch {
    return fallback
  }
}

/**
 * The album's (or song's) highest praise, strongest first. Awards and
 * certifications from Wikidata join the article's own; pass '' as the
 * wikitext when there's no article and only those are known.
 */
export function praiseFrom(
  wikitext: string,
  facts: { awards?: AwardFact[]; certifications?: CertFact[] } = {},
  work: Work = 'album',
): Praise[] {
  const w = stripRefs(wikitext)
  const high = safe(() => ratings(w), [])
    .filter((r) => r.score.value >= HIGH)
    .sort((a, b) => b.score.value - a.score.value)
  const q = safe(() => quotes(w, high), [])
  const quotedBy = new Set(q.map((p) => p.by))
  const award = safe(() => awards(w, facts.awards ?? []), {
    won: [],
    nominated: [],
  })
  return [
    ...award.won,
    ...safe(() => accolades(w), []),
    ...award.nominated,
    ...safe(() => certifications(w, facts.certifications ?? []), []),
    ...safe(() => charts(w, work), []),
    ...q,
    ...high
      .filter((r) => !quotedBy.has(r.by))
      .slice(0, MAX_RATINGS)
      .map((r): Praise => ({
        kind: 'rating',
        text: r.score.display,
        by: r.by,
      })),
  ]
}

/**
 * A community average (out of 5) as a rating, when it's high and enough
 * people voted: "4.6/5" by "1,203 Discogs ratings".
 */
export function communityRating(
  source: string,
  average: number | undefined,
  count: number | undefined,
): Praise | null {
  if (
    typeof average !== 'number' ||
    typeof count !== 'number' ||
    !Number.isFinite(average) ||
    average < HIGH_COMMUNITY ||
    count < MIN_COMMUNITY_VOTES
  )
    return null
  return {
    kind: 'rating',
    text: `${average.toFixed(1)}/5`,
    by: `${count.toLocaleString('en-US')} ${source} ratings`,
  }
}

// ---------- infobox facts ----------

/** {{hlist|a|b}}, {{plainlist|* a * b}}…: list templates to one item per line. */
const listTemplates = (tpl: string): string | null =>
  /^\{\{\s*(hlist|flatlist|flat list|plainlist|plain list|unbulleted list|ubl|ubil)\s*[|}]/i.test(
    tpl,
  )
    ? templateParams(tpl)
        .positional.map((item) => replaceTemplates(item, inlineTemplates))
        .join('\n')
    : inlineTemplates(tpl)

/**
 * An infobox value as separate items: bullets, line breaks and list
 * templates all split. "(Brooklyn)" on a line of its own joins the item above.
 */
function listItems(raw: string | undefined): string[] {
  if (!raw) return []
  const out: string[] = []
  for (const line of replaceTemplates(raw, listTemplates).split(
    /\n|<br\s*\/?>/i,
  )) {
    const item = plain(line.replace(/<[^>]+>/g, '').replace(/^\s*\*+/, ''))
      .replace(/[;,]$/, '')
      .trim()
    if (!item) continue
    if (/^\(.*\)$/.test(item) && out.length) out[out.length - 1] += ` ${item}`
    else if (!out.includes(item)) out.push(item)
  }
  return out
}

/** "{{Duration|m=60|s=08}}" or "44:28" to "60:08" / "44:28". */
function duration(raw: string | undefined): string | null {
  if (!raw) return null
  const tpl = templatesNamed(raw, /duration/)[0]
  if (tpl) {
    const { positional, named } = templateParams(tpl)
    const [h, m, s] = named.size
      ? [named.get('h'), named.get('m'), named.get('s')]
      : positional.length >= 3
        ? positional
        : [undefined, ...positional]
    const pad = (n: string | undefined) => (n ?? '0').trim().padStart(2, '0')
    if (m || s)
      return h
        ? `${Number(h)}:${pad(m)}:${pad(s)}`
        : `${Number(m ?? 0)}:${pad(s)}`
  }
  return /\d+:\d{2}(:\d{2})?/.exec(plain(replaceTemplates(raw)))?.[0] ?? null
}

/** Studio, recording dates, producers and running time from the infobox. */
export function albumFactsFrom(wikitext: string): AlbumFacts | null {
  return safe(() => {
    const w = stripRefs(wikitext)
    const at = w.search(/\{\{\s*infobox album/i)
    if (at < 0) return null
    const { named } = templateParams(templateAt(w, at))
    const facts: AlbumFacts = {
      recorded: listItems(named.get('recorded')),
      studios: listItems(named.get('studio')),
      producers: listItems(named.get('producer')),
      length: duration(named.get('length')),
    }
    return facts.recorded.length ||
      facts.studios.length ||
      facts.producers.length ||
      facts.length
      ? facts
      : null
  }, null)
}

/**
 * Origin, years active and genres from {{Infobox musical artist}}: the
 * at-a-glance line under the artist's summary.
 */
export function artistFactsFrom(wikitext: string): ArtistFacts | null {
  return safe(() => {
    const w = stripRefs(wikitext)
    // A solo artist's {{Infobox person}} embeds the musical artist one: read
    // both, the first value found winning.
    const named = new Map<string, string>()
    for (const tpl of templatesNamed(
      w,
      /infobox (musical artist|band|musician|person)/,
    ))
      for (const [k, v] of templateParams(tpl).named)
        if (v && !named.has(k)) named.set(k, v)
    if (!named.size) return null
    const years = listItems(named.get('years_active'))
    const facts: ArtistFacts = {
      origin:
        listItems(named.get('origin') ?? named.get('birth_place'))[0] ?? null,
      // Split careers ("1985–2003, 2009–present") read as one line.
      yearsActive: years.length
        ? years.join(', ').replace(/\s*[-–]\s*/g, '–')
        : null,
      genres: listItems(named.get('genre'))
        .map((g) => g.replace(/^\w/, (c) => c.toUpperCase()))
        .slice(0, 4),
    }
    return facts.origin || facts.yearsActive || facts.genres.length
      ? facts
      : null
  }, null)
}
