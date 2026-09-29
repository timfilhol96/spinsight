import { primaryLabel } from '#/lib/stats'
import type { CollectionRecord, Play } from '#/lib/records'

// Facts about the record playing that only your own collection can tell:
// your history with it, what's special about your copy, and what else on
// your shelf it connects to. Pure, from data the profile already has.

export type Connection = {
  label: string
  records: CollectionRecord[]
}

export type ShelfFacts = {
  history: string[]
  copy: string[]
  connections: Connection[]
  /** Records that would follow this one well, least recently played first. */
  upNext: CollectionRecord[]
}

const DAYPARTS = ['morning', 'afternoon', 'evening', 'night'] as const
const daypart = (h: number) =>
  h >= 5 && h < 12 ? 0 : h < 17 ? 1 : h < 22 ? 2 : 3

const monthYear = (d: Date) =>
  d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
const dayMonth = (d: Date) =>
  d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

function span(days: number): string {
  if (days < 14) return `${days} ${days === 1 ? 'day' : 'days'}`
  if (days < 60) return `${Math.round(days / 7)} weeks`
  if (days < 730) return `${Math.round(days / 30.4)} months`
  return `${Math.floor(days / 365)} years`
}

/** "2nd ", "11th "…, and "" for 1 so it reads "your most played". */
function ordinal(n: number): string {
  if (n === 1) return ''
  const teen = n % 100 >= 11 && n % 100 <= 13
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')
  return `${n}${suffix} `
}

export function shelfFacts(
  record: CollectionRecord,
  records: CollectionRecord[],
  plays: Play[],
  now = Date.now(),
): ShelfFacts {
  const DAY = 86_400_000
  const mine = plays
    .filter((p) => p.releaseId === record.releaseId)
    .map((p) => new Date(p.playedAt))
    .sort((a, b) => a.getTime() - b.getTime())

  // ----- history -----
  const history: string[] = []
  const added = record.dateAdded ? new Date(record.dateAdded) : null
  if (added)
    history.push(
      `On your shelf since ${monthYear(added)}, ${span(Math.max(1, Math.round((now - added.getTime()) / DAY)))} ago.`,
    )
  if (!mine.length) {
    history.push("You haven't logged a spin of this one before.")
  } else {
    history.push(
      `You've logged ${mine.length} ${mine.length === 1 ? 'spin' : 'spins'}; the first was on ${dayMonth(mine[0])}.`,
    )
    const last = mine[mine.length - 1]
    const since = Math.round((now - last.getTime()) / DAY)
    if (since >= 1)
      history.push(`Last time it was on the platter: ${span(since)} ago.`)
    if (added && mine[0].getTime() - added.getTime() > 14 * DAY)
      history.push(
        `It waited ${span(Math.round((mine[0].getTime() - added.getTime()) / DAY))} for its first logged spin.`,
      )
    if (mine.length >= 3) {
      const parts = [0, 0, 0, 0]
      for (const d of mine) parts[daypart(d.getHours())]++
      const top = parts.indexOf(Math.max(...parts))
      if (parts[top] / mine.length >= 0.5)
        history.push(`You mostly play it in the ${DAYPARTS[top]}.`)
    }
    const ranked = records
      .filter((r) => r.playCount > 0)
      .sort((a, b) => b.playCount - a.playCount)
    const rank = ranked.findIndex((r) => r.releaseId === record.releaseId) + 1
    if (rank > 0 && rank <= 10 && ranked.length >= 5)
      history.push(`It's your ${ordinal(rank)}most played record.`)
  }

  // ----- your copy -----
  const copy: string[] = []
  const limited = record.formatDescriptions.some((d) => /limited/i.test(d))
  if (record.look.label)
    copy.push(
      `Your copy is pressed on ${record.look.label.toLowerCase()} vinyl${limited ? ', a limited edition' : ''}.`,
    )
  else if (limited) copy.push('Your copy is a limited edition.')
  if (record.year && record.originalYear && record.year !== record.originalYear)
    copy.push(
      `This pressing is from ${record.year}; the music first came out in ${record.originalYear}.`,
    )
  const label = record.labels.find((l) => l.name === primaryLabel(record))
  if (label)
    copy.push(
      `Released on ${label.name}${label.catno && label.catno !== 'none' ? `, catalogue number ${label.catno}` : ''}.`,
    )
  if (record.communityHave != null)
    copy.push(
      `${record.communityHave.toLocaleString()} Discogs members own this pressing${record.communityWant ? ` and ${record.communityWant.toLocaleString()} want it` : ''}.`,
    )
  const byHave = records
    .filter((r) => r.communityHave)
    .sort((a, b) => (a.communityHave ?? 0) - (b.communityHave ?? 0))
  const rarityRank = byHave.findIndex((r) => r.releaseId === record.releaseId)
  if (rarityRank >= 0 && byHave.length >= 10) {
    if (rarityRank < 5)
      copy.push(
        rarityRank === 0
          ? 'It is the rarest record in your collection.'
          : `It is your ${ordinal(rarityRank + 1)}rarest record.`,
      )
    else {
      const share = Math.round((1 - rarityRank / byHave.length) * 100)
      if (share >= 60)
        copy.push(`Fewer people own it than ${share}% of your records.`)
    }
  }

  // ----- connections -----
  const others = records.filter((r) => r.releaseId !== record.releaseId)
  const connections: Connection[] = []
  const add = (title: string, rs: CollectionRecord[]) => {
    if (rs.length) connections.push({ label: title, records: rs.slice(0, 6) })
  }
  add(
    `More ${record.artist} on your shelf`,
    others.filter((r) =>
      r.artistIds.some((id) => record.artistIds.includes(id)),
    ),
  )
  if (label)
    add(
      `Also on ${label.name}`,
      others.filter((r) => primaryLabel(r) === label.name),
    )
  if (record.originalYear)
    add(
      `Also from ${record.originalYear}`,
      others.filter((r) => r.originalYear === record.originalYear),
    )
  const style = record.styles.find((s) =>
    others.some((r) => r.styles.includes(s)),
  )
  if (style)
    add(
      `Other ${style} in your crates`,
      others.filter((r) => r.styles.includes(style)),
    )

  // ----- up next -----
  const overlap = (r: CollectionRecord) =>
    r.styles.filter((s) => record.styles.includes(s)).length +
    0.5 * r.genres.filter((g) => record.genres.includes(g)).length
  const upNext = others
    .filter((r) => overlap(r) >= 1)
    .sort(
      (a, b) =>
        overlap(b) - overlap(a) ||
        (a.lastPlayedAt ?? '').localeCompare(b.lastPlayedAt ?? ''),
    )
    .slice(0, 12)
    // Least recently played among the closest matches.
    .sort((a, b) => (a.lastPlayedAt ?? '').localeCompare(b.lastPlayedAt ?? ''))
    .slice(0, 3)

  return { history, copy, connections, upNext }
}
