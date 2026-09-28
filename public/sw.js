// Spinsight service worker. Deliberately small:
//  - hashed build assets: cache-first (they never change)
//  - album covers: stale-while-revalidate, capped
//  - page loads: network, falling back to an offline page
// Server functions, API routes and auth are never cached.
const VERSION = 'v1'
const STATIC = `spinsight-static-${VERSION}`
const COVERS = `spinsight-covers-${VERSION}`
const OFFLINE_URL = '/offline.html'
const COVER_HOSTS = [
  'i.scdn.co',
  'i.discogs.com',
  'mzstatic.com',
  'fonts.gstatic.com',
  'fonts.googleapis.com',
]
const MAX_COVERS = 400

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((c) => c.addAll([OFFLINE_URL, '/logo.svg', '/icon-192.png']))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => ![STATIC, COVERS].includes(k))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  for (const key of keys.slice(0, Math.max(0, keys.length - max)))
    await cache.delete(key)
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)))
    return
  }

  if (url.origin === location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            // Clone now: the page may consume the body before the cache opens.
            if (res.ok) {
              const copy = res.clone()
              caches.open(STATIC).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
    return
  }

  if (
    COVER_HOSTS.some(
      (h) => url.hostname === h || url.hostname.endsWith(`.${h}`),
    )
  ) {
    event.respondWith(
      caches.open(COVERS).then(async (cache) => {
        const hit = await cache.match(req)
        const network = fetch(req)
          .then((res) => {
            // Opaque (no-cors) image responses are fine to cache for <img>.
            if (res.ok || res.type === 'opaque') {
              cache.put(req, res.clone())
              trim(COVERS, MAX_COVERS)
            }
            return res
          })
          .catch(() => hit)
        return hit || network
      }),
    )
  }
})
