import type { Rates } from '#/lib/currency'

// ECB reference rates (updated once per working day), cached per server
// instance. Free, no key: https://frankfurter.dev
let cache: { rates: Rates; fetchedAt: number } | null = null
const TTL = 6 * 60 * 60 * 1000

export async function usdRates(): Promise<Rates | null> {
  if (cache && Date.now() - cache.fetchedAt < TTL) return cache.rates
  try {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=USD')
    if (!res.ok) throw new Error(`rates ${res.status}`)
    const json = (await res.json()) as { rates: Rates }
    cache = { rates: { ...json.rates, USD: 1 }, fetchedAt: Date.now() }
    return cache.rates
  } catch (e) {
    console.warn('[rates] unavailable', (e as Error).message)
    // A stale rate beats no conversion at all.
    return cache?.rates ?? null
  }
}
