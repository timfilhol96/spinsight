import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Gift, Sparkles } from 'lucide-react'
import {
  ChartCard,
  PairLegend,
  PairedBars,
  pairedTable,
} from '#/components/charts'
import type { Paired } from '#/components/charts'
import { overlap, tasteMatch, wantsOwnedBy } from '#/lib/friends'
import type { WantItem } from '#/lib/friends'
import { wantlistQuery } from '#/lib/queries'
import { formatDuration } from '#/lib/records'
import type { CollectionRecord, Profile } from '#/lib/records'
import * as S from '#/lib/stats'
import { cn } from '#/lib/utils'
import { usePair } from '#/routes/friends.$username'

export const Route = createFileRoute('/friends/$username/')({
  component: ComparePage,
})

/** Top categories across both collections, with each side's count. */
function pairUp(mine: S.Ranked[], theirs: S.Ranked[], limit: number): Paired[] {
  const m = new Map(mine.map((r) => [r.name, r.count]))
  const t = new Map(theirs.map((r) => [r.name, r.count]))
  return [...new Set([...m.keys(), ...t.keys()])]
    .map((name) => ({ name, mine: m.get(name) ?? 0, theirs: t.get(name) ?? 0 }))
    .sort((a, b) => b.mine + b.theirs - (a.mine + a.theirs))
    .slice(0, limit)
}

function ComparePage() {
  const { me, them } = usePair()
  const name = them.displayName?.split(' ')[0] || them.username

  const c = useMemo(() => {
    const decadeRanks = (rs: CollectionRecord[]) =>
      S.decades(rs).map((d) => ({ name: d.label, count: d.count }))
    const decades = pairUp(
      decadeRanks(me.records),
      decadeRanks(them.records),
      Infinity,
    ).sort((a, b) => {
      // "60s" sorts by its decade, oldest first ("00s" and later after "90s").
      const y = (s: string) => {
        const n = Number(s.slice(0, 2))
        return n < 30 ? 2000 + n : 1900 + n
      }
      return y(a.name) - y(b.name)
    })
    return {
      match: tasteMatch(me.records, them.records),
      styles: pairUp(
        S.styles(me.records, Infinity),
        S.styles(them.records, Infinity),
        10,
      ),
      genres: pairUp(S.genres(me.records), S.genres(them.records), 8),
      decades,
      overlap: overlap(me.records, them.records),
    }
  }, [me.records, them.records])

  return (
    <>
      <section className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <MatchCard match={c.match} name={name} />
        <HeadToHead me={me} them={them} name={name} />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Styles"
          subtitle="Share of each collection"
          table={pairedTable(c.styles, 'Style', name)}
        >
          <PairedBars
            items={c.styles}
            mineTotal={me.records.length}
            theirsTotal={them.records.length}
            them={name}
          />
        </ChartCard>
        <ChartCard
          title="Genres"
          subtitle="Share of each collection"
          table={pairedTable(c.genres, 'Genre', name)}
        >
          <PairedBars
            items={c.genres}
            mineTotal={me.records.length}
            theirsTotal={them.records.length}
            them={name}
          />
        </ChartCard>
        <ChartCard
          title="Decades"
          subtitle="When the music first came out"
          table={pairedTable(c.decades, 'Decade', name)}
        >
          <PairedBars
            items={c.decades}
            mineTotal={me.records.length}
            theirsTotal={them.records.length}
            them={name}
          />
        </ChartCard>
      </section>

      <Wants me={me} them={them} name={name} />
      <CrateOverlap me={me} them={them} name={name} overlap={c.overlap} />
    </>
  )
}

