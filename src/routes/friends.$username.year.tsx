import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { VinylDisc } from '#/components/vinyl-disc'
import { Button } from '#/components/ui/button'
import { jointYear, jointYears } from '#/lib/friends'
import { formatDuration } from '#/lib/records'
import type { CollectionRecord } from '#/lib/records'
import { cn } from '#/lib/utils'
import { usePair } from '#/routes/friends.$username'

type Search = { year?: number }

export const Route = createFileRoute('/friends/$username/year')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    year:
      s.year !== undefined && Number.isInteger(Number(s.year))
        ? Number(s.year)
        : undefined,
  }),
  head: ({ params }) => ({
    meta: [{ title: `Your year with ${params.username} · Spinsight` }],
  }),
  component: JointYearPage,
})

function JointYearPage() {
  const { me, them } = usePair()
  const navigate = useNavigate({ from: Route.fullPath })
  const years = useMemo(() => jointYears(me, them), [me, them])
  const { year: requested } = Route.useSearch()
  const year = requested && years.includes(requested) ? requested : years[0]
  const y = useMemo(
    () => (year ? jointYear(me, them, year) : null),
    [me, them, year],
  )
  if (!y || !year) {
    return (
      <p className="mt-16 text-center text-muted-foreground">
        Nothing added or spun yet on either side.
      </p>
    )
  }

  const myName = me.displayName?.split(' ')[0] || me.username
  const theirName = them.displayName?.split(' ')[0] || them.username
  // Who "won" the year: more records added, spins breaking ties.
  const lead =
    y.mine.added.length + y.mine.spins ===
    y.theirs.added.length + y.theirs.spins
      ? null
      : y.mine.added.length + y.mine.spins >
          y.theirs.added.length + y.theirs.spins
        ? myName
        : theirName
  const cover = y.boughtBoth[0] ?? y.mine.mostSpun?.record ?? null

  async function copyLink() {
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('year', String(year))
      await navigator.clipboard.writeText(url.toString())
      toast.success('Link copied. They can open it when signed in.')
    } catch {
      toast.error("Couldn't copy the link.")
    }
  }

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center gap-2">
        {years.map((yy) => (
          <button
            key={yy}
            type="button"
            onClick={() => navigate({ search: { year: yy }, replace: true })}
            aria-pressed={yy === year}
            className={cn(
              'rounded-full border px-3 py-1 text-sm font-medium tabular-nums transition',
              yy === year
                ? 'border-record-1 bg-record-1 text-record-ink'
                : 'bg-card hover:border-record-1',
            )}
          >
            {yy}
          </button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={copyLink}
          className="ml-auto"
        >
          <Link2 /> Copy link
        </Button>
      </div>

      <section className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* The shared "sleeve": split down the middle, one half each. */}
        <div className="sleeve-shadow relative aspect-square overflow-hidden rounded-md bg-gradient-to-br from-primary via-primary/70 to-friend p-7 text-primary-foreground md:p-9">
          <VinylDisc
            look={cover?.look}
            labelImage={cover?.thumb}
            seed={cover?.releaseId ?? year}
            className="animate-spin-slow pointer-events-none absolute -right-[22%] -bottom-[22%] w-[70%] opacity-90"
          />
          <div className="relative flex h-full flex-col">
            <p className="font-mono text-xs tracking-[0.2em] uppercase opacity-80">
              {myName} & {theirName}
            </p>
            <p className="mt-1 font-display text-7xl leading-none font-bold md:text-8xl">
              {year}
            </p>
            <div className="mt-auto grid max-w-[58%] grid-cols-2 gap-x-5 gap-y-4">
              <Side name={myName} side={y.mine} />
              <Side name={theirName} side={y.theirs} />
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-2xl border bg-card/80 p-5">
            <h2 className="text-lg font-bold">The year in one line</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {lead
                ? `${lead === myName ? 'You were' : `${theirName} was`} the busier crate digger in ${year}.`
                : `A dead heat in ${year}.`}{' '}
              {y.sharedArtists.length > 0 &&
                `You both kept coming back to ${y.sharedArtists[0].name}.`}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Moment
              label={`${myName}'s most spun`}
              record={y.mine.mostSpun?.record ?? null}
              count={y.mine.mostSpun?.count}
              owner={me.username}
            />
            <Moment
              label={`${theirName}'s most spun`}
              record={y.theirs.mostSpun?.record ?? null}
              count={y.theirs.mostSpun?.count}
              owner={them.username}
            />
          </div>
          {y.sharedArtists.length > 0 && (
            <div className="rounded-2xl border bg-card/80 p-5">
              <h2 className="text-lg font-bold">
                Artists you shared this year
              </h2>
              <p className="text-xs text-muted-foreground">
                Bought or spun by both of you in {year}.
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {y.sharedArtists.map((a) => (
                  <li
                    key={a.name}
                    className="rounded-full border bg-card px-3 py-1 text-xs"
                  >
                    {a.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {y.boughtBoth.length > 0 && (
        <section className="mt-10">
          <h2 className="text-2xl font-bold">
            You both bought these in {year}
          </h2>
          <CoverRow records={y.boughtBoth} owner={me.username} />
        </section>
      )}
      <section className="mt-10 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-bold">
            {myName} added {y.mine.added.length}
          </h2>
          <CoverRow records={y.mine.added} owner={me.username} />
        </div>
        <div>
          <h2 className="text-xl font-bold">
            {theirName} added {y.theirs.added.length}
          </h2>
          <CoverRow records={y.theirs.added} owner={them.username} />
        </div>
      </section>
    </>
  )
}

function Side({
  name,
  side,
}: {
  name: string
  side: ReturnType<typeof jointYear>['mine']
}) {
  return (
    <dl className="min-w-0 space-y-3">
      <div>
        <dt className="font-mono text-[10px] tracking-[0.15em] uppercase opacity-75">
          {name}
        </dt>
        <dd className="text-xl font-semibold md:text-2xl">
          {side.added.length} added
        </dd>
      </div>
      <div>
        <dt className="font-mono text-[10px] tracking-[0.15em] uppercase opacity-75">
          Spun
        </dt>
        <dd className="truncate text-lg font-semibold">
          {side.spins}×
          {side.minutes > 0 && (
            <span className="text-sm font-normal opacity-80">
              {' '}
              · {formatDuration(side.minutes * 60)}
            </span>
          )}
        </dd>
      </div>
      {side.topArtist && (
        <div>
          <dt className="font-mono text-[10px] tracking-[0.15em] uppercase opacity-75">
            Top artist
          </dt>
          <dd className="truncate text-sm font-semibold">
            {side.topArtist.name}
          </dd>
        </div>
      )}
    </dl>
  )
}

function Moment({
  label,
  record,
  count,
  owner,
}: {
  label: string
  record: CollectionRecord | null
  count?: number
  owner: string
}) {
  if (!record)
    return (
      <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
        {label}: no spins logged
      </div>
    )
  return (
    <Link
      to="/u/$username"
      params={{ username: owner }}
      search={{ open: record.instanceId }}
      className="flex items-center gap-3 rounded-xl border bg-card/80 p-3 hover:border-record-1"
    >
      {record.thumb && (
        <img
          src={record.thumb}
          alt=""
          className="size-12 shrink-0 rounded-[2px] object-cover"
        />
      )}
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="block truncate text-sm font-medium">
          {record.title}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {record.artist}
          {count ? ` · ${count}×` : ''}
        </span>
      </span>
    </Link>
  )
}

function CoverRow({
  records,
  owner,
}: {
  records: CollectionRecord[]
  owner: string
}) {
  if (!records.length)
    return <p className="mt-3 text-sm text-muted-foreground">Nothing.</p>
  return (
    <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
      {records.slice(0, 24).map((r) => (
        <li key={r.instanceId}>
          <Link
            to="/u/$username"
            params={{ username: owner }}
            search={{ open: r.instanceId }}
            className="sleeve-shadow block aspect-square overflow-hidden rounded-[2px] bg-muted transition hover:-translate-y-0.5"
            title={`${r.artist} – ${r.title}`}
            aria-label={`${r.artist} – ${r.title}`}
          >
            {r.thumb && (
              <img
                src={r.thumb}
                alt=""
                loading="lazy"
                className="size-full object-cover"
              />
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}
