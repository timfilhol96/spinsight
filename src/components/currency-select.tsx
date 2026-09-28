import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { setPreferredCurrency } from '#/lib/collection.functions'
import { CURRENCIES } from '#/lib/currency'

/** Saves the signed-in user's display currency; every page re-renders in it. */
export function CurrencySelect({ value }: { value: string | null }) {
  const qc = useQueryClient()
  const [pending, setPending] = useState(false)
  async function change(next: string) {
    setPending(true)
    try {
      await setPreferredCurrency({ data: { currency: next || null } })
      await qc.invalidateQueries({ queryKey: ['profile'] })
      await qc.invalidateQueries({ queryKey: ['viewer'] })
    } catch (e) {
      toast.error(`Couldn't save currency: ${(e as Error).message}`)
    } finally {
      setPending(false)
    }
  }
  return (
    <select
      value={value ?? ''}
      disabled={pending}
      onChange={(e) => change(e.target.value)}
      aria-label="Display currency"
      className="rounded-md border bg-card px-1.5 py-0.5 text-xs text-foreground"
    >
      <option value="">As on Discogs</option>
      {CURRENCIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  )
}
