import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { setPricePaid } from '#/lib/collection.functions'
import { CURRENCIES, formatMoney } from '#/lib/currency'
import type { Money } from '#/lib/currency'
import type { CollectionRecord } from '#/lib/records'
import { useMoney, useProfile } from '#/lib/use-profile'

/**
 * What the owner paid for this copy. Discogs has nowhere to put it, so it's
 * kept on Spinsight, in the currency it was paid in, and only shown to them.
 */
export function PricePaid({ record }: { record: CollectionRecord }) {
  const qc = useQueryClient()
  const money = useMoney()
  const { currency: displayCurrency } = useProfile()
  const paid = record.pricePaid
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [saving, setSaving] = useState(false)

  function startEditing() {
    setAmount(paid ? String(paid.amount) : '')
    setCurrency(paid?.currency ?? displayCurrency ?? 'USD')
    setEditing(true)
  }

  async function save(price: Money | null) {
    setSaving(true)
    try {
      await setPricePaid({ data: { instanceId: record.instanceId, price } })
      await qc.invalidateQueries({ queryKey: ['profile'] })
      setEditing(false)
    } catch (e) {
      toast.error(`Couldn't save the price: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    // Accept "12,50" as well as "12.50".
    const parsed = Number(amount.replace(',', '.'))
    const valid = amount.trim() !== '' && Number.isFinite(parsed) && parsed >= 0
    return (
      <form
        className="flex flex-wrap items-center gap-2 rounded-lg border bg-background/60 p-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) void save({ amount: parsed, currency })
        }}
      >
        <label className="sr-only" htmlFor="price-paid">
          Price paid
        </label>
        <Input
          id="price-paid"
          inputMode="decimal"
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="h-8 w-24 bg-card"
        />
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          aria-label="Currency paid in"
          className="h-8 rounded-md border bg-card px-1.5 text-sm"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={!valid || saving}>
          Save
        </Button>
        {paid && (
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
      </form>
    )
  }

  // Shown as paid, with the display currency alongside when they differ.
  const converted = paid && money(paid)
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background/60 p-3 text-sm">
      <Wallet className="size-4 text-muted-foreground" />
      {paid ? (
        <span>
          Paid <span className="font-semibold">{formatMoney(paid)}</span>
          {converted && converted !== formatMoney(paid) && (
            <span className="text-muted-foreground"> · about {converted}</span>
          )}
        </span>
      ) : (
        <span className="text-muted-foreground">What did you pay?</span>
      )}
      <button
        type="button"
        onClick={startEditing}
        className="ml-auto text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        {paid ? 'Edit' : 'Add price'}
      </button>
    </div>
  )
}
