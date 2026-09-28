// Money helpers shared by server and client. Rates are "units per 1 USD"
// (ECB reference rates via frankfurter.dev), so any→any goes through USD.

export type Rates = Record<string, number>
export type Money = { amount: number; currency: string }

/** Currencies with ECB reference rates. */
export const CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'SGD',
  'JPY',
  'AUD',
  'CAD',
  'CHF',
  'CNY',
  'CZK',
  'DKK',
  'HKD',
  'HUF',
  'IDR',
  'ILS',
  'INR',
  'ISK',
  'KRW',
  'MXN',
  'MYR',
  'NOK',
  'NZD',
  'PHP',
  'PLN',
  'RON',
  'SEK',
  'THB',
  'TRY',
  'ZAR',
  'BRL',
  'BGN',
] as const

// How Discogs writes amounts ("€1,234.56", "CA$12.00", "¥3,000"). Longest first.
const SYMBOLS: Array<[string, string]> = [
  ['CA$', 'CAD'],
  ['A$', 'AUD'],
  ['NZ$', 'NZD'],
  ['MX$', 'MXN'],
  ['R$', 'BRL'],
  ['HK$', 'HKD'],
  ['S$', 'SGD'],
  ['CHF', 'CHF'],
  ['SEK', 'SEK'],
  ['DKK', 'DKK'],
  ['NOK', 'NOK'],
  ['ZAR', 'ZAR'],
  ['€', 'EUR'],
  ['£', 'GBP'],
  ['¥', 'JPY'],
  ['$', 'USD'],
]

/** Parses Discogs' formatted amounts. Returns null for anything unrecognised. */
export function parseMoney(text: string | null | undefined): Money | null {
  if (!text) return null
  const t = text.trim()
  const code = /^[A-Z]{3}\b/.exec(t)?.[0]
  const sym = SYMBOLS.find(([s]) => t.startsWith(s))
  const currency =
    sym?.[1] ??
    (code && (CURRENCIES as readonly string[]).includes(code) ? code : null)
  if (!currency) return null
  const amount = Number(t.replace(/[^0-9.]/g, ''))
  return Number.isFinite(amount) ? { amount, currency } : null
}

export function convert(
  m: Money,
  to: string,
  rates: Rates | null,
): Money | null {
  if (m.currency === to) return m
  if (!rates) return null
  const from = m.currency === 'USD' ? 1 : rates[m.currency]
  const target = to === 'USD' ? 1 : rates[to]
  if (!from || !target) return null
  return { amount: (m.amount / from) * target, currency: to }
}

export function formatMoney(
  m: Money,
  opts: { compact?: boolean } = {},
): string {
  // Fixed locale so server and browser render the same string (no hydration mismatch).
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: m.currency,
    maximumFractionDigits: opts.compact || m.amount >= 100 ? 0 : 2,
  }).format(m.amount)
}

/** Converts when possible; otherwise shows the amount in its own currency. */
export function displayMoney(
  m: Money | null,
  to: string | null,
  rates: Rates | null,
  opts?: { compact?: boolean },
): string | null {
  if (!m) return null
  return formatMoney((to && convert(m, to, rates)) || m, opts)
}
