import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

// Your data: a copy of everything Spinsight keeps about you, and deleting it.
// Both are linked from the privacy page.

/** Everything stored about the signed-in user, minus the Discogs tokens. */
export const exportMyData = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { requireUser } = await import('#/lib/session.server')
    const { db, selectAll } = await import('#/lib/supabase.server')
    const user = await requireUser()
    const supabase = db()
    // All of it, in pages: one response stops at 1,000 rows. `order` is a
    // column that's unique for this user, so no row is skipped between pages.
    const mine = async (table: string, column: string, order: string) => {
      const { data, error } = await selectAll((from, to) =>
        supabase
          .from(table)
          .select('*')
          .eq(column, user.id)
          .order(order)
          .range(from, to),
      )
      if (error) throw new Error(`${table}: ${error.message}`)
      return data
    }
    const [collection, plays, wantlist, follows, followers, reactions, syncs] =
      await Promise.all([
        mine('collection_items', 'user_id', 'instance_id'),
        mine('plays', 'user_id', 'id'),
        mine('want_items', 'user_id', 'release_id'),
        mine('follows', 'follower_id', 'followee_username'),
        mine('follows', 'followee_id', 'follower_id'),
        mine('play_reactions', 'user_id', 'play_id'),
        mine('sync_runs', 'user_id', 'id'),
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
 * wantlist, follows, reactions: all cascade from `users`; images added from
 * links are removed from storage), then signs out.
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
    const { deleteStoredImages } = await import('#/lib/link-image.server')
    // Covers and disc photos added from links live in storage, not the
    // database, so they don't cascade.
    await deleteStoredImages(user.id)
    const { error } = await db().from('users').delete().eq('id', user.id)
    if (error) throw new Error(error.message)
    const session = await appSession()
    await session.clear()
    return { ok: true }
  })
