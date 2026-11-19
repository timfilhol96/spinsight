import type { Extras } from '#/lib/moods'
import { cn } from '#/lib/utils'

/** Whole record, or the original album without the bonus tracks. */
export function ExtrasToggle({
  extras,
  onChange,
  size = 'default',
}: {
  extras: Extras
  onChange: (extras: Extras) => void
  size?: 'default' | 'sm'
}) {
  const options: Array<{ value: Extras; label: string }> = [
    { value: undefined, label: 'With bonus tracks' },
    { value: 'skip', label: 'Original album only' },
  ]
  return (
    <div
      role="radiogroup"
      aria-label="Bonus tracks"
      className={cn(
        'inline-flex rounded-lg border bg-card p-0.5',
        size === 'sm' ? 'text-xs' : 'text-sm',
      )}
    >
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          role="radio"
          aria-checked={extras === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            size === 'sm' ? 'px-2.5 py-1' : 'px-3 py-1.5',
            extras === o.value
              ? 'bg-record-1 text-record-ink'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
