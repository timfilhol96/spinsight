import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import {
  BarList,
  ChartCard,
  ColumnChart,
  GrowthChart,
  StatTile,
  rankedTable,
} from '#/components/charts'
import { CurrencySelect } from '#/components/currency-select'
import { VinylSwatch } from '#/components/record-card'
import { RecordRow } from '#/components/record-row'
import { RecordSheet } from '#/components/record-sheet'
import { VinylDisc } from '#/components/vinyl-disc'
import type { CollectionSearch } from '#/routes/u.$username.index'
import { formatDuration } from '#/lib/records'
import type { CollectionRecord } from '#/lib/records'
import * as S from '#/lib/stats'
import { useMoney, useProfile } from '#/lib/use-profile'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/u/$username/insights')({
  head: ({ params }) => ({
    meta: [{ title: `Insights · ${params.username} · Spinsight` }],
  }),
  component: InsightsPage,
})

const PATTERN_NAMES: Record<string, string> = {
  solid: 'Solid colour',
  translucent: 'Translucent',
  marbled: 'Marbled',
  splatter: 'Splatter',
  split: 'Split',
  swirl: 'Swirl',
  'color-in-color': 'Colour-in-colour',
  galaxy: 'Galaxy',
  smoke: 'Smoke',
  picture: 'Picture disc',
  glow: 'Glow in the dark',
}

function Section({
  title,
  kicker,
  children,
}: {
  title: string
  kicker: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-14">
      <p className="kicker">{kicker}</p>
      <h2 className="mt-1 mb-5 text-3xl font-bold tracking-tight">{title}</h2>
      {children}
    </section>
  )
}

