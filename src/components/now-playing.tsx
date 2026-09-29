import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { BookOpen, ChevronDown, Square } from 'lucide-react'
import { toast } from 'sonner'
import { VinylDisc } from '#/components/vinyl-disc'
import { Button } from '#/components/ui/button'
import { stopPlay } from '#/lib/collection.functions'
import { nowPlayingQuery, viewerQuery } from '#/lib/queries'
import { THEME_PRIORITY, useRecordTheme } from '#/lib/theme'
import type { NowPlaying } from '#/lib/records'
import { cn } from '#/lib/utils'

const COLLAPSE_KEY = 'spinsight-player-collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

/** Minutes since the needle dropped, ticking while mounted. */
function useElapsedMin(startedAt: string) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [])
  return {
    now,
    min: Math.max(
      0,
      Math.floor((now - new Date(startedAt).getTime()) / 60_000),
    ),
  }
}

/**
 * The record on the turntable, docked in the corner on every page (above the
 * tab bar on phones). While it's spinning, the whole app wears its colours.
 */
export function NowPlayingDock() {
  const { data: viewer } = useQuery(viewerQuery)
  const { data: playing } = useQuery({ ...nowPlayingQuery, enabled: !!viewer })
  // Client-only: it depends on the current time and localStorage.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted || !viewer || !playing) return null
  return (
    <Dock key={playing.playId} playing={playing} username={viewer.username} />
  )
}

function Dock({
  playing,
  username,
}: {
  playing: NowPlaying
  username: string
}) {
  const qc = useQueryClient()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [stopping, setStopping] = useState(false)
  const { now, min } = useElapsedMin(playing.startedAt)
  useRecordTheme(playing.look, THEME_PRIORITY.playing, playing.coverImage)

  // Past the runtime: let the server confirm it's over, then disappear.
  useEffect(() => {
    if (now > new Date(playing.endsAt).getTime()) {
      void qc.invalidateQueries({ queryKey: nowPlayingQuery.queryKey })
    }
  }, [now, playing.endsAt, qc])

  function setCollapsedPersist(v: boolean) {
    setCollapsed(v)
    try {
      localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0')
    } catch {
      // Not persisted in private mode; fine.
    }
  }

  async function done() {
    setStopping(true)
    try {
      await stopPlay({ data: { id: playing.playId } })
      await qc.invalidateQueries({ queryKey: nowPlayingQuery.queryKey })
      await qc.invalidateQueries({ queryKey: ['profile'] })
    } catch (e) {
      toast.error(`Couldn't stop: ${(e as Error).message}`)
      setStopping(false)
    }
  }

  const total = playing.durationSec
    ? Math.round(playing.durationSec / 60)
    : null
  const progress = total ? Math.min(1, min / total) : null
  const position =
    'fixed right-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 sm:right-5 sm:bottom-5'

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsedPersist(false)}
        className={cn(
          position,
          'size-14 rounded-full shadow-xl ring-2 ring-record-1 ring-offset-2 ring-offset-background',
        )}
        aria-label={`Now spinning: ${playing.title} by ${playing.artist}. Show player.`}
        title={`${playing.artist} – ${playing.title}`}
      >
        <VinylDisc
          look={playing.look}
          labelImage={playing.thumb}
          seed={playing.releaseId}
          spinning
          className="size-full"
        />
      </button>
    )
  }

  return (
    <section
      aria-label="Now spinning"
      className={cn(
        position,
        'left-3 flex items-center gap-3 rounded-2xl border bg-card/95 p-3 shadow-2xl backdrop-blur-md sm:left-auto sm:w-[23rem]',
        'rise-in',
      )}
    >
      <RecordLink
        playing={playing}
        username={username}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg"
      >
        {/* Sleeve with the disc half out of it, spinning. */}
        <div className="relative h-16 w-24 shrink-0">
          <VinylDisc
            look={playing.look}
            labelImage={playing.thumb}
            seed={playing.releaseId}
            spinning
            className="absolute top-0 left-7 size-16"
          />
          <div className="sleeve-shadow absolute top-0 left-0 size-16 overflow-hidden rounded-[2px] bg-muted">
            {playing.coverImage && (
              <img
                src={playing.coverImage}
                alt=""
                className="size-full object-cover"
              />
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[10px] font-medium tracking-[0.15em] text-record-1 uppercase">
            <Equalizer /> Now spinning
          </p>
          <p className="truncate text-sm leading-tight font-semibold">
            {playing.title}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {playing.artist}
          </p>
          <FriendsLine playing={playing} />
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              {progress != null && (
                <div
                  className="h-full rounded-full bg-record-1 transition-[width] duration-1000"
                  style={{ width: `${progress * 100}%` }}
                />
              )}
            </div>
            <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
              {total
                ? `${Math.min(min, total)} / ${total} min`
                : `${min} min in`}
            </span>
          </div>
        </div>
      </RecordLink>

      <div className="flex shrink-0 flex-col gap-1">
        <Button size="icon-sm" variant="ghost" asChild>
          <Link
            to="/listening"
            aria-label="Open the listening room"
            title="Listening room"
          >
            <BookOpen />
          </Link>
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => setCollapsedPersist(true)}
          aria-label="Minimise player"
        >
          <ChevronDown />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={done}
          disabled={stopping}
          aria-label="Done: back in the sleeve"
          title="Done"
        >
          <Square className="fill-current" />
        </Button>
      </div>
    </section>
  )
}

/** Friends' emoji on this spin, and whose spin it joined. */
function FriendsLine({ playing }: { playing: NowPlaying }) {
  const { along, reactions } = playing
  if (!along && !reactions.length) return null
  const names = reactions.map(
    (r) => `${r.displayName || r.username} ${r.emoji}`,
  )
  return (
    <p
      className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground"
      title={names.join(', ') || undefined}
    >
      {reactions.length > 0 && (
        <span className="shrink-0 tracking-tight">
          <span aria-hidden>
            {reactions
              .slice(-4)
              .map((r) => r.emoji)
              .join('')}
          </span>
          <span className="sr-only">Reactions: {names.join(', ')}</span>
        </span>
      )}
      {along && (
        <span className="truncate">
          with {along.displayName?.split(' ')[0] || along.username}
        </span>
      )}
    </p>
  )
}

/**
 * Opens the record's card on the owner's collection page. Plain wrapper when
 * the copy has left the collection, since there's no card to show.
 */
function RecordLink({
  playing,
  username,
  className,
  children,
}: {
  playing: NowPlaying
  username: string
  className?: string
  children: React.ReactNode
}) {
  if (playing.instanceId == null) {
    return <div className={className}>{children}</div>
  }
  return (
    <Link
      to="/u/$username"
      params={{ username }}
      search={{ open: playing.instanceId }}
      className={cn(
        className,
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
      )}
      aria-label={`${playing.title} by ${playing.artist}. Open record card.`}
    >
      {children}
    </Link>
  )
}

/** Three little bouncing bars. Static when reduced motion is on. */
export function Equalizer() {
  return (
    <span className="flex h-2.5 items-end gap-px" aria-hidden>
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="equalizer-bar w-0.5 rounded-full bg-record-1"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  )
}

/** Keeps page content from ending up under the dock. */
export function NowPlayingSpacer() {
  const { data: viewer } = useQuery(viewerQuery)
  const { data: playing } = useQuery({ ...nowPlayingQuery, enabled: !!viewer })
  return playing ? <div aria-hidden className="h-24" /> : null
}
