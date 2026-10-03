// Turns Discogs format text ("Red Translucent", "Clear w/ Blue Splatter",
// "Coke Bottle Green") into something we can paint: a list of colours plus a
// pattern. Pure and shared by server (stored on sync) and client (rendering).

export type VinylPattern =
  | 'black'
  | 'solid'
  | 'translucent'
  | 'marbled'
  | 'splatter'
  | 'split'
  | 'swirl'
  | 'color-in-color'
  | 'galaxy'
  | 'smoke'
  | 'picture'
  | 'glow'
  | 'stripe'
  | 'pinwheel'

export type VinylLook = {
  pattern: VinylPattern
  /** Hex colours, dominant first. Empty for black and picture discs. */
  colors: string[]
  translucent: boolean
  /** Original Discogs text, for display ("Red Translucent"). */
  label: string | null
  /** Finer shape hints parsed from the text. */
  detail?: VinylDetail
  /** A real photo of the disc, chosen and cropped by the owner. */
  photo?: DiscPhoto
}

export type VinylDetail = {
  /** Splatter: "specks"/"confetti" are fine, "heavy splatter" is heavy. */
  density?: 'fine' | 'normal' | 'heavy'
  /** Colour-in-colour: size of the inner blob as a share of the disc. */
  blob?: number
  /** Swirl drawn as chunky patches ("smash") rather than streaks. */
  blotchy?: boolean
}

/**
 * A photo used as the disc: the circle (centre cx/cy as a fraction of the
 * image's width/height, radius r as a fraction of its width) plus the image's
 * pixel size, so the crop maps onto the drawn disc exactly.
 */
export type DiscPhoto = {
  url: string
  cx: number
  cy: number
  r: number
  w: number
  h: number
}

export type DiscogsFormat = {
  name: string
  qty?: string
  text?: string
  descriptions?: string[]
}

