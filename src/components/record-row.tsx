import { VinylSwatch } from '#/components/record-card'
import type { CollectionRecord } from '#/lib/records'

/** Compact record line for ranked lists (most wanted, rarest, …). */
export function RecordRow({
  record,
  metric,
  onOpen,
}: {
  record: CollectionRecord
  metric: React.ReactNode
  onOpen: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:outline-none"
      >
        {record.thumb ? (
          <img
            src={record.thumb}
            alt=""
            loading="lazy"
            className="size-10 shrink-0 rounded-[2px] object-cover"
          />
        ) : (
          <span className="size-10 shrink-0 rounded-[2px] bg-muted" />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 truncate text-sm font-medium">
            {record.title}
            <VinylSwatch colors={record.look.colors} className="size-2.5" />
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {record.artist}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {metric}
        </span>
      </button>
    </li>
  )
}
