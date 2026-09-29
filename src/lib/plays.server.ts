import { db } from '#/lib/supabase.server'
import { DEFAULT_RUNTIME_SEC } from '#/lib/records'
import type { NowPlaying, Reaction } from '#/lib/records'
import { parseVinylLook, withDiscPhoto } from '#/lib/vinyl-color'
import type { DiscPhoto, DiscogsFormat } from '#/lib/vinyl-color'

/** Leeway after the runtime for flipping sides and the run-out groove. */
const GRACE_SEC = 10 * 60

/** When an open play stops counting as "now playing". */
export function spinEndsAt(playedAt: string, durationSec: number | null) {
  const runtime = durationSec ?? DEFAULT_RUNTIME_SEC
  return new Date(playedAt).getTime() + (runtime + GRACE_SEC) * 1000
}

/** Friends' emoji on these plays, keyed by play id. Empty before migration 006. */
export async function reactionsFor(
  playIds: string[],
): Promise<Map<string, Array<Reaction & { userId: string }>>> {
  const out = new Map<string, Array<Reaction & { userId: string }>>()
  if (!playIds.length) return out
  const { data, error } = await db()
    .from('play_reactions')
    .select(
      'play_id, user_id, emoji, created_at, user:users!inner(discogs_username, display_name)',
    )
    .in('play_id', playIds)
    .order('created_at', { ascending: true })
  if (error) return out
  for (const r of data) {
    const u = r.user as unknown as {
      discogs_username: string
      display_name: string | null
    }
    const list = out.get(r.play_id as string) ?? []
    list.push({
      userId: r.user_id as string,
      username: u.discogs_username,
      displayName: u.display_name,
      emoji: r.emoji as string,
    })
    out.set(r.play_id as string, list)
  }
  return out
}

/** The friend whose spin this one joined ("Spin it too"), if any. */
export async function alongWithFor(
  context: unknown,
): Promise<NowPlaying['along']> {
  const username = (context as { along?: unknown } | null)?.along
  if (typeof username !== 'string' || !username) return null
  const { data } = await db()
    .from('users')
    .select('discogs_username, display_name')
    .ilike('discogs_username', username.replace(/[\\%_]/g, '\\$&'))
    .maybeSingle()
  return data
    ? { username: data.discogs_username, displayName: data.display_name }
    : { username, displayName: null }
}

/**
 * The record this user is spinning right now: their latest play that hasn't
 * been ended ("Done", or a newer play) and whose runtime hasn't run out.
 */
export async function nowPlayingFor(
  userId: string,
): Promise<NowPlaying | null> {
  const supabase = db()
  const { data: play } = await supabase
    .from('plays')
    .select(
      'id, played_at, context, release:releases!inner(id, title, artist_display, formats, cover_image, thumb, artwork_url, artwork_thumb, duration_sec)',
    )
    .eq('user_id', userId)
    .is('ended_at', null)
    .order('played_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!play) return null

  const rel = play.release as unknown as {
    id: number
    title: string
    artist_display: string
    formats: DiscogsFormat[]
    cover_image: string | null
    thumb: string | null
    artwork_url: string | null
    artwork_thumb: string | null
    duration_sec: number | null
  }
  const startedAt = new Date(play.played_at as string).getTime()
  const endsAt = spinEndsAt(play.played_at as string, rel.duration_sec)
  if (Date.now() > endsAt) return null

  // Respect a hand-picked cover for this user's copy.
  const [{ data: item }, reactions, along] = await Promise.all([
    supabase
      .from('collection_items')
      .select('instance_id, cover_url, cover_thumb, disc_photo, disc_colors')
      .eq('user_id', userId)
      .eq('release_id', rel.id)
      .limit(1)
      .maybeSingle(),
    reactionsFor([play.id as string]),
    alongWithFor(play.context),
  ])

  return {
    playId: play.id as string,
    releaseId: Number(rel.id),
    instanceId: item ? Number(item.instance_id) : null,
    title: rel.title,
    artist: rel.artist_display,
    look: withDiscPhoto(
      parseVinylLook(rel.formats),
      item?.disc_photo as DiscPhoto | null,
      item?.disc_colors as string[] | null,
    ),
    coverImage: item?.cover_url ?? rel.artwork_url ?? rel.cover_image,
    thumb: item?.cover_thumb ?? rel.artwork_thumb ?? rel.thumb,
    durationSec: rel.duration_sec,
    startedAt: new Date(startedAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    along,
    reactions: (reactions.get(play.id as string) ?? []).map(
      ({ userId: _, ...r }) => r,
    ),
  }
}

/** Only one record spins at a time: starting one ends the rest. */
export async function endOpenPlays(userId: string) {
  await db()
    .from('plays')
    .update({ ended_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('ended_at', null)
}
