import { createFileRoute } from '@tanstack/react-router'

// Step 1 of "Sign in with Discogs": get a request token, remember its secret in
// the encrypted session, and send the user to Discogs to approve access.
export const Route = createFileRoute('/api/auth/discogs/start')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { env } = await import('#/lib/env.server')
        const { getRequestToken, authorizeUrl } =
          await import('#/lib/discogs.server')
        const { appSession } = await import('#/lib/session.server')

        const url = new URL(request.url)
        const origin = env.appUrl ?? url.origin
        const returnTo = url.searchParams.get('returnTo')
        const safeReturnTo =
          returnTo?.startsWith('/') && !returnTo.startsWith('//')
            ? returnTo
            : ''

        const { USERNAME_RE } = await import('#/lib/friends')
        const invite = url.searchParams.get('invite')
        const invitedBy =
          invite && USERNAME_RE.test(invite) ? invite : undefined

        const requestToken = await getRequestToken(
          `${origin}/api/auth/discogs/callback`,
        )
        const session = await appSession()
        await session.update({
          oauth: { ...requestToken, returnTo: safeReturnTo, invitedBy },
        })

        return new Response(null, {
          status: 302,
          headers: { Location: authorizeUrl(requestToken.token) },
        })
      },
    },
  },
})
