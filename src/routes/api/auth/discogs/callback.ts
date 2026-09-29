import { createFileRoute } from '@tanstack/react-router'
import type { DiscogsIdentity, DiscogsProfile } from '#/lib/discogs.server'

// Step 2: Discogs sends the user back with a verifier. Exchange it for a
// permanent access token, find out who they are, and sign them in.
export const Route = createFileRoute('/api/auth/discogs/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getAccessToken, discogsGet } =
          await import('#/lib/discogs.server')
        const { appSession } = await import('#/lib/session.server')
        const { db } = await import('#/lib/supabase.server')

        const url = new URL(request.url)
        const redirect = (to: string) =>
          new Response(null, { status: 302, headers: { Location: to } })

        const token = url.searchParams.get('oauth_token')
        const verifier = url.searchParams.get('oauth_verifier')
        const session = await appSession()
        const pending = session.data.oauth
        // User clicked "Cancel" on Discogs, or the flow was started elsewhere.
        if (!token || !verifier || !pending || pending.token !== token) {
          await session.update({ oauth: undefined })
          return redirect('/?auth=cancelled')
        }

        try {
          const access = await getAccessToken(
            { token: pending.token, secret: pending.secret },
            verifier,
          )
          const identity = await discogsGet<DiscogsIdentity>(
            '/oauth/identity',
            access,
          )
          const profile = await discogsGet<DiscogsProfile>(
            `/users/${encodeURIComponent(identity.username)}`,
            access,
          ).catch(() => null)

          const supabase = db()
          const { data: existing } = await supabase
            .from('users')
            .select('id')
            .eq('discogs_id', identity.id)
            .maybeSingle()
          const { data: user, error } = await supabase
            .from('users')
            .upsert(
              {
                discogs_id: identity.id,
                discogs_username: identity.username,
                display_name: profile?.name || null,
                avatar_url: profile?.avatar_url || null,
                oauth_token: access.token,
                oauth_token_secret: access.secret,
              },
              { onConflict: 'discogs_id' },
            )
            .select('id, discogs_username')
            .single()
          if (error) throw error

          await linkFriends(user, existing ? undefined : pending.invitedBy)

          await session.update({ userId: user.id, oauth: undefined })
          // New users land on their collection, which kicks off the first sync.
          const home = `/u/${encodeURIComponent(user.discogs_username)}`
          return redirect(
            existing ? pending.returnTo || home : `${home}?welcome=1`,
          )
        } catch (e) {
          console.error('[auth] discogs callback failed', e)
          await session.update({ oauth: undefined })
          return redirect('/?auth=error')
        }
      },
    },
  },
})

/**
 * People who followed this username before it was on Spinsight now follow
 * the account; someone joining from an invite link follows whoever sent it.
 * Never blocks signing in.
 */
async function linkFriends(
  user: { id: string; discogs_username: string },
  invitedBy: string | undefined,
) {
  try {
    const { claimPendingFollows, findUser } =
      await import('#/lib/friends.server')
    const { db } = await import('#/lib/supabase.server')
    await claimPendingFollows(user)
    const inviter = invitedBy ? await findUser(invitedBy) : null
    if (inviter && inviter.id !== user.id) {
      // Brand-new account, so there's nothing to clash with.
      await db().from('follows').insert({
        follower_id: user.id,
        followee_username: inviter.discogs_username,
        followee_id: inviter.id,
      })
    }
  } catch (e) {
    console.warn('[auth] linking friends failed', e)
  }
}
