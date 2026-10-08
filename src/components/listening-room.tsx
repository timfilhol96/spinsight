import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ExternalLink,
  Maximize2,
  Minimize2,
  RefreshCw,
  SkipForward,
  X,
} from 'lucide-react'
import { Equalizer } from '#/components/now-playing'
import { VinylDisc } from '#/components/vinyl-disc'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import {
  getArtworkPalette,
  getLinerNotes,
  getTrackFacts,
} from '#/lib/listening.functions'
import type {
  CreditGroup,
  LinerNotes,
  LiveTrack,
  Popularity,
  Praise,
  Show,
  TrackFacts,
  WikiPage,
} from '#/lib/liner-notes'
import { formatDuration } from '#/lib/records'
import type { CollectionRecord, Play } from '#/lib/records'
import { shelfFacts } from '#/lib/shelf-facts'
import type { ShelfFacts } from '#/lib/shelf-facts'
import { THEME_PRIORITY, useRecordTheme } from '#/lib/theme'
import { artworkTheme } from '#/lib/vinyl-color'
import { buildSides, initialCursor, positionAt } from '#/lib/track-follower'
import type {
  Cursor,
  Position,
  Side,
  TimedTrack,
  TimingSource,
} from '#/lib/track-follower'
import { cn } from '#/lib/utils'

// The listening room: the record on the platter, full screen, with something
// to read while it plays: the track first, then the album, then the artist.
// It follows along track by track (an estimate the listener can correct) and
// has a lean-back "stand mode" for a phone or tablet propped up next to the
// turntable. Each fact is said once: what the header, the credits or the
// song already say isn't repeated further down.

type Props = {
  record: CollectionRecord
  records: CollectionRecord[]
  plays: Play[]
  /** When the needle dropped (ms). */
  startedAt: number
  /** The current time (ms). A prop so practice spins can fast-forward it. */
  now: number
  /** Shown as a badge: this spin isn't logged anywhere. */
  practice?: boolean
  onClose: () => void
  onPlayNext?: (record: CollectionRecord) => void
}

const mmss = (sec: number) => {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function ListeningRoom({
  record,
  records,
  plays,
  startedAt,
  now,
  practice,
  onClose,
  onPlayNext,
}: Props) {
  useRecordTheme(record.look, THEME_PRIORITY.focus, record.coverImage)
  const notes = useQuery({
    queryKey: ['liner-notes', record.releaseId],
    queryFn: () => getLinerNotes({ data: { releaseId: record.releaseId } }),
    staleTime: Infinity,
    retry: 1,
  })
  const { sides, timing, guessed } = useMemo(
    () =>
      buildSides(record.tracklist ?? [], {
        totalSec: record.durationSec,
        streaming: notes.data?.streaming,
      }),
    [record.tracklist, record.durationSec, notes.data?.streaming],
  )
  const follower = useFollower(sides, startedAt, now)
  const shelf = useMemo(
    () => shelfFacts(record, records, plays, startedAt),
    [record, records, plays, startedAt],
  )
  const [stand, setStand] = useState(false)

  // Full screen: the page underneath shouldn't scroll, and Esc leaves.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !stand) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, stand])

  const playing =
    follower.position?.state === 'playing' ? follower.position.track : null
  const trackNotes = playing ? notes.data?.tracks[playing.index] : undefined

  // The song's own facts, looked up as it comes on (the liner notes first,
  // so a split's track goes to the band on that side). The next one is
  // fetched ahead so it's there when the needle gets to it.
  const qc = useQueryClient()
  const trackFactsQuery = (t: TimedTrack | null) => {
    const artist =
      (t && notes.data?.tracks[t.index]?.artist) ??
      notes.data?.artist?.name ??
      record.artist
    return {
      queryKey: ['track-facts', artist, t?.title ?? ''],
      queryFn: () => getTrackFacts({ data: { artist, title: t?.title ?? '' } }),
      staleTime: Infinity,
      retry: 1,
    }
  }
  const trackFacts = useQuery({
    ...trackFactsQuery(playing),
    enabled: !!playing && !notes.isPending,
  })
  const nextTrack = playing
    ? follower.sides.flatMap((side) => side.tracks)[playing.index + 1]
    : undefined
  useEffect(() => {
    if (nextTrack && !notes.isPending)
      void qc.prefetchQuery(trackFactsQuery(nextTrack))
    // trackFactsQuery is rebuilt every render; the track is what matters.
  }, [nextTrack?.index, notes.isPending])

  const songPraise = trackFacts.data?.praise ?? []
  const albumPraise = withoutRepeats(notes.data?.praise ?? [], songPraise)

  if (stand)
    return (
      <StandMode
        record={record}
        follower={follower}
        praise={[...songPraise, ...albumPraise]}
        onExit={() => setStand(false)}
      />
    )

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={`Listening room: ${record.title} by ${record.artist}`}
      className="fixed inset-0 z-[60] overflow-x-hidden overflow-y-auto bg-background"
    >
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top_left,color-mix(in_oklab,var(--record-1)_30%,transparent),transparent_60%),radial-gradient(ellipse_at_bottom_right,color-mix(in_oklab,var(--record-2)_20%,transparent),transparent_55%)]"
      />
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/70 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="page-wrap flex h-14 items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X /> Close
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="kicker hidden sm:inline">Listening room</span>
            {practice && (
              <span className="rounded-full border border-dashed border-record-1/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                practice spin · not logged
              </span>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => {
              setStand(true)
              // Best effort: phones without the Fullscreen API still get the layout.
              document.documentElement.requestFullscreen?.().catch(() => {})
            }}
            className="bg-record-1 text-record-ink hover:bg-record-1/90"
          >
            <Maximize2 /> Stand mode
          </Button>
        </div>
      </header>

      <div className="page-wrap relative grid grid-cols-1 gap-10 pt-8 pb-32 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-14">
        <aside className="min-w-0 space-y-6 lg:sticky lg:top-22 lg:self-start">
          <Platter
            record={record}
            spinning={follower.position?.state === 'playing'}
            flips={follower.flips}
          />
          <div>
            <h1 className="font-display text-3xl leading-tight font-semibold">
              {record.title}
            </h1>
            <p className="text-lg text-muted-foreground">{record.artist}</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {[record.originalYear, formatDuration(record.durationSec)]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <NowCard follower={follower} />
          <TrackList
            follower={follower}
            timing={timing}
            guessed={guessed}
            streamingAlbum={notes.data?.streaming?.album ?? undefined}
          />
        </aside>

        <main className="min-w-0 space-y-12">
          {playing && (
            <TrackSection
              track={playing}
              notes={trackNotes}
              facts={trackFacts.data}
              albumCredits={notes.data?.credits ?? []}
              loading={notes.isPending || trackFacts.isPending}
            />
          )}
          {follower.position?.state === 'finished' &&
            shelf.upNext.length > 0 && (
              <UpNext shelf={shelf} onPlayNext={onPlayNext} highlight />
            )}
          {notes.isPending ? (
            <NotesSkeleton />
          ) : notes.isError ? (
            <p className="rounded-xl border bg-card/70 p-4 text-sm text-muted-foreground">
              Couldn't fetch the liner notes: {notes.error.message}
            </p>
          ) : (
            <>
              <AlbumSection
                record={record}
                notes={notes.data}
                praise={albumPraise}
              />
              <ArtistSection notes={notes.data} />
              <CreditsSection notes={notes.data} />
            </>
          )}
          <ShelfSection record={record} shelf={shelf} />
          {follower.position?.state !== 'finished' &&
            shelf.upNext.length > 0 && (
              <UpNext shelf={shelf} onPlayNext={onPlayNext} />
            )}
          <Sources record={record} notes={notes.data} track={trackFacts.data} />
        </main>
      </div>
    </div>
  )
}

