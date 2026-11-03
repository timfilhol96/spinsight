// Where to buy a want. Plain links (no affiliate tags): the Discogs
// marketplace for that exact pressing, and an eBay or Amazon search on the
// viewer's local site.

export type ShopLink = { shop: 'Discogs' | 'eBay' | 'Amazon'; url: string }

// Country → local site. Countries without their own site use a neighbour's.
const EBAY: Record<string, string> = {
  GB: 'ebay.co.uk',
  IE: 'ebay.ie',
  DE: 'ebay.de',
  AT: 'ebay.at',
  CH: 'ebay.ch',
  FR: 'ebay.fr',
  IT: 'ebay.it',
  ES: 'ebay.es',
  NL: 'ebay.nl',
  BE: 'befr.ebay.be',
  PL: 'ebay.pl',
  CA: 'ebay.ca',
  AU: 'ebay.com.au',
}
const AMAZON: Record<string, string> = {
  GB: 'amazon.co.uk',
  IE: 'amazon.co.uk',
  DE: 'amazon.de',
  AT: 'amazon.de',
  CH: 'amazon.de',
  FR: 'amazon.fr',
  IT: 'amazon.it',
  ES: 'amazon.es',
  NL: 'amazon.nl',
  BE: 'amazon.com.be',
  PL: 'amazon.pl',
  SE: 'amazon.se',
  CA: 'amazon.ca',
  MX: 'amazon.com.mx',
  BR: 'amazon.com.br',
  AU: 'amazon.com.au',
  JP: 'amazon.co.jp',
  IN: 'amazon.in',
}

/** The browser's country: "en-GB" → "GB", and "fr" → "FR" via likely subtags. */
function viewerCountry(): string | undefined {
  if (typeof navigator === 'undefined') return undefined
  try {
    return new Intl.Locale(navigator.language).maximize().region
  } catch {
    return undefined
  }
}

export function buyLinks(want: {
  releaseId: number
  artist: string
  title: string
}): ShopLink[] {
  const country = viewerCountry() ?? 'US'
  const q = encodeURIComponent(`${want.artist} ${want.title} vinyl`)
  return [
    {
      shop: 'Discogs',
      url: `https://www.discogs.com/sell/release/${want.releaseId}`,
    },
    {
      shop: 'eBay',
      url: `https://www.${EBAY[country] ?? 'ebay.com'}/sch/i.html?_nkw=${q}`,
    },
    {
      shop: 'Amazon',
      url: `https://www.${AMAZON[country] ?? 'amazon.com'}/s?k=${q}`,
    },
  ]
}
