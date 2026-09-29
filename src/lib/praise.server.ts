import { matchKey } from '#/lib/artwork.server'
import type { Praise } from '#/lib/liner-notes'

// Critics' praise for an album, read from its Wikipedia article's wikitext:
// the review-score box ({{Music ratings}}), the accolades table and quotes in
// the reception section. Only the highest marks are kept; stand mode shows
// them, and a middling review is not something to put on the wall.

/** Scores at or above this share of the maximum count as high. */
const HIGH = 0.8
/** List placings at or above this rank count (unranked lists count too). */
const TOP_RANK = 10
/** Longer quotes don't read from across the room. */
const MAX_QUOTE = 300
/** Bare scores shown at most; quotes and placings say more. */
const MAX_RATINGS = 4

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
  const box = templateAt(wikitext, at)
  const params = new Map<string, string>()
  // Split on top-level "|" only: scores are often templates themselves.
  let depth = 0
  let cur = ''
  for (let i = 2; i < box.length - 2; i++) {
    const two = box.slice(i, i + 2)
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
    if (box[i] === '|' && depth === 0) {
      const eq = cur.indexOf('=')
      if (eq > 0)
        params.set(
          cur.slice(0, eq).trim().toLowerCase(),
          cur.slice(eq + 1).trim(),
        )
      cur = ''
      continue
    }
    cur += box[i]
  }
  const eq = cur.indexOf('=')
  if (eq > 0)
    params.set(cur.slice(0, eq).trim().toLowerCase(), cur.slice(eq + 1).trim())

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

/** Rows of the first wikitable in a section, as { header: cell } objects. */
function tableRows(body: string): Array<Record<string, string>> {
  const table = /\{\|[\s\S]*?\n\|\}/.exec(body)?.[0]
  if (!table) return []
  const rows = table.split(/\n\|-[^\n]*/).slice(1)
  let headers: string[] = []
  const out: Array<Record<string, string>> = []
  for (const row of rows) {
    const lines = row
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.every((l) => l.startsWith('!'))) {
      headers = lines
        .flatMap((l) => l.slice(1).split('!!'))
        .map((h) => plain(h.replace(/^[^|]*\|(?!\|)/, '')).toLowerCase())
      continue
    }
    const cells = lines
      .filter((l) => l.startsWith('|') && !l.startsWith('|}'))
      .flatMap((l) => l.slice(1).split('||'))
      // Drop cell attributes ("style=… | text").
      .map((c) =>
        /^[^[{|]*=[^|]*\|(?!\|)/.test(c) ? c.replace(/^[^|]*\|/, '') : c,
      )
      .map((c) => plain(replaceTemplates(c, inlineTemplates)))
    if (headers.length && cells.length === headers.length)
      out.push(Object.fromEntries(headers.map((h, i) => [h, cells[i]])))
  }
  return out
}

function accolades(wikitext: string): Praise[] {
  const body = section(wikitext, /^(accolades|year-end lists|rankings|lists)$/i)
  if (!body) return []
  const out: Array<Praise & { rank: number }> = []
  for (const row of tableRows(body)) {
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
  return out.sort((a, b) => a.rank - b.rank).map(({ rank: _rank, ...p }) => p)
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
    if (text.length > MAX_QUOTE || text.split(' ').length < 5) continue
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
  return out
}

/** The album's highest praise, best first: top list placings, quotes, scores. */
export function praiseFrom(wikitext: string): Praise[] {
  const w = stripRefs(wikitext)
  const high = ratings(w)
    .filter((r) => r.score.value >= HIGH)
    .sort((a, b) => b.score.value - a.score.value)
  const q = quotes(w, high)
  const quotedBy = new Set(q.map((p) => p.by))
  return [
    ...accolades(w),
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
