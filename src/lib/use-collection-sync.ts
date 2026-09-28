import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { runEnrich, runSync } from '#/lib/collection.functions'
import { profileQuery } from '#/lib/queries'

export type SyncState =
  | { phase: 'idle' }
  | { phase: 'syncing' }
  | { phase: 'enriching'; done: number; total: number }

/**
 * Sync = pull the collection list (seconds). Enrich = fetch details per record
 * in short server batches (Discogs allows ~60 requests/min), refreshing the
 * page after each batch so records fill in as we go.
 */
export function useCollectionSync(username: string) {
  const qc = useQueryClient()
  const [state, setState] = useState<SyncState>({ phase: 'idle' })
  const running = useRef(false)

  const refresh = useCallback(
    () => qc.invalidateQueries({ queryKey: profileQuery(username).queryKey }),
    [qc, username],
  )

  const enrich = useCallback(async () => {
    let done = 0
    setState({ phase: 'enriching', done: 0, total: 0 })
    for (;;) {
      const r = await runEnrich()
      done += r.processed
      setState({ phase: 'enriching', done, total: done + r.remaining })
      await refresh()
      // processed === 0 with work remaining means we're stuck; stop rather than spin.
      if (r.remaining === 0 || r.processed === 0) break
    }
    return done
  }, [refresh])

  const start = useCallback(
    async (
      opts: { trigger?: 'manual' | 'signup'; skipSync?: boolean } = {},
    ) => {
      if (running.current) return
      running.current = true
      try {
        if (!opts.skipSync) {
          setState({ phase: 'syncing' })
          const r = await runSync({
            data: { trigger: opts.trigger ?? 'manual' },
          })
          await refresh()
          const changes = [
            r.added && `${r.added} new`,
            r.removed && `${r.removed} removed`,
          ].filter(Boolean)
          toast.success(
            `Synced ${r.total} records${changes.length ? ` (${changes.join(', ')})` : ''}.`,
          )
        }
        const enriched = await enrich()
        if (enriched && opts.skipSync)
          toast.success(`Fetched details for ${enriched} records.`)
      } catch (e) {
        console.error(e)
        toast.error(`Sync failed: ${(e as Error).message}`)
      } finally {
        running.current = false
        setState({ phase: 'idle' })
      }
    },
    [enrich, refresh],
  )

  return { state, start }
}
