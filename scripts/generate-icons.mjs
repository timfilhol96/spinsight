// Renders public/logo.svg into the PNG icons the web manifest and iOS need.
// Run with: npm run icons
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'

const logo = await readFile(new URL('../public/logo.svg', import.meta.url))
const out = (name) => new URL(`../public/${name}`, import.meta.url).pathname
const CREAM = '#f3ebdd'

// Plain icons: the disc on transparent.
for (const size of [32, 192, 512]) {
  await sharp(logo, { density: 1200 }).resize(size, size).png().toFile(out(`icon-${size}.png`))
}

// Maskable + Apple touch: disc at ~70% on cream, so OS masks (circle, squircle)
// never crop it.
async function padded(size, name) {
  const inner = Math.round(size * 0.7)
  const disc = await sharp(logo, { density: 1200 }).resize(inner, inner).png().toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: CREAM } })
    .composite([{ input: disc, gravity: 'center' }])
    .png()
    .toFile(out(name))
}
await padded(512, 'icon-maskable-512.png')
await padded(180, 'apple-touch-icon.png')
console.log('icons written to public/')
