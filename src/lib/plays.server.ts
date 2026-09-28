import { db } from '#/lib/supabase.server'
import type { NowPlaying } from '#/lib/records'
import { parseVinylLook, withDiscPhoto } from '#/lib/vinyl-color'
import type { DiscPhoto, DiscogsFormat } from '#/lib/vinyl-color'

/** Runtime assumed when a record's length is unknown (a typical LP). */
const DEFAULT_RUNTIME_SEC = 45 * 60
/** Leeway after the runtime for flipping sides and the run-out groove. */
const GRACE_SEC = 10 * 60

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
      'id, played_at, release:releases!inner(id, title, artist_display, formats, cover_image, thumb, artwork_url, artwork_thumb, duration_sec)',
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
  const runtime = rel.duration_sec ?? DEFAULT_RUNTIME_SEC
  const endsAt = startedAt + (runtime + GRACE_SEC) * 1000
  if (Date.now() > endsAt) return null

  // Respect a hand-picked cover for this user's copy.
  const { data: item } = await supabase
    .from('collection_items')
    .select('instance_id, cover_url, cover_thumb, disc_photo, disc_colors')
    .eq('user_id', userId)
    .eq('release_id', rel.id)
    .limit(1)
    .maybeSingle()

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
