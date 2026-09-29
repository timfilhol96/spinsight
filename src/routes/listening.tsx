import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { FastForward, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { ListeningRoom } from '#/components/listening-room'
import { VinylDisc } from '#/components/vinyl-disc'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { logPlay } from '#/lib/collection.functions'
import { nowPlayingQuery, profileQuery } from '#/lib/queries'
import type { CollectionRecord, NowPlaying, Profile } from '#/lib/records'
import { cn } from '#/lib/utils'

// The listening room for the record you're spinning right now, opened from
// the now-playing dock. Locally (`npm run dev`) it also offers practice spins
// (?release=<id>): nothing is logged, and a mock clock fast-forwards through
// the record to try the track follower and the flip.

type Search = { release?: number }

export const Route = createFileRoute('/listening')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    release:
      import.meta.env.DEV && Number(s.release) > 0
        ? Number(s.release)
        : undefined,
  }),
  loader: async ({ context }) => {
    if (context.viewer)
      await context.queryClient.ensureQueryData(
        profileQuery(context.viewer.username),
      )
  },
  head: () => ({ meta: [{ title: 'Listening room · Spinsight' }] }),
  component: Listening,
})

function Listening() {
  const { viewer } = Route.useRouteContext()
  // Time-dependent: render on the client only.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!viewer)
    return (
      <main className="page-wrap py-24 text-center">
        <p>Sign in with Discogs to open your listening room.</p>
      </main>
    )
  if (!mounted) return null
  return <Session username={viewer.username} />
}

function Session({ username }: { username: string }) {
  const profile = useSuspenseQuery(profileQuery(username)).data as Profile
  const { release } = Route.useSearch()
  const navigate = useNavigate({ from: '/listening' })
  const router = useRouter()
  const qc = useQueryClient()
  const { data: playing, isPending } = useQuery(nowPlayingQuery)

  const close = () => {
    if (window.history.length > 1) router.history.back()
    else void navigate({ to: '/u/$username', params: { username } })
  }

  async function playNext(r: CollectionRecord) {
    try {
      await logPlay({ data: { releaseId: r.releaseId, source: 'manual' } })
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['profile'] }),
        qc.invalidateQueries({ queryKey: nowPlayingQuery.queryKey }),
      ])
      toast.success(`Enjoy ${r.title}.`)
    } catch (e) {
      toast.error(`Couldn't log the play: ${(e as Error).message}`)
    }
  }

  const practice = release
    ? profile.records.find((r) => r.releaseId === release)
    : undefined
  if (practice)
    return (
      <PracticeSpin
        // A new record starts a fresh spin and a fresh clock.
        key={practice.releaseId}
        record={practice}
        profile={profile}
        onClose={() => void navigate({ search: {} })}
        onPlayNext={(r) => void navigate({ search: { release: r.releaseId } })}
      />
    )

  if (isPending)
    return (
      <main className="page-wrap flex justify-center py-24">
        <VinylDisc look={null} spinning className="w-20" />
      </main>
    )
  const record = playing
    ? profile.records.find((r) => r.releaseId === playing.releaseId)
    : undefined
  if (!playing || !record)
    return (
      <NothingPlaying
        profile={profile}
        onPractice={(r) => void navigate({ search: { release: r.releaseId } })}
      />
    )
  return (
    <LiveSpin
      key={playing.playId}
      record={record}
      playing={playing}
      profile={profile}
      onClose={close}
      onPlayNext={playNext}
    />
  )
}

function useNow(everyMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}

function LiveSpin({
  record,
  playing,
  profile,
  onClose,
  onPlayNext,
}: {
  record: CollectionRecord
  playing: NowPlaying
  profile: Profile
  onClose: () => void
  onPlayNext: (r: CollectionRecord) => void
}) {
  const now = useNow()
  return (
    <ListeningRoom
      record={record}
      records={profile.records}
      plays={profile.plays}
      startedAt={Date.parse(playing.startedAt)}
      now={now}
      onClose={onClose}
      onPlayNext={onPlayNext}
    />
  )
}

function NothingPlaying({
  profile,
  onPractice,
}: {
  profile: Profile
  onPractice: (r: CollectionRecord) => void
}) {
  return (
    <main className="page-wrap pt-10 pb-24">
      <p className="kicker">Listening room</p>
      <h1 className="mt-1 font-display text-4xl font-semibold">
        Nothing on the platter
      </h1>
      <p className="mt-2 max-w-xl text-muted-foreground">
        Put a record on and log the spin; the listening room follows along with
        it, track by track, with its liner notes to read.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button
          asChild
          className="bg-record-1 text-record-ink hover:bg-record-1/90"
        >
          <Link to="/u/$username/pick" params={{ username: profile.username }}>
            Pick a record
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/u/$username" params={{ username: profile.username }}>
            Your collection
          </Link>
        </Button>
      </div>
      {import.meta.env.DEV && (
        <PracticePicker profile={profile} onPick={onPractice} />
      )}
    </main>
  )
}

// ---------- practice spins (local dev only) ----------

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
  onClose,
  onPlayNext,
}: {
  record: CollectionRecord
  profile: Profile
  onClose: () => void
  onPlayNext: (r: CollectionRecord) => void
}) {
  const clock = useMockClock()
  const [start] = useState(() => Date.now())
  const elapsed = Math.max(0, Math.round((clock.now - start) / 1000))

  return (
    <>
      <ListeningRoom
        record={record}
        records={profile.records}
        plays={profile.plays}
        startedAt={start}
        now={clock.now}
        practice
        onClose={onClose}
        onPlayNext={onPlayNext}
      />
      {/* Clock controls, above everything including stand mode. */}
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

function PracticePicker({
  profile,
  onPick,
}: {
  profile: Profile
  onPick: (r: CollectionRecord) => void
}) {
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return profile.records
      .filter(
        (r) =>
          !needle ||
          r.title.toLowerCase().includes(needle) ||
          r.artist.toLowerCase().includes(needle),
      )
      .sort((a, b) =>
        (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? ''),
      )
  }, [profile.records, q])

  return (
    <section className="mt-12 border-t border-dashed pt-8">
      <p className="kicker">Local only</p>
      <h2 className="mt-1 font-display text-2xl font-semibold">
        Practice spin
      </h2>
      <p className="mt-1 max-w-xl text-sm text-muted-foreground">
        Nothing is logged: your plays and stats stay as they are. A mock clock
        at the bottom fast-forwards through the sides.
      </p>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search your collection"
        className="mt-4 max-w-sm"
      />
      <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        {list.map((r) => (
          <li key={r.instanceId}>
            <button
              type="button"
              onClick={() => onPick(r)}
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
              </div>
              <p className="mt-1.5 truncate text-sm font-medium">{r.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {r.artist}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
