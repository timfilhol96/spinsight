// A small, hand-tuned model of what a record *feels* like, built from its
// Discogs styles (Spotify no longer provides audio features or genres to
// hobby apps). Each style maps to three 0–1 axes:
//   energy      – ambient/acoustic (0) … blast beats (1)
//   darkness    – sunny/fun (0) … bleak/heavy (1)
//   atmosphere  – direct/riff-driven (0) … washed-out/spacious (1)
import type { CollectionRecord } from '#/lib/records'

export type Vibe = { energy: number; darkness: number; atmosphere: number }

// First match wins, so specific rules come before generic ones.
const STYLE_RULES: Array<[RegExp, Vibe]> = [
  [/^(dark ambient|drone)/, { energy: 0.1, darkness: 0.85, atmosphere: 0.95 }],
  [
    /ambient|new age|field recording/,
    { energy: 0.1, darkness: 0.3, atmosphere: 0.95 },
  ],
  [
    /shoegaze|dream pop|ethereal/,
    { energy: 0.45, darkness: 0.4, atmosphere: 0.95 },
  ],
  [
    /blackgaze|post-black|atmospheric black/,
    { energy: 0.8, darkness: 0.75, atmosphere: 0.9 },
  ],
  [/post rock|post-rock/, { energy: 0.45, darkness: 0.5, atmosphere: 0.9 }],
  [/post-metal|sludge/, { energy: 0.7, darkness: 0.85, atmosphere: 0.7 }],
  [/doom|funeral/, { energy: 0.5, darkness: 0.95, atmosphere: 0.7 }],
  [/black metal|depressive/, { energy: 0.9, darkness: 0.95, atmosphere: 0.7 }],
  [
    /deathcore|brutal death|grindcore|goregrind|slam/,
    { energy: 1, darkness: 0.95, atmosphere: 0.15 },
  ],
  [/melodic death/, { energy: 0.9, darkness: 0.7, atmosphere: 0.35 }],
  [/death metal/, { energy: 0.95, darkness: 0.9, atmosphere: 0.25 }],
  [
    /post-hardcore|emo|screamo/,
    { energy: 0.8, darkness: 0.6, atmosphere: 0.35 },
  ],
  [
    /art rock|new wave|post-punk|coldwave|darkwave|goth/,
    { energy: 0.55, darkness: 0.65, atmosphere: 0.55 },
  ],
  [
    /metalcore|mathcore|beatdown|hardcore/,
    { energy: 0.95, darkness: 0.7, atmosphere: 0.2 },
  ],
  [/thrash|speed metal/, { energy: 0.95, darkness: 0.6, atmosphere: 0.1 }],
  [/progressive metal|djent/, { energy: 0.8, darkness: 0.6, atmosphere: 0.5 }],
  [
    /power metal|heavy metal|nwobhm/,
    { energy: 0.85, darkness: 0.45, atmosphere: 0.25 },
  ],
  [
    /nu metal|alternative metal|groove metal|industrial metal/,
    { energy: 0.85, darkness: 0.7, atmosphere: 0.25 },
  ],
  [/stoner|desert rock/, { energy: 0.7, darkness: 0.55, atmosphere: 0.5 }],
  [/metal/, { energy: 0.85, darkness: 0.75, atmosphere: 0.3 }],
  [/pop punk|ska/, { energy: 0.8, darkness: 0.15, atmosphere: 0.1 }],
  [/punk|garage/, { energy: 0.85, darkness: 0.4, atmosphere: 0.1 }],
  [/grunge/, { energy: 0.75, darkness: 0.65, atmosphere: 0.3 }],
  [
    /psychedelic|space rock|krautrock/,
    { energy: 0.55, darkness: 0.35, atmosphere: 0.8 },
  ],
  [/prog/, { energy: 0.6, darkness: 0.45, atmosphere: 0.6 }],
  [
    /hard rock|arena rock|glam/,
    { energy: 0.8, darkness: 0.3, atmosphere: 0.2 },
  ],
  [
    /indie rock|alternative rock|britpop|power pop/,
    { energy: 0.6, darkness: 0.35, atmosphere: 0.35 },
  ],
  [
    /folk rock|americana|country/,
    { energy: 0.4, darkness: 0.3, atmosphere: 0.35 },
  ],
  [
    /folk|acoustic|singer\/songwriter/,
    { energy: 0.25, darkness: 0.35, atmosphere: 0.45 },
  ],
  [/blues/, { energy: 0.45, darkness: 0.45, atmosphere: 0.3 }],
  [/soft rock|yacht/, { energy: 0.35, darkness: 0.15, atmosphere: 0.35 }],
  [/techno|industrial|ebm/, { energy: 0.85, darkness: 0.7, atmosphere: 0.55 }],
  [
    /drum n bass|jungle|breakbeat|hardstyle|dubstep/,
    { energy: 0.9, darkness: 0.5, atmosphere: 0.4 },
  ],
  [
    /house|disco|nu-disco|electro|dance-pop|eurodance/,
    { energy: 0.8, darkness: 0.15, atmosphere: 0.4 },
  ],
  [
    /synthwave|synth-pop|italo/,
    { energy: 0.6, darkness: 0.3, atmosphere: 0.6 },
  ],
  [
    /downtempo|trip hop|chillwave|lo-fi|idm/,
    { energy: 0.3, darkness: 0.45, atmosphere: 0.8 },
  ],
  [/trance/, { energy: 0.8, darkness: 0.3, atmosphere: 0.75 }],
  [
    /experimental|abstract|noise/,
    { energy: 0.5, darkness: 0.6, atmosphere: 0.8 },
  ],
  [/trap|drill|horrorcore/, { energy: 0.75, darkness: 0.65, atmosphere: 0.35 }],
  [
    /boom bap|conscious|jazzy hip|hip hop|rap/,
    { energy: 0.6, darkness: 0.35, atmosphere: 0.3 },
  ],
  [/funk|boogie|afrobeat/, { energy: 0.75, darkness: 0.1, atmosphere: 0.25 }],
  [
    /soul|r&b|rnb|neo soul|gospel/,
    { energy: 0.45, darkness: 0.2, atmosphere: 0.4 },
  ],
  [
    /bossa|latin|samba|reggae|dub|dancehall/,
    { energy: 0.5, darkness: 0.1, atmosphere: 0.45 },
  ],
  [/anatolian|world|afro/, { energy: 0.55, darkness: 0.2, atmosphere: 0.5 }],
  [/jazz|swing|bop|fusion/, { energy: 0.45, darkness: 0.25, atmosphere: 0.45 }],
  [
    /classical|baroque|romantic|opera|score|soundtrack|modern classical/,
    { energy: 0.3, darkness: 0.4, atmosphere: 0.75 },
  ],
  [/pop/, { energy: 0.6, darkness: 0.15, atmosphere: 0.35 }],
]

