import { getRequest, setResponseHeader } from '@tanstack/react-start/server'

// Server-Timing for slow-page hunting: each timed step shows up under the
// response's Timing tab in the browser's network panel (the page load itself
// for server-rendered pages). Entries are kept per request.
const entries = new WeakMap<Request, string[]>()

function record(name: string, ms: number) {
  try {
    const req = getRequest()
    const list = entries.get(req) ?? []
    list.push(`${name};dur=${ms.toFixed(1)}`)
    entries.set(req, list)
    setResponseHeader('Server-Timing', list.join(', '))
  } catch {
    // Outside a request (e.g. a script): nothing to report to.
  }
}

/** Runs `fn` and reports how long it took as `name` (a token: no spaces). */
export async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now()
  try {
    return await fn()
  } finally {
    record(name, performance.now() - start)
  }
}
