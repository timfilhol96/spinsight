import { VinylDisc } from '#/components/vinyl-disc'
import type { CollectionRecord } from '#/lib/records'
import { isColoredVinyl } from '#/lib/vinyl-color'

export function VinylSwatch({
  colors,
  className = 'size-3',
}: {
  colors: string[]
  className?: string
}) {
  if (!colors.length) return null
  const bg =
    colors.length === 1
      ? colors[0]
      : `conic-gradient(${colors.map((c, i) => `${c} ${(i / colors.length) * 100}% ${((i + 1) / colors.length) * 100}%`).join(', ')})`
  return (
    <span
      className={`inline-block shrink-0 rounded-full ring-1 ring-black/15 ${className}`}
      style={{ background: bg }}
    />
  )
}

export function RecordCard({
  record,
  onOpen,
}: {
  record: CollectionRecord
  onOpen: () => void
}) {
  const colored = isColoredVinyl(record.look)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative block w-full text-left focus-visible:outline-none"
      aria-label={`${record.artist} – ${record.title}`}
    >
      <div className="relative aspect-square">
        {/* The disc slides out of the sleeve on hover, like pulling it from a crate. */}
        <VinylDisc
          look={record.look}
          labelImage={record.thumb}
          seed={record.releaseId}
          className="absolute inset-[4%] transition-transform duration-500 ease-out group-hover:translate-x-[22%] group-focus-visible:translate-x-[22%] group-hover:rotate-45"
        />
        <div className="sleeve-shadow relative size-full overflow-hidden rounded-[3px] bg-muted ring-record-1 transition group-focus-visible:ring-2">
          {record.coverImage ? (
            <img
              src={record.coverImage}
              alt=""
              loading="lazy"
              className="size-full object-cover"
            />
          ) : (
            <div className="grid size-full place-items-center p-3 text-center font-display text-sm text-muted-foreground">
              {record.title}
            </div>
          )}
        </div>
        {record.originalYear ? (
          <span className="sticker absolute -top-2 -left-2">
            {record.originalYear}
          </span>
        ) : null}
      </div>
      <div className="mt-3 pr-2">
        <p className="truncate font-semibold leading-tight">{record.title}</p>
        <p className="truncate text-sm text-muted-foreground">
          {record.artist}
        </p>
        {colored && (
          <p className="mt-1 flex items-center gap-1.5 truncate font-mono text-[11px] text-muted-foreground">
            <VinylSwatch colors={record.look.colors} />
            {record.look.label}
          </p>
        )}
      </div>
    </button>
  )
}
