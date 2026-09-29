import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  BarChart3,
  Clock,
  Headphones,
  Lock,
  MoreHorizontal,
  Send,
  Trophy,
  UserMinus,
  UserPlus,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  FriendAvatar,
  FriendSpinCard,
  LastSpinLine,
} from '#/components/friend-spin'
import { FollowButton, copyInvite, useFollow } from '#/components/follow-button'
import { VinylDisc } from '#/components/vinyl-disc'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Input } from '#/components/ui/input'
import { setShareListening } from '#/lib/friends.functions'
import { firstName, parseUsername, timeAgo } from '#/lib/friends'
import type { Friend, FriendsActivity, LeaderRow } from '#/lib/friends'
import { friendsQuery } from '#/lib/queries'
import { formatDuration } from '#/lib/records'
import type { Viewer } from '#/lib/records'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/friends/')({
  beforeLoad: ({ context }) => {
    if (!context.viewer) throw redirect({ to: '/' })
    return { me: context.viewer }
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(friendsQuery),
  head: () => ({ meta: [{ title: 'Friends · Spinsight' }] }),
  component: FriendsPage,
  errorComponent: FriendsError,
})

function FriendsError({ error }: ErrorComponentProps) {
  return (
    <main className="page-wrap py-24 text-center">
      <h1 className="text-3xl font-bold">Friends are unavailable</h1>
      <p className="mx-auto mt-2 max-w-md text-muted-foreground">
        Couldn't load who you follow. If the app was just updated, the database
        may need migration 006.
      </p>
      <p className="mt-3 font-mono text-xs text-muted-foreground">
        {error instanceof Error ? error.message : String(error)}
      </p>
    </main>
  )
}

