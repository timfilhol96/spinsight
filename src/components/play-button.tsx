import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Disc3 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import { deletePlay, logPlay } from '#/lib/collection.functions'
import type { PickAnswers } from '#/lib/moods'
import type { CollectionRecord } from '#/lib/records'
import { cn } from '#/lib/utils'

/** Logs a spin. Only rendered for the collection's owner. */
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
  context?: PickAnswers & { mode?: 'guided' | 'random' }
  onLogged?: () => void
  className?: string
  size?: 'default' | 'lg'
}) {
  const qc = useQueryClient()
  const [pending, setPending] = useState(false)

  async function play() {
    setPending(true)
    try {
      const { id } = await logPlay({
        data: { releaseId: record.releaseId, source, context },
      })
      await qc.invalidateQueries({ queryKey: ['profile'] })
      onLogged?.()
      toast.success(`Enjoy ${record.title}.`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            await deletePlay({ data: { id } })
            await qc.invalidateQueries({ queryKey: ['profile'] })
          },
        },
      })
    } catch (e) {
      toast.error(`Couldn't log the play: ${(e as Error).message}`)
    } finally {
      setPending(false)
    }
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