// Discogs genre fallback when no style matched.
const GENRE_VIBES: Record<string, Vibe> = {
  Rock: { energy: 0.65, darkness: 0.4, atmosphere: 0.35 },
  Electronic: { energy: 0.6, darkness: 0.4, atmosphere: 0.6 },
  Pop: { energy: 0.6, darkness: 0.15, atmosphere: 0.35 },
  'Hip Hop': { energy: 0.6, darkness: 0.4, atmosphere: 0.3 },
  Jazz: { energy: 0.45, darkness: 0.25, atmosphere: 0.45 },
  'Funk / Soul': { energy: 0.6, darkness: 0.15, atmosphere: 0.35 },
  Classical: { energy: 0.3, darkness: 0.4, atmosphere: 0.75 },
  Reggae: { energy: 0.5, darkness: 0.1, atmosphere: 0.45 },
  Blues: { energy: 0.45, darkness: 0.45, atmosphere: 0.3 },
  'Folk, World, & Country': { energy: 0.35, darkness: 0.3, atmosphere: 0.45 },
  Latin: { energy: 0.6, darkness: 0.1, atmosphere: 0.4 },
  'Stage & Screen': { energy: 0.4, darkness: 0.4, atmosphere: 0.7 },
}
const NEUTRAL: Vibe = { energy: 0.5, darkness: 0.4, atmosphere: 0.45 }

function styleVibe(style: string): Vibe | null {
  const s = style.toLowerCase()
  return STYLE_RULES.find(([re]) => re.test(s))?.[1] ?? null
}

export function recordVibe(r: CollectionRecord): Vibe {
  const vibes = r.styles.map(styleVibe).filter((v): v is Vibe => !!v)
  if (!vibes.length) {
    const g = r.genres.map((x) => GENRE_VIBES[x]).filter(Boolean)
    if (!g.length) return NEUTRAL
    vibes.push(...g)
  }
  const avg = (k: keyof Vibe) =>
    vibes.reduce((s, v) => s + v[k], 0) / vibes.length
  return {
    energy: avg('energy'),
    darkness: avg('darkness'),
    atmosphere: avg('atmosphere'),
  }
}

// ---------- what the listener can ask for ----------