// Vinyl-press colour names. Multi-word names are matched before single words
// so "sea glass" never reads as "glass" and "blood red" never as "red".
const COLOR_NAMES: Record<string, string> = {
  'coke bottle': '#8fb89a',
  'coke bottle clear': '#8fb89a',
  'coke bottle green': '#8fb89a',
  'sea glass': '#8fc1b5',
  'sea blue': '#2f7fa8',
  'baby blue': '#9ec9e8',
  'sky blue': '#7cb9e8',
  'light blue': '#8ab8e0',
  'royal blue': '#2b4acb',
  'electric blue': '#2f7cff',
  'dark blue': '#1f2f6b',
  'navy blue': '#1f2a5a',
  'baby pink': '#f4b6c2',
  'hot pink': '#ff4f9a',
  'light pink': '#f6c1cf',
  'blood red': '#8a0f0f',
  'dark red': '#7d1616',
  'forest green': '#2d5a3a',
  'dark green': '#1f4d2b',
  'light green': '#9ed49a',
  'neon green': '#6cff3a',
  'olive green': '#6b6b2a',
  'bottle green': '#2f5d3a',
  'neon yellow': '#e8ff3a',
  'neon orange': '#ff7a1a',
  'neon pink': '#ff3fa4',
  'pale yellow': '#f5e6a3',
  'dark grey': '#4b4e52',
  'dark gray': '#4b4e52',
  'light grey': '#c4c7cb',
  'light gray': '#c4c7cb',
  'milky clear': '#e9ecea',
  'crystal clear': '#e8eef0',
  'ultra clear': '#e8eef0',
  'glow in the dark': '#d8f5c4',
  // Evocative names that show up in real press descriptions.
  'black ice': '#3a3d44',
  seaweed: '#4b6b3a',
  algae: '#4f7a3a',
  ice: '#cfe8f0',
  beer: '#d9a441',
  honey: '#d9a441',
  moonstone: '#b9bcc4',
  navy: '#1f2a5a',
  cobalt: '#1f4fbf',
  blue: '#2f5fb3',
  cyan: '#3cc8e0',
  aqua: '#5fd3d3',
  turquoise: '#30c5c0',
  teal: '#2a8c8c',
  seafoam: '#9fe2bf',
  mint: '#a8e6cf',
  green: '#3a8f4b',
  emerald: '#1f8a5b',
  jade: '#3d9b74',
  olive: '#6b6b2a',
  lime: '#a6d943',
  yellow: '#f2cf2e',
  canary: '#ffe45c',
  lemon: '#fff05c',
  mustard: '#d4a52a',
  gold: '#c9a13b',
  golden: '#c9a13b',
  amber: '#d98e1f',
  orange: '#e8792b',
  tangerine: '#f28a2e',
  peach: '#f6b48f',
  coral: '#f27a6b',
  salmon: '#f29b85',
  red: '#c62b2b',
  crimson: '#b01e35',
  scarlet: '#d0261f',
  cherry: '#a5122a',
  oxblood: '#5c1a1b',
  maroon: '#6b1f2a',
  burgundy: '#6d1a2a',
  wine: '#6a1a33',
  rose: '#e58ca3',
  pink: '#ef7fa5',
  magenta: '#d1307b',
  fuchsia: '#d63fa0',
  purple: '#6c3aa6',
  violet: '#8452c9',
  indigo: '#3b2f8a',
  lavender: '#b9a5e0',
  lilac: '#c7a6d8',
  orchid: '#b565c9',
  plum: '#6e2f5f',
  white: '#f3f0ea',
  bone: '#e6dcc6',
  cream: '#efe4c8',
  ivory: '#f2ead3',
  beige: '#dccbaa',
  sand: '#d8c39a',
  tan: '#c8a57a',
  brown: '#6b4426',
  chocolate: '#4a2c1a',
  copper: '#b0653b',
  bronze: '#8c6a3a',
  rust: '#a4492a',
  silver: '#b8bcc2',
  grey: '#8a8d91',
  gray: '#8a8d91',
  smoke: '#6e6a6a',
  smokey: '#6e6a6a',
  smoky: '#6e6a6a',
  black: '#141414',
  clear: '#e8eef0',
}

const SORTED_NAMES = Object.keys(COLOR_NAMES).sort(
  (a, b) => b.length - a.length,
)

const PATTERN_RULES: Array<[RegExp, VinylPattern]> = [
  [/picture disc|picture/, 'picture'],
  [/glow/, 'glow'],
  [/galaxy|nebula|cosmic/, 'galaxy'],
  [
    /splatter|splattered|splash|speckle|speckled|specks?\b|confetti/,
    'splatter',
  ],
  [/marble|marbled|marbling|swirled marble/, 'marbled'],
  [
    /pinwheel|quad|tri-?colou?r|tri colou?r|sectioned|segmented|butterfly|pie\b/,
    'pinwheel',
  ],
  [/half|split|side a\s*\/\s*side b|a-side|b-side/, 'split'],
  [/\bin\b|inside|colou?r[- ]in[- ]colou?r|yolk|blob/, 'color-in-color'],
  [/swirl|swirled|mixed|twister|tie[- ]dye|lava|smash|haze|hazy/, 'swirl'],
  [/smoke|smokey|smoky/, 'smoke'],
  [/stripe|striped|\bbands?\b|\bbanded\b|\brings?\b/, 'stripe'],
]

/**
 * Named effects with no colour word in them ("Citrus Marble", "Nature's Grain
 * Splatter"). Used only when the text names no colour at all.
 */
const NAMED_EFFECTS: Array<[RegExp, string[]]> = [
  [/citrus/, ['#f2cf2e', '#e8792b', '#a6d943']],
  [/molten|lava|fire/, ['#e8792b', '#c62b2b', '#141414']],
  [/grain|wood|nature|earth/, ['#8a6a4a', '#c8a57a', '#4b6b3a']],
  [/recycled|eco[- ]?mix|random/, ['#5b4a6b', '#3a8f4b', '#c62b2b', '#d9a441']],
  [/ocean|sea\b|wave/, ['#2f7fa8', '#9fe2bf']],
]
/** Last resort for a pattern with no colour named: the shop's own colours. */
const DEFAULT_EFFECT = ['#b5462a', '#e6dcc6']