// ---------- following along ----------

type Follower = {
  sides: Side[]
  position: Position | null
  /** False until the listener confirms where they are. */
  confirmed: boolean
  jumpTo: (track: TimedTrack) => void
  flip: () => void
  /** Skip to the next song; from the last one on a side, to the flip. */
  next: () => void
  /** Goes up by one each time the record is turned over. */
  flips: number
}

/** Length of the .flip-record animation; the new side starts after it. */
const FLIP_ANIM_MS = 1100

function useFollower(sides: Side[], startedAt: number, now: number): Follower {
  const [cursor, setCursor] = useState<Cursor | null>(null)
  const [flips, setFlips] = useState(0)
  // A guess until the listener says otherwise; re-guessed if the timings
  // change underneath it (streaming lengths arriving).
  const guess = useMemo(
    () => initialCursor(sides, startedAt, now),
    // Only when the tracklist or start changes, not every tick.
    [sides, startedAt],
  )
  const active = cursor ?? guess
  const position = sides.length ? positionAt(sides, active, now) : null
  const flip = () => {
    // The side's clock starts once the disc is back down on the platter.
    setCursor({ side: active.side + 1, offset: 0, at: now + FLIP_ANIM_MS })
    setFlips((n) => n + 1)
  }
  return {
    sides,
    position,
    confirmed: cursor != null,
    jumpTo: (track) => {
      const side = sides.findIndex((s) => s.tracks.includes(track))
      setCursor({ side, offset: track.start, at: now })
    },
    flip,
    flips,
    next: () => {
      if (position?.state === 'flip') return flip()
      if (position?.state !== 'playing') return
      const { side, track } = position
      const after = side.tracks[side.tracks.indexOf(track) + 1]
      setCursor({
        side: active.side,
        offset: after ? after.start : side.length,
        at: now,
      })
    },
  }
}

/**
 * The disc, turned over whenever `flips` goes up. It stops spinning while
 * it's in the air and picks up again once it's back on the platter.
 */
function FlippingDisc({
  record,
  spinning,
  flips,
  className,
}: {
  record: CollectionRecord
  spinning: boolean
  flips: number
  className?: string
}) {
  const [flipping, setFlipping] = useState(false)
  const [seen, setSeen] = useState(flips)
  if (flips !== seen) {
    setSeen(flips)
    setFlipping(true)
  }
  useEffect(() => {
    if (!flipping) return
    const id = setTimeout(() => setFlipping(false), FLIP_ANIM_MS)
    return () => clearTimeout(id)
  }, [flipping, flips])
  return (
    <div key={flips} className={cn(className, flipping && 'flip-record')}>
      <VinylDisc
        look={record.look}
        labelImage={record.thumb}
        seed={record.releaseId}
        spinning={spinning && !flipping}
        className="w-full"
      />
    </div>
  )
}

function Platter({
  record,
  spinning,
  flips,
  large,
}: {
  record: CollectionRecord
  spinning: boolean
  flips: number
  large?: boolean
}) {
  return (
    <div
      className={cn(
        'relative flex items-center',
        large ? 'w-full' : 'w-full max-w-sm',
      )}
    >
      <div className="sleeve-shadow relative z-10 aspect-square w-[62%] shrink-0 overflow-hidden rounded-[3px] bg-muted">
        {record.coverImage && (
          <img
            src={record.coverImage}
            alt=""
            className="size-full object-cover"
          />
        )}
      </div>
      <FlippingDisc
        record={record}
        spinning={spinning}
        flips={flips}
        className="-ml-[30%] w-[62%] shrink-0"
      />
    </div>
  )
}

