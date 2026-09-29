import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Disc3, Square } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import { deletePlay, logPlay, stopPlay } from '#/lib/collection.functions'
import type { PickAnswers } from '#/lib/moods'
import { nowPlayingQuery } from '#/lib/queries'
import type { CollectionRecord } from '#/lib/records'
import { cn } from '#/lib/utils'

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
  context?: PickAnswers & { mode?: 'guided' | 'random' | 'friends' }
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