const TRANSLUCENT_RE =
  /translucent|transparent|clear|see[- ]through|crystal|trans\b|glass|coke bottle|\bice\b/

function matchColors(text: string): string[] {
  const found: Array<{ at: number; hex: string }> = []
  const taken = new Array(text.length).fill(false)
  for (const name of SORTED_NAMES) {
    const re = new RegExp(`\\b${name}\\b`, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      const start = m.index
      const end = start + name.length
      if (taken.slice(start, end).some(Boolean)) continue
      for (let i = start; i < end; i++) taken[i] = true
      found.push({ at: start, hex: COLOR_NAMES[name] })
    }
  }
  const ordered = found.sort((a, b) => a.at - b.at).map((f) => f.hex)
  return [...new Set(ordered)]
}

/** Picks the vinyl entry that describes the disc itself. */
function vinylFormat(
  formats: DiscogsFormat[] | null | undefined,
): DiscogsFormat | null {
  if (!formats?.length) return null
  const vinyl = formats.filter((f) => f.name === 'Vinyl')
  if (!vinyl.length) return null
  return (
    vinyl.find((f) => f.text || f.descriptions?.includes('Picture Disc')) ??
    vinyl[0]
  )
}

export function parseVinylLook(
  formats: DiscogsFormat[] | null | undefined,
): VinylLook {
  const fmt = vinylFormat(formats)
  const label = fmt?.text?.trim() || null
  const descriptions = (fmt?.descriptions ?? []).join(' ').toLowerCase()
  const text = `${label ?? ''}`.toLowerCase()

  if (descriptions.includes('picture disc') || /picture disc/.test(text)) {
    return {
      pattern: 'picture',
      colors: [],
      translucent: false,
      label: label ?? 'Picture Disc',
    }
  }
  if (!text)
    return { pattern: 'black', colors: [], translucent: false, label: null }

  // Colours come from the text outside brackets when it names any, so
  // "Green (Translucent Forest Green)" is one green, not a green/green swirl.
  // Pattern and translucency still read the whole string ("Yellow [Transparent]").
  const outside = text.replace(/[([][^)\]]*[)\]]/g, ' ')
  let colors = matchColors(outside)
  if (!colors.length) colors = matchColors(text)
  const translucent = TRANSLUCENT_RE.test(text)
  let pattern: VinylPattern | null = null
  for (const [re, p] of PATTERN_RULES) {
    if (re.test(text)) {
      pattern = p
      break
    }
  }

  // "Smoke" is both a colour and an effect; if it's the only thing named,
  // treat it as the effect over a dark base.
  if (pattern === 'smoke' && colors.length <= 1) colors = ['#3a3636', '#8a8585']
  if (pattern === 'glow' && colors.length === 0)
    colors = [COLOR_NAMES['glow in the dark']]
  // A bare "Galaxy" press is usually deep purple/blue with flecks.
  if (pattern === 'galaxy' && colors.length === 0)
    colors = [COLOR_NAMES.indigo, COLOR_NAMES.violet, COLOR_NAMES.white]
  if (colors.length === 0 && pattern && pattern !== 'smoke') {
    colors = NAMED_EFFECTS.find(([re]) => re.test(text))?.[1] ?? DEFAULT_EFFECT
  }

  // Text that isn't about colour at all ("180 Gram", "Gatefold") leaves us
  // with standard black vinyl.
  if (colors.length === 0 && !translucent && !pattern) {
    return { pattern: 'black', colors: [], translucent: false, label }
  }
  if (colors.length === 0 && translucent) colors = [COLOR_NAMES.clear]
  if (colors.length === 1 && colors[0] === COLOR_NAMES.black && !pattern) {
    // Translucent black ("Black Ice") is a smoky see-through press, not black.
    if (translucent)
      return {
        pattern: 'translucent',
        colors: [COLOR_NAMES['black ice']],
        translucent,
        label,
      }
    return { pattern: 'black', colors: [], translucent: false, label }
  }
  // "Blue Clear": clear is the translucency, not a second colour.
  if (!pattern && translucent && colors.length > 1) {
    const tinted = colors.filter((c) => c !== COLOR_NAMES.clear)
    if (tinted.length === 1) colors = tinted
  }

  // "Red In Clear": the named-first colour is the inner blob, and the outer
  // disc is usually clear. "Green / Black Yolk" names the outer disc first,
  // so flip it to keep the inner colour first.
  if (pattern === 'color-in-color' && /yolk/.test(text) && !/\bin\b/.test(text))
    colors = [...colors].reverse()
  if (pattern === 'color-in-color' && colors.length === 1)
    colors.push(COLOR_NAMES.clear)
  if (!pattern) {
    // "Red/Black" or "Red / Black" is a split; the "/" in "w/" is not.
    if (colors.length > 1)
      pattern = /\w\/\w|\s\/\s/.test(text) ? 'split' : 'swirl'
    else pattern = translucent ? 'translucent' : 'solid'
  }
  // A pattern needs a second colour to show; pair single colours with black
  // (marble/swirl/splatter on black is the most common press).
  if (
    ['marbled', 'splatter', 'swirl', 'split', 'galaxy'].includes(pattern) &&
    colors.length === 1
  ) {
    colors.push(pattern === 'splatter' ? COLOR_NAMES.white : COLOR_NAMES.black)
  }

  const detail: VinylDetail = {}
  if (pattern === 'splatter')
    detail.density = /speck|confetti|dust|fleck/.test(text)
      ? 'fine'
      : /heavy|mega|lots/.test(text)
        ? 'heavy'
        : 'normal'
  if (pattern === 'color-in-color')
    detail.blob = /yolk|egg/.test(text)
      ? 0.6
      : /blob|splash/.test(text)
        ? 0.42
        : 0.52
  if (pattern === 'swirl' && /smash|chunk|patch|blotch/.test(text))
    detail.blotchy = true
  if (['pinwheel', 'stripe'].includes(pattern) && colors.length === 1)
    colors.push(COLOR_NAMES.black)

  return { pattern, colors, translucent, label, detail }
}