function NowCard({ follower }: { follower: Follower }) {
  const p = follower.position
  if (!p)
    return (
      <p className="rounded-xl border bg-card/70 p-4 text-sm text-muted-foreground">
        Discogs has no tracklist for this record, so there's nothing to follow
        along with.
      </p>
    )
  if (p.state === 'flip')
    return (
      <div className="rise-in rounded-xl border-2 border-record-1 bg-card/90 p-4">
        <p className="kicker">Side {p.side.name} is over</p>
        <p className="mt-1 font-display text-2xl font-semibold">
          Flip to side {p.next.name}
        </p>
        <Button
          className="mt-3 bg-record-1 text-record-ink hover:bg-record-1/90"
          onClick={follower.flip}
        >
          <RefreshCw /> Flipped, side {p.next.name} is on
        </Button>
      </div>
    )
  if (p.state === 'finished')
    return (
      <div className="rounded-xl border bg-card/80 p-4">
        <p className="kicker">Run-out groove</p>
        <p className="mt-1 font-display text-2xl font-semibold">
          That's the end of the record
        </p>
      </div>
    )

  const { track, side } = p
  const next = side.tracks[side.tracks.indexOf(track) + 1]
  const nextSide = follower.sides[follower.sides.indexOf(side) + 1]
  return (
    <div className="rounded-xl border bg-card/80 p-4">
      <p className="kicker flex items-center gap-1.5">
        <Equalizer />
        {follower.confirmed ? 'Now playing' : 'Probably playing'} · side{' '}
        {side.name}
      </p>
      <p className="mt-1 text-xl leading-tight font-semibold">
        <span className="mr-2 font-mono text-sm text-muted-foreground">
          {track.position}
        </span>
        {track.title}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-record-1 transition-[width] duration-1000 ease-linear"
            style={{
              width: `${Math.min(100, (p.intoTrack / track.sec) * 100)}%`,
            }}
          />
        </div>
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {mmss(p.intoTrack)} / {mmss(track.sec)}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {next
          ? `Next: ${next.title}`
          : nextSide
            ? `Last track on side ${side.name}; then flip to side ${nextSide.name}`
            : 'Last track on the record'}
      </p>
    </div>
  )
}

const TIMING_NOTE: Record<TimingSource, string> = {
  discogs: 'Track times from Discogs.',
  spotify: 'Track times Discogs is missing come from Spotify',
  itunes: 'Track times Discogs is missing come from Apple Music',
  estimated:
    'No track times anywhere, so the runtime is split evenly: tap the song that is playing to keep in step.',
}