function MatchCard({
  match,
  name,
}: {
  match: ReturnType<typeof tasteMatch>
  name: string
}) {
  return (
    <div className="rounded-2xl border bg-card/80 p-5 md:p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Sparkles className="size-4 text-record-1" /> Why {match.score}%
      </h2>
      {match.reasons.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {match.reasons.map((r) => (
            <li
              key={r}
              className="rounded-full border bg-card px-3 py-1 text-xs"
            >
              {r}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Not much in common yet, which means plenty to borrow.
        </p>
      )}
      <dl className="mt-5 space-y-2">
        {match.parts.map((p) => (
          <div key={p.name} className="flex items-center gap-3 text-sm">
            <dt className="w-24 shrink-0 text-muted-foreground">{p.name}</dt>
            <dd className="flex flex-1 items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-record-1"
                  style={{ width: `${p.value}%` }}
                />
              </span>
              <span className="w-9 text-right text-xs tabular-nums">
                {p.value}%
              </span>
            </dd>
          </div>
        ))}
      </dl>
      {match.sharedArtists.length > 0 && (
        <>
          <h3 className="mt-6 text-sm font-semibold">
            Artists you both collect
          </h3>
          <ul className="mt-2 space-y-1 text-sm">
            {match.sharedArtists.slice(0, 6).map((a) => (
              <li key={a.name} className="flex justify-between gap-3">
                <span className="truncate">{a.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  you {a.mine} · {name} {a.theirs}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function HeadToHead({
  me,
  them,
  name,
}: {
  me: Profile
  them: Profile
  name: string
}) {
  const side = (p: Profile) => {
    const s = S.summary(p.records)
    const l = S.listening(p.records, p.plays, 1)
    return {
      s,
      spins: l.total,
      played: Math.round(l.playedShare * 100),
      topGenre: S.genres(p.records)[0]?.name ?? '—',
      topStyle: S.styles(p.records, 1)[0]?.name ?? '—',
      topArtist: S.artists(p.records, 1)[0]?.name ?? '—',
      topLabel: S.labels(p.records, 1)[0]?.name ?? '—',
      mostPlayed: l.mostPlayed[0] ?? null,
    }
  }
  const a = side(me)
  const b = side(them)
  type Row = {
    label: string
    mine: React.ReactNode
    theirs: React.ReactNode
    /** Numbers to decide who "wins" the row (bolded). */
    cmp?: [number, number]
  }
  const rows: Row[] = [
    {
      label: 'Records',
      mine: a.s.records,
      theirs: b.s.records,
      cmp: [a.s.records, b.s.records],
    },
    {
      label: 'Artists',
      mine: a.s.artists,
      theirs: b.s.artists,
      cmp: [a.s.artists, b.s.artists],
    },
    {
      label: 'Hours of music',
      mine: Math.round(a.s.totalSec / 3600),
      theirs: Math.round(b.s.totalSec / 3600),
      cmp: [a.s.totalSec, b.s.totalSec],
    },
    {
      label: 'Coloured pressings',
      mine: a.s.colored,
      theirs: b.s.colored,
      cmp: [a.s.colored, b.s.colored],
    },
    {
      label: 'Spins logged',
      mine: a.spins,
      theirs: b.spins,
      cmp: [a.spins, b.spins],
    },
    {
      label: 'Share ever spun',
      mine: `${a.played}%`,
      theirs: `${b.played}%`,
      cmp: [a.played, b.played],
    },
    {
      label: 'Median year',
      mine: a.s.medianYear ?? '—',
      theirs: b.s.medianYear ?? '—',
    },
    { label: 'Top genre', mine: a.topGenre, theirs: b.topGenre },
    { label: 'Top style', mine: a.topStyle, theirs: b.topStyle },
    { label: 'Top artist', mine: a.topArtist, theirs: b.topArtist },
    { label: 'Top label', mine: a.topLabel, theirs: b.topLabel },
    {
      label: 'Most spun',
      mine: a.mostPlayed?.title ?? '—',
      theirs: b.mostPlayed?.title ?? '—',
    },
  ]
  return (
    <div className="rounded-2xl border bg-card/80 p-5 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Head to head</h2>
        <PairLegend them={name} />
      </div>
      <table className="mt-3 w-full table-fixed text-sm">
        <thead className="sr-only">
          <tr>
            <th>Stat</th>
            <th>You</th>
            <th>{name}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const win = r.cmp && r.cmp[0] !== r.cmp[1]
            const mineWins = win && r.cmp![0] > r.cmp![1]
            return (
              <tr key={r.label} className="border-t border-border/50">
                <th
                  scope="row"
                  className="w-[34%] py-2 pr-2 text-left text-xs font-normal text-muted-foreground"
                >
                  {r.label}
                </th>
                <td
                  className={cn(
                    'truncate py-2 pr-2 tabular-nums',
                    win && mineWins && 'font-semibold text-primary',
                  )}
                >
                  {r.mine}
                </td>
                <td
                  className={cn(
                    'truncate py-2 tabular-nums',
                    win && !mineWins && 'font-semibold text-friend',
                  )}
                >
                  {r.theirs}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {(a.s.totalSec > 0 || b.s.totalSec > 0) && (
        <p className="mt-3 text-xs text-muted-foreground">
          Together that's {formatDuration(a.s.totalSec + b.s.totalSec)} of
          music.
        </p>
      )}
    </div>
  )
}

/** Wants of each side that the other owns: borrowing and trading material. */
function Wants({
  me,
  them,
  name,
}: {
  me: Profile
  them: Profile
  name: string
}) {
  const { data: myWants = [] } = useQuery(wantlistQuery(me.username))
  const { data: theirWants = [] } = useQuery(wantlistQuery(them.username))
  const theyHave = useMemo(
    () => wantsOwnedBy(myWants, them.records),
    [myWants, them.records],
  )
  const youHave = useMemo(
    () => wantsOwnedBy(theirWants, me.records),
    [theirWants, me.records],
  )
  if (!theyHave.length && !youHave.length) return null
  return (
    <section className="mt-10 grid gap-4 md:grid-cols-2">
      <WantList
        title={`${name} has ${theyHave.length} of your wants`}
        subtitle="Ask to borrow, or come round for a listen."
        items={theyHave}
        username={them.username}
      />
      <WantList
        title={`You have ${youHave.length} of ${name}'s wants`}
        subtitle="Good trade material."
        items={youHave}
        username={me.username}
      />
    </section>
  )
}

function WantList({
  title,
  subtitle,
  items,
  username,
}: {
  title: string
  subtitle: string
  items: Array<{ want: WantItem; record: CollectionRecord; exact: boolean }>
  username: string
}) {
  return (
    <div className="rounded-2xl border bg-card/80 p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Gift className="size-4 text-record-1" /> {title}
      </h2>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
      {items.length ? (
        <ul className="mt-4 space-y-2">
          {items.slice(0, 12).map(({ want, record, exact }) => (
            <li key={want.releaseId}>
              <Link
                to="/u/$username"
                params={{ username }}
                search={{ open: record.instanceId }}
                className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1 hover:bg-muted/60"
              >
                {record.thumb ? (
                  <img
                    src={record.thumb}
                    alt=""
                    loading="lazy"
                    className="size-10 shrink-0 rounded-[2px] object-cover"
                  />
                ) : (
                  <div className="size-10 shrink-0 rounded-[2px] bg-muted" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {want.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {want.artist}
                    {exact ? ' · the exact pressing' : ' · another pressing'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">None right now.</p>
      )}
    </div>
  )
}

type OverlapTab = 'both' | 'mine' | 'theirs'

function CrateOverlap({
  me,
  them,
  name,
  overlap: o,
}: {
  me: Profile
  them: Profile
  name: string
  overlap: ReturnType<typeof overlap>
}) {
  const [tab, setTab] = useState<OverlapTab>('both')
  const [limit, setLimit] = useState(48)
  const tabs: Array<{ id: OverlapTab; label: string; count: number }> = [
    { id: 'both', label: 'You both own', count: o.both.length },
    { id: 'mine', label: 'Only you', count: o.onlyMine.length },
    { id: 'theirs', label: `Only ${name}`, count: o.onlyTheirs.length },
  ]
  const list: Array<{ record: CollectionRecord; owner: string }> =
    tab === 'both'
      ? o.both.map((p) => ({ record: p.mine, owner: me.username }))
      : tab === 'mine'
        ? o.onlyMine.map((r) => ({ record: r, owner: me.username }))
        : o.onlyTheirs.map((r) => ({ record: r, owner: them.username }))

  return (
    <section className="mt-12">
      <p className="kicker">Crate overlap</p>
      <h2 className="mt-1 text-3xl font-bold tracking-tight">
        Same albums, any pressing
      </h2>
      <div className="mt-4 flex flex-wrap gap-2" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => {
              setTab(t.id)
              setLimit(48)
            }}
            className={cn(
              'rounded-full border px-3 py-1 text-sm font-medium transition',
              tab === t.id
                ? 'border-record-1 bg-record-1 text-record-ink'
                : 'bg-card hover:border-record-1',
            )}
          >
            {t.label}{' '}
            <span className="ml-0.5 text-xs tabular-nums opacity-70">
              {t.count}
            </span>
          </button>
        ))}
      </div>
      {list.length ? (
        <>
          <ul className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
            {list.slice(0, limit).map(({ record: r, owner }) => (
              <li key={r.instanceId}>
                <Link
                  to="/u/$username"
                  params={{ username: owner }}
                  search={{ open: r.instanceId }}
                  className="group block"
                  title={`${r.artist} – ${r.title}`}
                >
                  <span className="sleeve-shadow block aspect-square overflow-hidden rounded-[2px] bg-muted transition group-hover:-translate-y-0.5">
                    {r.thumb && (
                      <img
                        src={r.thumb}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    )}
                  </span>
                  <span className="mt-1.5 block truncate text-xs font-medium">
                    {r.title}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {r.artist}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {list.length > limit && (
            <button
              type="button"
              onClick={() => setLimit((l) => l + 96)}
              className="mt-5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Show more ({list.length - limit} left)
            </button>
          )}
        </>
      ) : (
        <p className="mt-5 text-sm text-muted-foreground">
          {tab === 'both' ? 'No albums in common yet.' : 'Nothing here.'}
        </p>
      )}
    </section>
  )
}
