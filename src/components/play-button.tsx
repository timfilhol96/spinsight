import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Check, Disc3, History, Square } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Input } from '#/components/ui/input'
import { deletePlay, logPlay, stopPlay } from '#/lib/collection.functions'
import { likelyRuntimeSec } from '#/lib/moods'
import type { PickAnswers } from '#/lib/moods'
import { nowPlayingQuery } from '#/lib/queries'
import { DEFAULT_RUNTIME_SEC } from '#/lib/records'
import type { CollectionRecord } from '#/lib/records'
import { cn } from '#/lib/utils'

type PickContext = PickAnswers & { mode?: 'guided' | 'random' | 'friends' }

/**
 * Logs a spin and puts the record on the now-playing dock. If this record is
 * already spinning, offers "Done" instead. Only rendered for the owner.
 */
export function PlayButton({
  record,
  source = 'manual',
  context,
  onLogged,
  className,
  size = 'default',
}: {
  record: CollectionRecord
  source?: 'manual' | 'picker'
  context?: PickContext
  onLogged?: () => void
  className?: string
  size?: 'default' | 'lg'
}) {
  const qc = useQueryClient()
  const [pending, setPending] = useState(false)
  const { data: playing } = useQuery(nowPlayingQuery)
  const isSpinning = playing?.releaseId === record.releaseId

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['profile'] }),
      qc.invalidateQueries({ queryKey: nowPlayingQuery.queryKey }),
    ])

  async function play() {
    setPending(true)
    try {
      const { id } = await logPlay({
        data: { releaseId: record.releaseId, source, context },
      })
      await refresh()
      onLogged?.()
      toast.success(`Enjoy ${record.title}.`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            await deletePlay({ data: { id } })
            await refresh()
          },
        },
      })
    } catch (e) {
      toast.error(`Couldn't log the play: ${(e as Error).message}`)
    } finally {
      setPending(false)
    }
  }

  async function done() {
    if (!playing) return
    setPending(true)
    try {
      await stopPlay({ data: { id: playing.playId } })
      await refresh()
    } catch (e) {
      toast.error(`Couldn't stop: ${(e as Error).message}`)
    } finally {
      setPending(false)
    }
  }

  if (isSpinning) {
    return (
      <Button
        onClick={done}
        disabled={pending}
        size={size}
        variant="outline"
        className={cn('border-record-1', className)}
      >
        <Disc3 className="animate-spin-record text-record-1" />
        Spinning now
        <Square className="fill-current opacity-60" />
      </Button>
    )
  }

  return (
    <Button
      onClick={play}
      disabled={pending}
      size={size}
      className={cn(
        'bg-record-1 text-record-ink hover:bg-record-1/90',
        className,
      )}
    >
      <Disc3 className={pending ? 'animate-spin' : ''} />
      I'm playing this
    </Button>
  )
}

/** A `datetime-local` value (local time, to the minute). */
function localInputValue(ms: number) {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000)
  return d.toISOString().slice(0, 16)
}

/**
 * Logs a listen after the fact, saved already finished so it skips the
 * now-playing dock. Toasts with an Undo; resolves to whether it was saved.
 */
function useLogPastPlay(record: CollectionRecord) {
  const qc = useQueryClient()
  const [pending, setPending] = useState(false)

  async function log(
    playedAt: number,
    opts: { source?: 'manual' | 'picker'; context?: PickContext } = {},
  ): Promise<boolean> {
    setPending(true)
    try {
      const { id } = await logPlay({
        data: {
          releaseId: record.releaseId,
          source: opts.source ?? 'manual',
          context: opts.context,
          playedAt: new Date(playedAt).toISOString(),
        },
      })
      await qc.invalidateQueries({ queryKey: ['profile'] })
      toast.success(`Logged a listen of ${record.title}.`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            await deletePlay({ data: { id } })
            await qc.invalidateQueries({ queryKey: ['profile'] })
          },
        },
      })
      return true
    } catch (e) {
      toast.error(`Couldn't log the listen: ${(e as Error).message}`)
      return false
    } finally {
      setPending(false)
    }
  }

  return { log, pending }
}

/** When a record of this length that ended now would have started. */
const startedAgo = (record: CollectionRecord) =>
  Date.now() - (likelyRuntimeSec(record) ?? DEFAULT_RUNTIME_SEC) * 1000

/**
 * One tap to log a listen that just finished, without the now-playing dock.
 * Used by the picker, where the record often went on before the tap.
 */
export function PlayedItButton({
  record,
  context,
  size = 'default',
  className,
}: {
  record: CollectionRecord
  context?: PickContext
  size?: 'default' | 'lg'
  className?: string
}) {
  const { log, pending } = useLogPastPlay(record)
  return (
    <Button
      variant="outline"
      size={size}
      disabled={pending}
      onClick={() =>
        void log(startedAgo(record), { source: 'picker', context })
      }
      className={className}
    >
      <Check className={pending ? 'animate-pulse' : ''} />
      Played it
    </Button>
  )
}

/**
 * Logs a listen after the fact, for when the record wasn't logged while it
 * played: just now, or at a time picked.
 */
export function PastPlayButton({
  record,
  className,
}: {
  record: CollectionRecord
  className?: string
}) {
  const { log: logPast, pending } = useLogPastPlay(record)
  const [picking, setPicking] = useState(false)
  const [when, setWhen] = useState('')

  async function log(playedAt: number) {
    if (await logPast(playedAt)) setPicking(false)
  }

  if (picking) {
    const now = Date.now()
    return (
      <form
        className={cn('flex w-full flex-wrap items-center gap-2', className)}
        onSubmit={(e) => {
          e.preventDefault()
          const t = new Date(when).getTime()
          if (!Number.isNaN(t)) void log(Math.min(t, Date.now()))
        }}
      >
        <label className="sr-only" htmlFor="past-play-when">
          When you started listening
        </label>
        <Input
          id="past-play-when"
          type="datetime-local"
          value={when}
          max={localInputValue(now)}
          onChange={(e) => setWhen(e.target.value)}
          required
          className="w-auto"
        />
        <Button type="submit" disabled={pending || !when}>
          <History className={pending ? 'animate-spin' : ''} />
          Log it
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setPicking(false)}
          disabled={pending}
        >
          Cancel
        </Button>
      </form>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={pending} className={className}>
          <History className={pending ? 'animate-spin' : ''} />
          Already played it
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => void log(startedAgo(record))}>
          Just finished it
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            setWhen(localInputValue(startedAgo(record)))
            setPicking(true)
          }}
        >
          Earlier…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function playSummary(r: CollectionRecord): string {
  if (!r.playCount) return 'Never played (logged)'
  const days = r.lastPlayedAt
    ? Math.floor((Date.now() - new Date(r.lastPlayedAt).getTime()) / 86_400_000)
    : null
  const when =
    days == null
      ? ''
      : days === 0
        ? ' · last today'
        : days === 1
          ? ' · last yesterday'
          : ` · last ${days} days ago`
  return `Played ${r.playCount} ${r.playCount === 1 ? 'time' : 'times'}${when}`
}