export function isColoredVinyl(look: VinylLook | null | undefined): boolean {
  return !!look && look.pattern !== 'black'
}

// ---------- colour maths for theming ----------

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return (
    '#' +
    [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
  )
}

export function mixHex(a: string, b: string, t: number): string {
  const ra = hexToRgb(a)
  const rb = hexToRgb(b)
  return rgbToHex(
    [0, 1, 2].map((i) => ra[i] + (rb[i] - ra[i]) * t) as [
      number,
      number,
      number,
    ],
  )
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** 0 for greys, 1 for a pure hue. */
function saturation(hex: string): number {
  const rgb = hexToRgb(hex)
  const max = Math.max(...rgb)
  return max ? (max - Math.min(...rgb)) / max : 0
}

/** How much colour there is at all: 0 for greys, black and white. */
function chroma(hex: string): number {
  const rgb = hexToRgb(hex)
  return (Math.max(...rgb) - Math.min(...rgb)) / 255
}

/**
 * How stand mode reads the album artwork: the cover's main colour as the
 * backdrop, readable ink on it, the most vivid colour that stands out from the
 * backdrop as the accent, and another cover colour for the glow.
 * `palette` is dominant colours, most common first.
 */
function artworkColors(palette: Array<{ hex: string; share: number }>) {
  const background = palette[0].hex
  const DARK = '#141010'
  const LIGHT = '#fbf7f0'
  const inkOn = (hex: string) =>
    contrast(hex, DARK) >= contrast(hex, LIGHT) ? DARK : LIGHT
  const foreground = inkOn(background)
  const others = palette.slice(1).map((p) => p.hex)
  // The accent has to stand out from the backdrop to be worth using.
  const accent =
    others
      .filter((h) => contrast(h, background) >= 1.6)
      .sort((a, b) => saturation(b) - saturation(a))[0] ?? foreground
  const glow =
    others.find((h) => h !== accent) ?? mixHex(background, foreground, 0.15)
  return { background, foreground, accent, glow, inkOn }
}

/**
 * Accent colours from the album artwork, for records whose vinyl gives none
 * (black, picture discs): the same accent and glow as stand mode, so the app
 * wears the cover's gradient. A black-and-white cover gives null so the shop
 * palette stays.
 */
export function artworkAccent(
  palette: Array<{ hex: string; share: number }>,
): ReturnType<typeof recordTheme> {
  if (!palette.length) return null
  const { accent, glow } = artworkColors(palette)
  // Greys, blacks and whites (ink, paper) carry no colour; let a coloured one
  // lead. Chroma, not saturation: near-black reads as saturated.
  const colors = [accent, glow].filter((h) => chroma(h) >= 0.1)
  if (!colors.length) return null
  return recordTheme({
    pattern: 'solid',
    colors,
    translucent: false,
    label: null,
  })
}

/**
 * A whole palette taken from the album artwork, for stand mode, returned as
 * CSS variables to set on a container. `palette` is dominant colours, most
 * common first.
 */
export function artworkTheme(
  palette: Array<{ hex: string; share: number }>,
): Record<string, string> | null {
  if (!palette.length) return null
  const { background, foreground, accent, glow, inkOn } = artworkColors(palette)
  return {
    '--background': background,
    '--foreground': foreground,
    '--muted-foreground': mixHex(foreground, background, 0.35),
    '--card': mixHex(background, foreground, 0.06),
    '--accent': mixHex(background, foreground, 0.12),
    '--accent-foreground': foreground,
    '--border': mixHex(background, foreground, 0.2),
    '--record-1': accent,
    '--record-2': glow,
    '--record-ink': inkOn(accent),
  }
}

/**
 * Accent colours for the app while this record is selected. Very light
 * colours (clear, white, bone) are deepened so they still read as an accent on
 * cream paper. Returns null for black vinyl so the shop palette stays.
 */
export function recordTheme(
  look: VinylLook | null | undefined,
): { primary: string; secondary: string; ink: string } | null {
  if (!look || !look.colors.length) return null
  const deepen = (hex: string) => {
    const l = luminance(hex)
    if (l > 0.7) return mixHex(hex, '#5a4a3a', 0.45)
    if (l > 0.5) return mixHex(hex, '#3b2b1f', 0.2)
    return hex
  }
  // Black is the backdrop of a marble/splatter, never the accent.
  const accents = look.colors.filter((c) => c !== COLOR_NAMES.black)
  const first = accents[0] ?? look.colors[0]
  const primary = deepen(first)
  const second = accents.find((c) => c !== first)
  const secondary = deepen(second ?? mixHex(first, '#d9a441', 0.35))
  const DARK_INK = '#1b120c'
  const LIGHT_INK = '#fff7ec'
  const ink =
    contrast(primary, DARK_INK) >= contrast(primary, LIGHT_INK)
      ? DARK_INK
      : LIGHT_INK
  return { primary, secondary, ink }
}

/**
 * Applies the owner's disc photo. Sampled colours replace the parsed ones for
 * theming, except on black vinyl, which keeps the shop palette.
 */
export function withDiscPhoto(
  look: VinylLook,
  photo: DiscPhoto | null | undefined,
  sampled: string[] | null | undefined,
): VinylLook {
  if (!photo) return look
  const colors =
    look.pattern !== 'black' && sampled?.length ? sampled : look.colors
  return { ...look, photo, colors }
}
