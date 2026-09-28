import {
  Link,
  Outlet,
  createFileRoute,
  notFound,
  useNavigate,
} from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { VinylDisc } from '#/components/vinyl-disc'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import { Progress } from '#/components/ui/progress'
import { setProfileVisibility } from '#/lib/collection.functions'
import { profileQuery } from '#/lib/queries'
import type { Profile } from '#/lib/records'
import { useCollectionSync } from '#/lib/use-collection-sync'
import { useProfile } from '#/lib/use-profile'

// Profile shell: header, owner sync controls and tabs. The pages underneath
// (collection, insights, year in vinyl) all read the same cached profile.

type Search = { welcome?: boolean }

export const Route = createFileRoute('/u/$username')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    welcome:
      s.welcome === 1 || s.welcome === '1' || s.welcome === true
        ? true
        : undefined,
  }),
  loader: async ({ context, params }) => {
    const profile = await context.queryClient.ensureQueryData(
      profileQuery(params.username),
    )
    if (!profile) throw notFound()
  },
  component: ProfileLayout,
  pendingComponent: () => (
    <main className="page-wrap flex flex-col items-center py-24 text-center">
      <VinylDisc look={null} spinning className="w-24" />
      <p className="mt-6 text-sm text-muted-foreground">Pulling the crate…</p>
    </main>
  ),
  notFoundComponent: () => (
    <main className="page-wrap py-24 text-center">
      <h1 className="text-3xl font-bold">Nothing in this crate</h1>
      <p className="mt-2 text-muted-foreground">
        This collection doesn't exist here, or it's private.
      </p>
    </main>
  ),
})

function relativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

function ProfileLayout() {
  const { username } = Route.useParams()
  const { welcome } = Route.useSearch()
  const navigate = useNavigate()
  const profile = useProfile()
  const sync = useCollectionSync(username)

  // First visit after signing up: pull the collection straight away.
  const welcomed = useRef(false)
  useEffect(() => {
    if (!welcome || !profile.isOwner || welcomed.current) return
    welcomed.current = true
    void navigate({
      to: '/u/$username',
      params: { username },
      search: {},
      replace: true,
    })
    void sync.start({ trigger: 'signup' })
  }, [welcome, profile.isOwner, navigate, sync, username])

  const unenriched = profile.records.filter((r) => r.needsDetails).length
  const busy = sync.state.phase !== 'idle'
  const tabClass =
    'relative pb-3 text-sm font-medium text-muted-foreground hover:text-foreground'
  const activeTab = {
    className:
      'text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-record-1',
  }

  return (
    <main className="page-wrap pt-10 pb-24">
      <section className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="size-16 ring-2 ring-record-1 ring-offset-2 ring-offset-background">
            <AvatarImage src={profile.avatarUrl ?? undefined} alt="" />
            <AvatarFallback>
              {profile.username.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="kicker">
              {profile.isOwner ? 'Your collection' : 'Collection'}
            </p>
            <h1 className="text-4xl font-bold tracking-tight">
              {profile.displayName || profile.username}
            </h1>
            <p className="font-mono text-xs text-muted-foreground">
              @{profile.username} · synced {relativeTime(profile.lastSyncedAt)}
            </p>
            {profile.nowPlaying && !profile.isOwner && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs">
                <VinylDisc
                  look={profile.nowPlaying.look}
                  labelImage={profile.nowPlaying.thumb}
                  seed={profile.nowPlaying.releaseId}
                  spinning
                  className="size-4"
                />
                <span className="text-muted-foreground">Now spinning</span>
                <span className="font-medium">
                  {profile.nowPlaying.artist} – {profile.nowPlaying.title}
                </span>
              </p>
            )}
          </div>
        </div>

        {profile.isOwner && (
          <div className="flex flex-wrap items-center gap-2">
            <VisibilityToggle profile={profile} />
            {unenriched > 0 && !busy && (
              <Button
                variant="outline"
                onClick={() => sync.start({ skipSync: true })}
              >
                Fetch details ({unenriched} left)
              </Button>
            )}
            <Button
              onClick={() => sync.start()}
              disabled={busy}
              className="bg-record-1 text-record-ink hover:bg-record-1/90"
            >
              <RefreshCw className={busy ? 'animate-spin' : ''} />
              {busy ? 'Syncing…' : 'Sync with Discogs'}
            </Button>
          </div>
        )}
      </section>

      {sync.state.phase !== 'idle' && (
        <div className="mt-6 rounded-xl border bg-card/80 p-4">
          <div className="flex items-center gap-3">
            <VinylDisc look={null} spinning className="size-8" />
            <div className="flex-1">
              <p className="text-sm font-medium">
                {sync.state.phase === 'syncing'
                  ? 'Flipping through your crates on Discogs…'
                  : `Fetching record details — ${sync.state.done} of ${sync.state.total || '…'}`}
              </p>
              <p className="text-xs text-muted-foreground">
                Discogs allows about one request a second, so the first full run
                takes a minute or two.
              </p>
            </div>
          </div>
          {sync.state.phase === 'enriching' && sync.state.total > 0 && (
            <Progress
              value={(sync.state.done / sync.state.total) * 100}
              className="mt-3"
            />
          )}
        </div>
      )}

      <nav
        className="-mx-4 mt-8 flex gap-6 overflow-x-auto border-b px-4 whitespace-nowrap [scrollbar-width:none] sm:mx-0 sm:px-0"
        aria-label="Collection sections"
      >
        <Link
          to="/u/$username"
          params={{ username }}
          activeOptions={{ exact: true }}
          className={tabClass}
          activeProps={activeTab}
        >
          Collection{' '}
          <span className="ml-1 text-xs tabular-nums opacity-60">
            {profile.records.length}
          </span>
        </Link>
        <Link
          to="/u/$username/insights"
          params={{ username }}
          className={tabClass}
          activeProps={activeTab}
        >
          Insights
        </Link>
        <Link
          to="/u/$username/wrapped"
          params={{ username }}
          className={tabClass}
          activeProps={activeTab}
        >
          Year in Vinyl
        </Link>
        <Link
          to="/u/$username/pick"
          params={{ username }}
          className={tabClass}
          activeProps={activeTab}
        >
          Pick a record
        </Link>
      </nav>

      <Outlet />
    </main>
  )
}

function VisibilityToggle({ profile }: { profile: Profile }) {
  const qc = useQueryClient()
  const [pending, setPending] = useState(false)
  async function toggle() {
    setPending(true)
    try {
      await setProfileVisibility({ data: { isPublic: !profile.isPublic } })
      await qc.invalidateQueries({
        queryKey: profileQuery(profile.username).queryKey,
      })
      toast(
        profile.isPublic
          ? 'Your collection is now private.'
          : 'Your collection is now public.',
      )
    } finally {
      setPending(false)
    }
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      disabled={pending}
      title={
        profile.isPublic ? 'Anyone with the link can view' : 'Only you can view'
      }
    >
      {profile.isPublic ? <Eye /> : <EyeOff />}
      {profile.isPublic ? 'Public' : 'Private'}
    </Button>
  )
}
