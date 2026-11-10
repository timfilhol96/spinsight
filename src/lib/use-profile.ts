import { useParams } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { profileQuery } from '#/lib/queries'
import { convert, displayMoney, formatMoney } from '#/lib/currency'
import type { Money } from '#/lib/currency'
import type { Profile } from '#/lib/records'

/** The profile for the current /u/$username page. Safe once its loader ran. */
export function useProfile(): Profile {
  const { username } = useParams({ from: '/u/$username' })
  return useSuspenseQuery(profileQuery(username)).data as Profile
}

/** Formats an amount in the page's display currency (converted when possible). */
export function useMoney() {
  const { currency, rates } = useProfile()
  return (m: Money | null, opts?: { compact?: boolean }) =>
    displayMoney(m, currency, rates, opts)
}

/**
 * Formats an amount in the second currency, for showing small beside the
 * main one. Null when there's no second currency, it's the currency already
 * shown, or there's no rate for it.
 */
export function useSecondMoney() {
  const { currency, secondaryCurrency, rates } = useProfile()
  return (m: Money | null, opts?: { compact?: boolean }) => {
    if (!m || !secondaryCurrency) return null
    const shown =
      currency && convert(m, currency, rates) ? currency : m.currency
    if (shown === secondaryCurrency) return null
    const other = convert(m, secondaryCurrency, rates)
    return other ? formatMoney(other, opts) : null
  }
}
