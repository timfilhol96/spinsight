import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
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

/**
 * Whether the card's disc should be drawn. It hides behind the sleeve until
 * hover or focus, so it's only added near the screen on devices that can
 * hover, or on focus: a big collection would otherwise draw hundreds of discs
 * (and fetch every label image, which SVG can't lazy-load) that nobody sees.
 */
function useDisc(ref: RefObject<HTMLElement | null>) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || show || !matchMedia('(hover: hover)').matches) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShow(true)
      },
      { rootMargin: '300px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref, show])
  return [show, () => setShow(true)] as const
}

export function RecordCard({
  record,
  onOpen,
  pressings = 1,
}: {
  record: CollectionRecord
  onOpen: () => void
  /** Album view: how many pressings of this album the card stands for. */
  pressings?: number
}) {
  const colored = isColoredVinyl(record.look)
  const ref = useRef<HTMLButtonElement>(null)
  const [showDisc, revealDisc] = useDisc(ref)
  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      onFocus={revealDisc}
      className="group relative block w-full text-left focus-visible:outline-none"
      aria-label={`${record.artist} – ${record.title}${pressings > 1 ? `, ${pressings} pressings` : ''}`}
    >
      <div className="relative aspect-square">
        {/* More than one pressing: a second sleeve peeks out behind. */}
        {pressings > 1 && (
          <div className="sleeve-shadow absolute inset-0 translate-x-[5%] -translate-y-[5%] rotate-3 rounded-[3px] bg-muted ring-1 ring-border" />
        )}
        {/* The disc slides out of the sleeve on hover, like pulling it from a crate. */}
        {showDisc && (
          <VinylDisc
            look={record.look}
            labelImage={record.thumb}
            coverImage={record.coverImage}
            seed={record.releaseId}
            className="absolute inset-[4%] transition-transform duration-500 ease-out group-hover:translate-x-[22%] group-focus-visible:translate-x-[22%] group-hover:rotate-45"
          />
        )}
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
        {pressings > 1 && (
          <span className="absolute -right-2 -bottom-2 rounded-full bg-record-1 px-2 py-0.5 text-[11px] font-semibold text-record-ink shadow">
            {pressings} pressings
          </span>
        )}
      </div>
      <div className="mt-3 pr-2">
        <p className="truncate font-semibold leading-tight">{record.title}</p>
        <p className="truncate text-sm text-muted-foreground">
          {record.artist}
        </p>
        {colored && pressings === 1 && (
          <p className="mt-1 flex items-center gap-1.5 truncate font-mono text-[11px] text-muted-foreground">
            <VinylSwatch colors={record.look.colors} />
            {record.look.label}
          </p>
        )}
      </div>
    </button>
  )
}
