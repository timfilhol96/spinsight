import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { REACTIONS, USERNAME_RE } from '#/lib/friends'
import type { FriendsActivity, WantItem } from '#/lib/friends'

// Server functions for following people and the Friends tab. Server-only
// modules are imported inside handlers, as in collection.functions.ts.

const Username = z.string().regex(USERNAME_RE)

export const getFriendsActivity = createServerFn({ method: 'GET' }).handler(
  async (): Promise<FriendsActivity | null> => {
    const { currentUser } = await import('#/lib/session.server')
    const { friendsActivity } = await import('#/lib/friends.server')
    const viewer = await currentUser()
    return viewer ? friendsActivity(viewer) : null
  },
)

/**
 * Follow a Discogs username. Someone not on Spinsight yet is checked against
 * Discogs (to catch typos) and kept as a pending follow until they join.
 */
export const followUser = createServerFn({ method: 'POST' })
  .validator((d: { username: string }) =>
    z.object({ username: Username }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import('#/lib/session.server')
    const { db } = await import('#/lib/supabase.server')
    const { findUser } = await import('#/lib/friends.server')
    const viewer = await requireUser()
    if (data.username.toLowerCase() === viewer.discogs_username.toLowerCase())
      throw new Error("That's you.")

    const existing = await findUser(data.username)
    let username = existing?.discogs_username ?? data.username
    if (!existing) {
      const { discogsGet } = await import('#/lib/discogs.server')
      try {
        const profile = await discogsGet<{ username: string }>(
          `/users/${encodeURIComponent(data.username)}`,
          { token: viewer.oauth_token, secret: viewer.oauth_token_secret },
        )
        username = profile.username
      } catch {
        throw new Error(`There's no Discogs user called ${data.username}.`)
      }
    }

    const supabase = db()
    const { data: already } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('follower_id', viewer.id)
      .ilike('followee_username', username.replace(/[\\%_]/g, '\\$&'))
      .maybeSingle()
    if (!already) {
      const { error } = await supabase.from('follows').insert({
        follower_id: viewer.id,
        followee_username: username,
        followee_id: existing?.id ?? null,
      })
      if (error) throw new Error(error.message)
    }
    return { username, pending: !existing }
  })

export const unfollowUser = createServerFn({ method: 'POST' })
  .validator((d: { username: string }) =>
    z.object({ username: Username }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import('#/lib/session.server')
    const { db } = await import('#/lib/supabase.server')
    const viewer = await requireUser()
    const { error } = await db()
      .from('follows')
      .delete()
      .eq('follower_id', viewer.id)
      .ilike('followee_username', data.username.replace(/[\\%_]/g, '\\$&'))
    if (error) throw new Error(error.message)
    return { ok: true }
  })

/** Whether friends see what you're spinning (live, last spin, leaderboard). */
export const setShareListening = createServerFn({ method: 'POST' })
  .validator((d: { share: boolean }) =>
    z.object({ share: z.boolean() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import('#/lib/session.server')
    const { db } = await import('#/lib/supabase.server')
    const viewer = await requireUser()
    const { error } = await db()
      .from('users')
      .update({ share_listening: data.share })
      .eq('id', viewer.id)
    if (error) throw new Error(error.message)
    return { share: data.share }
  })

/** Put an emoji on a friend's spin, or take it off with `emoji: null`. */
export const reactToPlay = createServerFn({ method: 'POST' })
  .validator((d: { playId: string; emoji: string | null }) =>
    z
      .object({
        playId: z.string().uuid(),
        emoji: z.enum(REACTIONS).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import('#/lib/session.server')
    const { db } = await import('#/lib/supabase.server')
    const viewer = await requireUser()
    const supabase = db()

    // Only on spins you can see: someone you follow, who shares listening.
    const { data: play } = await supabase
      .from('plays')
      .select('user_id, owner:users!inner(is_public, share_listening)')
      .eq('id', data.playId)
      .maybeSingle()
    const owner = play?.owner as unknown as
      { is_public: boolean; share_listening: boolean } | undefined
    if (!play || !owner?.is_public || !owner.share_listening)
      throw new Error('That spin is not visible to you.')
    const { count } = await supabase
      .from('follows')
      .select('follower_id', { count: 'exact', head: true })
      .eq('follower_id', viewer.id)
      .eq('followee_id', play.user_id as string)
    if (!count) throw new Error('Follow them to react to their spins.')

    if (data.emoji === null) {
      await supabase
        .from('play_reactions')
        .delete()
        .eq('play_id', data.playId)
        .eq('user_id', viewer.id)
    } else {
      const { error } = await supabase.from('play_reactions').upsert(
        {
          play_id: data.playId,
          user_id: viewer.id,
          emoji: data.emoji,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'play_id,user_id' },
      )
      if (error) throw new Error(error.message)
    }
    return { ok: true }
  })

/** Someone's Discogs wantlist, for the compare page. Same visibility as the collection. */
export const getWantlist = createServerFn({ method: 'GET' })
  .validator((d: { username: string }) =>
    z.object({ username: Username }).parse(d),
  )
  .handler(async ({ data }): Promise<WantItem[]> => {
    const { currentUser } = await import('#/lib/session.server')
    const { db } = await import('#/lib/supabase.server')
    const { findUser } = await import('#/lib/friends.server')
    const [viewer, owner] = await Promise.all([
      currentUser(),
      findUser(data.username),
    ])
    if (!owner || (!owner.is_public && owner.id !== viewer?.id)) return []
    const { data: rows, error } = await db()
      .from('want_items')
      .select('release_id, master_id, title, artist_display, year, thumb')
      .eq('user_id', owner.id)
      .order('date_added', { ascending: false })
    if (error) return []
    return rows.map((w) => ({
      releaseId: Number(w.release_id),
      masterId: w.master_id ? Number(w.master_id) : null,
      title: w.title as string,
      artist: w.artist_display as string,
      year: (w.year as number | null) ?? null,
      thumb: (w.thumb as string | null) ?? null,
    }))
  })
