import { useParams } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { profileQuery } from '#/lib/queries'
import { displayMoney } from '#/lib/currency'
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
