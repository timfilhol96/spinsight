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

/** Rows per request: Supabase's API sends at most 1,000 (its `max_rows`). */
export const PAGE_ROWS = 1000

/**
 * Every row a query matches. The API quietly stops at 1,000 rows per
 * response, so a bigger collection, play log or wantlist has to be read in
 * pages. `page(from, to)` builds the query and ends it with `.range(from, to)`;
 * it must be ordered by something unique (add the primary key as a last
 * order), or rows can repeat or go missing between pages.
 */
export async function selectAll<T = Record<string, unknown>>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null
    error: { message: string } | null
  }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await page(from, from + PAGE_ROWS - 1)
    if (error) return { data: rows, error }
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_ROWS) return { data: rows, error: null }
  }
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
  /** Friends can see what you're spinning. Missing before migration 006. */
  share_listening?: boolean
  preferred_currency: string | null
  /** Missing before migration 015. */
  secondary_currency?: string | null
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
