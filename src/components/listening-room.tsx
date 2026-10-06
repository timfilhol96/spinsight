import { useQuery } from '@tanstack/react-query'
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
import { getArtworkPalette, getLinerNotes } from '#/lib/listening.functions'
import type {
  CreditGroup,
  LinerNotes,
  Praise,
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
// to read while it plays. It follows along track by track (an estimate the
// listener can correct) and has a lean-back "stand mode" for a phone or
// tablet propped up next to the turntable.

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

  const trackNotes =
    follower.position?.state === 'playing'
      ? notes.data?.tracks[follower.position.track.index]
      : undefined

  if (stand)
    return (
      <StandMode
        record={record}
        follower={follower}
        praise={notes.data?.praise ?? []}
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
          {follower.position?.state === 'playing' && (
            <TrackSection
              track={follower.position.track}
              notes={trackNotes}
              loading={notes.isPending}
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
              <AlbumSection record={record} notes={notes.data} />
              <ArtistSection notes={notes.data} />
              <CreditsSection notes={notes.data} />
            </>
          )}
          <ShelfSection record={record} shelf={shelf} />
          {follower.position?.state !== 'finished' &&
            shelf.upNext.length > 0 && (
              <UpNext shelf={shelf} onPlayNext={onPlayNext} />
            )}
          <Sources record={record} notes={notes.data} />
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

/** Wikipedia's lead, then the longer sections folded away. */
function WikiBlock({ page }: { page: WikiPage }) {
  return (
    <>
      <Paragraphs text={page.summary} />
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

function TrackSection({
  track,
  notes,
  loading,
}: {
  track: TimedTrack
  notes: LinerNotes['tracks'][number] | undefined
  loading: boolean
}) {
  const hasAny =
    notes && (notes.mentions.length || notes.article || notes.credits.length)
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
          {notes.mentions.map((m) => (
            <blockquote
              key={m}
              className="border-l-2 border-record-1 pl-3 leading-relaxed"
            >
              {m}
            </blockquote>
          ))}
          {notes.article && (
            <div className="rounded-xl border bg-card/60 p-4">
              <Paragraphs text={notes.article.summary} className="text-sm" />
              <a
                href={notes.article.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Wikipedia: {notes.article.title}{' '}
                <ExternalLink className="size-3" />
              </a>
            </div>
          )}
          {notes.credits.length > 0 && <Credits groups={notes.credits} />}
        </>
      )}
    </Section>
  )
}

function AlbumSection({
  record,
  notes,
}: {
  record: CollectionRecord
  notes: LinerNotes
}) {
  if (!notes.wiki.album && !notes.notes && !notes.albumFacts) return null
  const facts = notes.albumFacts
  // Laid out like the credits: a label over each value.
  const factGroups: CreditGroup[] = facts
    ? [
        { role: 'Recorded', names: facts.recorded },
        {
          role: facts.studios.length > 1 ? 'Studios' : 'Studio',
          names: facts.studios,
        },
        {
          role: facts.producers.length > 1 ? 'Producers' : 'Producer',
          names: facts.producers,
        },
        { role: 'Length', names: facts.length ? [facts.length] : [] },
      ].filter((g) => g.names.length)
    : []
  return (
    <Section kicker="The record" title={record.title}>
      {factGroups.length > 0 && <Credits groups={factGroups} />}
      {notes.wiki.album && <WikiBlock page={notes.wiki.album} />}
      {notes.notes && (
        <div className="rounded-xl border bg-card/60 p-4">
          <p className="kicker mb-2">Notes on this pressing (Discogs)</p>
          <Paragraphs text={notes.notes} className="text-sm" />
        </div>
      )}
    </Section>
  )
}

function ArtistSection({ notes }: { notes: LinerNotes }) {
  const a = notes.artist
  if (!a && !notes.wiki.artist) return null
  const members = a?.members ?? []
  return (
    <Section kicker="The artist" title={a?.name ?? notes.wiki.artist?.title}>
      {notes.wiki.artist ? (
        <WikiBlock page={notes.wiki.artist} />
      ) : (
        a?.profile && <Paragraphs text={a.profile} />
      )}
      {notes.wiki.artist && a?.profile && (
        <details className="rounded-lg border bg-card/50">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium select-none">
            Discogs profile
          </summary>
          <Paragraphs text={a.profile} className="px-3 pb-3 text-sm" />
        </details>
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
}: {
  record: CollectionRecord
  notes?: LinerNotes
}) {
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
      {notes?.wiki.album || notes?.wiki.artist
        ? ', Wikipedia (text under CC BY-SA 4.0)'
        : ''}
      {notes?.streaming
        ? `, track times from ${notes.streaming.source === 'spotify' ? 'Spotify' : 'Apple Music'}`
        : ''}
      .
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
      <p className="text-xs text-muted-foreground">
        Pulling the liner notes from Discogs and Wikipedia…
      </p>
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
      {label && <p className="kicker mb-2">{label}</p>}
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
