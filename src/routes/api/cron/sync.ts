import { createFileRoute } from '@tanstack/react-router'
import type { UserRow } from '#/lib/supabase.server'

// Daily refresh for everyone (scheduled in vercel.json). Vercel sends
// "Authorization: Bearer $CRON_SECRET" when CRON_SECRET is set on the project.
// It also keeps the free Supabase project from pausing after a quiet week.
export const Route = createFileRoute('/api/cron/sync')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { env } = await import('#/lib/env.server')
        const secret = env.cronSecret
        if (
          !secret ||
          request.headers.get('authorization') !== `Bearer ${secret}`
        ) {
          return new Response('Unauthorized', { status: 401 })
        }
        const { db } = await import('#/lib/supabase.server')
        const { syncCollection, enrichBatch } =
          await import('#/lib/sync.server')

        const started = Date.now()
        const { data: users } = await db()
          .from('users')
          .select('*')
          .order('last_synced_at', { ascending: true, nullsFirst: true })
        const results: Array<{ user: string; ok: boolean; detail: unknown }> =
          []
        for (const user of (users ?? []) as UserRow[]) {
          // Stay well under a 60s function limit; whoever is skipped
          // is first in line tomorrow (ordered by last sync).
          if (Date.now() - started > 40_000) break
          try {
            const sync = await syncCollection(user, 'cron')
            const enrich = await enrichBatch(user, 8_000)
            results.push({
              user: user.discogs_username,
              ok: true,
              detail: { sync, enrich },
            })
          } catch (e) {
            results.push({
              user: user.discogs_username,
              ok: false,
              detail: String((e as Error).message),
            })
          }
        }
        return Response.json({ results })
      },
    },
  },
})
