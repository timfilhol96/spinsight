// Detects special editions, which often come with different artwork.
// "Limited Edition", "Reissue", "Repress", "Remastered" and "Club Edition" are
// deliberately ignored: they're on most coloured pressings and rarely mean new
// artwork.

/**
 * Normalised edition markers found in the text, e.g. ["anniversary:10",
 * "deluxe"]. Empty when it's a regular release.
 */
export function editionTokens(text: string): string[] {
  const t = text.toLowerCase()
  const tokens = new Set<string>()
  // "10th Anniversary", "10 Year Anniversary", "Tenth Anniversary", "20th-Anniversary"
  const ORDINALS: Record<string, number> = {
    tenth: 10,
    fifteenth: 15,
    twentieth: 20,
    thirtieth: 30,
    fortieth: 40,
    fiftieth: 50,
  }
  for (const m of t.matchAll(
    /(\d+|tenth|fifteenth|twentieth|thirtieth|fortieth|fiftieth)(?:st|nd|rd|th)?[\s-]*(?:years?[\s-]*)?anniversary/g,
  )) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : ORDINALS[m[1]]
    if (n) tokens.add(`anniversary:${n}`)
  }
  if (!tokens.size && /anniversary/.test(t)) tokens.add('anniversary')
  if (/\bdeluxe\b/.test(t)) tokens.add('deluxe')
  if (/\bexpanded\b/.test(t)) tokens.add('expanded')
  if (/\bsuper deluxe\b/.test(t)) tokens.add('super-deluxe')
  if (/\bspecial edition\b/.test(t)) tokens.add('special')
  if (/\bcollector'?s edition\b/.test(t)) tokens.add('collectors')
  // Not "director's cut": that's an actual album title (Jeff Mills).
  if (/\b(redux|definitive edition)\b/.test(t)) tokens.add('redux')
  return [...tokens]
}