export const MOODS = {
  chill: {
    label: 'Chill',
    hint: 'Low-key, easy',
    target: { energy: 0.2, darkness: 0.3, atmosphere: 0.55 },
  },
  dreamy: {
    label: 'Dreamy',
    hint: 'Hazy & atmospheric',
    target: { energy: 0.4, darkness: 0.4, atmosphere: 0.95 },
  },
  upbeat: {
    label: 'Upbeat',
    hint: 'Fun, bright, moving',
    target: { energy: 0.75, darkness: 0.1, atmosphere: 0.3 },
  },
  heavy: {
    label: 'Heavy',
    hint: 'Loud and cathartic',
    target: { energy: 0.95, darkness: 0.8, atmosphere: 0.25 },
  },
  moody: {
    label: 'Moody',
    hint: 'Dark but slow-burning',
    target: { energy: 0.45, darkness: 0.85, atmosphere: 0.7 },
  },
} satisfies Record<string, { label: string; hint: string; target: Vibe }>
export type Mood = keyof typeof MOODS

export const WEATHERS = {
  sunny: {
    label: 'Sunny',
    icon: '☀️',
    nudge: { energy: 0.08, darkness: -0.15, atmosphere: -0.05 },
  },
  cloudy: {
    label: 'Cloudy',
    icon: '☁️',
    nudge: { energy: 0, darkness: 0.05, atmosphere: 0.08 },
  },
  rainy: {
    label: 'Rainy',
    icon: '🌧️',
    nudge: { energy: -0.08, darkness: 0.15, atmosphere: 0.15 },
  },
  stormy: {
    label: 'Stormy',
    icon: '⛈️',
    nudge: { energy: 0.12, darkness: 0.2, atmosphere: 0.05 },
  },
  cold: {
    label: 'Cold & grey',
    icon: '🥶',
    nudge: { energy: -0.05, darkness: 0.1, atmosphere: 0.12 },
  },
} satisfies Record<string, { label: string; icon: string; nudge: Vibe }>
export type Weather = keyof typeof WEATHERS

export const LENGTHS = {
  side: { label: 'Just a side', hint: '~20 min', maxSec: 35 * 60 },
  album: { label: 'A full album', hint: '30–60 min', maxSec: 65 * 60 },
  epic: { label: 'Something epic', hint: '60 min+', minSec: 55 * 60 },
} as const
export type Length = keyof typeof LENGTHS

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night'
export function timeOfDay(d = new Date()): TimeOfDay {
  const h = d.getHours()
  return h >= 5 && h < 12
    ? 'morning'
    : h < 17
      ? 'afternoon'
      : h < 22
        ? 'evening'
        : 'night'
}
const TIME_NUDGE: Record<TimeOfDay, Vibe> = {
  morning: { energy: 0.05, darkness: -0.1, atmosphere: 0 },
  afternoon: { energy: 0, darkness: 0, atmosphere: 0 },
  evening: { energy: -0.05, darkness: 0.05, atmosphere: 0.05 },
  night: { energy: -0.15, darkness: 0.1, atmosphere: 0.12 },
}

// ---------- style families (the "what kind of thing" question) ----------

export const FAMILIES: Array<{
  id: string
  label: string
  test: (r: CollectionRecord) => boolean
}> = [
  {
    id: 'metal',
    label: 'Metal & heavy',
    test: (r) =>
      r.styles.some((s) =>
        /metal|core\b|grind|thrash|sludge|doom|djent/i.test(s),
      ),
  },
  {
    id: 'rock',
    label: 'Rock & indie',
    test: (r) =>
      r.genres.includes('Rock') &&
      !r.styles.some((s) =>
        /metal|core\b|grind|thrash|sludge|doom|djent/i.test(s),
      ),
  },
  {
    id: 'electronic',
    label: 'Electronic',
    test: (r) => r.genres.includes('Electronic'),
  },
  {
    id: 'hiphop',
    label: 'Hip hop & R&B',
    test: (r) =>
      r.genres.includes('Hip Hop') || r.styles.some((s) => /r&b|rnb/i.test(s)),
  },
  {
    id: 'jazz',
    label: 'Jazz, soul & funk',
    test: (r) => r.genres.includes('Jazz') || r.genres.includes('Funk / Soul'),
  },
  { id: 'pop', label: 'Pop', test: (r) => r.genres.includes('Pop') },
  {
    id: 'folk',
    label: 'Folk & world',
    test: (r) =>
      r.genres.includes('Folk, World, & Country') ||
      r.genres.includes('Reggae') ||
      r.genres.includes('Latin'),
  },
  {
    id: 'classical',
    label: 'Classical & scores',
    test: (r) =>
      r.genres.includes('Classical') || r.genres.includes('Stage & Screen'),
  },
]

/** Families with at least `min` records in this collection. */
export function availableFamilies(records: CollectionRecord[], min = 2) {
  return FAMILIES.map((f) => ({
    ...f,
    count: records.filter(f.test).length,
  })).filter((f) => f.count >= min)
}

