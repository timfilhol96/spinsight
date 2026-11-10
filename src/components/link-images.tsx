import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import { findLinkImages, removeLinkImage } from '#/lib/collection.functions'
import type { CoverOption } from '#/lib/records'
import { cn } from '#/lib/utils'

/**
 * The × on an image added from a link. Deleting the cover or disc photo in
 * use puts the automatic cover / drawn disc back, so it asks first.
 */
export function RemoveLinkImage({
  instanceId,
  option,
  inUse,
}: {
  instanceId: number
  option: CoverOption
  inUse: boolean
}) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  if (!option.stored || !option.url) return null
  const url = option.url

  async function remove() {
    if (
      inUse &&
      !window.confirm(
        'This image is in use. Delete it and go back to the automatic one?',
      )
    )
      return
    setBusy(true)
    try {
      await removeLinkImage({ data: { instanceId, url } })
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['cover-options', instanceId] }),
        qc.invalidateQueries({ queryKey: ['profile'] }),
        qc.invalidateQueries({ queryKey: ['now-playing'] }),
      ])
      toast.success('Image deleted.')
    } catch (e) {
      toast.error(`Couldn't delete the image: ${(e as Error).message}`)
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      aria-label={`Delete ${option.label}`}
      title="Delete this image"
      className={cn(
        'absolute top-1 left-1 grid size-5 place-items-center rounded-full bg-background/90 text-foreground shadow ring-1 ring-border transition hover:bg-destructive hover:text-white',
        busy && 'animate-pulse',
      )}
    >
      <X className="size-3" />
    </button>
  )
}

/**
 * Paste a link (a shop's product page, a label's site, an image) and pick one
 * of its images. Used for covers and disc photos the Discogs release lacks.
 */
export function LinkImages({
  instanceId,
  purpose,
  onPick,
}: {
  instanceId: number
  purpose: 'cover' | 'disc'
  onPick: (url: string) => Promise<void>
}) {
  const [link, setLink] = useState('')
  const [images, setImages] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [finding, setFinding] = useState(false)
  const [picking, setPicking] = useState<string | null>(null)

  async function find(e: React.FormEvent) {
    e.preventDefault()
    if (!link.trim()) return
    setFinding(true)
    setError(null)
    setImages(null)
    try {
      const res = await findLinkImages({ data: { instanceId, link } })
      setImages(res.images)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setFinding(false)
    }
  }

  async function pick(url: string) {
    setPicking(url)
    setError(null)
    try {
      await onPick(url)
      setImages(null)
      setLink('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPicking(null)
    }
  }

  return (
    <div className="mt-4 border-t pt-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link2 className="size-3.5" />
        {purpose === 'cover'
          ? 'Or use an image from a link: a shop or label page, or the image itself.'
          : 'Or use a photo from a link: a shop or label page often shows the vinyl.'}
      </p>
      <form onSubmit={find} className="flex gap-2">
        <input
          type="url"
          inputMode="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://…"
          aria-label="Link to a page or image"
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={finding || !link.trim()}
        >
          {finding ? 'Looking…' : 'Find images'}
        </Button>
      </form>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      {images && (
        <>
          <p className="mt-3 mb-2 text-xs text-muted-foreground">
            {purpose === 'cover'
              ? 'Pick the cover.'
              : 'Pick the photo that shows the vinyl.'}
          </p>
          <ul className="grid grid-cols-4 gap-2">
            {images.map((url, i) => (
              <li key={url}>
                <button
                  type="button"
                  onClick={() => pick(url)}
                  disabled={!!picking}
                  aria-label={`Use image ${i + 1} from the link`}
                  className={cn(
                    'block aspect-square w-full overflow-hidden rounded-[3px] bg-muted transition hover:opacity-90',
                    picking === url && 'animate-pulse',
                  )}
                >
                  {/* Shown straight from the site while choosing; only the
                      chosen image is copied to Spinsight. */}
                  <img
                    src={url}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="size-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
