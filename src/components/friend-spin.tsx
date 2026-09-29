import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Disc3, Headphones } from 'lucide-react'
import { toast } from 'sonner'
import { Equalizer } from '#/components/now-playing'
import { VinylDisc } from '#/components/vinyl-disc'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import { logPlay } from '#/lib/collection.functions'
import { reactToPlay } from '#/lib/friends.functions'
import { REACTIONS, firstName, timeAgo } from '#/lib/friends'
import type { Friend, FriendSpin } from '#/lib/friends'
import { friendsQuery, nowPlayingQuery } from '#/lib/queries'
import { cn } from '#/lib/utils'

/** Ticks every 15 s so progress bars and "x min ago" stay fresh. */
export function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [])
  return now
}

export function FriendAvatar({
  friend,
  className,
}: {
  friend: { username: string; avatarUrl: string | null }
  className?: string
}) {
  return (
    <Avatar className={cn('size-9', className)}>
      <AvatarImage src={friend.avatarUrl ?? undefined} alt="" />
      <AvatarFallback className="text-xs">
        {friend.username.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  )
}

/** A friend's record on the turntable right now, Spotify friend-activity style. */
export function FriendSpinCard({
  friend,
  spin,
}: {
  friend: Friend
  spin: FriendSpin
}) {
  const now = useNow()
  const min = Math.max(
    0,
    Math.floor((now - new Date(spin.startedAt).getTime()) / 60_000),
  )
  const total = spin.durationSec ? Math.round(spin.durationSec / 60) : null
  const progress = total ? Math.min(1, min / total) : null

  return (
    <article className="rise-in flex flex-col gap-4 rounded-2xl border bg-card/80 p-4 sm:flex-row sm:items-center">
      {/* Sleeve with the disc half out of it, spinning. */}
      <div className="relative h-24 w-36 shrink-0">
        <VinylDisc
          look={spin.look}
          labelImage={spin.thumb}
          seed={spin.releaseId}
          spinning
          className="absolute top-0 left-12 size-24"
        />
        <div className="sleeve-shadow absolute top-0 left-0 size-24 overflow-hidden rounded-[2px] bg-muted">
          {spin.coverImage && (
            <img
              src={spin.coverImage}
              alt=""
              loading="lazy"
              className="size-full object-cover"
            />
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <Link
          to="/friends/$username"
          params={{ username: friend.username }}
          className="flex items-center gap-2 text-sm hover:underline"
        >
          <FriendAvatar friend={friend} className="size-6" />
          <span className="truncate font-semibold">
            {friend.displayName || friend.username}
          </span>
        </Link>
        <p className="mt-2 flex items-center gap-1.5 text-[10px] font-medium tracking-[0.15em] text-record-1 uppercase">
          <Equalizer /> Now spinning
        </p>
        <p className="truncate leading-tight font-semibold">{spin.title}</p>
        <p className="truncate text-sm text-muted-foreground">{spin.artist}</p>
        {spin.along && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Headphones className="size-3" /> Listening along with @{spin.along}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            {progress != null && (
              <div
                className="h-full rounded-full bg-record-1 transition-[width] duration-1000"
                style={{ width: `${progress * 100}%` }}
              />
            )}
          </div>
          <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
            {total ? `${Math.min(min, total)} / ${total} min` : `${min} min in`}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Reactions spin={spin} />
          <SpinAlong friend={friend} spin={spin} />
        </div>
      </div>
    </article>
  )
}

/** A row of emoji; yours is highlighted, counts show who else reacted. */
export function Reactions({ spin }: { spin: FriendSpin }) {
  const qc = useQueryClient()
  const [pending, setPending] = useState<string | null>(null)

  async function react(emoji: (typeof REACTIONS)[number]) {
    setPending(emoji)
    try {
      await reactToPlay({
        data: {
          playId: spin.playId,
          emoji: spin.myReaction === emoji ? null : emoji,
        },
      })
      await qc.invalidateQueries({ queryKey: friendsQuery.queryKey })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setPending(null)
    }
  }

  return (
    <ul className="flex flex-wrap gap-1" aria-label="React">
      {REACTIONS.map((emoji) => {
        const who = spin.reactions.filter((r) => r.emoji === emoji)
        const mine = spin.myReaction === emoji
        return (
          <li key={emoji}>
            <button
              type="button"
              onClick={() => react(emoji)}
              disabled={pending !== null}
              aria-pressed={mine}
              title={
                who.length
                  ? who.map((r) => r.displayName || r.username).join(', ')
                  : undefined
              }
              className={cn(
                'flex h-7 items-center gap-1 rounded-full border px-2 text-sm transition hover:border-record-1 disabled:opacity-60',
                mine ? 'border-record-1 bg-record-1/15' : 'bg-background/60',
                pending === emoji && 'animate-pulse',
              )}
            >
              <span aria-hidden>{emoji}</span>
              {who.length > 0 && (
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {who.length}
                </span>
              )}
              <span className="sr-only">
                {mine ? `Remove ${emoji}` : `React ${emoji}`}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** "Spin it too": log your own copy, noting whose spin you joined. */
export function SpinAlong({
  friend,
  spin,
}: {
  friend: Friend
  spin: FriendSpin
}) {
  const qc = useQueryClient()
  const { data: playing } = useQuery(nowPlayingQuery)
  const [pending, setPending] = useState(false)
  if (!spin.yourCopy) return null
  const copy = spin.yourCopy
  if (playing?.releaseId === copy.releaseId) {
    return (
      <span className="flex items-center gap-1 text-xs text-record-1">
        <Disc3 className="animate-spin-record size-3.5" /> On your turntable too
      </span>
    )
  }

  async function spinIt() {
    setPending(true)
    try {
      await logPlay({
        data: {
          releaseId: copy.releaseId,
          source: 'manual',
          context: { along: friend.username },
        },
      })
      await Promise.all([
        qc.invalidateQueries({ queryKey: nowPlayingQuery.queryKey }),
        qc.invalidateQueries({ queryKey: ['profile'] }),
        qc.invalidateQueries({ queryKey: friendsQuery.queryKey }),
      ])
      toast.success(`Spinning along with ${firstName(friend)}.`)
    } catch (e) {
      toast.error(`Couldn't log the play: ${(e as Error).message}`)
    } finally {
      setPending(false)
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={spinIt}
      disabled={pending}
      className="h-7 border-record-1/60"
      title={
        copy.releaseId === spin.releaseId
          ? 'You own this pressing'
          : 'You own another pressing of this album'
      }
    >
      <Disc3 className={pending ? 'animate-spin' : ''} /> Spin it too
    </Button>
  )
}

/** One line for a finished spin: "Kind of Blue · Miles Davis · 2 h ago". */
export function LastSpinLine({ spin }: { spin: FriendSpin }) {
  const now = useNow()
  return (
    <span className="flex min-w-0 items-center gap-2">
      {spin.thumb && (
        <img
          src={spin.thumb}
          alt=""
          loading="lazy"
          className="size-8 shrink-0 rounded-[2px] object-cover"
        />
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm">
          {spin.title}
          <span className="text-muted-foreground"> · {spin.artist}</span>
        </span>
        <span className="block text-xs text-muted-foreground">
          {timeAgo(spin.startedAt, now)}
          {spin.along && ` · with @${spin.along}`}
        </span>
      </span>
    </span>
  )
}