function InsightsPage() {
  const profile = useProfile()
  const records = profile.records
  const navigate = useNavigate()
  const money = useMoney()
  const [openId, setOpenId] = useState<number | null>(null)
  const [basis, setBasis] = useState<S.YearBasis>('original')
  const open = (r: CollectionRecord) => setOpenId(r.instanceId)
  const openRecord = records.find((r) => r.instanceId === openId) ?? null

  const showInCollection = (search: CollectionSearch) =>
    navigate({
      to: '/u/$username',
      params: { username: profile.username },
      search,
    })

  const stats = useMemo(() => {
    return {
      summary: S.summary(records),
      growth: S.growth(records),
      byYear: S.addedByYear(records),
      genres: S.genres(records),
      styles: S.styles(records),
      decades: {
        original: S.decades(records, 'original'),
        pressing: S.decades(records, 'pressing'),
      },
      years: {
        original: S.extremesByYear(records, 'original'),
        pressing: S.extremesByYear(records, 'pressing'),
      },
      reissues: S.reissues(records),
      durations: S.extremesByDuration(records),
      artists: S.artists(records),
      labels: S.labels(records),
      countries: S.countries(records),
      formats: S.formats(records),
      color: S.colorStats(records),
      rarity: S.rarity(records),
      badges: S.badges(records),
      onThisDay: S.onThisDay(records),
      listening: S.listening(records, profile.plays),
    }
  }, [records, profile.plays])

  if (!records.length) {
    return (
      <p className="mt-16 text-center text-muted-foreground">
        Insights appear once the collection is synced.
      </p>
    )
  }

  const s = stats.summary
  const n = s.records
  const decadeData = stats.decades[basis]
  const peakDecade = [...decadeData].sort((a, b) => b.count - a.count)[0]
  const enrichedShare = s.enriched / n

  return (
    <>
      {/* ---------- overview ---------- */}
      <section className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Records" value={n.toLocaleString()} />
        <StatTile label="Artists" value={s.artists.toLocaleString()} />
        <StatTile label="Labels" value={s.labels.toLocaleString()} />
        <StatTile
          label="Hours of music"
          value={
            s.totalSec ? Math.round(s.totalSec / 3600).toLocaleString() : '—'
          }
          sub={
            s.withDuration < n
              ? `from ${s.withDuration} records with track times`
              : undefined
          }
        />
        <StatTile
          label="Coloured vinyl"
          value={`${Math.round(stats.color.share * 100)}%`}
          sub={`${s.colored} pressings`}
        />
        {profile.collectionValue ? (
          <div className="rounded-xl border bg-card/80 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                Median value
              </p>
              <CurrencySelect value={profile.currency} />
            </div>
            <p className="mt-1 text-3xl font-semibold tracking-tight">
              {money(profile.collectionValue.median.money, { compact: true }) ??
                profile.collectionValue.median.raw}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {money(profile.collectionValue.minimum.money, {
                compact: true,
              }) ?? profile.collectionValue.minimum.raw}{' '}
              –{' '}
              {money(profile.collectionValue.maximum.money, {
                compact: true,
              }) ?? profile.collectionValue.maximum.raw}
            </p>
          </div>
        ) : (
          <StatTile label="Median release year" value={s.medianYear ?? '—'} />
        )}
      </section>

      {stats.onThisDay.length > 0 && (
        <section className="mt-6 rounded-2xl border border-record-1/40 bg-record-1/10 p-5">
          <p className="kicker">On this day</p>
          <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {stats.onThisDay.map((r) => (
              <RecordRow
                key={r.instanceId}
                record={r}
                onOpen={() => open(r)}
                metric={
                  <span className="font-normal text-muted-foreground">
                    {new Date(r.dateAdded!).getFullYear()}
                  </span>
                }
              />
            ))}
          </ul>
        </section>
      )}

      {/* ---------- listening ---------- */}
      <Section kicker="On the turntable" title="Listening">
        {stats.listening.total === 0 ? (
          <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
            No spins logged yet.{' '}
            {profile.isOwner && (
              <>
                Hit “I'm playing this” on a record, or{' '}
                <Link
                  to="/u/$username/pick"
                  params={{ username: profile.username }}
                  className="font-medium text-record-1 underline-offset-4 hover:underline"
                >
                  let the picker choose
                </Link>
                .
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-3">
              <StatTile
                label="Spins logged"
                value={stats.listening.total}
                sub={`${stats.listening.fromPicker} chosen by the picker`}
              />
              <StatTile
                label="Records played"
                value={`${Math.round(stats.listening.playedShare * 100)}%`}
                sub={`${n - stats.listening.neverPlayed.length} of ${n}`}
              />
              <StatTile
                label="Dust collectors"
                value={stats.listening.neverPlayed.length}
                sub="Never logged a spin"
              />
            </div>
            <RankCard
              title="Most played"
              subtitle="Logged spins"
              records={stats.listening.mostPlayed}
              metric={(r) => r.playCount}
              onOpen={open}
            />
            <RankCard
              title="Dust collectors"
              subtitle="Never played, longest-owned first"
              records={stats.listening.neverPlayed.slice(0, 5)}
              metric={() => ''}
              onOpen={open}
            />
            <div className="grid grid-cols-1 gap-4">
              <ChartCard
                title="When you listen"
                table={{
                  columns: ['Day', 'Spins'],
                  rows: stats.listening.byWeekday.map((d) => [
                    d.label,
                    d.count,
                  ]),
                }}
              >
                <ColumnChart
                  data={stats.listening.byWeekday}
                  unit="spin"
                  height={140}
                />
              </ChartCard>
              <ChartCard
                title="Time of day"
                table={{
                  columns: ['Time', 'Spins'],
                  rows: stats.listening.byDaypart.map((d) => [
                    d.label,
                    d.count,
                  ]),
                }}
              >
                <ColumnChart
                  data={stats.listening.byDaypart}
                  unit="spin"
                  height={140}
                />
              </ChartCard>
            </div>
          </div>
        )}
      </Section>

      {/* ---------- growth ---------- */}
      <Section kicker="Digging habits" title="How the collection grew">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ChartCard
            className="lg:col-span-2"
            title="Records over time"
            subtitle="Running total by the date each record was added to Discogs (not necessarily when it was bought)"
            table={{
              columns: ['Month', 'Added', 'Total'],
              rows: stats.growth
                .filter((g) => g.added)
                .map((g) => [g.label, g.added, g.total]),
            }}
          >
            <GrowthChart data={stats.growth} />
          </ChartCard>
          <ChartCard
            title="Added per year"
            table={{
              columns: ['Year', 'Records'],
              rows: stats.byYear.map((y) => [y.label, y.count]),
            }}
          >
            <ColumnChart data={stats.byYear} height={240} />
          </ChartCard>
        </div>
      </Section>

      {/* ---------- what ---------- */}
      <Section kicker="What's in the crates" title="Genres & styles">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard
            title="Genres"
            subtitle="Discogs genres; a record can have several. Click to browse."
            table={rankedTable(stats.genres, 'Genre', n)}
          >
            <BarList
              items={stats.genres}
              total={n}
              onSelect={(genre) => showInCollection({ genre })}
            />
          </ChartCard>
          <ChartCard
            title="Top styles"
            subtitle="The finer-grained Discogs tags"
            table={rankedTable(stats.styles, 'Style', n)}
          >
            <BarList
              items={stats.styles}
              total={n}
              onSelect={(style) => showInCollection({ style })}
            />
          </ChartCard>
        </div>
      </Section>

      {/* ---------- when ---------- */}
      <Section kicker="Time travel" title="When the music was made">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ChartCard
            className="lg:col-span-2"
            title="Records by decade"
            subtitle={
              basis === 'original'
                ? 'When the music first came out. Click a decade to browse.'
                : 'When this copy was pressed. Click a decade to browse.'
            }
            table={{
              columns: ['Decade', 'Records'],
              rows: decadeData.map((d) => [`${d.decade}s`, d.count]),
            }}
          >
            <div
              className="mb-3 inline-flex rounded-lg border bg-muted/50 p-0.5 text-xs"
              role="group"
              aria-label="Year to chart"
            >
              {(
                [
                  ['original', 'Original release'],
                  ['pressing', 'This pressing'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={basis === key}
                  onClick={() => setBasis(key)}
                  className={cn(
                    'rounded-md px-2.5 py-1 font-medium transition',
                    basis === key
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <ColumnChart
              data={decadeData}
              highlight={peakDecade?.label}
              onSelect={(label) => {
                const d = decadeData.find((x) => x.label === label)
                if (!d) return
                void showInCollection(
                  basis === 'original'
                    ? { decade: d.decade }
                    : { pressed: d.decade },
                )
              }}
            />
          </ChartCard>
          <div className="grid grid-cols-1 gap-4">
            <ExtremeCard
              label="Oldest music"
              record={stats.years.original.oldest}
              value={stats.years.original.oldest?.originalYear}
              note={pressedNote(stats.years.original.oldest)}
              onOpen={open}
            />
            <ExtremeCard
              label="Oldest pressing"
              record={stats.years.pressing.oldest}
              value={stats.years.pressing.oldest?.year}
              onOpen={open}
            />
            <StatTile
              label="Reissues"
              value={stats.reissues.count}
              sub={
                stats.reissues.biggestGap
                  ? `Pressed 5+ years after release. Biggest gap: ${stats.reissues.biggestGap.title} (${stats.reissues.biggestGap.originalYear} → ${stats.reissues.biggestGap.year})`
                  : 'Pressed 5+ years after the original release'
              }
            />
            <ExtremeCard
              label="Longest record"
              record={stats.durations.longest}
              value={formatDuration(stats.durations.longest?.durationSec)}
              onOpen={open}
            />
          </div>
        </div>
      </Section>

      {/* ---------- who & where ---------- */}
      <Section kicker="Who & where" title="Artists, labels, countries">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ChartCard
            title="Top artists"
            table={rankedTable(stats.artists, 'Artist', n)}
          >
            <BarList
              items={stats.artists}
              total={n}
              onSelect={(artist) => showInCollection({ artist })}
            />
          </ChartCard>
          <ChartCard
            title="Top labels"
            table={rankedTable(stats.labels, 'Label', n)}
          >
            <BarList
              items={stats.labels}
              total={n}
              onSelect={(label) => showInCollection({ label })}
            />
          </ChartCard>
          <ChartCard
            title="Pressed in"
            subtitle={
              enrichedShare < 1
                ? `From ${s.enriched} of ${n} records with details fetched`
                : 'Country of release'
            }
            table={rankedTable(stats.countries, 'Country', s.enriched)}
          >
            <BarList
              items={stats.countries}
              total={s.enriched}
              onSelect={(country) => showInCollection({ country })}
            />
          </ChartCard>
        </div>
      </Section>

      {/* ---------- formats & colour ---------- */}
      <Section kicker="The physical stuff" title="Formats & colour">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ChartCard
            title="Formats & editions"
            subtitle="From Discogs format descriptions"
            table={rankedTable(stats.formats, 'Format', n)}
          >
            <BarList items={stats.formats} total={n} />
          </ChartCard>
          <ChartCard
            className="lg:col-span-2"
            title="The colour wall"
            subtitle={`${stats.color.colored.length} coloured pressings. Click one to open it.`}
            table={rankedTable(
              stats.color.patterns.map((p) => ({
                ...p,
                name: PATTERN_NAMES[p.name] ?? p.name,
              })),
              'Pattern',
              stats.color.colored.length,
            )}
          >
            {stats.color.colored.length ? (
              <>
                <div className="mb-5">
                  <div
                    className="h-2 overflow-hidden rounded-full bg-muted"
                    role="img"
                    aria-label={`${Math.round(stats.color.share * 100)}% coloured vinyl`}
                  >
                    <div
                      className="h-full rounded-full bg-record-1"
                      style={{ width: `${stats.color.share * 100}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {Math.round(stats.color.share * 100)}% of the collection is
                    coloured ·{' '}
                    {stats.color.patterns
                      .slice(0, 4)
                      .map(
                        (p) =>
                          `${p.count} ${(PATTERN_NAMES[p.name] ?? p.name).toLowerCase()}`,
                      )
                      .join(' · ')}
                  </p>
                </div>
                <ul className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8">
                  {stats.color.colored.map((r) => (
                    <li key={r.instanceId}>
                      <button
                        type="button"
                        onClick={() => open(r)}
                        className="group block w-full rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        title={`${r.artist} – ${r.title} (${r.look.label})`}
                        aria-label={`${r.artist} – ${r.title}, ${r.look.label}`}
                      >
                        <VinylDisc
                          look={r.look}
                          labelImage={r.thumb}
                          seed={r.releaseId}
                          className="transition-transform duration-300 group-hover:scale-110 group-hover:rotate-45"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                All black vinyl. Classic.
              </p>
            )}
          </ChartCard>
        </div>
      </Section>

      {/* ---------- rarity ---------- */}
      <Section kicker="Rarity & value" title="The ones to keep safe">
        {s.enriched === 0 ? (
          <p className="text-sm text-muted-foreground">
            Community stats appear once record details are fetched
            {profile.isOwner ? ' (use “Fetch details” above)' : ''}.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <RankCard
              title="Most wanted"
              subtitle="Discogs users with it on their wantlist"
              records={stats.rarity.mostWanted}
              metric={(r) => r.communityWant?.toLocaleString()}
              onOpen={open}
            />
            <RankCard
              title="Rarest"
              subtitle="Fewest Discogs users own it"
              records={stats.rarity.rarest}
              metric={(r) => r.communityHave?.toLocaleString()}
              onOpen={open}
            />
            <RankCard
              title="Most in demand"
              subtitle="Want ÷ have. Above 1 = more want it than own it"
              records={stats.rarity.hottest}
              metric={(r) =>
                r.communityHave
                  ? ((r.communityWant ?? 0) / r.communityHave).toFixed(2)
                  : '—'
              }
              onOpen={open}
            />
            <RankCard
              title="Priciest to replace"
              subtitle="Lowest current Discogs listing"
              records={stats.rarity.priciest}
              metric={(r) => money(r.lowestPrice, { compact: true })}
              onOpen={open}
            />
          </div>
        )}
      </Section>

      {/* ---------- badges ---------- */}
      <Section kicker="Achievements" title="Badges">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {stats.badges.map((b) => (
            <li
              key={b.id}
              className={cn(
                'flex items-start gap-3 rounded-xl border p-4',
                b.earned ? 'bg-card' : 'bg-card/40 text-muted-foreground',
              )}
            >
              <span
                className={cn('text-2xl', !b.earned && 'opacity-40 grayscale')}
                aria-hidden
              >
                {b.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn('font-semibold', b.earned && 'text-foreground')}
                >
                  {b.label}
                </p>
                <p className="text-xs">{b.description}</p>
                {!b.earned && (
                  <div className="mt-2">
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-record-1/70"
                        style={{ width: `${(b.value / b.target) * 100}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] tabular-nums">
                      {b.value} / {b.target}
                    </p>
                  </div>
                )}
              </div>
              {b.earned && <span className="sticker shrink-0">earned</span>}
            </li>
          ))}
        </ul>
      </Section>

      <RecordSheet
        record={openRecord}
        onOpenChange={(o) => !o && setOpenId(null)}
      />
    </>
  )
}

/** "pressed 2022" when a record's copy is much newer than its music. */
function pressedNote(r: CollectionRecord | null): string | undefined {
  return r?.year && r.originalYear && r.year !== r.originalYear
    ? `this copy pressed ${r.year}`
    : undefined
}

function ExtremeCard({
  label,
  record,
  value,
  note,
  onOpen,
}: {
  label: string
  record: CollectionRecord | null
  value: React.ReactNode
  note?: string
  onOpen: (r: CollectionRecord) => void
}) {
  if (!record) return <StatTile label={label} value="—" />
  return (
    <button
      type="button"
      onClick={() => onOpen(record)}
      className="flex items-center gap-4 rounded-xl border bg-card/80 p-4 text-left hover:border-record-1"
    >
      {record.thumb && (
        <img
          src={record.thumb}
          alt=""
          className="size-14 shrink-0 rounded-[2px] object-cover"
        />
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tracking-tight">
          {value}
          {note && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {note}
            </span>
          )}
        </p>
        <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          <VinylSwatch colors={record.look.colors} className="size-2" />
          {record.artist} – {record.title}
        </p>
      </div>
    </button>
  )
}

function RankCard({
  title,
  subtitle,
  records,
  metric,
  onOpen,
}: {
  title: string
  subtitle: string
  records: CollectionRecord[]
  metric: (r: CollectionRecord) => React.ReactNode
  onOpen: (r: CollectionRecord) => void
}) {
  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      table={{
        columns: ['Record', title],
        rows: records.map((r) => [
          `${r.artist} – ${r.title}`,
          String(metric(r) ?? '—'),
        ]),
      }}
    >
      {records.length ? (
        <ol className="space-y-0.5">
          {records.map((r) => (
            <RecordRow
              key={r.instanceId}
              record={r}
              metric={metric(r)}
              onOpen={() => onOpen(r)}
            />
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">Not enough data yet.</p>
      )}
    </ChartCard>
  )
}
