import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

// Your data: a copy of everything Spinsight keeps about you, and deleting it.
// Both are linked from the privacy page.

/** Everything stored about the signed-in user, minus the Discogs tokens. */
export const exportMyData = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { requireUser } = await import('#/lib/session.server')
    const { db } = await import('#/lib/supabase.server')
    const user = await requireUser()
    const supabase = db()
    const mine = async (table: string, column = 'user_id') => {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq(column, user.id)
      if (error) throw new Error(`${table}: ${error.message}`)
      return data
    }
    const [collection, plays, wantlist, follows, followers, reactions, syncs] =
      await Promise.all([
        mine('collection_items'),
        mine('plays'),
        mine('want_items'),
        mine('follows', 'follower_id'),
        mine('follows', 'followee_id'),
        mine('play_reactions'),
        mine('sync_runs'),
      ])
    const {
      oauth_token: _token,
      oauth_token_secret: _secret,
      ...account
    } = user
    return {
      exportedAt: new Date().toISOString(),
      note: 'Release details (titles, artwork, prices) are public Discogs data shared between users and are not included row by row; collection_items reference them by release_id.',
      account,
      collection,
      plays,
      wantlist,
      following: follows,
      followers: followers.map((f) => ({
        follower_id: f.follower_id,
        created_at: f.created_at,
      })),
      reactions,
      syncs,
    }
  },
)

/**
 * Deletes the account and everything tied to it (collection, plays,
 * wantlist, follows, reactions: all cascade from `users`), then signs out.
 * Shared release data stays, as it isn't anyone's personal data.
 */
export const deleteMyAccount = createServerFn({ method: 'POST' })
  .validator((d: { confirm: string }) =>
    z.object({ confirm: z.string() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireUser, appSession } = await import('#/lib/session.server')
    const { db } = await import('#/lib/supabase.server')
    const user = await requireUser()
    if (data.confirm.toLowerCase() !== user.discogs_username.toLowerCase())
      throw new Error('Type your Discogs username to confirm.')
    const { error } = await db().from('users').delete().eq('id', user.id)
    if (error) throw new Error(error.message)
    const session = await appSession()
    await session.clear()
    return { ok: true }
  })
