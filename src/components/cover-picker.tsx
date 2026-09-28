import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Check, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { getCoverOptions, setCover } from '#/lib/collection.functions'
import type { CollectionRecord } from '#/lib/records'
import { cn } from '#/lib/utils'

/**
 * Lets the owner override a copy's cover: the regular album art, an edition
 * cover, or any image on the Discogs release. For the cases the automatic
 * choice gets wrong (special editions, photos of the disc).
 */
export function CoverPicker({ record }: { record: CollectionRecord }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const qc = useQueryClient()
  const options = useQuery({
    queryKey: ['cover-options', record.instanceId],
    queryFn: () => getCoverOptions({ data: { instanceId: record.instanceId } }),
    enabled: open,
    staleTime: 10 * 60_000,
  })

  const isCurrent = (url: string | null) =>
    url === null
      ? record.artworkSource !== 'custom'
      : record.artworkSource === 'custom' && record.coverImage === url

  async function choose(url: string | null) {
    setSaving(url ?? 'auto')
    try {
      await setCover({ data: { instanceId: record.instanceId, url } })
      await qc.invalidateQueries({ queryKey: ['profile'] })
    } catch (e) {
      toast.error(`Couldn't change the cover: ${(e as Error).message}`)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ImageIcon className="size-3.5" />
        {open ? 'Done choosing' : 'Wrong cover? Change it'}
      </button>
      {open && (
        <div className="mt-3">
          {options.isPending && (
            <p className="text-xs text-muted-foreground">Loading covers…</p>
          )}
          {options.isError && (
            <p className="text-xs text-destructive">{options.error.message}</p>
          )}
          {options.data && (
            <ul className="grid grid-cols-4 gap-2">
              {options.data.map((o) => (
                <li key={o.url ?? 'auto'}>
                  <button
                    type="button"
                    onClick={() => choose(o.url)}
                    disabled={!!saving}
                    title={o.label}
                    aria-label={`Use ${o.label}`}
                    aria-pressed={isCurrent(o.url)}
                    className={cn(
                      'relative block aspect-square w-full overflow-hidden rounded-[3px] bg-muted ring-offset-2 ring-offset-background transition hover:opacity-90',
                      isCurrent(o.url) && 'ring-2 ring-record-1',
                      saving === (o.url ?? 'auto') && 'animate-pulse',
                    )}
                  >
                    {o.thumb ? (
                      <img
                        src={o.thumb}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="grid size-full place-items-center p-1 text-center text-[10px] leading-tight text-muted-foreground">
                        Automatic
                      </span>
                    )}
                    {isCurrent(o.url) && (
                      <span className="absolute top-1 right-1 rounded-full bg-record-1 p-0.5 text-record-ink">
                        <Check className="size-3" />
                      </span>
                    )}
                  </button>
                  <p className="mt-1 truncate text-[10px] text-muted-foreground">
                    {o.label}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
