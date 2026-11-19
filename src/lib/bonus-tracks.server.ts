// Finds the tracks a special edition adds to the original album: bonus
// tracks, demos, live takes, instrumentals, remixes. They're marked in the
// stored tracklist so the original album keeps a runtime of its own.
import { songKey } from '#/lib/artwork.server'

type DiscogsEntry = { type_: string; title: string }

/** A heading that starts the extras: "Bonus Tracks", "Disc 2: Demos", "Live At …". */
const EXTRAS_HEADING =
  /\b(bonus|demos?|instrumentals?|live|outtakes?|rarities|b-sides?|remix(es)?|alternate|sessions?|extras?|rehearsals?|unreleased|acoustic|singles|appendix|non-album|previously)\b/i

/** A heading that goes back to the album itself: "Original Album", "Disc 1: The Album". */
const ALBUM_HEADING = /\b(original|album|remastered)\b/i

/** "(Bonus Track)", "[Bonus]", "- Bonus Track": marked as bonus by name. */
const BONUS_TAG = /[([][^)\]]*\bbonus\b[^)\]]*[)\]]|\s-\s.*\bbonus\b/i

/** Whether a song key names another recording ("~live", "~demo", …). */
const isOtherTake = (key: string) => key.includes('~')

/** The key without the recording tag: "song~live" → "song". */
const baseKey = (key: string) => key.split('~')[0]

/**
 * Indexes (among the tracks, headings left out) of the tracks that aren't
 * on the original album. Empty when it can't tell, or the release is just
 * the album.
 *
 * The master's tracklist, which Discogs takes from the album's main release
 * (usually the original), is the best guide: whatever this release has on
 * top of it is extra. It's only trusted when this release has nearly all of
 * it. Headings ("Bonus Tracks", "Disc 2: Demos") count either way; without
 * a master, song titles ("(Demo)", "(Live)") decide too.
 */
export function findBonusTracks(
  tracklist: DiscogsEntry[],
  opts: { isEdition: boolean; master?: DiscogsEntry[] | null },
): Set<number> {
  const tracks: Array<{
    title: string
    key: string
    underExtras: boolean
    underBonus: boolean
  }> = []
  let underExtras = false
  let underBonus = false
  for (const t of tracklist) {
    if (t.type_ === 'heading') {
      if (EXTRAS_HEADING.test(t.title)) {
        underExtras = true
        underBonus = /\bbonus\b/i.test(t.title)
      } else if (ALBUM_HEADING.test(t.title)) underExtras = underBonus = false
    } else if (t.type_ === 'track') {
      tracks.push({
        title: t.title,
        key: songKey(t.title),
        underExtras,
        underBonus,
      })
    }
  }

  const tagged = (t: (typeof tracks)[number]) => BONUS_TAG.test(t.title)
  const byHeading = new Set<number>()
  tracks.forEach((t, i) => {
    if (t.underExtras || tagged(t)) byHeading.add(i)
  })

  const master = compareWithMaster(tracks, opts.master)
  // The master has everything this release has: it is the album. Only a
  // track Discogs calls a bonus ("Special Bonus Track", "(Bonus Track)") is
  // extra; a "Live From …" disc here is part of the record.
  if (master?.kind === 'same') {
    const bonus = new Set<number>()
    tracks.forEach((t, i) => {
      if (t.underBonus || tagged(t)) bonus.add(i)
    })
    return keepsAnAlbum(bonus, tracks.length) ? bonus : new Set()
  }
  if (master) {
    // Headings that leave exactly the master's tracks are right even when a
    // title is written another way ("Fuck You (An Ode To No One)").
    if (
      keepsAnAlbum(byHeading, tracks.length) &&
      tracks.length - byHeading.size === master.albumTracks
    )
      return byHeading
    // Otherwise an explicit heading still adds to the master's answer,
    // unless together they leave no album (a live album under "Live").
    const both = new Set([...master.extras, ...byHeading])
    return keepsAnAlbum(both, tracks.length)
      ? both
      : keepsAnAlbum(master.extras, tracks.length)
        ? master.extras
        : new Set()
  }

  // No usable master: another take of a song already played ("Song" then
  // "Song (Demo)") is extra. On an edition, so is any other take in the
  // second half, where extras go (an album can have its own instrumental).
  const extras = new Set(byHeading)
  const heard = new Set<string>()
  const lateHalf = (i: number) => i >= tracks.length / 2
  tracks.forEach((t, i) => {
    if (isOtherTake(t.key)) {
      if (heard.has(baseKey(t.key)) || (opts.isEdition && lateHalf(i)))
        extras.add(i)
    } else if (!extras.has(i)) heard.add(t.key)
  })
  // Extras come together at the end or on their own disc: on an edition, a
  // song between two of them is one too (an unreleased song among demos).
  if (opts.isEdition && extras.size > 1) {
    const first = Math.min(...extras)
    const last = Math.max(...extras)
    if (lateHalf(first)) for (let i = first; i <= last; i++) extras.add(i)
  }
  return keepsAnAlbum(extras, tracks.length) ? extras : new Set()
}

/**
 * How this release compares with the master's tracklist. `extras`: the
 * tracks the master doesn't have, each master track accounting for one (so
 * a second "Zero" on a live disc is extra). `same`: the master has them
 * all. Null when the master tells nothing: no tracklist, or mostly other
 * titles.
 */
function compareWithMaster(
  tracks: Array<{ key: string }>,
  master: DiscogsEntry[] | null | undefined,
):
  | { kind: 'extras'; extras: Set<number>; albumTracks: number }
  | { kind: 'same' }
  | null {
  const album = (master ?? []).filter((t) => t.type_ === 'track')
  if (!album.length) return null
  const left = new Map<string, number>()
  for (const t of album) {
    const key = songKey(t.title)
    left.set(key, (left.get(key) ?? 0) + 1)
  }
  const take = (key: string) => {
    const n = left.get(key) ?? 0
    if (!n) return false
    left.set(key, n - 1)
    return true
  }
  const extras = new Set<number>()
  tracks.forEach((t, i) => {
    if (!take(t.key)) extras.add(i)
  })
  const matched = tracks.length - extras.size
  // Titles written another way ("Pt. 1" for "Part 1" is handled, a
  // translation isn't): a few misses are fine, most is another album.
  const sure = (n: number) => matched >= n * 0.75
  if (album.length >= tracks.length)
    return sure(tracks.length) ? { kind: 'same' } : null
  return sure(album.length)
    ? { kind: 'extras', extras, albumTracks: album.length }
    : null
}

/** Some extras, and some album left. */
const keepsAnAlbum = (extras: Set<number>, total: number) =>
  extras.size > 0 && extras.size < total
