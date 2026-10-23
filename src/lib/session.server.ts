import { getRequest, useSession } from '@tanstack/react-start/server'
import { env } from '#/lib/env.server'
import { db } from '#/lib/supabase.server'
import { timed } from '#/lib/timing.server'
import type { UserRow } from '#/lib/supabase.server'

type SessionData = {
  userId?: string
  /** Temporary OAuth request token, held between /start and /callback. */
  oauth?: {
    token: string
    secret: string
    returnTo: string
    /** Username from an invite link: new users follow them straight away. */
    invitedBy?: string
  }
}

// Encrypted, httpOnly cookie. Discogs is the only way in, so there is no
// password or email to manage — the session just remembers which user you are.
export function appSession() {
  // Not a React hook, despite the name.
  return useSession<SessionData>({
    password: env.sessionSecret,
    name: 'spinsight_session',
    maxAge: 60 * 60 * 24 * 90,
    cookie: { httpOnly: true, sameSite: 'lax', secure: env.isProd, path: '/' },
  })
}

// One lookup per request: a server-rendered page calls getViewer and then
// getProfile in the same request, and both want the signed-in user.
const usersByRequest = new WeakMap<Request, Promise<UserRow | null>>()

export function currentUser(): Promise<UserRow | null> {
  let req: Request | null = null
  try {
    req = getRequest()
  } catch {
    // Outside a request: no memo, just look it up.
  }
  const cached = req && usersByRequest.get(req)
  if (cached) return cached
  const lookup = timed('viewer', lookupUser)
  if (req) usersByRequest.set(req, lookup)
  return lookup
}

async function lookupUser(): Promise<UserRow | null> {
  const session = await appSession()
  const userId = session.data.userId
  if (!userId) return null
  const { data } = await db()
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  return (data as UserRow | null) ?? null
}

export async function requireUser(): Promise<UserRow> {
  const user = await currentUser()
  if (!user) throw new Error('Not signed in')
  return user
}
