import type { Money } from '#/lib/currency'
import { useSecondMoney } from '#/lib/use-profile'

/**
 * An amount in the second currency, in small type after the main amount
 * ("$24 ≈ ฿820"). Renders nothing without a second currency.
 */
export function SecondMoney({
  value,
  compact,
}: {
  value: Money | null
  compact?: boolean
}) {
  const second = useSecondMoney()(value, { compact })
  if (!second) return null
  return (
    <span className="ml-1.5 text-xs font-normal tracking-normal whitespace-nowrap text-muted-foreground">
      ≈ {second}
    </span>
  )
}