// ---------- scoring ----------

export type PickAnswers = {
  mood?: Mood
  weather?: Weather
  family?: string
  length?: Length
  time?: TimeOfDay
}

export type PlayInfo = { count: number; lastPlayedAt: string | null }

export type Candidate = {
  record: CollectionRecord
  score: number
  reasons: string[]
}

const clamp = (n: number) => Math.min(1, Math.max(0, n))
const DAY = 86_400_000

function describe(v: Vibe): string {
  const e =
    v.energy > 0.7 ? 'high-energy' : v.energy < 0.35 ? 'laid-back' : null
  const d = v.darkness > 0.7 ? 'dark' : v.darkness < 0.25 ? 'bright' : null
  const a = v.atmosphere > 0.75 ? 'atmospheric' : null
  return [e, d, a].filter(Boolean).join(', ')
}

/**
 * Ranks the collection against the answers. Everything is a soft preference
 * except the style family, which filters (and is dropped if nothing matches).
 */
export function rankRecords(
  records: CollectionRecord[],
  answers: PickAnswers,
  plays: Map<number, PlayInfo>,
  now = Date.now(),
): Candidate[] {
  const family = FAMILIES.find((f) => f.id === answers.family)
  let pool = family ? records.filter(family.test) : records
  if (!pool.length) pool = records

  let target: Vibe | null = answers.mood
    ? { ...MOODS[answers.mood].target }
    : null
  for (const nudge of [
    answers.weather ? WEATHERS[answers.weather].nudge : null,
    answers.time ? TIME_NUDGE[answers.time] : null,
  ]) {
    if (!nudge) continue
    target ??= { ...NEUTRAL }
    target = {
      energy: clamp(target.energy + nudge.energy),
      darkness: clamp(target.darkness + nudge.darkness),
      atmosphere: clamp(target.atmosphere + nudge.atmosphere),
    }
  }

  return pool
    .map((record) => {
      const reasons: string[] = []
      let score = 0.5
      const vibe = recordVibe(record)

      if (target) {
        const dist = Math.sqrt(
          (vibe.energy - target.energy) ** 2 * 1.2 +
            (vibe.darkness - target.darkness) ** 2 +
            (vibe.atmosphere - target.atmosphere) ** 2 * 0.8,
        )
        // dist ranges ~0 (perfect) … ~1.5; map to 1 … 0.
        score = clamp(1 - dist / 1.1)
        if (score > 0.7) {
          const words = describe(vibe)
          if (words) reasons.push(`Sounds ${words}`)
        }
      }

      if (answers.length) {
        const spec = LENGTHS[answers.length]
        const sec = record.durationSec
        if (sec) {
          const fits =
            ('maxSec' in spec ? sec <= spec.maxSec : true) &&
            ('minSec' in spec ? sec >= spec.minSec : true)
          score += fits ? 0.15 : -0.25
          if (fits) reasons.push(`${Math.round(sec / 60)} minutes long`)
        }
      }

      const p = plays.get(record.releaseId)
      if (!p?.count) {
        score += 0.1
        reasons.push('You haven’t logged a spin of this yet')
      } else if (p.lastPlayedAt) {
        const days = (now - new Date(p.lastPlayedAt).getTime()) / DAY
        if (days < 3) score -= 0.6
        else if (days < 14) score -= 0.25
        else if (days > 90) {
          score += 0.08
          reasons.push(`Last played ${Math.round(days / 30)} months ago`)
        }
      }

      if (family) reasons.unshift(family.label)
      return { record, score, reasons }
    })
    .sort((a, b) => b.score - a.score)
}

/** Weighted draw from the top of the ranking, so answers matter but it isn't deterministic. */
export function drawPick(
  ranked: Candidate[],
  exclude: Set<number>,
  top = 6,
): Candidate | null {
  const pool = ranked
    .filter((c) => !exclude.has(c.record.instanceId))
    .slice(0, top)
  if (!pool.length) return null
  const weights = pool.map((c) => Math.max(0.01, c.score) ** 4)
  let r = Math.random() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]
    if (r <= 0) return pool[i]
  }
  return pool[0]
}

/** "Surprise me": uniform-ish, but skipping anything spun in the last few days. */
export function randomPick(
  records: CollectionRecord[],
  plays: Map<number, PlayInfo>,
  exclude: Set<number>,
  now = Date.now(),
) {
  const fresh = records.filter((r) => {
    if (exclude.has(r.instanceId)) return false
    const last = plays.get(r.releaseId)?.lastPlayedAt
    return !last || now - new Date(last).getTime() > 3 * DAY
  })
  const pool = fresh.length
    ? fresh
    : records.filter((r) => !exclude.has(r.instanceId))
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null
}
