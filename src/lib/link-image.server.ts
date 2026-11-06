import { createHash } from 'node:crypto'
import { lookup } from 'node:dns'
import type { LookupAddress } from 'node:dns'
import https from 'node:https'
import { BlockList, isIP } from 'node:net'
import zlib from 'node:zlib'
import sharp from 'sharp'
import { env } from '#/lib/env.server'
import { db } from '#/lib/supabase.server'

// Covers and disc photos from a link the owner pastes: a shop's product page
// or a direct image. The chosen image is copied into Supabase Storage, so it
// doesn't depend on the shop keeping it online, is re-encoded (nothing but
// pixels survives), and can be sampled for the app tint like any other cover.

export const COVER_BUCKET = 'covers'

const MAX_PAGE_BYTES = 3_000_000
const MAX_IMAGE_BYTES = 15_000_000
const TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 4
const UA =
  'Mozilla/5.0 (compatible; Spinsight/0.1; +https://spinsight-app.vercel.app)'

// ---------- fetching only public addresses ----------

// The server fetches whatever link it's given, so it must not be pointed at
// internal hosts. Addresses are checked at connect time (inside `lookup`), so
// a DNS answer can't change between the check and the connection.
const blocked = new BlockList()
for (const [net, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 3],
] as const)
  blocked.addSubnet(net, bits, 'ipv4')
// IPv4-mapped IPv6 (::ffff:a.b.c.d) is matched against the IPv4 rules above;
// a ::ffff:0:0/96 rule here would also match every plain IPv4 address.
for (const [net, bits] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const)
  blocked.addSubnet(net, bits, 'ipv6')

const isPublic = (address: string, family: number) =>
  !blocked.check(address, family === 6 ? 'ipv6' : 'ipv4')

function publicLookup(
  hostname: string,
  options: object,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void,
) {
  lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '')
    const list = addresses
    if (!list.length || list.some((a) => !isPublic(a.address, a.family)))
      return callback(new Error('That link points somewhere private.'), '')
    if ((options as { all?: boolean }).all) callback(null, list)
    else callback(null, list[0].address, list[0].family)
  })
}

function checkUrl(raw: string | URL): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error("That doesn't look like a link.")
  }
  if (url.protocol !== 'https:')
    throw new Error('Only https:// links can be used.')
  if (url.username || url.password || (url.port && url.port !== '443'))
    throw new Error("That link can't be used.")
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const family = isIP(host)
  if (family && !isPublic(host, family))
    throw new Error('That link points somewhere private.')
  return url
}

type Fetched = { url: URL; contentType: string; body: Buffer }

/** GET over https from public addresses only, following a few redirects. */
async function safeGet(
  raw: string | URL,
  maxBytes: number,
  accept: string,
): Promise<Fetched> {
  let url = checkUrl(raw)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await getOnce(url, maxBytes, accept)
    if ('redirect' in res) {
      url = checkUrl(new URL(res.redirect, url))
      continue
    }
    return { url, ...res }
  }
  throw new Error('That link redirects too many times.')
}

