import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { ChartCard, ColumnChart } from '#/components/charts'
import { RecordSheet } from '#/components/record-sheet'
import { VinylDisc } from '#/components/vinyl-disc'
import { Button } from '#/components/ui/button'
import { formatDuration } from '#/lib/records'
import type { CollectionRecord } from '#/lib/records'
import { yearInVinyl, yearsWithAdditions } from '#/lib/stats'
import { useRecordTheme } from '#/lib/theme'
import { useProfile } from '#/lib/use-profile'
import { cn } from '#/lib/utils'
import { isColoredVinyl } from '#/lib/vinyl-color'

type Search = { year?: number }

export const Route = createFileRoute('/u/$username/wrapped')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    year:
      Number.isInteger(Number(s.year)) && s.year !== undefined
        ? Number(s.year)
        : undefined,
  }),
  head: ({ params }) => ({
    meta: [{ title: `Year in Vinyl · ${params.username} · Spinsight` }],
  }),
  component: WrappedPage,
})

function WrappedPage() {
  const profile = useProfile()
  const navigate = useNavigate({ from: Route.fullPath })
  const years = useMemo(
    () => yearsWithAdditions(profile.records),
    [profile.records],
  )
  const { year: requested } = Route.useSearch()
  const year = requested && years.includes(requested) ? requested : years[0]
  const [openId, setOpenId] = useState<number | null>(null)

  const w = useMemo(
    () => (year ? yearInVinyl(profile.records, year) : null),
    [profile.records, year],
  )

  // The year takes on the colour of the first coloured record added that year.
  const signature = w?.records.find((r) => isColoredVinyl(r.look)) ?? null
  useRecordTheme(signature?.look)

  if (!w || !year) {
    return (
      <p className="mt-16 text-center text-muted-foreground">
        Nothing added yet — come back after a sync.
      </p>
    )
  }

  const openRecord =
    profile.records.find((r) => r.instanceId === openId) ?? null
  const open = (r: CollectionRecord) => setOpenId(r.instanceId)
  const name = profile.displayName?.split(' ')[0] || profile.username

  async function copyLink() {
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('year', String(year))
      await navigator.clipboard.writeText(url.toString())
      toast.success('Link copied.')
    } catch {
      toast.error("Couldn't copy the link.")
    }
  }

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center gap-2">
        {years.map((y) => (
          <button
            key={y}
            type="button"
            onClick={() => navigate({ search: { year: y }, replace: true })}
            aria-pressed={y === year}
            className={cn(
              'rounded-full border px-3 py-1 text-sm font-medium tabular-nums transition',
              y === year
                ? 'border-record-1 bg-record-1 text-record-ink'
                : 'bg-card hover:border-record-1',
            )}
          >
            {y}
          </button>
        ))}
        {profile.isPublic && (
          <Button
            variant="ghost"
            size="sm"
            onClick={copyLink}
            className="ml-auto"
          >
            <Link2 /> Copy link
          </Button>
        )}
      </div>

      <section className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* The "sleeve": the year's summary, designed to screenshot well. */}
        <div className="sleeve-shadow relative aspect-square overflow-hidden rounded-md bg-gradient-to-br from-record-1 via-record-1/80 to-record-2 p-7 text-record-ink md:p-9">
          <VinylDisc
            look={signature?.look}
            labelImage={signature?.thumb}
            seed={signature?.releaseId ?? year}
            className="animate-spin-slow pointer-events-none absolute -right-[22%] -bottom-[22%] w-[70%] opacity-90"
          />
          <div className="relative flex h-full flex-col">
            <p className="font-mono text-xs tracking-[0.2em] uppercase opacity-80">
              {name}'s year in vinyl
            </p>
            <p className="mt-1 font-display text-7xl leading-none font-bold md:text-8xl">
              {year}
            </p>

            <dl className="mt-auto grid max-w-[62%] grid-cols-2 gap-x-6 gap-y-4">
              <WrappedStat label="Records added" value={w.count} />
              <WrappedStat label="Coloured" value={w.colored} />
              {w.topGenre && (
                <WrappedStat label="Top genre" value={w.topGenre.name} />
              )}
              {w.topStyle && (
                <WrappedStat label="Top style" value={w.topStyle.name} />
              )}
              {w.topArtist && w.topArtist.count > 1 && (
                <WrappedStat label="Most bought" value={w.topArtist.name} />
              )}
              {w.peakMonth && (
                <WrappedStat label="Busiest month" value={w.peakMonth} />
              )}
              {w.totalSec > 0 && (
                <WrappedStat
                  label="New music"
                  value={formatDuration(w.totalSec)}
                />
              )}
            </dl>
          </div>
        </div>

        <div className="grid gap-4">
          <ChartCard
            title="Month by month"
            table={{
              columns: ['Month', 'Records'],
              rows: w.byMonth.map((m) => [m.label, m.count]),
            }}
          >
            <ColumnChart
              data={w.byMonth}
              highlight={w.peakMonth ?? undefined}
              height={180}
            />
          </ChartCard>
          <div className="grid grid-cols-2 gap-4">
            <Moment label="First of the year" record={w.first} onOpen={open} />
            <Moment label="Latest addition" record={w.latest} onOpen={open} />
            {w.oldestAlbum?.originalYear && (
              <Moment
                label={`Oldest music (${w.oldestAlbum.originalYear})`}
                record={w.oldestAlbum}
                onOpen={open}
              />
            )}
            {signature && (
              <Moment
                label="Signature colour"
                record={signature}
                onOpen={open}
              />
            )}
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-2xl font-bold">Everything added in {year}</h2>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
          {w.records.map((r) => (
            <li key={r.instanceId}>
              <button
                type="button"
                onClick={() => open(r)}
                className="sleeve-shadow block aspect-square w-full overflow-hidden rounded-[2px] bg-muted transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
              </button>
            </li>
          ))}
        </ul>
      </section>

      <RecordSheet
        record={openRecord}
        onOpenChange={(o) => !o && setOpenId(null)}
      />
    </>
  )
}

function WrappedStat({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[10px] tracking-[0.15em] uppercase opacity-75">
        {label}
      </dt>
      <dd className="truncate text-xl font-semibold md:text-2xl">{value}</dd>
    </div>
  )
}

function Moment({
  label,
  record,
  onOpen,
}: {
  label: string
  record: CollectionRecord | null
  onOpen: (r: CollectionRecord) => void
}) {
  if (!record) return null
  return (
    <button
      type="button"
      onClick={() => onOpen(record)}
      className="flex items-center gap-3 rounded-xl border bg-card/80 p-3 text-left hover:border-record-1"
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
        </span>
      </span>
    </button>
  )
}
