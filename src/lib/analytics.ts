import type { BeforeSendEvent } from '@vercel/analytics/react'

// Page views go to Vercel Web Analytics without saying whose collection was
// looked at: profile addresses lose their username, and query strings and
// hashes are dropped. The Privacy page describes exactly this, so keep the
// two in step.

const PROFILE_PATH = /^\/(u|friends)\/[^/]+/

export function redactUrl(raw: string): string {
  const url = new URL(raw)
  url.pathname = url.pathname.replace(PROFILE_PATH, '/$1/[username]')
  url.search = ''
  url.hash = ''
  return url.toString()
}

export function beforeSend(event: BeforeSendEvent): BeforeSendEvent {
  return { ...event, url: redactUrl(event.url) }
}
