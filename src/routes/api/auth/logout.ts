import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/auth/logout')({
  server: {
    handlers: {
      // POST only, so a stray <img src> or link prefetch can't sign you out.
      POST: async () => {
        const { appSession } = await import('#/lib/session.server')
        const session = await appSession()
        await session.clear()
        return new Response(null, { status: 303, headers: { Location: '/' } })
      },
    },
  },
})
