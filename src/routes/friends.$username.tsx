import {
  Link,
  Outlet,
  createFileRoute,
  notFound,
  redirect,
  useParams,
} from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { FollowButton } from '#/components/follow-button'
import { VinylDisc } from '#/components/vinyl-disc'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { tasteMatch } from '#/lib/friends'
import { profileQuery } from '#/lib/queries'
import type { Profile } from '#/lib/records'

// You and a friend side by side. Both profiles are the same cached queries the
// collection pages use, so every comparison runs in the browser.

export const Route = createFileRoute('/friends/$username')({
  beforeLoad: ({ context, params }) => {
    if (!context.viewer)
      throw redirect({
        to: '/u/$username',
        params: { username: params.username },
      })
    if (context.viewer.username.toLowerCase() === params.username.toLowerCase())
      throw redirect({ to: '/friends' })
    return { me: context.viewer }
  },
  loader: async ({ context, params }) => {
    const [mine, theirs] = await Promise.all([
      context.queryClient.ensureQueryData(profileQuery(context.me.username)),
      context.queryClient.ensureQueryData(profileQuery(params.username)),
    ])
    if (!mine || !theirs) throw notFound()
  },
  head: ({ params }) => ({
    meta: [{ title: `You & ${params.username} · Spinsight` }],
  }),
  component: CompareLayout,
  pendingComponent: () => (
    <main className="page-wrap flex flex-col items-center py-24 text-center">
      <div className="flex -space-x-8">
        <VinylDisc look={null} spinning className="w-20" />
        <VinylDisc look={null} seed={7} spinning className="w-20" />
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        Laying both crates side by side…
      </p>
    </main>
  ),
  notFoundComponent: () => (
    <main className="page-wrap py-24 text-center">
      <h1 className="text-3xl font-bold">Can't compare with this crate</h1>
      <p className="mt-2 text-muted-foreground">
        This collection isn't on Spinsight, or it's private.
      </p>
    </main>
  ),
})

/** Both profiles for the current /friends/$username page. */
export function usePair(): { me: Profile; them: Profile } {
  const { username } = useParams({ from: '/friends/$username' })
  const { me: viewer } = Route.useRouteContext()
  const me = useSuspenseQuery(profileQuery(viewer.username)).data as Profile
  const them = useSuspenseQuery(profileQuery(username)).data as Profile
  return { me, them }
}

function CompareLayout() {
  const { me, them } = usePair()
  const match = useMemo(
    () => tasteMatch(me.records, them.records),
    [me.records, them.records],
  )
  const name = them.displayName || them.username
  const tabClass =
    'relative pb-3 text-sm font-medium text-muted-foreground hover:text-foreground'
  const activeTab = {
    className:
      'text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-record-1',
  }

  return (
    <main className="page-wrap pt-10 pb-24">
      <Link
        to="/friends"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Friends
      </Link>
      <section className="mt-4 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex shrink-0 -space-x-4">
            <Avatar className="size-16 ring-2 ring-primary ring-offset-2 ring-offset-background">
              <AvatarImage src={me.avatarUrl ?? undefined} alt="" />
              <AvatarFallback>
                {me.username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <Avatar className="size-16 ring-2 ring-friend ring-offset-2 ring-offset-background">
              <AvatarImage src={them.avatarUrl ?? undefined} alt="" />
              <AvatarFallback>
                {them.username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="min-w-0">
            <p className="kicker">Compare</p>
            <h1 className="truncate text-4xl font-bold tracking-tight">
              You & {name}
            </h1>
            <p className="font-mono text-xs text-muted-foreground">
              @{them.username} · {them.records.length} records
              {them.nowPlaying &&
                ` · spinning ${them.nowPlaying.artist} – ${them.nowPlaying.title}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="font-display text-5xl leading-none font-bold tabular-nums">
              {match.score}
              <span className="text-2xl">%</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              taste match · {match.label}
            </p>
          </div>
          <FollowButton username={them.username} />
        </div>
      </section>

      <nav
        className="-mx-4 mt-8 flex gap-6 overflow-x-auto border-b px-4 whitespace-nowrap [scrollbar-width:none] sm:mx-0 sm:px-0"
        aria-label="Compare sections"
      >
        <Link
          to="/friends/$username"
          params={{ username: them.username }}
          activeOptions={{ exact: true }}
          className={tabClass}
          activeProps={activeTab}
        >
          Side by side
        </Link>
        <Link
          to="/friends/$username/year"
          params={{ username: them.username }}
          className={tabClass}
          activeProps={activeTab}
        >
          Your year together
        </Link>
        <Link
          to="/u/$username"
          params={{ username: them.username }}
          className={tabClass}
        >
          Their collection ↗
        </Link>
      </nav>

      <Outlet />
    </main>
  )
}
