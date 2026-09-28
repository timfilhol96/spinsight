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

  // Bucket pixels at 3 bits per channel, keeping running sums per bucket.
  const buckets = new Map<
    number,
    { n: number; r: number; g: number; b: number }
  >()
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - centreX, y - centreY) / rPx
      if (d < 0.42 || d > 0.94) continue // skip the label and the rim
      const i = (y * N + x) * 3
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
      const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5)
      const cur = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
      cur.n++
      cur.r += r
      cur.g += g
      cur.b += b
      buckets.set(key, cur)
    }
  }

  const total = [...buckets.values()].reduce((s, v) => s + v.n, 0)
  const ranked = [...buckets.values()]
    .map((v) => ({ n: v.n, rgb: [v.r / v.n, v.g / v.n, v.b / v.n] }))
    .sort((a, b) => b.n - a.n)
  const picked: number[][] = []
  for (const c of ranked) {
    if (picked.length === 3) break
    // Ignore specks (<4% of the ring) and near-duplicates of a picked colour.
    if (c.n / total < 0.04) break
    if (picked.every((p) => dist(p, c.rgb) > 55)) picked.push(c.rgb)
  }
  return { colors: picked.map(([r, g, b]) => toHex(r, g, b)), width, height }
}
