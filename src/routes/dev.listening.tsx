import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FastForward, RotateCcw } from 'lucide-react'
import { ListeningRoom } from '#/components/listening-room'
import { VinylDisc } from '#/components/vinyl-disc'
import { Input } from '#/components/ui/input'
import { nowPlayingQuery, profileQuery } from '#/lib/queries'
import type { CollectionRecord, Profile } from '#/lib/records'
import { cn } from '#/lib/utils'

// Listening room mock-up. Only exists in `npm run dev`. Practice spins live
// in this tab: nothing is logged and nothing is written to the database, so
// stats stay untouched. A mock clock fast-forwards through a record to try
// the track follower and the flip prompt.

type Search = { release?: number; started?: string }

export const Route = createFileRoute('/dev/listening')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    release: Number(s.release) > 0 ? Number(s.release) : undefined,
    started: typeof s.started === 'string' ? s.started : undefined,
  }),
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound()
  },
  loader: async ({ context }) => {
    if (context.viewer)
      await context.queryClient.ensureQueryData(
        profileQuery(context.viewer.username),
      )
  },
  component: DevListening,
})

function DevListening() {
  const { viewer } = Route.useRouteContext()
  // Time-dependent: render on the client only.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!viewer)
    return (
      <main className="page-wrap py-24 text-center">
        <p>Sign in with Discogs first, then come back here.</p>
      </main>
    )
  if (!mounted) return null
  return <Session username={viewer.username} />
}

function Session({ username }: { username: string }) {
  const profile = useSuspenseQuery(profileQuery(username)).data as Profile
  const { release, started } = Route.useSearch()
  const navigate = useNavigate({ from: '/dev/listening' })
  const record = profile.records.find((r) => r.releaseId === release)

  const open = useCallback(
    (r: CollectionRecord | null, startedAt?: string) =>
      void navigate({
        search: r ? { release: r.releaseId, started: startedAt } : {},
      }),
    [navigate],
  )

  if (!record) return <Picker profile={profile} onPick={open} />
  return (
    <PracticeSpin
      // A new record starts a fresh spin and a fresh clock.
      key={`${record.releaseId}-${started ?? ''}`}
      record={record}
      profile={profile}
      startedAt={started ? Date.parse(started) : null}
      onClose={() => open(null)}
      onPlayNext={(r) => open(r)}
    />
  )
}

// ---------- mock clock ----------

/** Wall-clock time that can be fast-forwarded and sped up. */
function useMockClock() {
  const [anchor, setAnchor] = useState(() => ({
    virtual: Date.now(),
    real: Date.now(),
    speed: 1,
  }))
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const now = anchor.virtual + (Date.now() - anchor.real) * anchor.speed
  return {
    now,
    speed: anchor.speed,
    skip: (sec: number) =>
      setAnchor((a) => ({
        ...a,
        virtual: a.virtual + (Date.now() - a.real) * a.speed + sec * 1000,
        real: Date.now(),
      })),
    setSpeed: (speed: number) =>
      setAnchor((a) => ({
        virtual: a.virtual + (Date.now() - a.real) * a.speed,
        real: Date.now(),
        speed,
      })),
    reset: () => setAnchor({ virtual: Date.now(), real: Date.now(), speed: 1 }),
  }
}

function PracticeSpin({
  record,
  profile,
  startedAt,
  onClose,
  onPlayNext,
}: {
  record: CollectionRecord
  profile: Profile
  /** A real spin's start (opened from the dock); null for a practice spin. */
  startedAt: number | null
  onClose: () => void
  onPlayNext: (r: CollectionRecord) => void
}) {
  const clock = useMockClock()
  const [practiceStart] = useState(() => Date.now())
  const start = startedAt ?? practiceStart
  const elapsed = Math.max(0, Math.round((clock.now - start) / 1000))

  return (
    <>
      <ListeningRoom
        record={record}
        records={profile.records}
        plays={profile.plays}
        startedAt={start}
        now={clock.now}
        practice={startedAt == null}
        onClose={onClose}
        onPlayNext={onPlayNext}
      />
      {/* Mock-up controls, above everything including stand mode. */}
      <div className="fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[80] flex justify-center px-3">
        <div className="flex flex-wrap items-center gap-1 rounded-full border border-dashed bg-background/90 px-2 py-1 font-mono text-[11px] shadow-lg backdrop-blur-md">
          <span className="px-2 text-muted-foreground">
            mock clock · {Math.floor(elapsed / 60)}:
            {String(elapsed % 60).padStart(2, '0')} in
          </span>
          {[60, 300].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => clock.skip(s)}
              className="rounded-full px-2 py-1 hover:bg-muted"
            >
              +{s / 60} min
            </button>
          ))}
          {[1, 10, 60].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => clock.setSpeed(s)}
              className={cn(
                'rounded-full px-2 py-1 hover:bg-muted',
                clock.speed === s &&
                  'bg-record-1 text-record-ink hover:bg-record-1',
              )}
              aria-pressed={clock.speed === s}
            >
              {s === 1 ? (
                '1×'
              ) : (
                <span className="inline-flex items-center gap-0.5">
                  <FastForward className="size-3" />
                  {s}×
                </span>
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={clock.reset}
            className="rounded-full px-2 py-1 hover:bg-muted"
            title="Back to real time"
          >
            <RotateCcw className="size-3" />
          </button>
        </div>
      </div>
    </>
  )
}

// ---------- picker ----------

function Picker({
  profile,
  onPick,
}: {
  profile: Profile
  /** `startedAt` when picking the record that's really spinning: follow that spin. */
  onPick: (r: CollectionRecord, startedAt?: string) => void
}) {
  const [q, setQ] = useState('')
  const { data: playing } = useQuery(nowPlayingQuery)
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return profile.records
      .filter(
        (r) =>
          !needle ||
          r.title.toLowerCase().includes(needle) ||
          r.artist.toLowerCase().includes(needle),
      )
      .sort(
        (a, b) =>
          Number(b.releaseId === playing?.releaseId) -
            Number(a.releaseId === playing?.releaseId) ||
          (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? ''),
      )
  }, [profile.records, q, playing?.releaseId])

  return (
    <main className="page-wrap pt-10 pb-24">
      <p className="kicker">Mock-up · local only</p>
      <h1 className="mt-1 font-display text-4xl font-semibold">
        Listening room
      </h1>
      <p className="mt-2 max-w-xl text-muted-foreground">
        Pick a record for a practice spin. Nothing is logged: your plays and
        stats stay exactly as they are. Use the mock clock at the bottom to
        fast-forward through sides.
      </p>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search your collection"
        className="mt-6 max-w-sm"
        autoFocus
      />
      <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        {list.map((r) => (
          <li key={r.instanceId}>
            <button
              type="button"
              onClick={() =>
                onPick(
                  r,
                  r.releaseId === playing?.releaseId
                    ? playing.startedAt
                    : undefined,
                )
              }
              className="group w-full text-left"
            >
              <div className="sleeve-shadow relative aspect-square overflow-hidden rounded-[3px] bg-muted">
                {r.thumb ? (
                  <img
                    src={r.thumb}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <VinylDisc
                    look={r.look}
                    seed={r.releaseId}
                    className="size-full p-3"
                  />
                )}
                {r.releaseId === playing?.releaseId && (
                  <span className="absolute top-1.5 left-1.5 rounded-full bg-record-1 px-2 py-0.5 text-[10px] font-medium text-record-ink">
                    spinning now
                  </span>
                )}
              </div>
              <p className="mt-1.5 truncate text-sm font-medium">{r.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {r.artist}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </main>
  )
}