function TrackList({
  follower,
  timing,
  guessed,
  streamingAlbum,
}: {
  follower: Follower
  timing: TimingSource
  /** Tracks timed by guesswork, when the others are known. */
  guessed: number
  streamingAlbum?: string
}) {
  const p = follower.position
  const current = p?.state === 'playing' ? p.track : null
  const sideNow = p ? p.side : null
  if (!follower.sides.length) return null
  return (
    <div className="rounded-xl border bg-card/60 p-2">
      {follower.sides.map((side) => {
        const sideIdx = follower.sides.indexOf(side)
        const sideNowIdx = sideNow ? follower.sides.indexOf(sideNow) : -1
        return (
          <div key={side.name} className="py-1">
            <p className="kicker flex justify-between px-2 py-1.5">
              <span>Side {side.name}</span>
              <span>{mmss(side.length)}</span>
            </p>
            <ol>
              {side.tracks.map((t) => {
                const isNow = t === current
                const done =
                  sideIdx < sideNowIdx ||
                  (sideIdx === sideNowIdx &&
                    (p?.state !== 'playing' || t.start + t.sec <= p.intoSide))
                return (
                  <li key={t.index}>
                    <button
                      type="button"
                      onClick={() => follower.jumpTo(t)}
                      aria-current={isNow ? 'true' : undefined}
                      title="Playing this one? Tap to keep in step."
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted/70',
                        isNow && 'bg-record-1/15 font-semibold',
                        done && !isNow && 'text-muted-foreground/70',
                      )}
                    >
                      <span className="w-7 shrink-0 font-mono text-xs text-muted-foreground">
                        {isNow ? <Equalizer /> : t.position}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        {mmss(t.sec)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
        )
      })}
      <p className="px-2 pt-1 pb-1.5 text-[11px] text-muted-foreground">
        {TIMING_NOTE[timing]}
        {timing === 'spotify' || timing === 'itunes'
          ? streamingAlbum
            ? ` ("${streamingAlbum}").`
            : ', song by song.'
          : ''}
        {timing !== 'estimated' && guessed > 0
          ? ` ${guessed === 1 ? 'One track’s length is' : `${guessed} tracks’ lengths are`} a guess.`
          : ''}{' '}
        Tap a track to say where you are.
      </p>
    </div>
  )
}

// ---------- reading ----------

function Section({
  kicker,
  title,
  children,
}: {
  kicker: string
  title?: string
  children: React.ReactNode
}) {
  return (
    <section className="rise-in">
      <p className="kicker">{kicker}</p>
      {title && (
        <h2 className="mt-1 font-display text-2xl leading-tight font-semibold">
          {title}
        </h2>
      )}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}

function Paragraphs({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('space-y-3 leading-relaxed', className)}>
      {text
        .split(/\n+/)
        .filter((p) => p.trim())
        .map((p, i) => (
          <p key={i}>{p}</p>
        ))}
    </div>
  )
}

/** Lead paragraphs shown before the rest is folded: the later ones mostly recap the charts and awards. */
const LEAD_PARAGRAPHS = 2

/** The first part of `text`, with the rest behind a fold titled `more`. */
function Folded({
  text,
  keep,
  more,
  className,
}: {
  text: string
  keep: number
  more: string
  className?: string
}) {
  const paragraphs = text.split(/\n+/).filter((p) => p.trim())
  const rest = paragraphs.slice(keep)
  return (
    <>
      <Paragraphs
        text={paragraphs.slice(0, keep).join('\n')}
        className={className}
      />
      {rest.length > 0 && (
        <details className="group rounded-lg border bg-card/50">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium select-none">
            {more}
          </summary>
          <Paragraphs text={rest.join('\n')} className="px-3 pb-3 text-sm" />
        </details>
      )}
    </>
  )
}

/** Wikipedia's lead, then the longer sections folded away. */
function WikiBlock({ page }: { page: WikiPage }) {
  return (
    <>
      <Folded
        text={page.summary}
        keep={LEAD_PARAGRAPHS}
        more="More from the introduction"
      />
      {page.sections.map((s) => (
        <details key={s.heading} className="group rounded-lg border bg-card/50">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium select-none">
            {s.heading}
          </summary>
          <Paragraphs text={s.text} className="px-3 pb-3 text-sm" />
        </details>
      ))}
      <a
        href={page.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        Wikipedia{page.lang !== 'en' && ` (${page.lang.toUpperCase()})`}:{' '}
        {page.title} <ExternalLink className="size-3" />
      </a>
    </>
  )
}

/** Names compared loosely: "Ed O’Brien" and "Ed O'Brien" are one person. */
const nameKey = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/** Is each of `names` already credited under a role matching `role`? */
function allCredited(
  names: string[],
  groups: CreditGroup[],
  role: RegExp,
): boolean {
  const credited = groups
    .filter((g) => role.test(g.role))
    .flatMap((g) => g.names.map(nameKey))
  return (
    names.length > 0 &&
    names.every((n) =>
      credited.some((c) => c.includes(nameKey(n)) || nameKey(n).includes(c)),
    )
  )
}

/** "1.2M", "48K". */
const compact = (n: number) =>
  new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n)

/** "16 Dec 2025". */
const showDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

function listenersFact(stats: Popularity | null | undefined): Fact | null {
  if (!stats) return null
  return {
    text: `${compact(stats.listeners)} listeners · ${compact(stats.plays)} plays`,
    note: 'on Last.fm',
    href: stats.url || undefined,
  }
}

function liveFact(live: LiveTrack | null | undefined): Fact | null {
  if (!live) return null
  const last = live.last
  if (!live.played) return { text: `Not played at their last ${live.of} shows` }
  return {
    text:
      live.played === live.of
        ? `Played at every one of their last ${live.of} shows`
        : `Played at ${live.played} of their last ${live.of} shows`,
    note: last ? `last on ${showDate(last.date)}, ${last.place}` : undefined,
  }
}

type Fact = { text: string; note?: string; href?: string }

/** A row of short facts and numbers, under a section's title. */
function Facts({ facts }: { facts: Array<Fact | null> }) {
  const shown = facts.filter((f): f is Fact => !!f)
  if (!shown.length) return null
  return (
    <ul className="flex flex-wrap gap-1.5">
      {shown.map((f) => {
        const body = (
          <>
            <span className="font-medium">{f.text}</span>
            {f.note && <span className="text-muted-foreground"> {f.note}</span>}
          </>
        )
        return (
          <li
            key={f.text}
            className="rounded-full border bg-card/60 px-3 py-1 text-xs"
          >
            {f.href ? (
              <a
                href={f.href}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
                {body}
              </a>
            ) : (
              body
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** A source credit under a block of text: "Genius ↗". */
function SourceLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      {label} <ExternalLink className="size-3" />
    </a>
  )
}

function TrackSection({
  track,
  notes,
  facts,
  albumCredits,
  loading,
}: {
  track: TimedTrack
  notes: LinerNotes['tracks'][number] | undefined
  facts: TrackFacts | undefined
  /** Credited album-wide: not said again for each song. */
  albumCredits: CreditGroup[]
  loading: boolean
}) {
  const genius = facts?.genius
  const credits = [...(notes?.credits ?? [])]
  const allCredits = [...albumCredits, ...credits]
  // Genius fills in the writers and producers Discogs doesn't name.
  if (
    genius?.writers.length &&
    !allCredits.some((g) => /writ|compos|lyric/i.test(g.role))
  )
    credits.push({ role: 'Written by', names: genius.writers })
  if (
    genius?.producers.length &&
    !allCredited(genius.producers, allCredits, /^produce/i)
  )
    credits.push({ role: 'Produced by', names: genius.producers })
  // The album's sentences about the song add little next to its own story.
  const mentions = facts?.story ? [] : (notes?.mentions ?? [])
  const stats = [
    listenersFact(facts?.lastfm),
    liveFact(notes?.live),
    genius?.recordedAt ? { text: `Recorded at ${genius.recordedAt}` } : null,
  ]
  const hasAny =
    !!facts?.story ||
    mentions.length > 0 ||
    credits.length > 0 ||
    (facts?.praise.length ?? 0) > 0 ||
    (genius?.connections.length ?? 0) > 0 ||
    stats.some(Boolean)
  return (
    <Section kicker={`On the platter · ${track.position}`} title={track.title}>
      {loading ? (
        <Skeleton className="h-16 w-full" />
      ) : !hasAny ? (
        <p className="text-sm text-muted-foreground">
          Nothing written about this track that we could find. Just listen.
        </p>
      ) : (
        <>
          <Facts facts={stats} />
          {facts && facts.praise.length > 0 && (
            <Highlights praise={facts.praise} />
          )}
          {facts?.story && (
            <div className="space-y-2">
              <Paragraphs text={facts.story.text} />
              <SourceLink
                href={facts.story.url}
                label={
                  facts.story.source === 'Wikipedia' && facts.wiki
                    ? `Wikipedia: ${facts.wiki.title}`
                    : facts.story.source
                }
              />
            </div>
          )}
          {mentions.map((m) => (
            <blockquote
              key={m}
              className="border-l-2 border-record-1 pl-3 leading-relaxed"
            >
              {m}
            </blockquote>
          ))}
          {genius && genius.connections.length > 0 && (
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {genius.connections.map((c) => (
                <div key={c.label}>
                  <dt className="text-xs text-muted-foreground">{c.label}</dt>
                  <dd>
                    {c.songs.length ? (
                      <>
                        {c.songs.join(', ')}
                        {c.more > 0 && (
                          <span className="text-muted-foreground">
                            {' '}
                            and {c.more} more
                          </span>
                        )}
                      </>
                    ) : (
                      // Only lesser-known ones: a count says enough.
                      `${c.more} ${c.label === 'Covered by' ? (c.more === 1 ? 'artist' : 'artists') : c.more === 1 ? 'song' : 'songs'}`
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {credits.length > 0 && <Credits groups={credits} />}
        </>
      )}
    </Section>
  )
}

function AlbumSection({
  record,
  notes,
  praise,
}: {
  record: CollectionRecord
  notes: LinerNotes
  /** The album's praise, less what the song playing already shows. */
  praise: Praise[]
}) {
  const facts = notes.albumFacts
  // Laid out like the credits: a label over each value. The producers and
  // studios go when the credits name them anyway; the length is in the header.
  const factGroups: CreditGroup[] = facts
    ? [
        { role: 'Recorded', names: facts.recorded },
        {
          role: facts.studios.length > 1 ? 'Studios' : 'Studio',
          names: allCredited(facts.studios, notes.companies, /record|studio/i)
            ? []
            : facts.studios,
        },
        {
          role: facts.producers.length > 1 ? 'Producers' : 'Producer',
          names: allCredited(facts.producers, notes.credits, /^produce/i)
            ? []
            : facts.producers,
        },
      ].filter((g) => g.names.length)
    : []
  if (
    !notes.wiki.album &&
    !notes.notes &&
    !factGroups.length &&
    !praise.length &&
    !notes.lastfm
  )
    return null
  return (
    <Section kicker="The record" title={record.title}>
      <Facts facts={[listenersFact(notes.lastfm)]} />
      {praise.length > 0 && <Highlights praise={praise} />}
      {factGroups.length > 0 && <Credits groups={factGroups} />}
      {notes.wiki.album && <WikiBlock page={notes.wiki.album} />}
      {notes.notes && (
        <div className="rounded-xl border bg-card/60 p-4">
          <p className="kicker mb-2">Notes on this pressing (Discogs)</p>
          <div className="space-y-2">
            {/* Often runs to catalogue numbers and publishing lines. */}
            <Folded
              text={notes.notes}
              keep={1}
              more="All the pressing notes"
              className="text-sm"
            />
          </div>
        </div>
      )}
    </Section>
  )
}

function ArtistSection({ notes }: { notes: LinerNotes }) {
  const a = notes.artist
  if (!a && !notes.wiki.artist) return null
  // Chips only add something when the summary doesn't name everyone
  // already ("Phil Selway" is named as "Philip Selway").
  const words = nameKey(notes.wiki.artist?.summary ?? a?.profile ?? '').split(
    ' ',
  )
  const named = (name: string) =>
    nameKey(name)
      .split(' ')
      .every((t) => words.some((w) => w.startsWith(t)))
  const members = (a?.members ?? []).every((m) => named(m.name))
    ? []
    : (a?.members ?? [])
  const facts = a?.facts
  const last: Show | null | undefined = a?.live?.last
  return (
    <Section kicker="The artist" title={a?.name ?? notes.wiki.artist?.title}>
      <Facts
        facts={[
          facts?.origin ? { text: `From ${facts.origin}` } : null,
          facts?.yearsActive
            ? { text: facts.yearsActive, note: 'active' }
            : null,
          facts?.genres.length ? { text: facts.genres.join(', ') } : null,
          listenersFact(a?.lastfm),
          a?.live
            ? {
                text: `${a.live.shows.toLocaleString('en-US')} shows`,
                note: last
                  ? `on setlist.fm · latest ${showDate(last.date)}, ${last.place}${last.tour ? ` (${last.tour})` : ''}`
                  : 'on setlist.fm',
                href: a.live.url,
              }
            : null,
        ]}
      />
      {/* A summary, not the whole article: the record comes first. */}
      {notes.wiki.artist ? (
        <WikiBlock page={notes.wiki.artist} />
      ) : (
        a?.profile && (
          <>
            <Paragraphs text={a.profile} />
            {a.discogsUrl && <SourceLink href={a.discogsUrl} label="Discogs" />}
          </>
        )
      )}
      {members.length > 0 && (
        <div>
          <p className="kicker mb-2">Members</p>
          <ul className="flex flex-wrap gap-1.5">
            {members.map((m) => (
              <li
                key={m.name}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs',
                  !m.active &&
                    'text-muted-foreground line-through decoration-muted-foreground/40',
                )}
                title={m.active ? 'Current member' : 'Former member'}
              >
                {m.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  )
}

// ---------- praise ----------

/** Praise compared without "for “Get Lucky”": the album's award for a single is the single's too. */
const praiseKey = (p: Praise) => nameKey(p.text.replace(/ for “[^”]*”/, ''))

/** The album's praise less what the song playing already shows. */
function withoutRepeats(album: Praise[], song: Praise[]): Praise[] {
  const said = new Set(song.map(praiseKey))
  return album.filter((p) => !said.has(praiseKey(p)))
}

/** Critics' lists and ratings named per card; the rest of the list is stand mode's. */
const MAX_CARD_LINES = 3

type Card = {
  label: string
  /** Each on its own line, set large. */
  lines: string[]
  /** Smaller, under the lines. */
  detail?: string
  quote?: boolean
}

/** "Won · Album of the Year, Grammy Awards 2014" → won, "Album of the Year", "2014". */
function awardParts(p: Praise) {
  const won = p.text.startsWith('Won')
  const rest = p.text.replace(/^(Won|Nominated) · /, '')
  const at = rest.lastIndexOf(`, ${p.by}`)
  const tail = at >= 0 ? rest.slice(at + 2) : rest
  return {
    won,
    category: at >= 0 ? rest.slice(0, at) : null,
    year: /\b\d{4}$/.exec(tail)?.[0] ?? '',
  }
}

/**
 * The praise as a handful of cards: a night of five Grammys is one card,
 * the chart peaks another, and only the best quote. Stand mode shows every
 * piece, one at a time.
 */
function highlightCards(praise: Praise[]): Card[] {
  const cards: Card[] = []
  const awards = new Map<string, Card>()
  for (const p of praise.filter((x) => x.kind === 'award')) {
    const { won, category, year } = awardParts(p)
    const head = `${won ? 'Won' : 'Nominated'} · ${p.by}${year ? ` ${year}` : ''}`
    const card = awards.get(head) ?? { label: 'Awards', lines: [head] }
    if (category)
      card.detail = card.detail ? `${card.detail} · ${category}` : category
    if (!awards.has(head)) cards.push(card)
    awards.set(head, card)
  }
  const ofKind = (kind: Praise['kind']) => praise.filter((p) => p.kind === kind)
  const lists = ofKind('accolade')
  if (lists.length)
    cards.push({
      label: "Critics' lists",
      lines: lists.slice(0, MAX_CARD_LINES).map((p) => `${p.text} — ${p.by}`),
    })
  for (const p of ofKind('certification'))
    cards.push({ label: 'Certified', lines: p.text.split(' · '), detail: p.by })
  const charts = ofKind('chart')
  if (charts.length)
    cards.push({
      label: 'Chart peak',
      lines: charts.map((p) => p.text.replace(' · ', ' in ')),
      detail: charts[0].by,
    })
  const quote = ofKind('quote')[0] as Praise | undefined
  if (quote)
    cards.push({
      label: 'Reviews',
      lines: [quote.text],
      detail: `${quote.by}${quote.score ? ` · ${quote.score}` : ''}`,
      quote: true,
    })
  const ratings = ofKind('rating')
  if (ratings.length)
    cards.push({
      label: 'Rated',
      lines: ratings.slice(0, MAX_CARD_LINES).map((p) => `${p.text} · ${p.by}`),
    })
  return cards
}

/** Awards, lists, charts and the best review, as a few cards. */
function Highlights({ praise }: { praise: Praise[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {highlightCards(praise).map((c) => (
        <li
          key={`${c.label}${c.lines[0]}`}
          className={cn(
            'rounded-xl border bg-card/60 p-3',
            c.quote && 'sm:col-span-2',
          )}
        >
          <p className="kicker mb-1">{c.label}</p>
          {c.quote ? (
            <blockquote className="font-display text-lg leading-snug italic">
              “{c.lines[0]}”
            </blockquote>
          ) : (
            c.lines.map((l) => (
              <p key={l} className="text-sm leading-snug font-medium">
                {l}
              </p>
            ))
          )}
          {c.detail && (
            <p className="mt-1 text-xs text-muted-foreground">
              {c.quote ? '— ' : ''}
              {c.detail}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}

function Credits({ groups }: { groups: CreditGroup[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {groups.map((g) => (
        <div key={g.role}>
          <dt className="text-xs text-muted-foreground">{g.role}</dt>
          <dd>{g.names.join(', ')}</dd>
        </div>
      ))}
    </dl>
  )
}

function CreditsSection({ notes }: { notes: LinerNotes }) {
  if (!notes.credits.length && !notes.companies.length && !notes.runout.length)
    return null
  return (
    <Section kicker="Credits" title="Who made it">
      {notes.credits.length > 0 && (
        <>
          <Credits groups={notes.credits} />
          {notes.creditsFrom !== 'this pressing' && (
            <p className="text-xs text-muted-foreground">
              Your pressing lists no credits; these are from {notes.creditsFrom}
              .
            </p>
          )}
        </>
      )}
      {notes.companies.length > 0 && (
        <div>
          <p className="kicker mb-2">Studios, plants and companies</p>
          <Credits groups={notes.companies} />
        </div>
      )}
      {notes.runout.length > 0 && (
        <details className="rounded-lg border bg-card/50">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium select-none">
            Check your copy's run-out etchings
          </summary>
          <ul className="space-y-1 px-3 pb-3 font-mono text-xs">
            {notes.runout.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>
      )}
    </Section>
  )
}

function Mini({ record }: { record: CollectionRecord }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="sleeve-shadow aspect-square overflow-hidden rounded-[2px] bg-muted">
        {record.thumb && (
          <img
            src={record.thumb}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        )}
      </div>
      <p className="truncate text-xs font-medium">{record.title}</p>
      <p className="-mt-1.5 truncate text-[11px] text-muted-foreground">
        {record.artist}
      </p>
    </div>
  )
}

function ShelfSection({
  record,
  shelf,
}: {
  record: CollectionRecord
  shelf: ShelfFacts
}) {
  return (
    <Section kicker="Your shelf" title="You and this record">
      <ul className="space-y-1.5 leading-relaxed">
        {[...shelf.history, ...shelf.copy].map((f) => (
          <li key={f} className="flex gap-2">
            <span
              aria-hidden
              className="mt-2.5 size-1.5 shrink-0 rounded-full bg-record-1"
            />
            {f}
          </li>
        ))}
      </ul>
      {shelf.connections.map((c) => (
        <div key={c.label} className="pt-2">
          <p className="kicker mb-2">{c.label}</p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {c.records.map((r) => (
              <Mini key={r.instanceId} record={r} />
            ))}
          </div>
        </div>
      ))}
      {!shelf.connections.length && (
        <p className="text-sm text-muted-foreground">
          Nothing else on your shelf shares an artist, label, year or style with{' '}
          {record.title}.
        </p>
      )}
    </Section>
  )
}

function UpNext({
  shelf,
  onPlayNext,
  highlight,
}: {
  shelf: ShelfFacts
  onPlayNext?: (r: CollectionRecord) => void
  highlight?: boolean
}) {
  return (
    <Section
      kicker="Up next"
      title={highlight ? 'What to put on next' : undefined}
    >
      {!highlight && (
        <p className="text-sm text-muted-foreground">
          Same styles, and you haven't played them in a while.
        </p>
      )}
      <ul className="grid gap-2 sm:grid-cols-3">
        {shelf.upNext.map((r) => (
          <li
            key={r.instanceId}
            className="flex items-center gap-3 rounded-xl border bg-card/70 p-2"
          >
            <div className="sleeve-shadow size-14 shrink-0 overflow-hidden rounded-[2px] bg-muted">
              {r.thumb && (
                <img src={r.thumb} alt="" className="size-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{r.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {r.artist}
              </p>
              {onPlayNext && (
                <button
                  type="button"
                  onClick={() => onPlayNext(r)}
                  className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-record-1 hover:underline"
                >
                  <SkipForward className="size-3" /> Spin this next
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function Sources({
  record,
  notes,
  track,
}: {
  record: CollectionRecord
  notes?: LinerNotes
  track?: TrackFacts
}) {
  const used = [
    (notes?.wiki.album || notes?.wiki.artist || track?.wiki) &&
      'Wikipedia (text under CC BY-SA 4.0)',
    track?.genius && 'Genius',
    (notes?.lastfm || notes?.artist?.lastfm || track?.lastfm) && 'Last.fm',
    notes?.artist?.live && 'setlist.fm',
    notes?.streaming &&
      `track times from ${notes.streaming.source === 'spotify' ? 'Spotify' : 'Apple Music'}`,
  ].filter(Boolean)
  return (
    <footer className="border-t pt-4 text-xs text-muted-foreground">
      Sources:{' '}
      <a
        className="underline hover:text-foreground"
        href={`https://www.discogs.com/release/${record.releaseId}`}
        target="_blank"
        rel="noreferrer"
      >
        Discogs
      </a>
      {used.map((u) => `, ${u}`).join('')}.
    </footer>
  )
}

function NotesSkeleton() {
  return (
    <div className="space-y-3" aria-label="Pulling the liner notes">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <p className="text-xs text-muted-foreground">Pulling the liner notes…</p>
    </div>
  )
}

// ---------- stand mode ----------

/** How long each piece of praise stays up. */
const PRAISE_MS = 20_000

/** What each kind of praise is, said above it so it reads from the sofa. */
const PRAISE_LABEL: Record<Praise['kind'], string | null> = {
  award: 'Awards',
  accolade: "Critics' lists",
  certification: 'Certified',
  chart: 'Chart peak',
  quote: null,
  rating: 'Rated',
}

/**
 * One piece of praise for stand mode. Quotes are set as quotes; everything
 * else is a fact, set upright with each " · " part on its own line.
 */
function PraiseFigure({ praise }: { praise: Praise }) {
  if (praise.kind === 'quote')
    return (
      <figure>
        <blockquote className="font-display text-2xl leading-snug text-balance italic md:text-3xl">
          “{praise.text}”
        </blockquote>
        <figcaption className="mt-3 text-sm text-muted-foreground">
          — {praise.by}
          {praise.score ? ` · ${praise.score}` : ''}
        </figcaption>
      </figure>
    )
  const label = PRAISE_LABEL[praise.kind]
  return (
    <figure>
      {label && (
        <p className="kicker mb-2">
          {label}
          {praise.song && ` · ${praise.song}`}
        </p>
      )}
      <div
        className={cn(
          'font-display leading-snug font-semibold text-balance',
          praise.kind === 'rating'
            ? 'text-4xl md:text-6xl'
            : 'text-2xl md:text-3xl',
        )}
      >
        {praise.text.split(' · ').map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
      {/* An award's body is already in its text. */}
      {praise.kind !== 'award' && (
        <figcaption className="mt-3 text-sm text-muted-foreground">
          {praise.kind === 'accolade' || praise.kind === 'rating' ? '— ' : ''}
          {praise.by}
        </figcaption>
      )}
    </figure>
  )
}

/** Smallest the stand-mode text may shrink to fit: still readable on a phone. */
const MIN_FIT = 0.5

/**
 * Shrinks `inner` (via CSS zoom) until it fits in `outer`. On a phone a long
 * accolade would otherwise push the record's name off the top of the screen
 * and its own end off the bottom. Starts again at full size whenever
 * `content` or the window size changes. Measures `inner`'s own box rather than
 * `outer`'s scrollHeight, which also counts the praise sliding in from below
 * and would shrink the text for nothing.
 */
function useFitScale(
  outer: React.RefObject<HTMLElement | null>,
  inner: React.RefObject<HTMLElement | null>,
  content: unknown[],
): number {
  const [scale, setScale] = useState(1)
  const [size, setSize] = useState(0)
  useEffect(() => {
    const onResize = () => setSize((n) => n + 1)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useLayoutEffect(() => setScale(1), [size, ...content])
  // Runs after each render, before paint: steps down until nothing overflows.
  useLayoutEffect(() => {
    const box = outer.current
    const el = inner.current
    if (
      box &&
      el &&
      el.getBoundingClientRect().height > box.clientHeight + 1 &&
      scale > MIN_FIT
    )
      setScale((s) => Math.max(MIN_FIT, Math.round((s - 0.05) * 100) / 100))
  })
  return scale
}

function useWakeLock() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let released = false
    const request = () => {
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (released) void l.release()
          else lock = l
        })
        .catch(() => {})
    }
    request()
    // The lock drops when the tab is hidden; take it again on return.
    const onVisible = () => {
      if (document.visibilityState === 'visible') request()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [])
}

function StandMode({
  record,
  follower,
  praise,
  onExit,
}: {
  record: CollectionRecord
  follower: Follower
  praise: Praise[]
  onExit: () => void
}) {
  useWakeLock()
  // The whole screen takes the album artwork's colours.
  const palette = useQuery({
    queryKey: ['artwork-palette', record.coverImage],
    queryFn: () => getArtworkPalette({ data: { url: record.coverImage! } }),
    enabled: !!record.coverImage,
    staleTime: Infinity,
    retry: false,
  })
  const colors = palette.data ? artworkTheme(palette.data) : null
  const p = follower.position
  const [praiseIdx, setPraiseIdx] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setPraiseIdx((i) => i + 1), PRAISE_MS)
    return () => clearInterval(id)
  }, [praiseIdx])
  // A new song starts with its own praise, which comes first in the list.
  const trackIdx = p?.state === 'playing' ? p.track.index : -1
  useEffect(() => setPraiseIdx(0), [trackIdx])
  const shown = praise.length ? praise[praiseIdx % praise.length] : null
  const textBox = useRef<HTMLDivElement>(null)
  const textInner = useRef<HTMLDivElement>(null)
  const fit = useFitScale(textBox, textInner, [
    shown,
    p?.state,
    p?.state === 'playing' ? p.track.title : null,
  ])

  function exit() {
    if (document.fullscreenElement)
      void document.exitFullscreen().catch(() => {})
    onExit()
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit()
    }
    // Leaving browser fullscreen (Esc, swipe) leaves stand mode too.
    const onFs = () => {
      if (!document.fullscreenElement) onExit()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onFs)
    }
  }, [onExit])

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={`Stand mode: ${record.title}`}
      className="fixed inset-0 z-[70] overflow-hidden bg-background text-foreground transition-colors duration-700"
      style={colors as React.CSSProperties | undefined}
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,color-mix(in_oklab,var(--record-1)_30%,transparent),transparent_65%),radial-gradient(circle_at_80%_90%,color-mix(in_oklab,var(--record-2)_20%,transparent),transparent_60%)]"
      />
      <div className="relative flex h-full flex-col gap-6 p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] landscape:flex-row landscape:items-center landscape:gap-12 landscape:px-12 md:p-12">
        <div className="mx-auto w-[min(64vw,36vh)] shrink-0 landscape:mx-0 landscape:w-[min(42vw,78vh)]">
          <FlippingDisc
            record={record}
            spinning={p?.state === 'playing'}
            flips={follower.flips}
            className="w-full drop-shadow-2xl"
          />
        </div>

        <div
          ref={textBox}
          className="flex min-h-0 min-w-0 flex-1 flex-col justify-center-safe overflow-hidden landscape:self-stretch"
        >
          <div
            ref={textInner}
            className="flex flex-col gap-6 md:gap-10"
            style={fit < 1 ? { zoom: fit } : undefined}
          >
            <div>
              <p className="kicker">
                {record.artist} · {record.title}
              </p>
              {p?.state === 'playing' ? (
                <>
                  <p className="mt-2 font-display text-4xl leading-[1.05] font-semibold text-balance md:text-6xl">
                    {p.track.title}
                  </p>
                  <div className="mt-4 flex max-w-lg items-center gap-3">
                    <span className="font-mono text-sm text-muted-foreground">
                      {p.track.position}
                    </span>
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/10">
                      <div
                        className="h-full rounded-full bg-record-1 transition-[width] duration-1000 ease-linear"
                        style={{
                          width: `${Math.min(100, (p.intoTrack / p.track.sec) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      {mmss(p.track.sec - p.intoTrack)} left
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={follower.next}
                      aria-label="Skip to the next song"
                      title="Skip to the next song"
                    >
                      <SkipForward />
                    </Button>
                  </div>
                </>
              ) : p?.state === 'flip' ? (
                <div className="mt-2">
                  <p className="font-display text-4xl font-semibold md:text-6xl">
                    Flip to side {p.next.name}
                  </p>
                  <Button
                    size="lg"
                    className="mt-4 bg-record-1 text-record-ink hover:bg-record-1/90"
                    onClick={follower.flip}
                  >
                    <RefreshCw /> Flipped
                  </Button>
                </div>
              ) : (
                <p className="mt-2 font-display text-4xl font-semibold md:text-6xl">
                  {p?.state === 'finished' ? 'Needle up' : record.title}
                </p>
              )}
            </div>

            {shown && (
              <button
                type="button"
                key={praiseIdx}
                onClick={() => setPraiseIdx((i) => i + 1)}
                className="rise-in max-w-2xl text-left"
                title={praise.length > 1 ? 'Next' : undefined}
              >
                <PraiseFigure praise={shown} />
              </button>
            )}
          </div>
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={exit}
        className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 opacity-60 hover:opacity-100"
      >
        <Minimize2 /> Leave stand mode
      </Button>
    </div>
  )
}
