// What's new: shown on /changelog, newest first. Add an entry in the same
// commit as any change people will notice, written for them (what they can
// do now, not how it was built). The account menu shows a dot until the
// latest entry has been seen.

export type Release = {
  /** "2026-11-13": the day it went live. */
  date: string
  title: string
  items: string[]
  /** The GitHub issue it came from, if someone asked for it. */
  issue?: number
}

export const CHANGELOG: Release[] = [
  {
    date: '2026-11-13',
    title: 'A smarter picker and more listening stats',
    issue: 3,
    items: [
      'Telling the picker how much time you have now rules out records that are too short, so an hour no longer brings up singles.',
      'Christmas records stay out of the picker except from 1 December to 6 January.',
      '“Played it” logs a listen in one tap from the picker, with Undo.',
      'Insights shows your total time listening and your most played artists.',
      'Year in Vinyl has a new row for the year’s spins, time listening, most played artist and record.',
      'If you stop sharing what you spin, visitors to your public collection no longer see your spins or play counts either.',
    ],
  },
  {
    date: '2026-11-12',
    title: 'Quicker syncs and better covers',
    items: [
      'Syncs only fetch what changed since last time, so they finish sooner on big collections.',
      'Covers now come from the Cover Art Archive first, then Apple Music and Spotify.',
    ],
  },
  {
    date: '2026-11-10',
    title: 'Purchase dates, notes and a second currency',
    issue: 2,
    items: [
      'Add the date you bought a copy. It’s used in “How the collection grew”, On this day and Year in Vinyl.',
      'Keep private notes on each record, such as who gave it to you. The search box finds them too.',
      'Show values in a second currency next to the main one (Insights → What you’ve spent).',
      'Filter your collection by whether you’ve entered a price.',
      'Delete an image you added from a link.',
    ],
  },
  {
    date: '2026-11-06',
    title: 'Covers and disc photos from a link',
    issue: 2,
    items: [
      'Paste a shop or label page, or an image link, to use its photo as a record’s cover or disc.',
    ],
  },
  {
    date: '2026-11-03',
    title: 'Wantlist, new views and what you paid',
    issue: 1,
    items: [
      'Your wantlist has its own tab, with links to buy each record.',
      'Browse your collection as a table or by album, with every pressing of an album stacked together. Your choice of view is remembered.',
      'Record what you paid for each copy and see what you’ve spent in Insights.',
      'Filter by genre, decade and artist from dropdowns, sort by title, and clear every filter at once.',
    ],
  },
  {
    date: '2026-10-28',
    title: 'Faster on phones',
    items: [
      'Big collections load far less on phones, so the page is ready much sooner.',
    ],
  },
  {
    date: '2026-10-24',
    title: 'Log a listen after the fact',
    items: [
      '“Already played it” on a record logs a listen that just finished or happened earlier, without the now-playing dock.',
      'Records and the listening room open faster.',
    ],
  },
  {
    date: '2026-10-23',
    title: 'Faster profile pages',
    items: ['Collections load noticeably faster.', 'Picture discs stay sharp.'],
  },
  {
    date: '2026-10-08',
    title: 'Song facts in the listening room',
    items: [
      'The song playing gets its story, samples and covers, chart peaks and how often the artist plays it live.',
      'A shorter artist summary, and album praise grouped into a few cards.',
    ],
  },
  {
    date: '2026-10-06',
    title: 'Awards, charts and track times',
    items: [
      'Stand mode rotates awards, critics’ lists, certifications and chart peaks alongside reviews.',
      'Every track now has a length, filled in from streaming when Discogs has none.',
      'Opening or closing a record keeps your place in the crate.',
    ],
  },
  {
    date: '2026-10-03',
    title: 'Colours from the cover',
    items: [
      'Black and picture discs tint the app from their cover artwork.',
      'The now-playing dock opens the listening room, and phones no longer scroll sideways.',
    ],
  },
  {
    date: '2026-09-29',
    title: 'Friends and the listening room',
    items: [
      'Follow friends by Discogs username, see what they’re spinning, react with an emoji and compare collections.',
      'The listening room: liner notes, reviews and facts about the record on the turntable.',
      'Your collection now syncs by itself every day.',
      'New Privacy, Terms and Trust pages, with a download of your data and account deletion.',
    ],
  },
  {
    date: '2026-09-28',
    title: 'Spinsight launches',
    items: [
      'Insights, Year in Vinyl and a record picker for your Discogs collection.',
      'Each pressing is drawn as its real disc, colours and all.',
      'Log what you’re spinning and it docks on every page until it’s done.',
    ],
  },
]

export const LATEST_CHANGE = CHANGELOG[0].date

const SEEN_KEY = 'spinsight-changes-seen'
const SEEN_EVENT = 'spinsight:changes-seen'

/** Whether this browser has opened What's new since the latest entry. */
export function changesSeen(): boolean {
  try {
    return (localStorage.getItem(SEEN_KEY) ?? '') >= LATEST_CHANGE
  } catch {
    // Storage blocked: don't nag about something we can't remember.
    return true
  }
}

export function markChangesSeen() {
  try {
    localStorage.setItem(SEEN_KEY, LATEST_CHANGE)
  } catch {
    // Storage blocked: nothing to remember.
  }
  window.dispatchEvent(new Event(SEEN_EVENT))
}

/** Calls back when What's new is opened in this tab or another. */
export function onChangesSeen(cb: () => void): () => void {
  const storage = (e: StorageEvent) => e.key === SEEN_KEY && cb()
  window.addEventListener(SEEN_EVENT, cb)
  window.addEventListener('storage', storage)
  return () => {
    window.removeEventListener(SEEN_EVENT, cb)
    window.removeEventListener('storage', storage)
  }
}
