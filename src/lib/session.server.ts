import { useSession } from '@tanstack/react-start/server'
import { env } from '#/lib/env.server'
import { db } from '#/lib/supabase.server'
import type { UserRow } from '#/lib/supabase.server'

type SessionData = {
  userId?: string
  /** Temporary OAuth request token, held between /start and /callback. */
  oauth?: { token: string; secret: string; returnTo: string }
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

export async function currentUser(): Promise<UserRow | null> {
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
