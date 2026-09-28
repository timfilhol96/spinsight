import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from '@tanstack/react-start'

// App-wide request middleware (TanStack Start picks up src/start.ts).

/**
 * Rejects cross-site calls to server functions and non-GET routes (e.g. the
 * sign-out POST). Plain page loads, the Discogs OAuth callback and Vercel's
 * cron are GETs from other origins, so they're left alone.
 */
const csrf = createCsrfMiddleware({
  filter: ({ handlerType, request }) =>
    handlerType === 'serverFn' || request.method !== 'GET',
})

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Location is only used by the picker's "Detect weather".
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
}

const securityHeaders = createMiddleware({ type: 'request' }).server(
  async ({ next }) => {
    const result = await next()
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      try {
        result.response.headers.set(name, value)
      } catch {
        // Some responses (e.g. proxied fetches) have immutable headers.
      }
    }
    return result
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [csrf, securityHeaders],
}))
