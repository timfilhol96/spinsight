import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { toast } from 'sonner'
import { VinylDisc } from '#/components/vinyl-disc'
import { Button } from '#/components/ui/button'
import { getCoverOptions, setDiscPhoto } from '#/lib/collection.functions'
import type { CollectionRecord, CoverOption } from '#/lib/records'
import type { DiscPhoto } from '#/lib/vinyl-color'
import { cn } from '#/lib/utils'

type Draft = DiscPhoto

/**
 * Lets the owner use a real Discogs photo as the disc: choose the photo that
 * shows the vinyl, then drag/resize a circle over it. The server samples the
 * colours inside the circle for the app tint.
 */
export function DiscPhotoEditor({ record }: { record: CollectionRecord }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const qc = useQueryClient()
  const options = useQuery({
    queryKey: ['cover-options', record.instanceId],
    queryFn: () => getCoverOptions({ data: { instanceId: record.instanceId } }),
    enabled: open,
    staleTime: 10 * 60_000,
  })
  const photos = (options.data ?? []).filter((o) => o.discogs)
  const current = record.look.photo

  function start(o: CoverOption) {
    if (!o.url || !o.discogs) return
    // Re-editing the same photo keeps the saved circle.
    setDraft(
      current?.url === o.url
        ? current
        : {
            url: o.url,
            cx: 0.5,
            cy: 0.5,
            r: 0.42,
            w: o.discogs.width,
            h: o.discogs.height,
          },
    )
  }

  async function save(photo: Draft | null) {
    setSaving(true)
    try {
      await setDiscPhoto({
        data: photo
          ? {
              instanceId: record.instanceId,
              url: photo.url,
              cx: photo.cx,
              cy: photo.cy,
              r: photo.r,
            }
          : { instanceId: record.instanceId, url: null },
      })
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['profile'] }),
        qc.invalidateQueries({ queryKey: ['now-playing'] }),
      ])
      setDraft(null)
      if (!photo) setOpen(false)
      toast.success(photo ? 'Disc photo saved.' : 'Back to the drawn disc.')
    } catch (e) {
      toast.error(`Couldn't save: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o)
          setDraft(null)
        }}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <Camera className="size-3.5" />
        {open
          ? 'Close disc photo'
          : current
            ? 'Edit disc photo'
            : 'Use a real photo for the disc'}
      </button>

      {open && !draft && (
        <div className="mt-3">
          <p className="mb-2 text-xs text-muted-foreground">
            Pick the Discogs photo that shows the vinyl best.
          </p>
          {options.isPending && (
            <p className="text-xs text-muted-foreground">Loading photos…</p>
          )}
          {options.isError && (
            <p className="text-xs text-destructive">{options.error.message}</p>
          )}
          {options.data && photos.length === 0 && (
            <p className="text-xs text-muted-foreground">
              This release has no photos on Discogs.
            </p>
          )}
          <ul className="grid grid-cols-4 gap-2">
            {photos.map((o) => (
              <li key={o.url}>
                <button
                  type="button"
                  onClick={() => start(o)}
                  aria-label={`Use ${o.label}`}
                  className={cn(
                    'block aspect-square w-full overflow-hidden rounded-[3px] bg-muted ring-offset-2 ring-offset-background hover:opacity-90',
                    current?.url === o.url && 'ring-2 ring-record-1',
                  )}
                >
                  {o.thumb && (
                    <img
                      src={o.thumb}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
          {current && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => save(null)}
              disabled={saving}
            >
              Remove photo, use the drawn disc
            </Button>
          )}
        </div>
      )}

      {open && draft && (
        <CropCircle
          draft={draft}
          onChange={setDraft}
          record={record}
          saving={saving}
          onSave={() => save(draft)}
          onBack={() => setDraft(null)}
        />
      )}
    </div>
  )
}

function CropCircle({
  draft,
  onChange,
  record,
  saving,
  onSave,
  onBack,
}: {
  draft: Draft
  onChange: (d: Draft) => void
  record: CollectionRecord
  saving: boolean
  onSave: () => void
  onBack: () => void
}) {
  const frame = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(
    null,
  )
  // Discogs sometimes omits the size; fall back to the loaded image's.
  const [size, setSize] = useState({ w: draft.w, h: draft.h })
  const ready = size.w > 0 && size.h > 0
  const d = { ...draft, w: size.w, h: size.h }
  const clamp = (n: number) => Math.min(1, Math.max(0, n))

  function onPointerDown(e: React.PointerEvent) {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, cx: d.cx, cy: d.cy }
  }
  function onPointerMove(e: React.PointerEvent) {
    const start = drag.current
    const box = frame.current?.getBoundingClientRect()
    if (!start || !box) return
    onChange({
      ...d,
      cx: clamp(start.cx + (e.clientX - start.x) / box.width),
      cy: clamp(start.cy + (e.clientY - start.y) / box.height),
    })
  }
  function nudge(key: string) {
    const step = 0.01
    const moves: Record<string, Partial<Draft>> = {
      ArrowLeft: { cx: clamp(d.cx - step) },
      ArrowRight: { cx: clamp(d.cx + step) },
      ArrowUp: { cy: clamp(d.cy - step) },
      ArrowDown: { cy: clamp(d.cy + step) },
    }
    if (moves[key]) onChange({ ...d, ...moves[key] })
  }

  return (
    <div className="mt-3">
      <p className="mb-2 text-xs text-muted-foreground">
        Drag the circle onto the vinyl (arrow keys work too), then size it to
        the disc's edge.
      </p>
      <div className="flex items-start gap-3">
        <div
          ref={frame}
          className="relative flex-1 touch-none overflow-hidden rounded-md bg-muted"
        >
          <img
            src={draft.url}
            alt=""
            className="block w-full select-none"
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget
              if (!size.w || !size.h)
                setSize({ w: img.naturalWidth, h: img.naturalHeight })
            }}
          />
          {ready && (
            <svg
              viewBox={`0 0 ${size.w} ${size.h}`}
              preserveAspectRatio="none"
              className="absolute inset-0 size-full"
            >
              <defs>
                <mask id="disc-crop-mask">
                  <rect width={size.w} height={size.h} fill="white" />
                  <circle
                    cx={d.cx * size.w}
                    cy={d.cy * size.h}
                    r={d.r * size.w}
                    fill="black"
                  />
                </mask>
              </defs>
              <rect
                width={size.w}
                height={size.h}
                fill="black"
                opacity="0.5"
                mask="url(#disc-crop-mask)"
              />
              <circle
                cx={d.cx * size.w}
                cy={d.cy * size.h}
                r={d.r * size.w}
                fill="transparent"
                stroke="white"
                strokeWidth={size.w / 200}
                strokeDasharray={`${size.w / 60} ${size.w / 90}`}
                className="cursor-move focus:outline-none"
                tabIndex={0}
                role="slider"
                aria-label="Disc position"
                aria-valuetext={`${Math.round(d.cx * 100)}%, ${Math.round(d.cy * 100)}%`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={() => (drag.current = null)}
                onKeyDown={(e) => {
                  if (e.key.startsWith('Arrow')) {
                    e.preventDefault()
                    nudge(e.key)
                  }
                }}
              />
            </svg>
          )}
        </div>
        <div className="w-24 shrink-0 text-center">
          <VinylDisc
            look={{ ...record.look, photo: d }}
            seed={record.releaseId}
            className="w-full"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">Preview</p>
        </div>
      </div>
      <label className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        Size
        <input
          type="range"
          min={0.08}
          max={0.75}
          step={0.005}
          value={d.r}
          onChange={(e) => onChange({ ...d, r: Number(e.target.value) })}
          className="flex-1 accent-[var(--record-1)]"
        />
      </label>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          onClick={onSave}
          disabled={saving || !ready}
          className="bg-record-1 text-record-ink hover:bg-record-1/90"
        >
          {saving ? 'Saving…' : 'Save disc photo'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onBack} disabled={saving}>
          Pick another photo
        </Button>
      </div>
    </div>
  )
}
