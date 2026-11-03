import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { runEnrich, runSync } from '#/lib/collection.functions'
import { profileQuery, wantlistQuery } from '#/lib/queries'

export type SyncState =
  | { phase: 'idle' }
  /** `quiet`: started on its own when the owner came back (no panel). */
  | { phase: 'syncing'; quiet?: boolean }
  | { phase: 'enriching'; done: number; total: number; quiet?: boolean }

/** The owner's collection refreshes on a visit once its sync is this old. */
export const STALE_SYNC_MS = 6 * 3_600_000

/**
 * Sync = pull the collection list (seconds). Enrich = fetch details per record
 * in short server batches (Discogs allows ~60 requests/min), refreshing the
 * page after each batch so records fill in as we go.
 */
export function useCollectionSync(username: string) {
  const qc = useQueryClient()
  const [state, setState] = useState<SyncState>({ phase: 'idle' })
  const running = useRef(false)

  // The wantlist is synced and given artwork alongside the collection.
  const refresh = useCallback(
    () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: profileQuery(username).queryKey }),
        qc.invalidateQueries({ queryKey: wantlistQuery(username).queryKey }),
      ]),
    [qc, username],
  )

  const enrich = useCallback(
    async (quiet?: boolean) => {
      let done = 0
      setState({ phase: 'enriching', done: 0, total: 0, quiet })
      for (;;) {
        const r = await runEnrich()
        done += r.processed
        setState({ phase: 'enriching', done, total: done + r.remaining, quiet })
        await refresh()
        // processed === 0 with work remaining means we're stuck; stop rather than spin.
        if (r.remaining === 0 || r.processed === 0) break
      }
      return done
    },
    [refresh],
  )

  const start = useCallback(
    async (
      opts: {
        trigger?: 'manual' | 'signup' | 'visit'
        skipSync?: boolean
      } = {},
    ) => {
      if (running.current) return
      running.current = true
      // A sync on visit only speaks up when something changed.
      const quiet = opts.trigger === 'visit'
      try {
        if (!opts.skipSync) {
          setState({ phase: 'syncing', quiet })
          const r = await runSync({
            data: { trigger: opts.trigger ?? 'manual' },
          })
          await refresh()
          const changes = [
            r.added && `${r.added} new`,
            r.removed && `${r.removed} removed`,
          ].filter(Boolean)
          if (!quiet || changes.length)
            toast.success(
              `Synced ${r.total} records${changes.length ? ` (${changes.join(', ')})` : ''}.`,
            )
        }
        const enriched = await enrich(quiet)
        if (enriched && opts.skipSync)
          toast.success(`Fetched details for ${enriched} records.`)
      } catch (e) {
        console.error(e)
        if (!quiet) toast.error(`Sync failed: ${(e as Error).message}`)
      } finally {
        running.current = false
        setState({ phase: 'idle' })
      }
    },
    [enrich, refresh],
  )

  return { state, start }
}