function FriendsPage() {
  const { me: viewer } = Route.useRouteContext()
  // Polled: records end on their own, and friends drop new ones on.
  const { data } = useQuery({ ...friendsQuery, refetchInterval: 45_000 })
  if (!data) return null

  const spinning = data.friends.filter((f) => f.nowPlaying)
  const others = data.friends.filter((f) => !f.nowPlaying)
  const additions = data.friends
    .flatMap((f) => (f.recentAdditions.length ? [f] : []))
    .sort((a, b) =>
      b.recentAdditions[0].dateAdded.localeCompare(
        a.recentAdditions[0].dateAdded,
      ),
    )

  return (
    <main className="page-wrap pt-10 pb-24">
      <section className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="kicker">Friends</p>
          <h1 className="text-4xl font-bold tracking-tight">
            Who's spinning what
          </h1>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">
            Follow anyone by their Discogs username. They don't need to follow
            you back.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ShareToggle share={data.sharesListening} />
          <Button variant="outline" onClick={() => copyInvite(viewer.username)}>
            <Send /> Invite link
          </Button>
        </div>
      </section>

      <AddFriend />

      {data.friends.length === 0 ? (
        <EmptyState viewer={viewer} followers={data.followers} />
      ) : (
        <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-2xl font-bold">
              Spinning now
            </h2>
            {spinning.length ? (
              <div className="mt-4 grid gap-3">
                {spinning.map((f) => (
                  <FriendSpinCard
                    key={f.username}
                    friend={f}
                    spin={f.nowPlaying!}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-4 rounded-2xl border border-dashed p-5">
                <VinylDisc
                  look={null}
                  className="size-12 shrink-0 opacity-60"
                />
                <p className="text-sm text-muted-foreground">
                  Nobody's turntable is going right now. This page refreshes on
                  its own.
                </p>
              </div>
            )}

            {others.length > 0 && (
              <>
                <h2 className="mt-10 text-2xl font-bold">
                  Everyone you follow
                </h2>
                <ul className="mt-4 divide-y rounded-2xl border bg-card/80">
                  {others.map((f) => (
                    <FriendRow key={f.username} friend={f} viewer={viewer} />
                  ))}
                </ul>
              </>
            )}
            {spinning.length > 0 && (
              <p className="mt-4 text-xs text-muted-foreground">
                Tap a name to compare collections.
              </p>
            )}
          </div>

          <aside className="grid min-w-0 gap-6">
            <Leaderboard rows={data.leaderboard} />
            <WantMatches matches={data.wantMatches} />
            <NewInCrates friends={additions} />
            <FollowingYou followers={data.followers} />
          </aside>
        </div>
      )}
    </main>
  )
}

function AddFriend() {
  const [value, setValue] = useState('')
  const { follow, pending } = useFollow()
  const parsed = parseUsername(value)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!parsed) {
      toast.error('That doesn’t look like a Discogs username.')
      return
    }
    if (await follow(parsed)) setValue('')
  }

  return (
    <form
      onSubmit={submit}
      className="mt-8 flex max-w-xl flex-col gap-2 rounded-2xl border bg-card/80 p-4 sm:flex-row sm:items-center"
    >
      <label htmlFor="add-friend" className="sr-only">
        Discogs username or profile link
      </label>
      <Input
        id="add-friend"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Discogs username or profile link"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className="bg-background/60"
      />
      <Button
        type="submit"
        disabled={pending || !value.trim()}
        className="shrink-0 bg-record-1 text-record-ink hover:bg-record-1/90"
      >
        <UserPlus /> Follow
      </Button>
    </form>
  )
}

function ShareToggle({ share }: { share: boolean }) {
  const qc = useQueryClient()
  const [pending, setPending] = useState(false)
  async function toggle() {
    setPending(true)
    try {
      await setShareListening({ data: { share: !share } })
      await qc.invalidateQueries({ queryKey: friendsQuery.queryKey })
      await qc.invalidateQueries({ queryKey: ['profile'] })
      toast(
        share
          ? 'What you spin is now private.'
          : 'Friends can see what you spin.',
      )
    } catch (e) {
      toast.error((e as Error).message)
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
      aria-pressed={share}
      title={
        share
          ? 'Friends see your current record, last spin and weekly stats'
          : 'Your spins are hidden from friends'
      }
    >
      {share ? <Headphones /> : <Lock />}
      {share ? 'Sharing my spins' : 'Spins private'}
    </Button>
  )
}

function FriendRow({ friend, viewer }: { friend: Friend; viewer: Viewer }) {
  const { unfollow, pending } = useFollow()
  const body = (
    <>
      <FriendAvatar friend={friend} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate font-medium">
            {friend.displayName || friend.username}
          </span>
          {friend.displayName && (
            <span className="truncate font-mono text-xs text-muted-foreground">
              @{friend.username}
            </span>
          )}
          {friend.followsYou && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              Follows you
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {friend.status === 'pending' ? (
            'Not on Spinsight yet'
          ) : friend.status === 'private' ? (
            <span className="flex items-center gap-1">
              <Lock className="size-3" /> Collection is private
            </span>
          ) : friend.lastSpin ? null : friend.sharesListening ? (
            `${friend.recordCount ?? 0} records · no spins lately`
          ) : (
            `${friend.recordCount ?? 0} records · keeps spins private`
          )}
        </span>
        {friend.status === 'active' && friend.lastSpin && (
          <span className="mt-1.5 block">
            <LastSpinLine spin={friend.lastSpin} />
          </span>
        )}
      </span>
    </>
  )

  return (
    <li className="flex items-center gap-2 p-3">
      {friend.status === 'active' ? (
        <Link
          to="/friends/$username"
          params={{ username: friend.username }}
          className="-m-1 flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 hover:bg-muted/60"
        >
          {body}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
      )}
      {friend.status === 'pending' && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => copyInvite(viewer.username)}
        >
          <Send /> Invite
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`More for ${friend.username}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {friend.status === 'active' && (
            <DropdownMenuItem asChild>
              <Link to="/u/$username" params={{ username: friend.username }}>
                <BarChart3 /> Their collection
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            disabled={pending}
            onSelect={() => unfollow(friend.username)}
          >
            <UserMinus /> Unfollow
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

function SideCard({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string
  subtitle?: string
  icon: typeof Trophy
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border bg-card/80 p-5">
      <h2 className="flex items-center gap-2 text-lg leading-tight font-bold">
        <Icon className="size-4 text-record-1" /> {title}
      </h2>
      {subtitle && (
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  )
}

const MEDALS = ['🥇', '🥈', '🥉']

function Leaderboard({ rows }: { rows: LeaderRow[] }) {
  const anyone = rows.some((r) => r.spins > 0)
  return (
    <SideCard
      title="This week"
      subtitle="Last 7 days, for friends who share their spins."
      icon={Trophy}
    >
      {!anyone ? (
        <p className="text-sm text-muted-foreground">
          No spins logged this week yet.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-2 font-medium">
                <span className="sr-only">Rank and name</span>
              </th>
              <th className="pb-2 text-right font-medium">Spins</th>
              <th className="pb-2 text-right font-medium">Time</th>
              <th
                className="pb-2 text-right font-medium"
                title="Records owned 6+ months that got their first logged spin"
              >
                Dusted off
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.username}
                className={cn(
                  'border-t border-border/50',
                  r.isYou && 'font-semibold',
                )}
              >
                <td className="max-w-0 py-2 pr-2">
                  <span className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-center text-xs tabular-nums">
                      {r.spins > 0 && i < 3 ? MEDALS[i] : i + 1}
                    </span>
                    <span className="truncate">
                      {r.isYou ? 'You' : r.displayName || r.username}
                    </span>
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums">{r.spins}</td>
                <td className="py-2 text-right whitespace-nowrap tabular-nums">
                  {formatDuration(r.minutes * 60) ?? '—'}
                </td>
                <td className="py-2 text-right tabular-nums">{r.rescued}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SideCard>
  )
}

function WantMatches({ matches }: { matches: FriendsActivity['wantMatches'] }) {
  if (!matches.length) return null
  return (
    <SideCard
      title="They have your wants"
      subtitle="From your Discogs wantlist. Updated when you sync."
      icon={Headphones}
    >
      <ul className="space-y-3">
        {matches.slice(0, 8).map((m) => (
          <li key={m.want.releaseId} className="flex items-center gap-3">
            {m.want.thumb ? (
              <img
                src={m.want.thumb}
                alt=""
                loading="lazy"
                className="size-10 shrink-0 rounded-[2px] object-cover"
              />
            ) : (
              <div className="size-10 shrink-0 rounded-[2px] bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{m.want.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {m.want.artist}
              </p>
              <p className="truncate text-xs">
                {m.owners.map((o, i) => (
                  <span key={o.username}>
                    {i > 0 && ', '}
                    <Link
                      to="/friends/$username"
                      params={{ username: o.username }}
                      className="font-medium hover:underline"
                    >
                      {firstName(o)}
                    </Link>
                    <span className="text-muted-foreground">
                      {o.exact ? ' (this pressing)' : ' (another pressing)'}
                    </span>
                  </span>
                ))}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {matches.length > 8 && (
        <p className="mt-3 text-xs text-muted-foreground">
          And {matches.length - 8} more. See each friend's page.
        </p>
      )}
    </SideCard>
  )
}

function NewInCrates({ friends }: { friends: Friend[] }) {
  if (!friends.length) return null
  return (
    <SideCard
      title="New in their crates"
      subtitle="Added in the last 30 days."
      icon={Clock}
    >
      <ul className="space-y-4">
        {friends.map((f) => (
          <li key={f.username}>
            <p className="text-sm">
              <Link
                to="/u/$username"
                params={{ username: f.username }}
                className="font-medium hover:underline"
              >
                {firstName(f)}
              </Link>{' '}
              <span className="text-muted-foreground">
                added {f.recentAdditions.length}
                {f.recentAdditions.length === 8 ? '+' : ''}{' '}
                {f.recentAdditions.length === 1 ? 'record' : 'records'} ·{' '}
                {timeAgo(f.recentAdditions[0].dateAdded)}
              </span>
            </p>
            <ul className="mt-2 flex gap-1.5">
              {f.recentAdditions.slice(0, 6).map((r) => (
                <li
                  key={r.releaseId}
                  title={`${r.artist} – ${r.title}`}
                  className="sleeve-shadow size-11 shrink-0 overflow-hidden rounded-[2px] bg-muted"
                >
                  {r.thumb && (
                    <img
                      src={r.thumb}
                      alt={`${r.artist} – ${r.title}`}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </SideCard>
  )
}

function FollowingYou({
  followers,
}: {
  followers: FriendsActivity['followers']
}) {
  if (!followers.length) return null
  return (
    <SideCard title="Following you" icon={UserPlus}>
      <ul className="space-y-3">
        {followers.map((f) => (
          <li key={f.username} className="flex items-center gap-3">
            <FriendAvatar friend={f} className="size-8" />
            <Link
              to="/u/$username"
              params={{ username: f.username }}
              className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
            >
              {f.displayName || f.username}
            </Link>
            <FollowButton username={f.username} />
          </li>
        ))}
      </ul>
    </SideCard>
  )
}

function EmptyState({
  viewer,
  followers,
}: {
  viewer: Viewer
  followers: FriendsActivity['followers']
}) {
  return (
    <div className="mt-10 grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center">
        <div className="flex -space-x-6">
          <VinylDisc look={null} spinning className="size-20" />
          <VinylDisc look={null} seed={7} className="size-20 opacity-70" />
        </div>
        <h2 className="mt-6 text-2xl font-bold">No one here yet</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Follow a friend above to see what they're spinning, compare your
          collections and find out who owns the records on your wantlist. Not on
          Spinsight yet? Send them your invite link.
        </p>
        <Button
          className="mt-5 bg-record-1 text-record-ink hover:bg-record-1/90"
          onClick={() => copyInvite(viewer.username)}
        >
          <Send /> Copy invite link
        </Button>
      </div>
      <FollowingYou followers={followers} />
    </div>
  )
}