function getOnce(
  url: URL,
  maxBytes: number,
  accept: string,
): Promise<{ redirect: string } | { contentType: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        lookup: publicLookup,
        timeout: TIMEOUT_MS,
        headers: {
          'User-Agent': UA,
          Accept: accept,
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'en',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume()
          return resolve({ redirect: res.headers.location })
        }
        if (status !== 200) {
          res.resume()
          return reject(
            new Error(
              status === 401 || status === 403 || status === 429
                ? `That site doesn't let Spinsight in (${status}). Try a link to the image itself, or another shop.`
                : `The site answered ${status}.`,
            ),
          )
        }
        if (Number(res.headers['content-length'] ?? 0) > maxBytes) {
          res.destroy()
          return reject(new Error('That file is too large.'))
        }
        const encoding = res.headers['content-encoding']
        const stream =
          encoding === 'gzip'
            ? res.pipe(zlib.createGunzip())
            : encoding === 'deflate'
              ? res.pipe(zlib.createInflate())
              : encoding === 'br'
                ? res.pipe(zlib.createBrotliDecompress())
                : res
        const chunks: Buffer[] = []
        let size = 0
        stream.on('data', (c: Buffer) => {
          size += c.length
          if (size > maxBytes) {
            req.destroy()
            reject(new Error('That file is too large.'))
          } else chunks.push(c)
        })
        stream.on('end', () =>
          resolve({
            contentType: String(res.headers['content-type'] ?? ''),
            body: Buffer.concat(chunks),
          }),
        )
        stream.on('error', reject)
      },
    )
    req.on('timeout', () => req.destroy(new Error('The site took too long.')))
    req.on('error', (e) =>
      reject(
        e.message.startsWith('That') || e.message.startsWith('The site')
          ? e
          : new Error(`Couldn't reach that site (${e.message}).`),
      ),
    )
  })
}

// ---------- finding the images on a page ----------

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#x2F;|&#47;/gi, '/')

const attr = (tag: string, name: string) =>
  tag
    .match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'))
    ?.slice(2)
    .find((v) => v != null)

/** Every `image` in the page's JSON-LD (schema.org Product, MusicAlbum…). */
function jsonLdImages(html: string): string[] {
  const out: string[] = []
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit)
    if (!node || typeof node !== 'object') return
    const o = node as Record<string, unknown>
    const add = (v: unknown): void => {
      if (typeof v === 'string') out.push(v)
      else if (Array.isArray(v)) v.forEach(add)
      else if (v && typeof v === 'object') {
        const img = v as Record<string, unknown>
        add(img.contentUrl ?? img.url)
      }
    }
    add(o.image)
    if (o['@graph']) visit(o['@graph'])
  }
  for (const m of html.matchAll(
    /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      visit(JSON.parse(m[1]))
    } catch {
      // A broken block on someone else's page; skip it.
    }
  }
  return out
}

/**
 * The product images a page declares for sharing and search: JSON-LD first
 * (shops list every product photo there, the vinyl included), then Open
 * Graph and Twitter cards. Not every <img>: that would be the whole shop.
 */
export function imagesInPage(html: string, base: URL): string[] {
  const found: string[] = [...jsonLdImages(html)]
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = (
      attr(m[0], 'property') ??
      attr(m[0], 'name') ??
      ''
    ).toLowerCase()
    if (/^(og:image(:secure_url|:url)?|twitter:image(:src)?)$/.test(key)) {
      const content = attr(m[0], 'content')
      if (content) found.push(content)
    }
  }
  for (const m of html.matchAll(/<link\b[^>]*>/gi))
    if (/^image_src$/i.test(attr(m[0], 'rel') ?? ''))
      found.push(attr(m[0], 'href') ?? '')

  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of found) {
    let url: URL
    try {
      url = new URL(decode(raw.trim()), base)
    } catch {
      continue
    }
    if (url.protocol === 'http:') url.protocol = 'https:'
    if (url.protocol !== 'https:') continue
    // Shopify serves one file under many `?v=`/`width=`: count it once.
    const key = url.origin + url.pathname
    if (seen.has(key)) continue
    seen.add(key)
    out.push(url.href)
  }
  return out.slice(0, 16)
}

/** The images behind a link: the image itself, or the ones its page lists. */
export async function findLinkImages(link: string): Promise<string[]> {
  if (/(^|\.)discogs\.com$/i.test(checkUrl(link).hostname))
    throw new Error(
      "This release's Discogs images are already in the list above. For other artwork, try a shop's or label's page.",
    )
  const page = await safeGet(
    link,
    MAX_PAGE_BYTES,
    'text/html,application/xhtml+xml,image/*;q=0.9,*/*;q=0.5',
  )
  if (page.contentType.startsWith('image/')) return [page.url.href]
  if (!/html|xml/.test(page.contentType))
    throw new Error("That link isn't a web page or an image.")
  const images = imagesInPage(page.body.toString('utf8'), page.url)
  if (!images.length)
    throw new Error(
      "Couldn't find any images on that page. Try a link to the image itself (right-click it → Copy image address).",
    )
  return images
}

