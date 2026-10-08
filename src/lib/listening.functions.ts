import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { LinerNotes, TrackFacts } from '#/lib/liner-notes'

// Listening room. Read-only: it looks things up on Discogs, Wikipedia,
// Genius, Last.fm, setlist.fm and Spotify and never writes to the database
// (beyond the shared cache of public facts about a record).

export const getLinerNotes = createServerFn({ method: 'GET' })
  .validator((d: { releaseId: number }) =>
    z.object({ releaseId: z.number().int().positive() }).parse(d),
  )
  .handler(async ({ data }): Promise<LinerNotes> => {
    const { requireUser } = await import('#/lib/session.server')
    const { db } = await import('#/lib/supabase.server')
    const { linerNotesFor } = await import('#/lib/liner-notes.server')
    const user = await requireUser()
    const { count } = await db()
      .from('collection_items')
      .select('instance_id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('release_id', data.releaseId)
    if (!count) throw new Error('That record is not in your collection.')
    return linerNotesFor(data.releaseId, {
      token: user.oauth_token,
      secret: user.oauth_token_secret,
    })
  })

/**
 * What's known about the song that's playing. Only public sources, so any
 * signed-in listener may ask; the room passes the track's own artist (on a
 * split, the band on that side).
 */
export const getTrackFacts = createServerFn({ method: 'GET' })
  .validator((d: { artist: string; title: string }) =>
    z
      .object({
        artist: z.string().trim().min(1).max(200),
        title: z.string().trim().min(1).max(300),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<TrackFacts> => {
    const { requireUser } = await import('#/lib/session.server')
    const { trackFactsFor } = await import('#/lib/track-facts.server')
    await requireUser()
    return trackFactsFor(data.artist, data.title)
  })

/**
 * Dominant colours of a record's cover: stand mode's palette, and the tint
 * for black and picture discs. Public, since anyone viewing a collection
 * sees the tint; only known artwork hosts are fetched.
 */
export const getArtworkPalette = createServerFn({ method: 'GET' })
  .validator((d: { url: string }) =>
    z.object({ url: z.string().url() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { sampleArtworkColors } = await import('#/lib/disc-photo.server')
    return sampleArtworkColors(data.url)
  })
