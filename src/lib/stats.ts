// Collection statistics: pure derivations from a list of records, computed in
// the browser (collections are small enough, and friends' pages reuse them).
import type { CollectionRecord, Play } from '#/lib/records'
import { isColoredVinyl } from '#/lib/vinyl-color'

export type Ranked = { name: string; count: number }

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/** Labels that aren't really labels. */
const NON_LABELS = new Set(['Not On Label', 'none'])

function rank(values: Iterable<string>, limit = Infinity): Ranked[] {
  const counts = new Map<string, number>()
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
}

function median(nums: number[]): number | null {
  if (!nums.length) return null
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

const added = (r: CollectionRecord) =>
  r.dateAdded ? new Date(r.dateAdded) : null
const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
export const decadeOf = (year: number) => Math.floor(year / 10) * 10

export function primaryLabel(r: CollectionRecord): string | null {
  return r.labels.find((l) => !NON_LABELS.has(l.name))?.name ?? null
}

// ---------- overview ----------

export function summary(records: CollectionRecord[]) {
  const years = records
    .map((r) => r.originalYear)
    .filter((y): y is number => !!y)
  const withDuration = records.filter((r) => r.durationSec)
  return {
    records: records.length,
    artists: new Set(records.map((r) => r.artist)).size,
    labels: new Set(records.map(primaryLabel).filter(Boolean)).size,
    genres: new Set(records.flatMap((r) => r.genres)).size,
    styles: new Set(records.flatMap((r) => r.styles)).size,
    /** Median year the music first came out. */
    medianYear: median(years),
    totalSec: withDuration.reduce((s, r) => s + (r.durationSec ?? 0), 0),
    withDuration: withDuration.length,
    colored: records.filter((r) => isColoredVinyl(r.look)).length,
    enriched: records.filter((r) => r.enriched).length,
  }
}

// ---------- growth ----------

/** Running total per month, from the first addition to the current month. */
export function growth(records: CollectionRecord[], now = new Date()) {
  const dates = records.map(added).filter((d): d is Date => !!d)
  if (!dates.length) return []
  const perMonth = new Map<string, number>()
  for (const d of dates)
    perMonth.set(monthKey(d), (perMonth.get(monthKey(d)) ?? 0) + 1)
  const first = new Date(Math.min(...dates.map((d) => d.getTime())))
  const out: Array<{
    key: string
    label: string
    added: number
    total: number
  }> = []
  let total = 0
  for (
    let d = new Date(first.getFullYear(), first.getMonth(), 1);
    d <= now;
    d.setMonth(d.getMonth() + 1)
  ) {
    const key = monthKey(d)
    const n = perMonth.get(key) ?? 0
    total += n
    out.push({
      key,
      label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
      added: n,
      total,
    })
  }
  return out
}

export function addedByYear(records: CollectionRecord[]) {
  const counts = new Map<number, number>()
  for (const d of records.map(added))
    if (d) counts.set(d.getFullYear(), (counts.get(d.getFullYear()) ?? 0) + 1)
  if (!counts.size) return []
  const years = [...counts.keys()]
  const out = []
  for (let y = Math.min(...years); y <= Math.max(...years); y++)
    out.push({ label: String(y), count: counts.get(y) ?? 0 })
  return out
}

// ---------- what & when ----------

export const genres = (rs: CollectionRecord[]) =>
  rank(rs.flatMap((r) => r.genres))
export const styles = (rs: CollectionRecord[], limit = 12) =>
  rank(
    rs.flatMap((r) => r.styles),
    limit,
  )
export const artists = (rs: CollectionRecord[], limit = 10) =>
  rank(
    rs.map((r) => r.artist),
    limit,
  )
export const labels = (rs: CollectionRecord[], limit = 10) =>
  rank(
    rs.map((r) => primaryLabel(r) ?? ''),
    limit,
  )
export const countries = (rs: CollectionRecord[], limit = 10) =>
  rank(
    rs.map((r) => r.country ?? ''),
    limit,
  )

/** Format descriptions worth charting (skips the generic "Vinyl"/"Album" noise). */
const FORMAT_SKIP = new Set(['Album', 'Stereo', 'Vinyl'])
export const formats = (rs: CollectionRecord[], limit = 10) =>
  rank(
    rs.flatMap((r) => r.formatDescriptions.filter((d) => !FORMAT_SKIP.has(d))),
    limit,
  )

/** Which year to use: when the music first came out, or this pressing. */
export type YearBasis = 'original' | 'pressing'

export const yearOf = (r: CollectionRecord, basis: YearBasis) =>
  basis === 'original' ? r.originalYear : r.year

export function decades(
  records: CollectionRecord[],
  basis: YearBasis = 'original',
) {
  const counts = new Map<number, number>()
  for (const r of records) {
    const y = yearOf(r, basis)
    if (y) counts.set(decadeOf(y), (counts.get(decadeOf(y)) ?? 0) + 1)
  }
  if (!counts.size) return []
  const ds = [...counts.keys()]
  const out = []
  for (let d = Math.min(...ds); d <= Math.max(...ds); d += 10) {
    out.push({
      decade: d,
      label: `${String(d).slice(2)}s`,
      count: counts.get(d) ?? 0,
    })
  }
  return out
}

export function extremesByYear(
  records: CollectionRecord[],
  basis: YearBasis = 'original',
) {
  const dated = records
    .filter((r) => yearOf(r, basis))
    .sort((a, b) => (yearOf(a, basis) ?? 0) - (yearOf(b, basis) ?? 0))
  return { oldest: dated[0] ?? null, newest: dated.at(-1) ?? null }
}

/** Records pressed well after the music first came out. */
export function reissues(records: CollectionRecord[], minGap = 5) {
  const list = records
    .filter(
      (r) => r.year && r.originalYear && r.year - r.originalYear >= minGap,
    )
    .sort((a, b) => b.year! - b.originalYear! - (a.year! - a.originalYear!))
  return { count: list.length, biggestGap: list[0] ?? null }
}

export function extremesByDuration(records: CollectionRecord[]) {
  const timed = records
    .filter((r) => r.durationSec)
    .sort((a, b) => (a.durationSec ?? 0) - (b.durationSec ?? 0))
  return { shortest: timed[0] ?? null, longest: timed.at(-1) ?? null }
}

// ---------- colour ----------

export function colorStats(records: CollectionRecord[]) {
  const colored = records.filter((r) => isColoredVinyl(r.look))
  const patterns = rank(colored.map((r) => r.look.pattern))
  return {
    colored,
    patterns,
    share: records.length ? colored.length / records.length : 0,
  }
}

// ---------- rarity & value ----------

export function rarity(records: CollectionRecord[], limit = 5) {
  const enriched = records.filter((r) => r.enriched)
  const by = (score: (r: CollectionRecord) => number | null, dir: 1 | -1) =>
    enriched
      .filter((r) => score(r) != null)
      .sort((a, b) => dir * ((score(a) ?? 0) - (score(b) ?? 0)))
      .slice(0, limit)
  return {
    mostWanted: by((r) => r.communityWant, -1),
    rarest: by((r) => (r.communityHave ? r.communityHave : null), 1),
    hottest: by(
      (r) =>
        r.communityHave && r.communityWant != null
          ? r.communityWant / r.communityHave
          : null,
      -1,
    ),
    // Prices are all fetched in USD, so amounts compare directly.
    priciest: by((r) => r.lowestPrice?.amount ?? null, -1),
  }
}

// ---------- on this day ----------

export function onThisDay(records: CollectionRecord[], today = new Date()) {
  return records
    .filter((r) => {
      const d = added(r)
      return (
        d &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate() &&
        d.getFullYear() < today.getFullYear()
      )
    })
    .sort((a, b) => (a.dateAdded ?? '').localeCompare(b.dateAdded ?? ''))
}

// ---------- badges ----------

export type Badge = {
  id: string
  icon: string
  label: string
  description: string
  value: number
  target: number
  earned: boolean
}

function badge(
  id: string,
  icon: string,
  label: string,
  description: string,
  value: number,
  target: number,
): Badge {
  return {
    id,
    icon,
    label,
    description,
    value,
    target,
    earned: value >= target,
  }
}

export function badges(records: CollectionRecord[]): Badge[] {
  const s = summary(records)
  const topLabel = labels(records, 1)[0]?.count ?? 0
  const topArtist = artists(records, 1)[0]?.count ?? 0
  const decadeCount = decades(records).filter((d) => d.count > 0).length
  const hot = records.filter(
    (r) =>
      r.communityHave &&
      r.communityWant != null &&
      r.communityWant > r.communityHave,
  ).length
  return [
    badge('first', '💿', 'First Spin', 'Add your first record.', s.records, 1),
    badge('crate', '📦', 'Crate Digger', 'Own 50 records.', s.records, 50),
    badge('hundred', '💯', 'Century', 'Own 100 records.', s.records, 100),
    badge('wall', '🧱', 'Record Wall', 'Own 250 records.', s.records, 250),
    badge(
      'rainbow',
      '🌈',
      'Colour Chaser',
      'Own 10 coloured pressings.',
      s.colored,
      10,
    ),
    badge(
      'decades',
      '🕰️',
      'Decade Hopper',
      'Own records from 5 different decades.',
      decadeCount,
      5,
    ),
    badge(
      'genres',
      '🎧',
      'Genre Explorer',
      'Cover 6 Discogs genres.',
      s.genres,
      6,
    ),
    badge(
      'label',
      '🏷️',
      'Label Loyalist',
      '5 records on the same label.',
      topLabel,
      5,
    ),
    badge(
      'superfan',
      '⭐',
      'Superfan',
      '5 records by the same artist.',
      topArtist,
      5,
    ),
    badge(
      'grail',
      '🏆',
      'Grail Holder',
      'Own a record more people want than have.',
      hot,
      1,
    ),
  ]
}

// ---------- year in vinyl ----------

export function yearsWithAdditions(records: CollectionRecord[]): number[] {
  return [
    ...new Set(
      records
        .map(added)
        .filter((d): d is Date => !!d)
        .map((d) => d.getFullYear()),
    ),
  ].sort((a, b) => b - a)
}

export function yearInVinyl(records: CollectionRecord[], year: number) {
  const inYear = records
    .filter((r) => added(r)?.getFullYear() === year)
    .sort((a, b) => (a.dateAdded ?? '').localeCompare(b.dateAdded ?? ''))
  const byMonth = new Array(12).fill(0)
  for (const r of inYear) byMonth[added(r)!.getMonth()]++
  const peak = byMonth.indexOf(Math.max(...byMonth))
  const s = summary(inYear)
  return {
    year,
    records: inYear,
    count: inYear.length,
    topGenre: genres(inYear)[0] ?? null,
    topStyle: styles(inYear, 1)[0] ?? null,
    topArtist: artists(inYear, 1)[0] ?? null,
    first: inYear[0] ?? null,
    latest: inYear.at(-1) ?? null,
    /** The oldest music among this year's additions. */
    oldestAlbum: extremesByYear(inYear, 'original').oldest,
    colored: s.colored,
    totalSec: s.totalSec,
    peakMonth: inYear.length ? MONTHS[peak] : null,
    byMonth: MONTHS.map((label, i) => ({ label, count: byMonth[i] as number })),
    topStyles: styles(inYear, 5),
  }
}

// ---------- listening (from logged plays) ----------

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAYPARTS = ['Morning', 'Afternoon', 'Evening', 'Night'] as const
const daypart = (h: number) =>
  h >= 5 && h < 12 ? 0 : h < 17 ? 1 : h < 22 ? 2 : 3

export function listening(
  records: CollectionRecord[],
  plays: Play[],
  limit = 5,
) {
  const played = records.filter((r) => r.playCount > 0)
  const byDay = new Array(7).fill(0)
  const byPart = new Array(4).fill(0)
  for (const p of plays) {
    const d = new Date(p.playedAt)
    byDay[(d.getDay() + 6) % 7]++
    byPart[daypart(d.getHours())]++
  }
  const neverPlayed = records
    .filter((r) => r.playCount === 0)
    // Longest-owned first: the true dust collectors.
    .sort((a, b) => (a.dateAdded ?? '').localeCompare(b.dateAdded ?? ''))
  return {
    total: plays.length,
    playedShare: records.length ? played.length / records.length : 0,
    fromPicker: plays.filter((p) => p.source === 'picker').length,
    mostPlayed: [...played]
      .sort(
        (a, b) =>
          b.playCount - a.playCount ||
          (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? ''),
      )
      .slice(0, limit),
    neverPlayed,
    byWeekday: WEEKDAYS.map((label, i) => ({
      label,
      count: byDay[i] as number,
    })),
    byDaypart: DAYPARTS.map((label, i) => ({
      label,
      count: byPart[i] as number,
    })),
  }
}
