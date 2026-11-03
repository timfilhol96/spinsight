import { VinylSwatch } from '#/components/record-card'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { discSize } from '#/lib/records'
import type { CollectionRecord } from '#/lib/records'
import { primaryLabel } from '#/lib/stats'
import { isColoredVinyl } from '#/lib/vinyl-color'

/**
 * Album view: the pressings of one album in the collection, to pick the one
 * whose record card opens.
 */
export function PressingPicker({
  pressings,
  onPick,
  onOpenChange,
}: {
  /** The album's own pressing first. Empty when closed. */
  pressings: CollectionRecord[]
  onPick: (r: CollectionRecord) => void
  onOpenChange: (open: boolean) => void
}) {
  const first = pressings[0]
  return (
    <Sheet open={pressings.length > 0} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-6 sm:max-w-md">
        {first && (
          <>
            <SheetHeader className="px-0">
              <p className="kicker">{pressings.length} pressings</p>
              <SheetTitle className="font-display text-2xl leading-tight">
                {first.title}
              </SheetTitle>
              <SheetDescription>
                {first.artist}
                {first.originalYear ? ` · ${first.originalYear}` : ''}
              </SheetDescription>
            </SheetHeader>
            <ul className="mt-2 space-y-1">
              {pressings.map((r) => {
                const label = r.labels.find((l) => l.name === primaryLabel(r))
                return (
                  <li key={r.instanceId}>
                    <button
                      type="button"
                      onClick={() => onPick(r)}
                      className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:outline-none"
                    >
                      {r.thumb ? (
                        <img
                          src={r.thumb}
                          alt=""
                          className="size-14 shrink-0 rounded-[2px] object-cover"
                        />
                      ) : (
                        <span className="size-14 shrink-0 rounded-[2px] bg-muted" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          {isColoredVinyl(r.look) && (
                            <VinylSwatch colors={r.look.colors} />
                          )}
                          <span className="truncate">
                            {[
                              discSize(r),
                              isColoredVinyl(r.look)
                                ? r.look.label
                                : r.look.pattern === 'picture'
                                  ? 'Picture disc'
                                  : 'Black vinyl',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[
                            r.year,
                            label?.name,
                            label?.catno !== 'none' && label?.catno,
                            r.country,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        {r.title !== first.title && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {r.title}
                          </span>
                        )}
                      </span>
                      {r.playCount > 0 && (
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {r.playCount} {r.playCount === 1 ? 'play' : 'plays'}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
