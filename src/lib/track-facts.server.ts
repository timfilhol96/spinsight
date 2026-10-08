import { matchKey } from '#/lib/artwork.server'
import { geniusSong } from '#/lib/genius.server'
import { lastfmTrack } from '#/lib/lastfm.server'
import type { TrackFacts } from '#/lib/liner-notes'
import { praiseFrom } from '#/lib/praise.server'
import { findWikiPage, wikiText } from '#/lib/wikipedia.server'

// The song that's playing, looked up when it comes on rather than for the
// whole record up front: its story (Genius, else its Wikipedia lead), what
// it samples or was covered by, its own chart peaks and certifications, and
// its Last.fm listeners. Every source fails soft.

const cache = new Map<string, { at: number; facts: TrackFacts }>()
const CACHE_MS = 6 * 60 * 60_000

/** "Karma Police (Remastered)" → "Karma Police": what the sources call it. */
const bareSong = (t: string) => t.replace(/\s*[([].*?[)\]]\s*/g, ' ').trim()

export async function trackFactsFor(
  artist: string,
  title: string,
): Promise<TrackFacts> {
  const key = `${matchKey(artist)}|${matchKey(title)}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.facts

  const song = bareSong(title) || title
  const [page, genius, lastfm] = await Promise.all([
    findWikiPage(
      song,
      artist,
      `"${song}" ${artist} song`,
      // The description ("1997 single by Radiohead") is the tell; an album's
      // lead mentions its singles too.
      (p) =>
        /\b(song|single)\b/i.test(p.description ?? p.summary.split(/\.\s/)[0]),
    ).catch(() => null),
    geniusSong(artist, song).catch(() => null),
    lastfmTrack(artist, song),
  ])
  const wikitext = page ? await wikiText(page.title) : null

  const { story, ...rest } = genius ?? { story: null }
  const facts: TrackFacts = {
    // Genius tells how the song came about; Wikipedia's lead is mostly the
    // release and chart run, which the praise below already covers.
    story: story
      ? { text: story, source: 'Genius', url: genius!.url }
      : page?.summary
        ? { text: page.summary, source: 'Wikipedia', url: page.url }
        : null,
    wiki: page ? { title: page.title, url: page.url } : null,
    genius: genius ? (rest as NonNullable<TrackFacts['genius']>) : null,
    praise: wikitext
      ? praiseFrom(wikitext, {}, 'song').map((p) => ({ ...p, song }))
      : [],
    lastfm,
  }
  cache.set(key, { at: Date.now(), facts })
  return facts
}
