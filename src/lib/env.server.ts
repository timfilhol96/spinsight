// Server-only configuration. Read lazily so a missing optional key (e.g.
// Spotify) only fails the feature that needs it, not the whole app.

function required(name: string): string {
  const v = process.env[name]
  if (!v)
    throw new Error(`Missing environment variable ${name}. See .env.example.`)
  return v
}

export const env = {
  get supabaseUrl() {
    return required('SUPABASE_URL')
  },
  get supabaseSecretKey() {
    return required('SUPABASE_SECRET_KEY')
  },
  get discogsConsumerKey() {
    return required('DISCOGS_CONSUMER_KEY')
  },
  get discogsConsumerSecret() {
    return required('DISCOGS_CONSUMER_SECRET')
  },
  get sessionSecret() {
    const v = required('SESSION_SECRET')
    if (v.length < 32)
      throw new Error('SESSION_SECRET must be at least 32 characters.')
    return v
  },
  get spotify() {
    const id = process.env.SPOTIFY_CLIENT_ID
    const secret = process.env.SPOTIFY_CLIENT_SECRET
    return id && secret ? { id, secret } : null
  },
  get cronSecret() {
    return process.env.CRON_SECRET ?? null
  },
  /** Public origin override, e.g. when running behind a tunnel. */
  get appUrl() {
    return process.env.APP_URL ?? null
  },
  get isProd() {
    return process.env.NODE_ENV === 'production'
  },
}