// ---------- copying an image into storage ----------

export type StoredImage = {
  url: string
  thumb: string
  width: number
  height: number
}

/** Storage folder per user; files are `<instanceId>-<hash>-<w>x<h>[.thumb].jpg`. */
const prefixFor = (userId: string) => `${userId}/`

const publicUrl = (path: string) =>
  `${env.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${COVER_BUCKET}/${path}`

/** Downloads an image, re-encodes it and stores it for this copy. */
export async function storeLinkImage(
  imageUrl: string,
  userId: string,
  instanceId: number,
): Promise<StoredImage> {
  const img = await safeGet(imageUrl, MAX_IMAGE_BYTES, 'image/*')
  let full: { data: Buffer; info: { width: number; height: number } }
  let thumb: Buffer
  try {
    // `limitInputPixels` refuses decompression bombs.
    const source = () =>
      sharp(img.body, { limitInputPixels: 60_000_000 }).rotate()
    full = await source()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer({ resolveWithObject: true })
    thumb = await source()
      .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer()
  } catch {
    throw new Error("That link isn't an image Spinsight can read.")
  }
  const { width, height } = full.info
  if (width < 100 || height < 100)
    throw new Error('That image is too small to use.')

  const hash = createHash('sha256').update(full.data).digest('hex').slice(0, 16)
  const base = `${prefixFor(userId)}${instanceId}-${hash}-${width}x${height}`
  const bucket = db().storage.from(COVER_BUCKET)
  const opts = {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
    upsert: true,
  }
  const results = await Promise.all([
    bucket.upload(`${base}.jpg`, full.data, opts),
    bucket.upload(`${base}.thumb.jpg`, thumb, opts),
  ])
  const failed = results.find((r) => r.error)?.error
  if (failed) throw new Error(`Couldn't store the image: ${failed.message}`)
  return {
    url: publicUrl(`${base}.jpg`),
    thumb: publicUrl(`${base}.thumb.jpg`),
    width,
    height,
  }
}

/** Images already stored for this copy, newest first. */
export async function storedImagesFor(
  userId: string,
  instanceId: number,
): Promise<StoredImage[]> {
  const { data, error } = await db()
    .storage.from(COVER_BUCKET)
    .list(prefixFor(userId), {
      search: `${instanceId}-`,
      limit: 100,
      sortBy: { column: 'created_at', order: 'desc' },
    })
  // Before the bucket exists (migration 014), there's simply nothing stored.
  if (error) return []
  const out: StoredImage[] = []
  for (const f of data) {
    const m = f.name.match(/^(\d+)-[0-9a-f]+-(\d+)x(\d+)\.jpg$/)
    if (!m || Number(m[1]) !== instanceId) continue
    const path = prefixFor(userId) + f.name
    out.push({
      url: publicUrl(path),
      thumb: publicUrl(path.replace(/\.jpg$/, '.thumb.jpg')),
      width: Number(m[2]),
      height: Number(m[3]),
    })
  }
  return out
}

/** Removes every stored image of a user (account deletion). */
export async function deleteStoredImages(userId: string): Promise<void> {
  const bucket = db().storage.from(COVER_BUCKET)
  for (let round = 0; round < 50; round++) {
    const { data, error } = await bucket.list(prefixFor(userId), {
      limit: 1000,
    })
    if (error || !data.length) return
    const { error: removeError } = await bucket.remove(
      data.map((f) => prefixFor(userId) + f.name),
    )
    if (removeError) throw new Error(removeError.message)
  }
}
