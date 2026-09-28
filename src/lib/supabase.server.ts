import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { env } from '#/lib/env.server'

// All database access goes through the server with the secret key. Every table
// has RLS enabled and no policies, so the public (anon) key can read nothing;
// authorisation is enforced in our server functions via the session.
let client: SupabaseClient | null = null

export function db(): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return client
}

export type UserRow = {
  id: string
  discogs_id: number
  discogs_username: string
  display_name: string | null
  avatar_url: string | null
  oauth_token: string
  oauth_token_secret: string
  is_public: boolean
  preferred_currency: string | null
  collection_value: CollectionValue | null
  last_synced_at: string | null
  created_at: string
}

export type CollectionValue = {
  minimum: string
  median: string
  maximum: string
  fetched_at: string
}
