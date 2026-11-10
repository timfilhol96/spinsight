import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { CalendarDays, NotebookPen } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { setCopyNotes, setPurchaseDate } from '#/lib/collection.functions'
import type { CollectionRecord } from '#/lib/records'

// The owner's own details about a copy, kept on Spinsight next to the price
// paid: when it was bought, and notes (a gift, where it was found…).

const dayFmt = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

/** "2024-06-11" (or a Discogs timestamp) → the local calendar day. */
const localDay = (iso: string) => {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const showDay = (day: string) => dayFmt.format(new Date(`${day}T12:00:00`))

function useRefresh() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['profile'] })
}

/**
 * When the owner bought this copy. Without one, the date it was added to
 * Discogs is used, which for an imported collection is the import day.
 */
export function PurchaseDate({ record }: { record: CollectionRecord }) {
  const refresh = useRefresh()
  const [editing, setEditing] = useState(false)
  const [day, setDay] = useState('')
  const [saving, setSaving] = useState(false)
  const bought = record.purchasedOn
  const discogsDay = record.discogsAddedAt
    ? localDay(record.discogsAddedAt)
    : null

  async function save(date: string | null) {
    setSaving(true)
    try {
      await setPurchaseDate({ data: { instanceId: record.instanceId, date } })
      await refresh()
      setEditing(false)
    } catch (e) {
      toast.error(`Couldn't save the date: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    const today = localDay(new Date().toISOString())
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= today
    return (
      <form
        className="rounded-lg border bg-background/60 p-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) void save(day)
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="purchase-date">
            Purchase date
          </label>
          <Input
            id="purchase-date"
            type="date"
            autoFocus
            value={day}
            min="1900-01-01"
            max={today}
            onChange={(e) => setDay(e.target.value)}
            className="h-8 w-40 bg-card"
          />
          <Button type="submit" size="sm" disabled={!valid || saving}>
            Save
          </Button>
          {bought && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => save(null)}
            >
              Remove
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Used instead of the Discogs date in your insights: the growth chart,
          on this day and your year in vinyl.
        </p>
      </form>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background/60 p-3 text-sm">
      <CalendarDays className="size-4 text-muted-foreground" />
      {bought ? (
        <span>
          Bought <span className="font-semibold">{showDay(bought)}</span>
        </span>
      ) : (
        <span className="text-muted-foreground">
          {discogsDay
            ? `Added to Discogs ${showDay(discogsDay)}`
            : 'When did you buy it?'}
        </span>
      )}
      <button
        type="button"
        onClick={() => {
          setDay(bought ?? discogsDay ?? '')
          setEditing(true)
        }}
        className="ml-auto shrink-0 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        {bought ? 'Edit' : 'Add purchase date'}
      </button>
    </div>
  )
}

const MAX_NOTES = 2000

/** Free-form notes on this copy. Only the owner sees them. */
export function CopyNotes({ record }: { record: CollectionRecord }) {
  const refresh = useRefresh()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const notes = record.notes

  async function save(next: string) {
    setSaving(true)
    try {
      await setCopyNotes({
        data: { instanceId: record.instanceId, notes: next },
      })
      await refresh()
      setEditing(false)
    } catch (e) {
      toast.error(`Couldn't save the note: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <form
        className="rounded-lg border bg-background/60 p-3"
        onSubmit={(e) => {
          e.preventDefault()
          void save(text)
        }}
      >
        <label className="sr-only" htmlFor="copy-notes">
          Notes
        </label>
        <textarea
          id="copy-notes"
          autoFocus
          rows={4}
          maxLength={MAX_NOTES}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="A gift from…, found at…, signed at the show…"
          className="w-full resize-y rounded-md border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={saving}>
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {text.length > MAX_NOTES * 0.8 && `${MAX_NOTES - text.length} left`}
          </span>
        </div>
      </form>
    )
  }

  return (
    <div className="flex items-start gap-2 rounded-lg border bg-background/60 p-3 text-sm">
      <NotebookPen className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      {notes ? (
        <p className="min-w-0 flex-1 break-words whitespace-pre-wrap">
          {notes}
        </p>
      ) : (
        <span className="flex-1 text-muted-foreground">
          Notes, only for you
        </span>
      )}
      <button
        type="button"
        onClick={() => {
          setText(notes ?? '')
          setEditing(true)
        }}
        className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        {notes ? 'Edit' : 'Add a note'}
      </button>
    </div>
  )
}
