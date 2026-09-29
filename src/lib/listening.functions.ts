import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { LinerNotes } from '#/lib/liner-notes'

// Listening room (mock-up, dev only). Read-only: it looks things up on
// Discogs, Wikipedia and Spotify and never writes to the database.

export const getLinerNotes = createServerFn({ method: 'GET' })
  .validator((d: { releaseId: number }) =>
    z.object({ releaseId: z.number().int().positive() }).parse(d),
  )
  .handler(async ({ data }): Promise<LinerNotes> => {
    if (!import.meta.env.DEV)
      throw new Error('The listening room is a local mock-up for now.')
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

/** Dominant colours of a record's cover, for stand mode's palette. */
export const getArtworkPalette = createServerFn({ method: 'GET' })
  .validator((d: { url: string }) =>
    z.object({ url: z.string().url() }).parse(d),
  )
  .handler(async ({ data }) => {
    if (!import.meta.env.DEV)
      throw new Error('The listening room is a local mock-up for now.')
    const { sampleArtworkColors } = await import('#/lib/disc-photo.server')
    return sampleArtworkColors(data.url)
  })
