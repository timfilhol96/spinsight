import sharp from 'sharp'

// Samples the vinyl's colours from a photo, inside the circle the owner drew.
// Done on the server because Discogs images don't allow cross-origin pixel
// reads in the browser.

const toHex = (r: number, g: number, b: number) =>
  '#' +
  [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

const dist = (a: number[], b: number[]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/**
 * Up to three dominant, clearly different colours from the ring between the
 * label and the edge (the label and the background around the disc would
 * skew the result). `cx`/`cy` are fractions of the image size; `r` is a
 * fraction of its width.
 */
export async function sampleDiscColors(
  imageUrl: string,
  crop: { cx: number; cy: number; r: number },
): Promise<{ colors: string[]; width: number; height: number }> {
  const res = await fetch(imageUrl, {
    headers: { 'User-Agent': 'Spinsight/0.1' },
  })
  if (!res.ok) throw new Error(`Couldn't fetch the photo (${res.status}).`)
  const input = Buffer.from(await res.arrayBuffer())
  const meta = await sharp(input).metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  if (!width || !height) throw new Error('Unreadable photo.')

  // Square around the circle, clamped to the image.
  const radius = crop.r * width
  const left = Math.max(0, Math.round(crop.cx * width - radius))
  const top = Math.max(0, Math.round(crop.cy * height - radius))
  const size = Math.max(
    8,
    Math.min(Math.round(radius * 2), width - left, height - top),
  )
  const N = 72
  const { data } = await sharp(input)
    .extract({ left, top, width: size, height: size })
    .resize(N, N, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  // Where the circle's centre lands inside the (possibly clamped) square.
  const centreX = ((crop.cx * width - left) / size) * N
  const centreY = ((crop.cy * height - top) / size) * N
  const rPx = (radius / size) * N

  const pixels: Array<[number, number, number]> = []
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - centreX, y - centreY) / rPx
      if (d < 0.42 || d > 0.94) continue // skip the label and the rim
      const i = (y * N + x) * 3
      pixels.push([data[i], data[i + 1], data[i + 2]])
    }
  }
  const colors = dominantColors(pixels, 3, 0.04).map((c) => c.hex)
  return { colors, width, height }
}

/**
 * Up to `max` dominant, clearly different colours, most common first, with
 * the share of pixels each covers. Colours under `minShare` are specks.
 */
function dominantColors(
  pixels: Array<[number, number, number]>,
  max: number,
  minShare: number,
): Array<{ hex: string; share: number }> {
  // Bucket pixels at 3 bits per channel, keeping running sums per bucket.
  const buckets = new Map<
    number,
    { n: number; r: number; g: number; b: number }
  >()
  for (const [r, g, b] of pixels) {
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5)
    const cur = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    cur.n++
    cur.r += r
    cur.g += g
    cur.b += b
    buckets.set(key, cur)
  }

  const total = pixels.length
  const ranked = [...buckets.values()]
    .map((v) => ({ n: v.n, rgb: [v.r / v.n, v.g / v.n, v.b / v.n] }))
    .sort((a, b) => b.n - a.n)
  const picked: Array<{ rgb: number[]; n: number }> = []
  for (const c of ranked) {
    if (picked.length === max || c.n / total < minShare) break
    // A near-duplicate of a picked colour adds to it instead.
    const near = picked.find((p) => dist(p.rgb, c.rgb) <= 55)
    if (near) near.n += c.n
    else picked.push({ rgb: c.rgb, n: c.n })
  }
  // Merging can reorder them.
  picked.sort((a, b) => b.n - a.n)
  return picked.map(({ rgb: [r, g, b], n }) => ({
    hex: toHex(r, g, b),
    share: n / total,
  }))
}

/** Hosts album artwork comes from; nothing else gets fetched. */
const ARTWORK_HOSTS = /(^|\.)(scdn\.co|mzstatic\.com|discogs\.com)$/

/** The album artwork's dominant colours, for theming stand mode. */
export async function sampleArtworkColors(
  imageUrl: string,
): Promise<Array<{ hex: string; share: number }>> {
  const url = new URL(imageUrl)
  if (url.protocol !== 'https:' || !ARTWORK_HOSTS.test(url.hostname))
    throw new Error('Not an artwork URL.')
  const res = await fetch(url, { headers: { 'User-Agent': 'Spinsight/0.1' } })
  if (!res.ok) throw new Error(`Couldn't fetch the artwork (${res.status}).`)
  const N = 96
  const { data } = await sharp(Buffer.from(await res.arrayBuffer()))
    .resize(N, N, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const pixels: Array<[number, number, number]> = []
  for (let i = 0; i < data.length; i += 3)
    pixels.push([data[i], data[i + 1], data[i + 2]])
  const dominant = dominantColors(pixels, 5, 0.03)
  // Vivid details (a prism on black, a busy painting) spread over too many
  // shades to rank above; gathered by hue they still count.
  const extra = vividColors(pixels).filter((v) =>
    dominant.every((d) => dist(hexRgb(d.hex), hexRgb(v.hex)) > 55),
  )
  return [...dominant, ...extra].sort((a, b) => b.share - a.share)
}

const hexRgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

/** The main saturated hues (12 bins) covering at least 0.5% of the image. */
function vividColors(
  pixels: Array<[number, number, number]>,
): Array<{ hex: string; share: number }> {
  const bins = Array.from({ length: 12 }, () => ({ n: 0, r: 0, g: 0, b: 0 }))
  for (const [r, g, b] of pixels) {
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    if (max < 64 || (max - min) / max < 0.4) continue
    const d = max - min
    const h =
      max === r
        ? ((g - b) / d + 6) % 6
        : max === g
          ? (b - r) / d + 2
          : (r - g) / d + 4
    const bin = bins[Math.floor(h * 2) % 12]
    bin.n++
    bin.r += r
    bin.g += g
    bin.b += b
  }
  return bins
    .filter((v) => v.n / pixels.length >= 0.005)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map((v) => ({
      hex: toHex(v.r / v.n, v.g / v.n, v.b / v.n),
      share: v.n / pixels.length,
    }))
}
