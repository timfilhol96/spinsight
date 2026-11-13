import { ChevronDown } from 'lucide-react'
import { VinylSwatch } from '#/components/record-card'
import { discSize } from '#/lib/records'
import type { CollectionRecord } from '#/lib/records'
import { primaryLabel } from '#/lib/stats'
import { useMoney, useProfile } from '#/lib/use-profile'
import { cn } from '#/lib/utils'
import { isColoredVinyl } from '#/lib/vinyl-color'

export type TableSort = 'added' | 'artist' | 'title' | 'year'

// Fixed locale and zone so the server and the browser print the same date.
const addedFmt = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

/**
 * The collection as rows, for scanning and comparing. Much lighter than the
 * grid (no sleeves or discs), so it also suits very big collections.
 */
export function RecordTable({
  records,
  sort,
  onSort,
  onOpen,
}: {
  records: CollectionRecord[]
  sort: TableSort
  onSort: (sort: TableSort) => void
  onOpen: (r: CollectionRecord) => void
}) {
  const { isOwner, listeningHidden } = useProfile()
  const money = useMoney()
  const header = (label: string, key?: TableSort, className?: string) => (
    <th
      scope="col"
      className={cn('px-2 py-2 font-medium', className)}
      aria-sort={key && sort === key ? 'ascending' : undefined}
    >
      {key ? (
        <button
          type="button"
          onClick={() => onSort(key)}
          className={cn(
            'inline-flex items-center gap-0.5 hover:text-foreground',
            sort === key && 'text-foreground',
          )}
        >
          {label}
          {sort === key && <ChevronDown className="size-3.5" />}
        </button>
      ) : (
        label
      )}
    </th>
  )

  return (
    <div className="mt-8 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="w-12 py-2">
              <span className="sr-only">Cover</span>
            </th>
            {header('Title', 'title')}
            {header('Artist', 'artist', 'hidden sm:table-cell')}
            {header('Year', 'year', 'text-right')}
            {header('Label', undefined, 'hidden lg:table-cell')}
            {header('Format', undefined, 'hidden md:table-cell')}
            {header('Added', 'added', 'hidden md:table-cell')}
            {/* What was paid is private, like the record sheet's price. */}
            {isOwner &&
              header('Paid', undefined, 'hidden text-right sm:table-cell')}
            {!listeningHidden && header('Plays', undefined, 'text-right')}
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const label = r.labels.find((l) => l.name === primaryLabel(r))
            const size = discSize(r)
            return (
              <tr
                key={r.instanceId}
                onClick={() => onOpen(r)}
                className="cursor-pointer border-b border-border/60 hover:bg-muted/60"
              >
                <td className="py-1.5">
                  {r.thumb ? (
                    <img
                      src={r.thumb}
                      alt=""
                      loading="lazy"
                      className="size-10 rounded-[2px] object-cover"
                    />
                  ) : (
                    <span className="block size-10 rounded-[2px] bg-muted" />
                  )}
                </td>
                {/* max-w-0: the title takes the room left, not its own length. */}
                <td className="w-full max-w-0 px-2">
                  {/* The row is clickable; this is its keyboard handle. */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpen(r)
                    }}
                    className="block w-full truncate text-left font-medium focus-visible:underline focus-visible:outline-none"
                  >
                    {r.title}
                  </button>
                  <span className="block truncate text-xs text-muted-foreground sm:hidden">
                    {r.artist}
                  </span>
                </td>
                <td className="hidden max-w-48 truncate px-2 sm:table-cell">
                  {r.artist}
                </td>
                <td className="px-2 text-right whitespace-nowrap tabular-nums">
                  {r.originalYear ?? '—'}
                  {r.year && r.originalYear && r.year !== r.originalYear && (
                    <span className="hidden text-xs text-muted-foreground sm:block">
                      pressed {r.year}
                    </span>
                  )}
                </td>
                <td className="hidden max-w-40 truncate px-2 lg:table-cell">
                  {label?.name ?? '—'}
                  {label?.catno && label.catno !== 'none' && (
                    <span className="block font-mono text-[11px] text-muted-foreground">
                      {label.catno}
                    </span>
                  )}
                </td>
                <td className="hidden max-w-44 px-2 md:table-cell">
                  <span
                    className="flex items-center gap-1.5"
                    title={r.look.label ?? undefined}
                  >
                    {isColoredVinyl(r.look) && (
                      <VinylSwatch colors={r.look.colors} />
                    )}
                    <span className="truncate">
                      {[size, isColoredVinyl(r.look) && r.look.label]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </span>
                  </span>
                </td>
                <td className="hidden px-2 whitespace-nowrap text-muted-foreground md:table-cell">
                  {r.dateAdded ? addedFmt.format(new Date(r.dateAdded)) : '—'}
                </td>
                {isOwner && (
                  <td className="hidden px-2 text-right whitespace-nowrap tabular-nums sm:table-cell">
                    {money(r.pricePaid) ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                )}
                {!listeningHidden && (
                  <td className="px-2 text-right tabular-nums">
                    {r.playCount || (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
